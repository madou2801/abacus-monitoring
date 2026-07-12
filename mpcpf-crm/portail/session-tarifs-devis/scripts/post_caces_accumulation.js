// Crée les tarifs CACES R489 accumulation (2/3/4 catégories) dans catalogue_formations.
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
const PDF = "https://ygphyzkyzstjhbhxvjeg.supabase.co/storage/v1/object/public/programmes_formations/caces/PRO-321-02_-_Formation_test_CACES_R489.pdf";
const base = { famille: "caces", financement: "aif", eligible_cpf: false, eligible_aif: true, tva_pct: 20, url_programme_pdf: PDF, source_fichier: "PRO-321-02_-_Formation_test_CACES_R489.pdf", actif: true };
const rows = [
  { ...base, code: "R489_2CAT", intitule: "CACES R489 - 2 catégories", tarif_cpf: 1150, tarif_perso: 1150, duree_h: 21 },
  { ...base, code: "R489_3CAT", intitule: "CACES R489 - 3 catégories", tarif_cpf: 1360, tarif_perso: 1360, duree_h: 35 },
  { ...base, code: "R489_4CAT", intitule: "CACES R489 - 4 catégories", tarif_cpf: 1500, tarif_perso: 1500, duree_h: 42 },
];
(async () => {
  // anti-doublon : ne crée que si le code n'existe pas déjà
  for (const r of rows) {
    const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${r.code}&select=code`, { headers: H })).json();
    if (Array.isArray(chk) && chk.length) { console.log("SKIP (existe déjà)", r.code); continue; }
    const res = await fetch(`${URL}/rest/v1/catalogue_formations`, { method: "POST", headers: H, body: JSON.stringify(r) });
    const j = await res.json();
    console.log(res.status, r.code, r.tarif_cpf + "€", Array.isArray(j) && j[0] ? "OK" : JSON.stringify(j).slice(0, 200));
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
