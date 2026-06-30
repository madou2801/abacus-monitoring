// matching.test.ts — appariement auto-école (3 niveaux : codes / SIRET / ville).
// Tourne sur le vrai SQL des migrations (PGlite).

import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMigrations } from "../helpers/migrate.ts";
import { PgliteCrmStore } from "../helpers/pglite-store.ts";
import { matchAutoEcole } from "../../supabase/functions/_shared/matching.ts";

const AE_CODE = "11111111-1111-1111-1111-111111111111";
const AE_SIRET = "22222222-2222-2222-2222-222222222222";
const AE_VILLE = "33333333-3333-3333-3333-333333333333";
const AE_OFF = "44444444-4444-4444-4444-444444444444";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  await store.upsertAutoEcole({ id: AE_CODE, raison_sociale: "AE Code", codes_actions: ["ACT123"], active: true });
  await store.upsertAutoEcole({ id: AE_SIRET, raison_sociale: "AE Siret", siret: "81757532100012", active: true });
  await store.upsertAutoEcole({ id: AE_VILLE, raison_sociale: "AE Ville", ville: "Lille", active: true });
  await store.upsertAutoEcole({ id: AE_OFF, raison_sociale: "AE Inactive", codes_actions: ["ACT999"], active: false });
  return { db, store };
}

async function benef(store: PgliteCrmStore, email: string) {
  return (await store.findOrCreateBeneficiaryByEmail(email, {})).id;
}

test("appariement par codes_actions (niveau 1)", async () => {
  const { store } = await setup();
  const id = await benef(store, "code@x.com");
  const r = await matchAutoEcole(store, id, { codesPossibles: ["ACTX", "ACT123"] });
  assert.equal(r.aeId, AE_CODE);
  assert.equal(r.method, "code_session");
});

test("repli SIRET (niveau 2)", async () => {
  const { store } = await setup();
  const id = await benef(store, "siret@x.com");
  const r = await matchAutoEcole(store, id, { siretFormation: "81757532100012" });
  assert.equal(r.aeId, AE_SIRET);
  assert.equal(r.method, "siret");
});

test("repli ville (niveau 3, l'AE contient la ville du dossier)", async () => {
  const { store } = await setup();
  const id = await benef(store, "ville@x.com");
  const r = await matchAutoEcole(store, id, { villeFormation: "Lille" });
  assert.equal(r.aeId, AE_VILLE);
  assert.equal(r.method, "ville");
});

test("aucune AE -> null / none", async () => {
  const { store } = await setup();
  const id = await benef(store, "none@x.com");
  const r = await matchAutoEcole(store, id, { villeFormation: "Marseille", siretFormation: "00000000000000" });
  assert.equal(r.aeId, null);
  assert.equal(r.method, "none");
});

test("une AE inactive n'est jamais appariée", async () => {
  const { store } = await setup();
  const id = await benef(store, "off@x.com");
  const r = await matchAutoEcole(store, id, { codesPossibles: ["ACT999"] });
  assert.equal(r.aeId, null);
  assert.equal(r.method, "none");
});

test("priorité codes > siret > ville", async () => {
  const { store } = await setup();
  // une AE qui matche par code ET porte aussi un siret/ville d'une autre
  const id = await benef(store, "prio@x.com");
  const r = await matchAutoEcole(store, id, {
    codesPossibles: ["ACT123"], siretFormation: "81757532100012", villeFormation: "Lille",
  });
  assert.equal(r.aeId, AE_CODE, "le code l'emporte sur SIRET et ville");
  assert.equal(r.method, "code_session");
});
