// retell.test.ts — signature HMAC et dérivation de l'issue d'appel.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeRetellSignature,
  deriveOutcome,
  normalizeRetellCall,
  verifyRetellSignature,
} from "../../supabase/functions/_shared/retell.ts";
import { TEST_RETELL_KEY } from "../helpers/fixtures.ts";

test("verifyRetellSignature accepte une signature valide", async () => {
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "x" } });
  const sig = await computeRetellSignature(body, TEST_RETELL_KEY);
  assert.equal(await verifyRetellSignature(body, sig, TEST_RETELL_KEY), true);
  assert.equal(await verifyRetellSignature(body, "v=" + sig, TEST_RETELL_KEY), true);
});

test("verifyRetellSignature rejette un corps altéré ou une mauvaise clé", async () => {
  const body = JSON.stringify({ event: "call_ended", call: { call_id: "x" } });
  const sig = await computeRetellSignature(body, TEST_RETELL_KEY);
  assert.equal(await verifyRetellSignature(body + " ", sig, TEST_RETELL_KEY), false);
  assert.equal(await verifyRetellSignature(body, sig, "mauvaise_cle"), false);
  assert.equal(await verifyRetellSignature(body, null, TEST_RETELL_KEY), false);
});

test("deriveOutcome distingue les issues d'appel", () => {
  assert.equal(deriveOutcome({ call_id: "a", disconnection_reason: "dial_no_answer" }), "no_answer");
  assert.equal(
    deriveOutcome({ call_id: "a", call_analysis: { in_voicemail: true } }),
    "voicemail",
  );
  assert.equal(
    deriveOutcome({ call_id: "a", disconnection_reason: "user_hangup", duration_ms: 60000 }),
    "answered",
  );
  assert.equal(
    deriveOutcome({
      call_id: "a",
      disconnection_reason: "user_hangup",
      call_analysis: { call_successful: false, custom_analysis_data: { not_interested: true } },
    }),
    "not_interested",
  );
  assert.equal(
    deriveOutcome({
      call_id: "a",
      duration_ms: 30000,
      call_analysis: { custom_analysis_data: { callback_requested: true } },
    }),
    "callback",
  );
});

test("normalizeRetellCall calcule la durée et convertit les timestamps", () => {
  const norm = normalizeRetellCall({
    event: "call_ended",
    call: {
      call_id: "c1",
      start_timestamp: 1_700_000_000_000,
      end_timestamp: 1_700_000_060_000,
      from_number: "+33180001122",
      to_number: "+33612345678",
      direction: "outbound",
      disconnection_reason: "user_hangup",
    },
  });
  assert.equal(norm.duration_ms, 60_000);
  assert.equal(norm.started_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(norm.outcome, "answered");
});
