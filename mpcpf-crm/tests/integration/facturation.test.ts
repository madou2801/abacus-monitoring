// facturation.test.ts — bout en bout : auto-facture à la certification Wedof,
// API back-office (create_invoice / set_invoice_status), détection des impayés,
// vues facturation. Tourne sur le vrai SQL (PGlite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import { QueueNotifier } from "../../supabase/functions/_shared/notifier.ts";
import { handleIntakeRequest } from "../../supabase/functions/_shared/intake-handler.ts";
import { applyWedofAutomations } from "../../supabase/functions/_shared/automation.ts";
import { processRelances } from "../../supabase/functions/_shared/relances-handler.ts";

async function ctx() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  return { db, store, deps: { store, notifier: new QueueNotifier() } };
}

test("certification Wedof -> facture auto depuis le devis accepté", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("benef@example.com", {});
  const q = await store.createQuote({ beneficiary_id: b.id, financeur: "edof", amount_cents: 150000 });
  await store.setQuoteStatus(q, "accepted");

  const res = await applyWedofAutomations(store, { beneficiaryId: b.id, state: "terminated" });
  assert.equal(res.newStage, "certifie");
  assert.ok(res.invoiceCreated, "une facture est créée à la certification");

  const inv = await db.query(`select status, financeur from crm.invoices where beneficiary_id=$1`, [b.id]);
  assert.equal(inv.rows.length, 1);
  assert.equal((inv.rows[0] as any).status, "a_emettre");
  assert.equal((inv.rows[0] as any).financeur, "edof");
});

test("certification sans devis accepté ne crée pas de facture", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("nodevis@example.com", {});
  const res = await applyWedofAutomations(store, { beneficiaryId: b.id, state: "terminated" });
  assert.equal(res.newStage, "certifie");
  assert.equal(res.invoiceCreated, undefined);
  const inv = await db.query(`select count(*)::int n from crm.invoices where beneficiary_id=$1`, [b.id]);
  assert.equal((inv.rows[0] as any).n, 0);
});

test("API : create_invoice puis set_invoice_status", async () => {
  const { db, store, deps } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("api@example.com", {});

  const created = await handleIntakeRequest({
    action: "create_invoice", beneficiary_id: b.id, financeur: "kairos",
    amount_cents: 120000, formation_label: "Permis B",
  }, deps);
  assert.equal(created.status, 200);
  const invoiceId = created.body.invoice_id as string;
  assert.ok(invoiceId);

  const upd = await handleIntakeRequest({
    action: "set_invoice_status", beneficiary_id: b.id, invoice_id: invoiceId, status: "emise", external_ref: "AIF-123",
  }, deps);
  assert.equal(upd.status, 200);
  assert.equal(upd.body.changed, true);

  const inv = await db.query(
    `select status, channel, external_ref from crm.invoices where id=$1`, [invoiceId],
  );
  assert.equal((inv.rows[0] as any).status, "emise");
  assert.equal((inv.rows[0] as any).channel, "france_travail");
  assert.equal((inv.rows[0] as any).external_ref, "AIF-123");
});

test("create_invoice refuse un financeur inconnu", async () => {
  const { store, deps } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("bad@example.com", {});
  const res = await handleIntakeRequest({
    action: "create_invoice", beneficiary_id: b.id, financeur: "loto",
  }, deps);
  assert.equal(res.status, 400);
});

test("détection des factures impayées planifie une relance", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("overdue@example.com", {});
  const invId = await store.createInvoice({ beneficiary_id: b.id, financeur: "opco", amount_cents: 100000 });
  await store.setInvoiceStatus(invId, "transmise");

  // échéance dépassée + on repart d'une file vide pour isoler la détection.
  await db.query(`update crm.invoices set due_date = current_date - 1 where id=$1`, [invId]);
  await db.query(`delete from crm.follow_up_tasks where beneficiary_id=$1`, [b.id]);

  const n = await store.detectOverdueInvoices();
  assert.equal(n, 1);

  const planned = await db.query(
    `select count(*)::int n from crm.follow_up_tasks where rule_code='relance_facture_impayee' and beneficiary_id=$1`,
    [b.id],
  );
  assert.equal((planned.rows[0] as any).n, 1);
});

test("processRelances remonte les impayés détectés", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("cron@example.com", {});
  const invId = await store.createInvoice({ beneficiary_id: b.id, financeur: "edof", amount_cents: 150000 });
  await store.setInvoiceStatus(invId, "transmise");
  await db.query(`update crm.invoices set due_date = current_date - 3 where id=$1`, [invId]);
  await db.query(`delete from crm.follow_up_tasks where beneficiary_id=$1`, [b.id]);

  const report = await processRelances({
    store,
    dispatchers: { email: (t) => Promise.resolve({ result: `email-${t.id}` }) },
    detectStale: true,
  });
  assert.equal(report.overdueInvoicesScheduled, 1);
});

test("vw_facturation expose le retard et vw_facturation_funnel les 6 statuts", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByEmail("vue@example.com", {});
  const invId = await store.createInvoice({ beneficiary_id: b.id, financeur: "edof", amount_cents: 150000 });
  await store.setInvoiceStatus(invId, "transmise");
  await db.query(`update crm.invoices set due_date = current_date - 5 where id=$1`, [invId]);

  const v = await db.query(
    `select status, days_overdue, amount_cents from crm.vw_facturation where id=$1`, [invId],
  );
  assert.equal((v.rows[0] as any).status, "transmise");
  assert.equal(Number((v.rows[0] as any).days_overdue), 5);
  assert.equal(Number((v.rows[0] as any).amount_cents), 150000);

  const funnel = await db.query(`select status, count, total_cents from crm.vw_facturation_funnel order by rank`);
  assert.equal(funnel.rows.length, 6);
});
