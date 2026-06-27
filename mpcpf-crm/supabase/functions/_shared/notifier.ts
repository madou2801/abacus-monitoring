// notifier.ts — port d'envoi de notifications SMS/email + adaptateurs.
// Provider-agnostic : le parcours et les relances dépendent de l'interface
// Notifier, pas d'un fournisseur précis. On branche l'adaptateur voulu (Brevo,
// file d'attente, etc.) à la périphérie (edge function).

import type { CrmStore, NotificationLog } from "./crm-store.ts";
import type { FetchLike } from "./recording.ts";

export interface OutgoingMessage {
  channel: "sms" | "email";
  to: string;
  body: string;
  subject?: string;
  templateCode?: string;
  metadata?: Record<string, unknown>;
}

export interface SendResult {
  status: "sent" | "queued" | "failed";
  provider: string;
  providerMessageId?: string;
  error?: string;
}

export interface Notifier {
  send(m: OutgoingMessage): Promise<SendResult>;
}

/**
 * Adaptateur par défaut : met en file (aucun envoi externe). Sûr tant que le
 * fournisseur réel n'est pas branché — les messages restent traçables dans
 * crm.notifications avec le statut "queued".
 */
export class QueueNotifier implements Notifier {
  send(_m: OutgoingMessage): Promise<SendResult> {
    return Promise.resolve({ status: "queued", provider: "queue" });
  }
}

/**
 * Adaptateur Brevo (ex-Sendinblue) : SMS + email transactionnel via API REST.
 */
export class BrevoNotifier implements Notifier {
  constructor(
    private readonly opts: {
      apiKey: string;
      fetchFn: FetchLike;
      emailSender: { name: string; email: string };
      smsSender: string; // nom expéditeur SMS (<= 11 caractères)
    },
  ) {}

  async send(m: OutgoingMessage): Promise<SendResult> {
    try {
      if (m.channel === "email") {
        const res = await this.post("https://api.brevo.com/v3/smtp/email", {
          sender: this.opts.emailSender,
          to: [{ email: m.to }],
          subject: m.subject ?? "MonPermisCPF",
          htmlContent: `<p>${m.body}</p>`,
        });
        return res;
      }
      return await this.post("https://api.brevo.com/v3/transactionalSMS/sms", {
        sender: this.opts.smsSender,
        recipient: m.to.replace(/^\+/, ""),
        content: m.body,
        type: "transactional",
      });
    } catch (err) {
      return { status: "failed", provider: "brevo", error: (err as Error).message };
    }
  }

  private async post(url: string, body: unknown): Promise<SendResult> {
    const res = await this.opts.fetchFn(url, {
      method: "POST",
      headers: { "api-key": this.opts.apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { status: "failed", provider: "brevo", error: `HTTP ${res.status}` };
    }
    let id: string | undefined;
    try {
      const data = JSON.parse(new TextDecoder().decode(await res.arrayBuffer()));
      id = data.messageId ?? data.reference ?? (data.messageIds && data.messageIds[0]);
    } catch { /* corps non-JSON : on ignore */ }
    return { status: "sent", provider: "brevo", providerMessageId: id };
  }
}

/**
 * Adaptateur PROD MonPermisCPF : email via le webhook n8n (Gmail OAuth2,
 * contact@monpermiscpf.com) et SMS via ClickSend (expéditeur « MonPermis »,
 * mobiles FR +33 6/7). C'est la stack réellement en production (pas Brevo).
 */
export class MpcpfNotifier implements Notifier {
  constructor(
    private readonly opts: {
      fetchFn: FetchLike;
      emailWebhookUrl: string; // N8N_EMAIL_WEBHOOK -> Gmail OAuth2
      clickSendUser: string; // CLICKSEND_USERNAME
      clickSendKey: string; // CLICKSEND_API_KEY
      smsSender?: string; // défaut "MonPermis"
    },
  ) {}

  async send(m: OutgoingMessage): Promise<SendResult> {
    try {
      return m.channel === "email" ? await this.sendEmail(m) : await this.sendSms(m);
    } catch (err) {
      return { status: "failed", provider: "mpcpf", error: (err as Error).message };
    }
  }

  private async sendEmail(m: OutgoingMessage): Promise<SendResult> {
    const res = await this.opts.fetchFn(this.opts.emailWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        to: m.to,
        subject: m.subject ?? "MonPermisCPF",
        body: m.body,
        template_code: m.templateCode ?? null,
        metadata: m.metadata ?? {},
      }),
    });
    if (!res.ok) return { status: "failed", provider: "n8n-gmail", error: `HTTP ${res.status}` };
    let id: string | undefined;
    try {
      const d = JSON.parse(new TextDecoder().decode(await res.arrayBuffer()));
      id = d.id ?? d.messageId ?? d.message_id;
    } catch { /* corps non-JSON : on ignore */ }
    return { status: "sent", provider: "n8n-gmail", providerMessageId: id };
  }

  private async sendSms(m: OutgoingMessage): Promise<SendResult> {
    const to = m.to.replace(/\s+/g, "");
    const auth = btoa(`${this.opts.clickSendUser}:${this.opts.clickSendKey}`);
    const res = await this.opts.fetchFn("https://rest.clicksend.com/v3/sms/send", {
      method: "POST",
      headers: { "authorization": `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{
          source: "mpcpf-crm",
          from: this.opts.smsSender ?? "MonPermis",
          to,
          body: m.body,
        }],
      }),
    });
    if (!res.ok) return { status: "failed", provider: "clicksend", error: `HTTP ${res.status}` };
    let id: string | undefined;
    try {
      const d = JSON.parse(new TextDecoder().decode(await res.arrayBuffer()));
      id = d?.data?.messages?.[0]?.message_id ?? d?.data?.messages?.[0]?.messageId;
    } catch { /* corps non-JSON : on ignore */ }
    return { status: "sent", provider: "clicksend", providerMessageId: id };
  }
}

/**
 * Envoie une notification et la journalise dans crm.notifications.
 * Ne jette jamais : une notification ratée n'interrompt pas le parcours.
 */
export async function notify(
  store: CrmStore,
  notifier: Notifier,
  beneficiaryId: string | null,
  m: OutgoingMessage,
): Promise<{ id: string; result: SendResult }> {
  let result: SendResult;
  try {
    result = await notifier.send(m);
  } catch (err) {
    result = { status: "failed", provider: "unknown", error: (err as Error).message };
  }
  const log: NotificationLog = {
    beneficiary_id: beneficiaryId,
    channel: m.channel,
    to_addr: m.to,
    template_code: m.templateCode ?? null,
    subject: m.subject ?? null,
    body: m.body,
    status: result.status,
    provider: result.provider,
    provider_message_id: result.providerMessageId ?? null,
    error: result.error ?? null,
    metadata: m.metadata ?? {},
  };
  const id = await store.logNotification(log);
  return { id, result };
}
