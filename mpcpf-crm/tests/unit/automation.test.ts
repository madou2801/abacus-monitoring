// automation.test.ts — règles de transition + relances, sur le vrai SQL (PGlite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import {
  applyCallAutomations,
  applyWedofAutomations,
} from "../../supabase/functions/_shared/automation.ts";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  const b = await store.findOrCreateBeneficiaryByPhone("+33612345678", {});
  return { db, store, beneficiaryId: b!.id };
}

test("appel décroché -> contact_etabli", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyCallAutomations(store, { beneficiaryId, outcome: "answered" });
  assert.equal(res.stageChanged, true);
  assert.equal(res.newStage, "contact_etabli");
});

test("appel sans réponse -> relance planifiée, pas de transition", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyCallAutomations(store, { beneficiaryId, outcome: "no_answer" });
  assert.equal(res.stageChanged, false);
  assert.deepEqual(res.followUpsScheduled, ["relance_no_answer"]);
});

test("messagerie -> relance email", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyCallAutomations(store, { beneficiaryId, outcome: "voicemail" });
  assert.deepEqual(res.followUpsScheduled, ["relance_voicemail"]);
});

test("non intéressé -> perdu", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyCallAutomations(store, { beneficiaryId, outcome: "not_interested" });
  assert.equal(res.newStage, "perdu");
});

test("Wedof inTraining -> en_formation", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyWedofAutomations(store, { beneficiaryId, state: "inTraining" });
  assert.equal(res.newStage, "en_formation");
});

test("Wedof toComplete -> relance pièces", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyWedofAutomations(store, { beneficiaryId, state: "toComplete" });
  assert.deepEqual(res.followUpsScheduled, ["relance_wedof_doc"]);
});

test("Wedof terminated -> certifie", async () => {
  const { store, beneficiaryId } = await setup();
  const res = await applyWedofAutomations(store, { beneficiaryId, state: "terminated" });
  assert.equal(res.newStage, "certifie");
});
