// Applique les prix marché aux 26 formations à définir + remonte CSE-CSSCT à 1100.
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
const P = {
  PREV_ASSIST_FPT:1200, PREV_ASSIST_FPT_CONT:600, PREV_CONS_FPT:1700, PREV_CONS_FPT_CONT:700,
  PREV_ASSIST_CONS_FPE:1150, PREV_ASSIST_CONS_FPE2:1150, PREV_REP_CSA:1200, PREV_REP_CST:1200,
  PREV_DUER:570, PREV_CHEF_ETAB:570, PREV_PERS_COMPETENTE:1100, PREV_CSE_CSSCT:1100,
  INC_EPI:570, INC_ESI:950, INC_SSI:570, INC_GUIDE_FILE:285, INC_PERMIS_FEU:285,
  SECOUR_DAE:200, SECOUR_ENFANTS:285, SECOUR_ARRET_CARDIAQUE:120, SECOUR_PASSERELLE_PSC1:350, SECOUR_TACTIQUE:400,
  CHIM_OPERATEUR:390, CHIM_ENCADREMENT:600, CONFLITS_GESTION:850, SURETE_ATTAQUE_TERRORISTE:250, RP_TRAVAIL_ECRAN:200,
};
(async () => {
  const codes = Object.keys(P);
  console.log("=== BACKUP (avant) ===");
  const before = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=in.(${codes.join(",")})&select=code,tarif_cpf`, { headers: H })).json();
  console.log(JSON.stringify(before));
  console.log("\n=== PATCH ===");
  let ok = 0, ko = 0;
  for (const code of codes) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}`, {
      method: "PATCH", headers: H, body: JSON.stringify({ tarif_cpf: P[code], tarif_perso: P[code] }),
    });
    const j = await r.json();
    if (r.status === 200 && Array.isArray(j) && j.length) { ok++; console.log(code, "->", P[code] + "€"); }
    else { ko++; console.log("ECHEC", code, r.status, JSON.stringify(j).slice(0, 120)); }
  }
  console.log(`\n=== ${ok} OK / ${ko} échec ===`);
  const zero = await (await fetch(`${URL}/rest/v1/catalogue_formations?famille=eq.securite&tarif_cpf=eq.0&select=code`, { headers: H })).json();
  console.log("Restant à 0€ en securite :", JSON.stringify(zero));
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
