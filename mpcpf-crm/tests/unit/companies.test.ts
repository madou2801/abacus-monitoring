// companies.test.ts — entreprises rattachées aux salariés + devis au nom de l'entreprise.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const b = await store.findOrCreateBeneficiaryByEmail("salarie@acme.com", {});
  return { db, id: b.id };
}

test("upsert_company : crée puis met à jour par SIRET (pas de doublon)", async () => {
  const { db } = await setup();
  const c1 = await db.query<{ id: string }>(
    `select crm.upsert_company('ACME SARL','12345678900012',null,null,'Lille','contact@acme.com') as id`);
  const id1 = c1.rows[0].id;
  const c2 = await db.query<{ id: string }>(
    `select crm.upsert_company('ACME SARL (maj)','12345678900012') as id`);
  assert.equal(c2.rows[0].id, id1, "même SIRET => même entreprise");
  const n = await db.query(`select count(*)::int n, max(raison_sociale) rs from crm.companies`);
  assert.equal((n.rows[0] as any).n, 1);
  assert.equal((n.rows[0] as any).rs, "ACME SARL (maj)");
});

test("rattachement salarié -> entreprise", async () => {
  const { db, id } = await setup();
  const c = await db.query<{ id: string }>(`select crm.upsert_company('ACME SARL','111') as id`);
  const cid = c.rows[0].id;
  await db.query(`select crm.link_beneficiary_company($1,$2)`, [id, cid]);
  const b = await db.query(`select company_id from crm.beneficiaries where id=$1`, [id]);
  assert.equal((b.rows[0] as any).company_id, cid);
});

test("devis AU NOM DE L'ENTREPRISE (create_quote + company_id)", async () => {
  const { db, id } = await setup();
  const c = await db.query<{ id: string }>(`select crm.upsert_company('ACME SARL','222') as id`);
  const cid = c.rows[0].id;
  const q = await db.query<{ id: string }>(
    `select crm.create_quote($1,'opco',150000,'SST',null,null,true,'{}'::jsonb,$2) as id`, [id, cid]);
  const inv = await db.query(`select beneficiary_id, company_id, status from crm.quotes where id=$1`, [q.rows[0].id]);
  assert.equal((inv.rows[0] as any).company_id, cid, "devis rattaché à l'entreprise");
  assert.equal((inv.rows[0] as any).beneficiary_id, id, "et au salarié");
  assert.equal((inv.rows[0] as any).status, "sent");
});

test("vue entreprise : compte salariés + devis", async () => {
  const { db, id } = await setup();
  const c = await db.query<{ id: string }>(`select crm.upsert_company('ACME SARL','333') as id`);
  const cid = c.rows[0].id;
  await db.query(`select crm.link_beneficiary_company($1,$2)`, [id, cid]);
  await db.query(`select crm.create_quote($1,'opco',100000,'SST',null,null,true,'{}'::jsonb,$2)`, [id, cid]);
  const v = await db.query(`select nb_salaries, nb_devis from crm.vw_company_overview where id=$1`, [cid]);
  assert.equal(Number((v.rows[0] as any).nb_salaries), 1);
  assert.equal(Number((v.rows[0] as any).nb_devis), 1);
});

test("create_quote refuse une entreprise inexistante", async () => {
  const { db, id } = await setup();
  await assert.rejects(() =>
    db.query(`select crm.create_quote($1,'opco',100,'SST',null,null,true,'{}'::jsonb,'00000000-0000-0000-0000-000000000000')`, [id]));
});
