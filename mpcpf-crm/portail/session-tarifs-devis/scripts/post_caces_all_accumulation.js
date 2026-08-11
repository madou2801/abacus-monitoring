// Crée l'accumulation CACES pour R482/R485/R486/R484 (+150€/cat suppl.), réutilise le programme de chaque base.
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };
// base = tarif 1 cat ; cats = nombre max de catégories ; incr = +€/cat suppl.
const CFG = [
  { code: "R482", label: "CACES R482 - Engins de chantier", base: 1956, maxcat: 4, incr: 150 },
  { code: "R485", label: "CACES R485 - Gerbeurs / transpalettes", base: 708, maxcat: 2, incr: 150 },
  { code: "R486", label: "CACES R486 - Nacelles (PEMP)", base: 1560, maxcat: 2, incr: 150 },
  { code: "R484", label: "CACES R484 - Ponts roulants", base: 995, maxcat: 2, incr: 150 },
];
(async () => {
  for (const c of CFG) {
    // récupère le programme de la base (1 ligne quelconque avec ce code)
    const baseRow = (await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${c.code}&select=url_programme_pdf,source_fichier,duree_h&limit=1`, { headers: H })).json())[0] || {};
    for (let n = 2; n <= c.maxcat; n++) {
      const code = `${c.code}_${n}CAT`;
      const chk = await (await fetch(`${URL}/rest/v1/catalogue_formations?code=eq.${code}&select=code`, { headers: H })).json();
      if (Array.isArray(chk) && chk.length) { console.log("SKIP", code); continue; }
      const prix = c.base + c.incr * (n - 1);
      const row = { famille: "caces", code, intitule: `${c.label} - ${n} catégories`, financement: "aif",
        eligible_cpf: false, eligible_aif: true, tarif_cpf: prix, tarif_perso: prix, tva_pct: 20,
        duree_h: (baseRow.duree_h || 21) + 7 * (n - 1), url_programme_pdf: baseRow.url_programme_pdf || null, source_fichier: baseRow.source_fichier || null, actif: true };
      const res = await fetch(`${URL}/rest/v1/catalogue_formations`, { method: "POST", headers: H, body: JSON.stringify(row) });
      const j = await res.json();
      console.log(res.status, code, prix + "€", Array.isArray(j) && j[0] ? "OK" : JSON.stringify(j).slice(0, 150));
    }
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
