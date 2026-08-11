// code-price-resolver.js — résolution AUTORITAIRE « code formation → prix » depuis catalogue_formations.
//
// Source de vérité unique = table Supabase `public.catalogue_formations` (colonne `code`).
// Ne JAMAIS faire confiance au prix envoyé par le navigateur (falsifiable). Le serveur résout
// le prix à partir du CODE reçu du frontend (le simulateur/formulaire envoient déjà `code`).
//
// Utilisé par le devis (`/t/devis`, campaign-tracker) — à réutiliser pour le PAIEMENT Stripe
// (finding Fable COMMS 25/27 : le montant de la session Stripe ne doit venir que du catalogue).
//
// Env requis : SUPABASE_URL, SUPABASE_SERVICE_KEY. Node 18+ (fetch global) ou passer fetchImpl.

async function resolveFormationPrice(code, opts = {}) {
  const { cpfEligible = false, strict = false, fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = opts;
  // strict=true → mode PAIEMENT : code obligatoire ET résoluble, sinon throw (pas de repli client).
  // strict=false → mode DEVIS : repli possible sur le prix client (document, bornes) si code absent.
  if (!fetchImpl) throw new Error("fetch indisponible : passer opts.fetchImpl");
  const c = (code || "").toString().trim();
  if (!c) {
    if (strict) throw new Error("PAIEMENT refusé : code formation manquant");
    return { found: false, code: "", reason: "no-code" };
  }
  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!URL || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY manquants");
  const H = { apikey: KEY, Authorization: "Bearer " + KEY };
  const r = await fetchImpl(URL + "/rest/v1/catalogue_formations?select=code,intitule,tarif_cpf,tarif_perso,actif,famille&code=eq." + encodeURIComponent(c) + "&limit=1", { headers: H });
  const row = (await r.json().catch(() => []))[0];
  if (!row || row.actif === false) {
    if (strict) throw new Error("PAIEMENT refusé : code '" + c + "' introuvable/inactif au catalogue");
    return { found: false, code: c, reason: "not-found" };
  }
  // Prix selon situation : CPF-éligible → tarif_cpf ; sinon → tarif_perso (repli l'un sur l'autre).
  const prix = Math.round(Number(cpfEligible ? (row.tarif_cpf || row.tarif_perso) : (row.tarif_perso || row.tarif_cpf)) || 0);
  return {
    found: true, code: c, intitule: row.intitule, famille: row.famille,
    prix, amount_cents: prix * 100, tarif_cpf: row.tarif_cpf, tarif_perso: row.tarif_perso,
  };
}

module.exports = { resolveFormationPrice };

/* --- Exemple PAIEMENT (redirection directe Stripe) ---
const { resolveFormationPrice } = require("./code-price-resolver");
// window.location a passé ?code=B_20H&situation=perso (valeurs structurées, PAS un libellé à parser)
const f = await resolveFormationPrice(req.query.code, { cpfEligible: false, strict: true }); // throw si non résoluble
// f.amount_cents = montant Stripe autoritaire ; f.intitule = libellé produit
const session = await stripe.checkout.sessions.create({
  line_items: [{ price_data: { currency: "eur", unit_amount: f.amount_cents, product_data: { name: f.intitule } }, quantity: 1 }],
  mode: "payment", success_url, cancel_url,
});
*/
