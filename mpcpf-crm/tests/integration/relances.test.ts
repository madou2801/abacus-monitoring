// relances.test.ts — moteur de relances : détection des dossiers dormants,
// dispatch par canal, idempotence du traitement.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import {
  type ChannelDispatcher,
  processRelances,
} from "../../supabase/functions/_shared/relances-handler.ts";
import { notify, QueueNotifier } from "../../supabase/functions/_shared/notifier.ts";

async function ctx() {
  const db = await applyMigrations();
  return { db, store: new PgliteCrmStore(db) };
}

const okDispatchers: Record<string, ChannelDispatcher> = {
  email: (t) => Promise.resolve({ result: `email-${t.id}` }),
  call: (t) => Promise.resolve({ result: `call-${t.id}` }),
};

test("traite les relances échues et les marque done", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33611112222", {});
  await store.scheduleFollowUp(b!.id, "relance_voicemail"); // email, délai 60 min
  await db.query(`update crm.follow_up_tasks set due_at = now() - interval '1 minute'`);

  const report = await processRelances({ store, dispatchers: okDispatchers });
  assert.equal(report.processed, 1);
  assert.equal(report.done, 1);

  const done = await db.query(`select status, result from crm.follow_up_tasks`);
  assert.equal((done.rows[0] as any).status, "done");
  assert.ok((done.rows[0] as any).result.startsWith("email-"));
});

test("detectStale planifie puis ignore les non-échues", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33633334444", {});
  await db.query(`update crm.beneficiaries set stage_changed_at = now() - interval '10 days' where id=$1`, [b!.id]);

  // relance_stale a un délai de 0 -> due immédiatement après planification.
  const report = await processRelances({ store, dispatchers: okDispatchers, detectStale: true });
  assert.equal(report.staleScheduled, 1);
  assert.equal(report.processed, 1);
  assert.equal(report.done, 1);
});

test("un canal sans dispatcher fait échouer proprement la relance", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33655556666", {});
  await store.scheduleFollowUp(b!.id, "relance_no_answer"); // canal 'call'
  await db.query(`update crm.follow_up_tasks set due_at = now() - interval '1 minute'`);

  const report = await processRelances({ store, dispatchers: { email: okDispatchers.email } });
  assert.equal(report.failed, 1);
  const t = await db.query(`select status, last_error from crm.follow_up_tasks`);
  assert.equal((t.rows[0] as any).status, "failed");
});

test("un dispatcher qui jette est capturé et marque failed", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33677778888", {});
  await store.scheduleFollowUp(b!.id, "relance_voicemail");
  await db.query(`update crm.follow_up_tasks set due_at = now() - interval '1 minute'`);

  const boom: Record<string, ChannelDispatcher> = {
    email: () => Promise.reject(new Error("SMTP down")),
  };
  const report = await processRelances({ store, dispatchers: boom });
  assert.equal(report.failed, 1);
  const t = await db.query(`select status, last_error from crm.follow_up_tasks`);
  assert.equal((t.rows[0] as any).last_error, "SMTP down");
});

test("getBeneficiaryContact renvoie email + téléphone E.164", async () => {
  const { store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33612345678", {});
  await store.updateProfile(b!.id, { email: "contact@y.com" });
  const c = await store.getBeneficiaryContact(b!.id);
  assert.equal(c?.email, "contact@y.com");
  assert.equal(c?.phone, "+33612345678");
});

test("dispatcher email réel : lookup contact + notify + journal", async () => {
  const { db, store } = await ctx();
  const b = await store.findOrCreateBeneficiaryByPhone("+33699998888", {});
  await store.updateProfile(b!.id, { email: "benef@y.com" });
  await store.scheduleFollowUp(b!.id, "relance_voicemail"); // canal email
  await db.query(`update crm.follow_up_tasks set due_at = now() - interval '1 minute'`);

  // dispatcher qui réplique le câblage edge function (contact + notify).
  const realEmail: ChannelDispatcher = async (task, s) => {
    const contact = await s.getBeneficiaryContact(task.beneficiary_id);
    if (!contact?.email) throw new Error("email manquant");
    const { result } = await notify(s, new QueueNotifier(), task.beneficiary_id, {
      channel: "email", to: contact.email, subject: "Relance", body: "corps",
      templateCode: task.template_code ?? undefined,
    });
    return { result: `email ${result.status}` };
  };

  const report = await processRelances({ store, dispatchers: { email: realEmail } });
  assert.equal(report.done, 1);

  const notifs = await db.query(
    `select channel, to_addr, status from crm.notifications where beneficiary_id=$1`, [b!.id],
  );
  assert.equal(notifs.rows.length, 1);
  assert.equal((notifs.rows[0] as any).to_addr, "benef@y.com");
});
