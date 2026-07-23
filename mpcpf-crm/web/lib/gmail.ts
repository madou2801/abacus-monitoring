// Lecture des emails d'un bénéficiaire via l'endpoint interne du campaign-tracker
// (OAuth Gmail de contact@monpermiscpf.com). Serveur uniquement — réutilise le même
// secret partagé que l'envoi (INTERNAL_MAIL_SECRET). Aucun nouvel identifiant requis.

export type MailMsg = {
  id: string;
  threadId: string;
  internalDate: number;
  date: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  direction: "sent" | "received";
  unread: boolean;
};

export async function markEmailRead(id: string): Promise<boolean> {
  const mid = (id || "").trim();
  if (!mid) return false;
  const url = process.env.INTERNAL_GMAIL_MARKREAD_URL || "https://api.monpermiscpf.com/t/internal-gmail-markread";
  const secret = SECRET();
  if (!secret) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ id: mid }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return !!(res.ok && data.ok);
  } catch {
    return false;
  }
}

export type MailBody = {
  id: string;
  threadId: string;
  messageId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html: string;
  text: string;
};

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
};

const SECRET = () => process.env.INTERNAL_MAIL_SECRET;

export async function fetchBeneficiaryEmails(email: string | null, max = 25): Promise<MailMsg[]> {
  const addr = (email || "").trim();
  if (!addr) return [];
  const url = process.env.INTERNAL_GMAIL_URL || "https://api.monpermiscpf.com/t/internal-gmail-search";
  const secret = SECRET();
  if (!secret) return [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ email: addr, max }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; messages?: MailMsg[] };
    return data && data.ok && Array.isArray(data.messages) ? data.messages : [];
  } catch {
    return [];
  }
}

export async function sendEmail(
  input: SendEmailInput
): Promise<{ ok: boolean; threadId?: string; error?: string }> {
  const to = (input.to || "").trim();
  if (!to) return { ok: false, error: "destinataire manquant" };
  const url = process.env.INTERNAL_MAIL_URL || "https://api.monpermiscpf.com/t/internal-send-mail";
  const secret = SECRET();
  if (!secret) return { ok: false, error: "INTERNAL_MAIL_SECRET manquant" };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({
        to,
        subject: input.subject || "MonPermisCPF",
        html: input.html || "",
        inReplyTo: input.inReplyTo,
        references: input.references,
        threadId: input.threadId,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; threadId?: string; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: data?.error || `HTTP ${res.status}` };
    return { ok: true, threadId: data.threadId };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

export async function fetchEmailBody(id: string): Promise<MailBody | null> {
  const mid = (id || "").trim();
  if (!mid) return null;
  const url = process.env.INTERNAL_GMAIL_MESSAGE_URL || "https://api.monpermiscpf.com/t/internal-gmail-message";
  const secret = SECRET();
  if (!secret) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ id: mid }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; message?: MailBody };
    return data && data.ok && data.message ? data.message : null;
  } catch {
    return null;
  }
}
