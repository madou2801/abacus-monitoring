// intake-client.js — client réutilisable pour l'API parcours bénéficiaire (intake-api).
// Transport-agnostique : on injecte baseUrl + token + (optionnel) fetch.
//
// ⚠️ SÉCURITÉ : `intake-api` est protégée par un secret de service (INTAKE_API_SECRET).
// Ce secret NE DOIT PAS être exposé dans un navigateur public. Utiliser ce client :
//   - côté SERVEUR (workflow n8n, proxy, back-office) qui détient le secret, OU
//   - depuis une page bénéficiaire UNIQUEMENT via un proxy / un token par-dossier
//     (à ajouter en Phase 2 — voir portail/README.md).
//
// NB : ne remplace ni ne touche app.monpermiscpf.com (portail auto-écoles OTP).

export function createIntakeClient({ baseUrl, token, fetchImpl } = {}) {
  if (!baseUrl) throw new Error("intake-client: baseUrl requis");
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  if (!doFetch) throw new Error("intake-client: fetch indisponible (injecter fetchImpl)");

  async function call(payload) {
    const res = await doFetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    let body = {};
    try { body = await res.json(); } catch { /* corps non-JSON */ }
    if (!res.ok) {
      throw new Error(body && body.error ? body.error : `intake-api HTTP ${res.status}`);
    }
    return body;
  }

  return {
    // Parcours bénéficiaire
    submitIntake: (args) => call({ action: "submit_intake", ...args }),
    submitDocument: (args) => call({ action: "submit_document", ...args }),
    sendQuote: (args) => call({ action: "send_quote", ...args }),
    decideQuote: (args) => call({ action: "decide_quote", ...args }),
    journey: (beneficiary_id) => call({ action: "journey", beneficiary_id }),
    // Facturation (back-office)
    createInvoice: (args) => call({ action: "create_invoice", ...args }),
    setInvoiceStatus: (args) => call({ action: "set_invoice_status", ...args }),
    // Échappatoire générique
    call,
  };
}

// Support CommonJS (n8n Function node / Node sans ESM) en plus de l'export ESM.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { createIntakeClient };
}
