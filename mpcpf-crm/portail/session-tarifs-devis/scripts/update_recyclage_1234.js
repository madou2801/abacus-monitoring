// Restructure le recyclage CACES en 1/2/3/4 catégories (×0,85 de l'initiale).
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
const DEL = ["R489_POLY_RECYC","R482_POLY_RECYC","R485_POLY_RECYC","R486_POLY_RECYC","R484_POLY_RECYC"];
const PATCH = { R489_RECYC:735, R482_RECYC:1665, R485_RECYC:600, R486_RECYC:1325, R484_RECYC:845, R490_RECYC:1070 };
const CREATE = [
  ["R489_2CAT_RECYC","CACES R489 - Recyclage 2 catégories",980,"R489"],
  ["R489_3CAT_RECYC","CACES R489 - Recyclage 3 catégories",1155,"R489"],
  ["R489_4CAT_RECYC","CACES R489 - Recyclage 4 catégories",1275,"R489"],
  ["R482_2CAT_RECYC","CACES R482 - Recyclage 2 catégories",2210,"R482"],
  ["R482_3CAT_RECYC","CACES R482 - Recyclage 3 catégories",2615,"R482"],
  ["R482_4CAT_RECYC","CACES R482 - Recyclage 4 catégories",2880,"R482"],
  ["R485_2CAT_RECYC","CACES R485 - Recyclage 2 catégories",800,"R485"],
  ["R486_2CAT_RECYC","CACES R486 - Recyclage 2 catégories",1765,"R486"],
  ["R484_2CAT_RECYC","CACES R484 - Recyclage 2 catégories",1120,"R484"],
];
(async () => {
  console.log("=== DELETE poly recyclage ===");
  for (const code of DEL) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}`, { method: "DELETE", headers: H });
    console.log(r.status, code);
  }
  console.log("=== PATCH 1-cat recyclage (arrondi) ===");
  for (const [code, prix] of Object.entries(PATCH)) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}`, { method: "PATCH", headers: H, body: JSON.stringify({ tarif_cpf: prix, tarif_perso: prix, intitule: `CACES ${code.split("_")[0]} - Recyclage 1 catégorie` }) });
    console.log(r.status, code, "->", prix);
  }
  const prog = {};
  for (const b of ["R489","R482","R485","R486","R484"]) prog[b] = (await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${b}&select=url_programme_pdf,source_fichier&limit=1`, { headers: H })).json())[0] || {};
  console.log("=== CREATE recyclage 2/3/4 ===");
  for (const [code, intitule, prix, base] of CREATE) {
    const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}&select=code`, { headers: H })).json();
    if (chk.length) { console.log("SKIP", code); continue; }
    const row = { famille: "caces", code, intitule, financement: "aif", eligible_cpf: false, eligible_aif: true, tarif_cpf: prix, tarif_perso: prix, tva_pct: 20, duree_h: 14, url_programme_pdf: prog[base].url_programme_pdf || null, source_fichier: prog[base].source_fichier || null, actif: true };
    const r = await fetch(`${URL}/rest/v1/catalogue_formations`, { method: "POST", headers: H, body: JSON.stringify(row) });
    console.log(r.status, code, prix);
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
