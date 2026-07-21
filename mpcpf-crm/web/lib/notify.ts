// Envoi d'email depuis le CRM (serveur uniquement) via le webhook n8n Gmail
// (même canal que le MpcpfNotifier des edge functions : N8N_EMAIL_WEBHOOK).
// Le corps est envoyé en HTML dans le champ `body`.

export async function sendMpcpfEmail(to: string, subject: string, html: string): Promise<void> {
  const url = process.env.N8N_EMAIL_WEBHOOK;
  if (!url) throw new Error("N8N_EMAIL_WEBHOOK manquant (env CRM).");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      to,
      subject: subject || "MonPermisCPF",
      body: html,
      template_code: null,
      metadata: { source: "crm-reset-password" },
    }),
  });
  if (!res.ok) throw new Error(`Envoi email échoué (HTTP ${res.status}).`);
}
