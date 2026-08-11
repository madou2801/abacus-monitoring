// retell-webhook.test.ts — flux complet du webhook Retell de bout en bout :
// signature -> rapprochement -> appel -> transcript -> enregistrement Storage
// -> automatisations -> idempotence.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../helpers/migrate.ts";
import { MemoryStorage, PgliteCrmStore } from "../helpers/pglite-store.ts";
import { handleRetellWebhook } from "../../supabase/functions/_shared/retell-handler.ts";
import {
  fakeAudioFetch,
  failingFetch,
  retellAnsweredCall,
  retellNoAnswerCall,
  retellVoicemailCall,
  signRetell,
  TEST_RETELL_KEY,
} from "../helpers/fixtures.ts";

async function ctx() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const storage = new MemoryStorage();
  return { db, store, storage };
}

async function post(
  store: PgliteCrmStore,
  storage: MemoryStorage,
  payload: unknown,
  opts: { fetchFn?: ReturnType<typeof fakeAudioFetch>["fn"]; signed?: boolean } = {},
) {
  const body = JSON.stringify(payload);
  const sig = opts.signed === false ? "bad" : await signRetell(body);
  return handleRetellWebhook(body, sig, {
    store,
    storage,
    fetchFn: opts.fetchFn ?? fakeAudioFetch().fn,
    apiKey: TEST_RETELL_KEY,
  });
}

async function count(db: PGlite, sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from ${sql}`, params as any[]);
  return r.rows[0].n;
}

test("signature invalide -> 401, rien n'est persisté", async () => {
  const { db, store, storage } = await ctx();
  const res = await post(store, storage, retellAnsweredCall(), { signed: false });
  assert.equal(res.status, 401);
  assert.equal(await count(db, "crm.calls"), 0);
});

test("appel décroché : dossier, appel, transcript, enregistrement et transition", async () => {
  const { db, store, storage } = await ctx();
  const audio = fakeAudioFetch();
  const res = await post(store, storage, retellAnsweredCall(), { fetchFn: audio.fn });

  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, "answered");

  // Bénéficiaire rapproché par téléphone (+33612345678).
  const benef = await db.query<{ id: string; pipeline_stage: string }>(
    `select id, pipeline_stage from crm.beneficiaries where phone_e164='+33612345678'`,
  );
  assert.equal(benef.rows.length, 1);
  assert.equal(benef.rows[0].pipeline_stage, "contact_etabli", "transition appliquée");

  // Appel + transcript.
  const call = await db.query<{ id: string; recording_path: string; recording_bucket: string }>(
    `select id, recording_path, recording_bucket from crm.calls where retell_call_id='call_answered_001'`,
  );
  assert.equal(call.rows.length, 1);
  assert.equal(await count(db, "crm.transcripts where call_id=$1", [call.rows[0].id]), 1);

  // Enregistrement déposé dans le bucket Storage.
  assert.ok(audio.calls.length === 1, "enregistrement téléchargé une fois");
  assert.ok(call.rows[0].recording_path?.includes("call_answered_001"));
  assert.equal(call.rows[0].recording_bucket, "call-recordings");
  assert.equal(storage.objects.has(`call-recordings/${call.rows[0].recording_path}`), true);
});

test("appel sans réponse : relance planifiée, dossier reste lead", async () => {
  const { db, store, storage } = await ctx();
  const res = await post(store, storage, retellNoAnswerCall());
  assert.equal(res.status, 200);
  assert.equal(res.body.outcome, "no_answer");

  const benef = await db.query<{ id: string; pipeline_stage: string }>(
    `select id, pipeline_stage from crm.beneficiaries where phone_e164='+33655443322'`,
  );
  assert.equal(benef.rows[0].pipeline_stage, "lead");

  const tasks = await db.query(
    `select rule_code from crm.follow_up_tasks where beneficiary_id=$1`, [benef.rows[0].id],
  );
  assert.equal(tasks.rows.length, 1);
  assert.equal((tasks.rows[0] as any).rule_code, "relance_no_answer");
});

test("messagerie : relance email planifiée", async () => {
  const { db, store, storage } = await ctx();
  await post(store, storage, retellVoicemailCall());
  const tasks = await db.query(`select rule_code, channel from crm.follow_up_tasks`);
  assert.equal(tasks.rows.length, 1);
  assert.equal((tasks.rows[0] as any).rule_code, "relance_voicemail");
  assert.equal((tasks.rows[0] as any).channel, "email");
});

test("idempotence : un même évènement n'est traité qu'une fois", async () => {
  const { db, store, storage } = await ctx();
  const first = await post(store, storage, retellAnsweredCall());
  const second = await post(store, storage, retellAnsweredCall());

  assert.equal(first.body.deduplicated, undefined);
  assert.equal(second.body.deduplicated, true);
  assert.equal(await count(db, "crm.calls"), 1);
  // Pas de double relance ni double transition.
  assert.equal(await count(db, "crm.pipeline_transitions"), 1);
});

test("échec de téléchargement d'enregistrement : 200 + erreur signalée, données conservées", async () => {
  const { db, store, storage } = await ctx();
  const res = await post(store, storage, retellAnsweredCall(), { fetchFn: failingFetch() });
  assert.equal(res.status, 200);
  assert.ok(String(res.body.recording_error).includes("404"));
  // L'appel et la transition sont quand même persistés.
  assert.equal(await count(db, "crm.calls where recording_path is null"), 1);
  assert.equal(await count(db, "crm.pipeline_transitions"), 1);
});
