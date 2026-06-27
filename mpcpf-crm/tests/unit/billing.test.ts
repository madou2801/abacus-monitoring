// billing.test.ts — facturation : création depuis devis, cycle de vie, garde-fous.
// Tourne sur le vrai SQL des migrations (PGlite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import {
  advanceInvoice,
  issueInvoiceFromCertification,
} from "../../supabase/functions/_shared/billing.ts";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const b = await store.findOrCreateBeneficiaryByEmail("facture@example.com", {});
  return { db, store, id: b.id };
}

test("issueInvoiceFromCertification sans devis accepté ne crée rien", async () => {
  const { store, id } = await setup();
  const r = await issueInvoiceFromCertification(store, id);
  assert.equal(r.created, false);
  assert.equal(r.invoiceId, null);
});

test("issueInvoiceFromCertification crée la facture depuis le devis accepté", async () => {
  const { db, store, id } = await setup();
  const q = await store.createQuote({
    beneficiary_id: id, financeur: "edof", amount_cents: 150000, formation_label: "Permis B",
  });
  await store.setQuoteStatus(q, "accepted");

  const r = await issueInvoiceFromCertification(store, id);
  assert.equal(r.created, true);
  assert.ok(r.invoiceId);

  const inv = await db.query(
    `select financeur, channel, amount_cents, status, quote_id from crm.invoices where id=$1`,
    [r.invoiceId],
  );
  assert.equal((inv.rows[0] as any).financeur, "edof");
  assert.equal((inv.rows[0] as any).channel, "wedof");
  assert.equal((inv.rows[0] as any).amount_cents, 150000);
  assert.equal((inv.rows[0] as any).status, "a_emettre");

  // idempotent : un 2e passage renvoie la même facture, pas de doublon.
  const r2 = await issueInvoiceFromCertification(store, id);
  assert.equal(r2.invoiceId, r.invoiceId);
  const n = await db.query(`select count(*)::int n from crm.invoices where beneficiary_id=$1`, [id]);
  assert.equal((n.rows[0] as any).n, 1);
});

test("cycle de vie a_emettre -> emise -> transmise -> encaissee, sans régression", async () => {
  const { db, store, id } = await setup();
  const invId = await store.createInvoice({
    beneficiary_id: id, financeur: "autofinancement", amount_cents: 99000,
  });

  assert.equal(await advanceInvoice(store, invId, "emise"), true);
  assert.equal(await advanceInvoice(store, invId, "transmise"), true);
  assert.equal(await advanceInvoice(store, invId, "emise"), false, "régression interdite");
  assert.equal(await advanceInvoice(store, invId, "encaissee"), true);

  const inv = await db.query(
    `select status, channel, issued_at, transmitted_at, settled_at from crm.invoices where id=$1`,
    [invId],
  );
  assert.equal((inv.rows[0] as any).status, "encaissee");
  assert.equal((inv.rows[0] as any).channel, "stripe");
  assert.ok((inv.rows[0] as any).issued_at);
  assert.ok((inv.rows[0] as any).settled_at);

  // l'émission a planifié une relance « facture impayée ».
  const relance = await db.query(
    `select count(*)::int n from crm.follow_up_tasks where rule_code='relance_facture_impayee' and beneficiary_id=$1`,
    [id],
  );
  assert.ok((relance.rows[0] as any).n >= 1);
});

test("annulation interdite après encaissement", async () => {
  const { store, id } = await setup();
  const invId = await store.createInvoice({ beneficiary_id: id, financeur: "opco" });
  await advanceInvoice(store, invId, "emise");
  await advanceInvoice(store, invId, "encaissee");
  assert.equal(await advanceInvoice(store, invId, "annulee"), false);
});
