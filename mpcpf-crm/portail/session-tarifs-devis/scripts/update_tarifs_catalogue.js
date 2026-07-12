// update_tarifs_catalogue.js — MAJ tarifs de vente MPCPF dans catalogue_formations (Supabase MPCPF).
// Backup -> PATCH -> verif. Lance sur le VPS 88 (lit /opt/campaign-tracker/.env).
require("/opt/campaign-tracker/node_modules/dotenv").config({ path: "/opt/campaign-tracker/.env" });
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_KEY;
const H = { "apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "Prefer": "return=representation" };

// Cibles : filtre PostgREST -> nouveau prix (tarif_cpf ET tarif_perso).
const updates = [
  { label: "Permis C",           q: "code=eq.C",                        prix: 3000 },
  { label: "Permis C1",          q: "code=eq.C1",                       prix: 3000 },
  { label: "Permis D",           q: "code=eq.D",                        prix: 3500 },
  { label: "Permis D1",          q: "code=eq.D1",                       prix: 3500 },
  { label: "FIMO Voyageurs",     q: "code=eq.FIMOV",                    prix: 3150 },
  { label: "SSIAP 3 Initial",    q: "code=eq.SSIAP3&tarif_cpf=eq.3200", prix: 5200 },
];

(async () => {
  // 1) BACKUP
  console.log("=== BACKUP (avant) ===");
  for (const u of updates) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?${u.q}&select=code,intitule,tarif_cpf,tarif_perso`, { headers: H });
    console.log(u.label, "->", JSON.stringify(await r.json()));
  }
  // 2) PATCH
  console.log("\n=== PATCH ===");
  for (const u of updates) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?${u.q}`, {
      method: "PATCH", headers: H,
      body: JSON.stringify({ tarif_cpf: u.prix, tarif_perso: u.prix }),
    });
    const j = await r.json();
    console.log(u.label, r.status, Array.isArray(j) ? `${j.length} ligne(s) -> ${u.prix}€` : JSON.stringify(j));
  }
  // 3) VERIF
  console.log("\n=== VERIF (apres) ===");
  for (const u of updates) {
    const r = await fetch(`${URL}/rest/v1/catalogue_formations?${u.q}&select=code,tarif_cpf,tarif_perso`, { headers: H });
    console.log(u.label, "->", JSON.stringify(await r.json()));
  }
})().catch(e => { console.error("ERR", e && e.message); process.exit(1); });
