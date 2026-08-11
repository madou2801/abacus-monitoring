// Rend les codes SSIAP uniques : l'initial garde SSIAPx, les variantes reçoivent un code suffixé.
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
// intitulé exact -> nouveau code
const MAP = {
  "SSIAP1 - RECYCLAGE": "SSIAP1_RECYC", "SSIAP1 - REMISE A NIVEAU": "SSIAP1_RAN", "SSIAP1 - MODULE COMPLEMENTAIRE": "SSIAP1_MOD",
  "SSIAP2 - RECYCLAGE": "SSIAP2_RECYC", "SSIAP2 - REMISE A NIVEAU": "SSIAP2_RAN", "SSIAP2 - MODULE COMPLEMENTAIRE": "SSIAP2_MOD",
  "SSIAP3 - RECYCLAGE": "SSIAP3_RECYC", "SSIAP3 - REMISE A NIVEAU": "SSIAP3_RAN",
  "SSIAP3 - MODULE COMPLEMENTAIRE DUT": "SSIAP3_MOD_DUT", "SSIAP3 - MODULE COMPLEMENTAIRE SP": "SSIAP3_MOD_SP",
};
(async () => {
  for (const [intitule, code] of Object.entries(MAP)) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?intitule=eq.${encodeURIComponent(intitule)}`, {
      method: "PATCH", headers: H, body: JSON.stringify({ code }),
    });
    const j = await r.json();
    console.log(r.status, intitule, "->", code, Array.isArray(j) ? j.length + " ligne(s)" : JSON.stringify(j).slice(0, 100));
  }
  // vérif : code SSIAP3 doit être unique et = 5490
  const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.SSIAP3&select=code,intitule,tarif_cpf,tarif_perso`, { headers: H })).json();
  console.log("\n=== code SSIAP3 restant ===", JSON.stringify(chk));
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
