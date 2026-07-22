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
};

export type MailBody = {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  html: string;
  text: string;
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
