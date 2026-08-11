// lucie-webhook.test.ts — webhook Retell avec notifier : capture Lucie de bout en bout.

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { MemoryStorage, PgliteCrmStore } from "../helpers/pglite-store.ts";
import { handleRetellWebhook } from "../../supabase/functions/_shared/retell-handler.ts";
import { QueueNotifier } from "../../supabase/functions/_shared/notifier.ts";
import { fakeAudioFetch, signRetell, TEST_RETELL_KEY } from "../helpers/fixtures.ts";
import type { RetellWebhookPayload } from "../../supabase/functions/_shared/types.ts";

const payload: RetellWebhookPayload = {
  event: "call_analyzed",
  call: {
    call_id: "call_lucie_001",
    direction: "outbound",
    from_number: "+33180001122",
    to_number: "+33612345678",
    call_status: "ended",
    disconnection_reason: "user_hangup",
    start_timestamp: 1_700_000_000_000,
    end_timestamp: 1_700_000_120_000,
    duration_ms: 120_000,
    transcript: "Agent: Bonjour... User: ...",
    call_analysis: {
      call_summary: "Bénéficiaire intéressé, financement CPF.",
      user_sentiment: "Positive",
      call_successful: true,
      in_voicemail: false,
      custom_analysis_data: {
        prenom: "Karim",
        nom: "Benali",
        email: "karim.benali@example.com",
        financement: "CPF",
        permis: "Permis B",
      },
    },
  },
};

test("appel Lucie décroché : profil capturé, notification + relance intake", async () => {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const body = JSON.stringify(payload);

  const res = await handleRetellWebhook(body, await signRetell(body), {
    store,
    storage: new MemoryStorage(),
    fetchFn: fakeAudioFetch().fn,
    apiKey: TEST_RETELL_KEY,
    notifier: new QueueNotifier(),
  });

  assert.equal(res.status, 200);
  assert.equal((res.body.lucie_capture as any).profileUpdated, true);

  const b = await db.query<{ first_name: string; email: string; financeur: string; pipeline_stage: string }>(
    `select first_name, email, financeur, pipeline_stage from crm.beneficiaries where phone_e164='+33612345678'`,
  );
  assert.equal(b.rows[0].first_name, "Karim");
  assert.equal(b.rows[0].email, "karim.benali@example.com");
  assert.equal(b.rows[0].financeur, "edof");
  assert.equal(b.rows[0].pipeline_stage, "contact_etabli"); // appel décroché

  const id = (await db.query<{ id: string }>(`select id from crm.beneficiaries where phone_e164='+33612345678'`)).rows[0].id;
  const notif = await db.query(`select channel from crm.notifications where beneficiary_id=$1`, [id]);
  assert.equal((notif.rows[0] as any).channel, "email");
  const relance = await db.query(`select rule_code from crm.follow_up_tasks where beneficiary_id=$1`, [id]);
  assert.ok(relance.rows.some((r: any) => r.rule_code === "relance_intake"));
});

test("sans notifier, pas de capture Lucie (rétro-compatible)", async () => {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const body = JSON.stringify(payload);
  const res = await handleRetellWebhook(body, await signRetell(body), {
    store,
    storage: new MemoryStorage(),
    fetchFn: fakeAudioFetch().fn,
    apiKey: TEST_RETELL_KEY,
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.lucie_capture, undefined);
});
