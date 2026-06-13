// journey.test.ts — parcours bénéficiaire de bout en bout via l'API d'intake.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import { handleIntakeRequest } from "../../supabase/functions/_shared/intake-handler.ts";
import { QueueNotifier } from "../../supabase/functions/_shared/notifier.ts";

async function ctx() {
  const db = await applyMigrations();
  return { db, deps: { store: new PgliteCrmStore(db), notifier: new QueueNotifier() } };
}

async function stage(db: PGlite, id: string): Promise<string> {
  const r = await db.query<{ s: string }>(
    `select pipeline_stage s from crm.beneficiaries where id=$1`, [id],
  );
  return r.rows[0].s;
}

test("intake crée le dossier et renvoie la prochaine étape", async () => {
  const { db, deps } = await ctx();
  const res = await handleIntakeRequest({
    action: "submit_intake",
    beneficiary: { email: "marie@example.com", phone: "0612345678" },
    form_type: "intake",
    profile: { first_name: "Marie", financeur: "edof" },
  }, deps);

  assert.equal(res.status, 200);
  const id = res.body.beneficiary_id as string;
  assert.ok(id);
  assert.equal(res.body.next_step, "eligibilite");

  const b = await db.query(`select first_name, financeur from crm.beneficiaries where id=$1`, [id]);
  assert.equal((b.rows[0] as any).first_name, "Marie");
  assert.equal((b.rows[0] as any).financeur, "edof");
});

test("parcours complet jusqu'à inscrit", async () => {
  const { db, deps } = await ctx();

  const intake = await handleIntakeRequest({
    action: "submit_intake",
    beneficiary: { email: "jean@example.com" },
    form_type: "intake",
  }, deps);
  const id = intake.body.beneficiary_id as string;

  // Éligibilité -> qualifie
  const elig = await handleIntakeRequest({
    action: "submit_intake",
    beneficiary: { id },
    form_type: "eligibility",
    payload: { eligible: true },
  }, deps);
  assert.equal(elig.body.next_step, "pieces");
  assert.equal(await stage(db, id), "qualifie");

  // Pièces : on enregistre puis on valide (validation = acte staff)
  await handleIntakeRequest({
    action: "submit_document", beneficiary_id: id, doc_type: "cni",
    bucket: "beneficiary-documents", path: `b/${id}/cni.pdf`, bytes: 1000,
  }, deps);
  await handleIntakeRequest({
    action: "submit_document", beneficiary_id: id, doc_type: "justif_domicile",
    bucket: "beneficiary-documents", path: `b/${id}/jd.pdf`, bytes: 1000,
  }, deps);
  await db.query(`update crm.documents set status='validated', validated_at=now() where beneficiary_id=$1`, [id]);

  const journey = await handleIntakeRequest({ action: "journey", beneficiary_id: id }, deps);
  assert.equal(journey.body.next_step, "devis");

  // Devis multi-financeur transmis puis accepté
  const quote = await handleIntakeRequest({
    action: "send_quote", beneficiary_id: id, financeur: "edof",
    formation_label: "Permis B", amount_cents: 150000,
    contact: { email: "jean@example.com" },
  }, deps);
  assert.equal(quote.status, 200);
  const quoteId = quote.body.quote_id as string;

  const decided = await handleIntakeRequest({
    action: "decide_quote", beneficiary_id: id, quote_id: quoteId, status: "accepted",
  }, deps);
  assert.equal(decided.body.next_step, null, "parcours complet");
  assert.equal(await stage(db, id), "inscrit");

  // Une relance d'acceptation de devis a été planifiée à la transmission.
  const relance = await db.query(
    `select count(*)::int n from crm.follow_up_tasks where rule_code='relance_devis' and beneficiary_id=$1`, [id],
  );
  assert.equal((relance.rows[0] as any).n, 1);
});

test("financeur inconnu rejeté", async () => {
  const { deps } = await ctx();
  const b = await deps.store.findOrCreateBeneficiaryByEmail("x@example.com", {});
  const res = await handleIntakeRequest({
    action: "send_quote", beneficiary_id: b.id, financeur: "loto",
  }, deps);
  assert.equal(res.status, 400);
});

test("send_quote journalise une notification", async () => {
  const { db, deps } = await ctx();
  const b = await deps.store.findOrCreateBeneficiaryByEmail("notif@example.com", {});
  await handleIntakeRequest({
    action: "send_quote", beneficiary_id: b.id, financeur: "kairos",
    amount_cents: 120000, contact: { email: "notif@example.com" },
  }, deps);
  const n = await db.query(`select channel, status, template_code from crm.notifications where beneficiary_id=$1`, [b.id]);
  assert.equal(n.rows.length, 1);
  assert.equal((n.rows[0] as any).channel, "email");
  assert.equal((n.rows[0] as any).status, "queued"); // QueueNotifier
});
