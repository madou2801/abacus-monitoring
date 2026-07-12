// Aligne le catalogue CACES sur les coefficients R489 + crée les lignes recyclage (×0,85).
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };

// 1) PATCH accumulations initiales (coefficients R489)
const PATCHES = { R482_2CAT: 2600, R482_3CAT: 3075, R482_4CAT: 3390, R485_2CAT: 940, R486_2CAT: 2075, R484_2CAT: 1320 };
// 2) Recyclage (single + polyvalent), base CACES = programme réutilisé
const RECYC = [
  ["R489_RECYC", "CACES R489 - Recyclage (1 catégorie)", 735, "R489"],
  ["R489_POLY_RECYC", "CACES R489 - Recyclage polyvalent 1A+3+5", 1155, "R489"],
  ["R482_RECYC", "CACES R482 - Recyclage", 1665, "R482"],
  ["R482_POLY_RECYC", "CACES R482 - Recyclage polyvalent", 2880, "R482"],
  ["R485_RECYC", "CACES R485 - Recyclage", 600, "R485"],
  ["R485_POLY_RECYC", "CACES R485 - Recyclage 1+2", 800, "R485"],
  ["R486_RECYC", "CACES R486 - Recyclage", 1325, "R486"],
  ["R486_POLY_RECYC", "CACES R486 - Recyclage A&B", 1765, "R486"],
  ["R484_RECYC", "CACES R484 - Recyclage", 845, "R484"],
  ["R484_POLY_RECYC", "CACES R484 - Recyclage 1+2", 1120, "R484"],
  ["R490_RECYC", "CACES R490 - Recyclage", 1070, "R490"],
];
(async () => {
  console.log("=== PATCH accumulations (coef R489) ===");
  for (const [code, prix] of Object.entries(PATCHES)) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}`, { method: "PATCH", headers: H, body: JSON.stringify({ tarif_cpf: prix, tarif_perso: prix }) });
    const j = await r.json();
    console.log(r.status, code, "->", prix + "€", Array.isArray(j) && j.length ? "OK" : "??");
  }
  // cache des programmes base
  const prog = {};
  for (const base of ["R489", "R482", "R485", "R486", "R484", "R490"]) {
    const row = (await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${base}&select=url_programme_pdf,source_fichier&limit=1`, { headers: H })).json())[0] || {};
    prog[base] = row;
  }
  console.log("\n=== CREATE recyclage ===");
  for (const [code, intitule, prix, base] of RECYC) {
    const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}&select=code`, { headers: H })).json();
    if (Array.isArray(chk) && chk.length) { console.log("SKIP", code); continue; }
    const row = { famille: "caces", code, intitule, financement: "aif", eligible_cpf: false, eligible_aif: true, tarif_cpf: prix, tarif_perso: prix, tva_pct: 20, duree_h: 14, url_programme_pdf: (prog[base] || {}).url_programme_pdf || null, source_fichier: (prog[base] || {}).source_fichier || null, actif: true };
    const r = await fetch(`${URL}/rest/v1/catalogue_formations`, { method: "POST", headers: H, body: JSON.stringify(row) });
    console.log(r.status, code, prix + "€", r.status === 201 ? "OK" : JSON.stringify(await r.json()).slice(0, 120));
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
