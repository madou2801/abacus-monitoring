#!/usr/bin/env node
/**
 * seed_abacus_academy_sends.js
 * -----------------------------------------------------------------------------
 * Génère les INSERT des 122 destinataires retenus (statut 'a_envoyer') pour la
 * table ref.abacus_academy_sends (base Gaïa oezaby).
 *
 * Source  : C:\Users\ThinkPad\Desktop\perso_academy\build\master.json
 * Colonnes : structure, email, type, pays, dirigeant  (statut = 'a_envoyer')
 *
 * À EXÉCUTER APRÈS la création de la table (abacus_academy_sends.sql).
 *
 * Deux modes :
 *   1) Génération SQL (par défaut, aucune dépendance) :
 *        node seed_abacus_academy_sends.js > seed_abacus_academy_sends.generated.sql
 *      puis coller/exécuter le SQL dans le SQL editor oezaby.
 *
 *   2) Insertion directe via l'API Supabase (si les env sont présents) :
 *        GAIA_SUPABASE_URL=... GAIA_SUPABASE_SERVICE_ROLE_KEY=... \
 *        node seed_abacus_academy_sends.js --run
 *      (nécessite @supabase/supabase-js, déjà présent dans web/).
 * -----------------------------------------------------------------------------
 */
const fs = require("fs");
const path = require("path");

const MASTER =
  process.env.ACADEMY_MASTER_JSON ||
  "C:\\Users\\ThinkPad\\Desktop\\perso_academy\\build\\master.json";

function loadRows() {
  const raw = JSON.parse(fs.readFileSync(MASTER, "utf8"));
  const list = Array.isArray(raw) ? raw : raw.destinataires || [];
  return list.map((d) => ({
    structure: d.structure ?? null,
    email: d.email ?? null,
    type: d.type ?? null,
    pays: d.pays ?? null,
    dirigeant: d.dirigeant ?? d.dirigeant_nom ?? null,
    statut: "a_envoyer",
  }));
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function toSql(rows) {
  const header =
    "-- Généré par seed_abacus_academy_sends.js — " +
    new Date().toISOString() +
    "\n-- " +
    rows.length +
    " destinataires, statut 'a_envoyer'.\n" +
    "-- Idempotent-friendly : lancer une seule fois (pas de contrainte d'unicité).\n\n";
  const values = rows
    .map(
      (r) =>
        "  (" +
        [r.structure, r.email, r.type, r.pays, r.dirigeant, r.statut]
          .map(sqlLiteral)
          .join(", ") +
        ")",
    )
    .join(",\n");
  return (
    header +
    "INSERT INTO ref.abacus_academy_sends\n" +
    "  (structure, email, type, pays, dirigeant, statut)\nVALUES\n" +
    values +
    ";\n"
  );
}

async function run(rows) {
  const url = process.env.GAIA_SUPABASE_URL;
  const key = process.env.GAIA_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "GAIA_SUPABASE_URL / GAIA_SUPABASE_SERVICE_ROLE_KEY manquants pour --run.",
    );
    process.exit(1);
  }
  const { createClient } = require(path.join(
    __dirname,
    "..",
    "node_modules",
    "@supabase",
    "supabase-js",
  ));
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "ref" },
  });
  const { error, count } = await c
    .from("abacus_academy_sends")
    .insert(rows, { count: "exact" });
  if (error) {
    console.error("Erreur insertion :", error.message);
    process.exit(1);
  }
  console.error(`OK — ${count ?? rows.length} lignes insérées.`);
}

const rows = loadRows();
if (process.argv.includes("--run")) {
  run(rows);
} else {
  process.stdout.write(toSql(rows));
  console.error(`${rows.length} lignes générées (SQL sur stdout).`);
}
