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
