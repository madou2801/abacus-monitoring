// work-layer.test.ts — couche « travail » du CRM (migration 0022) :
// édition contrôlée des propriétés (update_beneficiary_fields), historique
// field_changes, verrouillage locked_fields, notes et tâches dans la timeline.
// Tourne sur le vrai SQL (PGlite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";

async function ctx() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  return { db, store };
}

test("update_beneficiary_fields : diff, historique, verrouillage", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("edit@example.com", {});

  const res = await db.query(
    `select crm.update_beneficiary_fields($1, $2::jsonb, $3) as changed`,
    [b.id, JSON.stringify({ first_name: "Awa", financeur: "edof" }), "staff@test.fr"],
  );
  assert.equal((res.rows[0] as any).changed, true);

  const row = await db.query(
    `select first_name, financeur, locked_fields from crm.beneficiaries where id=$1`, [b.id]);
  const r = row.rows[0] as any;
  assert.equal(r.first_name, "Awa");
  assert.equal(r.financeur, "edof");
  assert.ok(r.locked_fields.includes("first_name"), "first_name verrouillé");
  assert.ok(r.locked_fields.includes("financeur"), "financeur verrouillé");

  const hist = await db.query(
    `select actor, changes from crm.field_changes where beneficiary_id=$1`, [b.id]);
  assert.equal(hist.rows.length, 1);
  assert.equal((hist.rows[0] as any).actor, "staff@test.fr");
  assert.equal((hist.rows[0] as any).changes.first_name.to, "Awa");

  // L'édition apparaît dans la timeline (event_type 'edit').
  const tl = await db.query(
    `select title, detail from crm.vw_beneficiary_timeline where beneficiary_id=$1 and event_type='edit'`,
    [b.id]);
  assert.equal(tl.rows.length, 1);
  assert.match((tl.rows[0] as any).detail, /financeur, first_name/);
});

test("update_beneficiary_fields : appel sans changement -> false, pas d'historique", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("noop@example.com", {});

  await db.query(`select crm.update_beneficiary_fields($1, $2::jsonb, $3)`,
    [b.id, JSON.stringify({ first_name: "Sam" }), "staff@test.fr"]);
  const res = await db.query(
    `select crm.update_beneficiary_fields($1, $2::jsonb, $3) as changed`,
    [b.id, JSON.stringify({ first_name: "Sam" }), "staff@test.fr"]);
  assert.equal((res.rows[0] as any).changed, false);

  const hist = await db.query(
    `select count(*)::int as n from crm.field_changes where beneficiary_id=$1`, [b.id]);
  assert.equal((hist.rows[0] as any).n, 1);
});

test("update_beneficiary_fields : champ hors allowlist et financeur inconnu -> erreur", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("guard@example.com", {});

  await assert.rejects(
    db.query(`select crm.update_beneficiary_fields($1, $2::jsonb, $3)`,
      [b.id, JSON.stringify({ pipeline_stage: "certifie" }), "staff@test.fr"]),
    /non modifiable/,
  );
  await assert.rejects(
    db.query(`select crm.update_beneficiary_fields($1, $2::jsonb, $3)`,
      [b.id, JSON.stringify({ financeur: "bitcoin" }), "staff@test.fr"]),
    /inconnu/,
  );
});

test("notes et tâches : visibles dans la timeline et comptées comme interactions", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("notes@example.com", {});

  await db.query(
    `insert into crm.notes (beneficiary_id, author_email, content) values ($1,$2,$3)`,
    [b.id, "staff@test.fr", "Rappelé, très motivé."]);
  await db.query(
    `insert into crm.tasks (beneficiary_id, title, assignee_email, created_by) values ($1,$2,$3,$3)`,
    [b.id, "Envoyer le devis", "staff@test.fr"]);

  const tl = await db.query(
    `select event_type, title from crm.vw_beneficiary_timeline where beneficiary_id=$1 order by event_type`,
    [b.id]);
  const types = tl.rows.map((r: any) => r.event_type);
  assert.ok(types.includes("note"), "note dans la timeline");
  assert.ok(types.includes("task"), "tâche dans la timeline");

  const enriched = await db.query(
    `select nb_interactions from crm.vw_beneficiary_enriched where id=$1`, [b.id]);
  assert.ok((enriched.rows[0] as any).nb_interactions >= 2);
});

test("tasks : contrainte de statut", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("task@example.com", {});
  await assert.rejects(
    db.query(`insert into crm.tasks (beneficiary_id, title, status) values ($1,'x','pas_un_statut')`, [b.id]),
    /tasks_status_chk/,
  );
});
