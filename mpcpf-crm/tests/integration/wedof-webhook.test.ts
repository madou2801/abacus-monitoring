// wedof-webhook.test.ts — flux complet du webhook Wedof.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import { handleWedofWebhook } from "../../supabase/functions/_shared/wedof-handler.ts";
import { TEST_WEDOF_SECRET, wedofEvent } from "../helpers/fixtures.ts";

async function ctx() {
  const db = await applyMigrations();
  return { db, store: new PgliteCrmStore(db) };
}

function post(store: PgliteCrmStore, payload: unknown, secret = TEST_WEDOF_SECRET) {
  return handleWedofWebhook(JSON.stringify(payload), secret, {
    store,
    secret: TEST_WEDOF_SECRET,
  });
}

test("secret invalide -> 401", async () => {
  const { store } = await ctx();
  const res = await post(store, wedofEvent("registrationFolder.validated"), "mauvais");
  assert.equal(res.status, 401);
});

test("création du dossier par email + passage à inscrit", async () => {
  const { db, store } = await ctx();
  const res = await post(store, wedofEvent("registrationFolder.validated"));
  assert.equal(res.status, 200);

  const benef = await db.query<{ id: string; pipeline_stage: string; wedof_state: string; wedof_folder_id: string }>(
    `select id, pipeline_stage, wedof_state, wedof_folder_id from crm.beneficiaries where lower(email)='camille.durand@example.com'`,
  );
  assert.equal(benef.rows.length, 1);
  assert.equal(benef.rows[0].pipeline_stage, "inscrit");
  assert.equal(benef.rows[0].wedof_state, "validated");
  assert.equal(benef.rows[0].wedof_folder_id, "WF-1000");

  const evt = await db.query(`select count(*)::int as n from crm.wedof_events`);
  assert.equal((evt.rows[0] as any).n, 1);
});

test("rapprochement par folder id sur un dossier existant", async () => {
  const { db, store } = await ctx();
  await post(store, wedofEvent("registrationFolder.validated")); // crée WF-1000
  const res = await post(store, wedofEvent("registrationFolder.inTraining"));
  assert.equal(res.status, 200);

  const benef = await db.query<{ pipeline_stage: string }>(
    `select pipeline_stage from crm.beneficiaries where wedof_folder_id='WF-1000'`,
  );
  // un seul dossier, avancé jusqu'à en_formation
  assert.equal(benef.rows.length, 1);
  assert.equal(benef.rows[0].pipeline_stage, "en_formation");
});

test("état toComplete -> relance pièces planifiée", async () => {
  const { db, store } = await ctx();
  await post(store, wedofEvent("registrationFolder.toComplete"));
  const tasks = await db.query(`select rule_code from crm.follow_up_tasks`);
  assert.equal((tasks.rows[0] as any).rule_code, "relance_wedof_doc");
});

test("idempotence Wedof", async () => {
  const { db, store } = await ctx();
  await post(store, wedofEvent("registrationFolder.validated"));
  const dup = await post(store, wedofEvent("registrationFolder.validated"));
  assert.equal(dup.body.deduplicated, true);
  const evt = await db.query(`select count(*)::int as n from crm.wedof_events`);
  assert.equal((evt.rows[0] as any).n, 1);
});
