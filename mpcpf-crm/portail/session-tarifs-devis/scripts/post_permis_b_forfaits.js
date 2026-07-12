// Crée les codes forfaits Permis B au catalogue (option b) — tarif CPF + perso distincts.
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
// [code, intitule, cpf, perso, duree_h]
const ROWS = [
  ["B_18H", "Permis B — BVA 18h", 1285, 1036, 18],
  ["B_20H", "Permis B — BVA 20h", 1415, 1140, 20],
  ["B_30H", "Permis B — BVA 30h", 2065, 1660, 30],
  ["B_MAN20", "Permis B — Manuelle 20h", 1415, 1140, 20],
  ["B_MAN25", "Permis B — Manuelle 25h", 1740, 1400, 25],
  ["B_MAN30", "Permis B — Manuelle 30h", 2065, 1660, 30],
  ["B_MAN40", "Permis B — Manuelle 40h", 2715, 2180, 40],
];
(async () => {
  const b = (await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.B&select=url_programme_pdf,source_fichier`, { headers: H })).json())[0] || {};
  for (const [code, intitule, cpf, perso, duree] of ROWS) {
    const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}&select=code`, { headers: H })).json();
    if (Array.isArray(chk) && chk.length) { console.log("SKIP", code); continue; }
    const row = { famille: "permis", code, intitule, financement: "cpf", eligible_cpf: true, eligible_aif: false, tarif_cpf: cpf, tarif_perso: perso, tva_pct: 20, duree_h: duree, url_programme_pdf: b.url_programme_pdf || null, source_fichier: b.source_fichier || null, actif: true };
    const r = await fetch(`${URL}/rest/v1/catalogue_formations`, { method: "POST", headers: H, body: JSON.stringify(row) });
    console.log(r.status, code, `cpf ${cpf} / perso ${perso}`, r.status === 201 ? "OK" : JSON.stringify(await r.json()).slice(0, 120));
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
