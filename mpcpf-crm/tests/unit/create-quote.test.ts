// create-quote.test.ts — primitive SQL de création de devis (manuelle/auto).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const b = await store.findOrCreateBeneficiaryByEmail("devis@example.com", {});
  return { db, id: b.id };
}

test("create_quote crée + transmet + planifie la relance devis", async () => {
  const { db, id } = await setup();
  const r = await db.query<{ id: string }>(
    `select crm.create_quote($1,'edof',150000,'Permis B') as id`, [id],
  );
  const quoteId = r.rows[0].id;
  assert.ok(quoteId);

  const q = await db.query(`select status, amount_cents, valid_until from crm.quotes where id=$1`, [quoteId]);
  assert.equal((q.rows[0] as any).status, "sent");
  assert.equal((q.rows[0] as any).amount_cents, 150000);
  assert.ok((q.rows[0] as any).valid_until, "échéance posée à la transmission");

  const relance = await db.query(
    `select count(*)::int n from crm.follow_up_tasks where rule_code='relance_devis' and beneficiary_id=$1`, [id],
  );
  assert.equal((relance.rows[0] as any).n, 1);
});

test("create_quote sans transmission → draft, pas de relance", async () => {
  const { db, id } = await setup();
  const r = await db.query<{ id: string }>(
    `select crm.create_quote($1,'kairos',120000,'Permis B',null,null,false) as id`, [id],
  );
  const q = await db.query(`select status from crm.quotes where id=$1`, [r.rows[0].id]);
  assert.equal((q.rows[0] as any).status, "draft");
  const relance = await db.query(
    `select count(*)::int n from crm.follow_up_tasks where rule_code='relance_devis' and beneficiary_id=$1`, [id],
  );
  assert.equal((relance.rows[0] as any).n, 0);
});

test("create_quote refuse un financeur inconnu", async () => {
  const { db, id } = await setup();
  await assert.rejects(() => db.query(`select crm.create_quote($1,'loto',100)`, [id]));
});

test("create_quote refuse un bénéficiaire inexistant", async () => {
  const { db } = await setup();
  await assert.rejects(() =>
    db.query(`select crm.create_quote('00000000-0000-0000-0000-000000000000','edof',100)`));
});
