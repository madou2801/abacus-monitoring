// matching.test.ts — appariement auto-école le plus fiable :
// codes_actions → SIRET → ville (medium) → repli siège (low), + confiance / revue.
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
const AE_CODE2 = "55555555-5555-5555-5555-555555555555";
const AE_SIEGE = "99999999-9999-9999-9999-999999999999";

async function setup() {
  const db = await applyMigrations();
  const store = new PgliteCrmStore(db);
  await store.upsertAutoEcole({ id: AE_CODE, raison_sociale: "AE Code", codes_actions: ["ACT123"], active: true });
  await store.upsertAutoEcole({ id: AE_SIRET, raison_sociale: "AE Siret", siret: "81757532100012", active: true });
  await store.upsertAutoEcole({ id: AE_VILLE, raison_sociale: "AE Ville", ville: "Lille", active: true });
  await store.upsertAutoEcole({ id: AE_OFF, raison_sociale: "AE Inactive", codes_actions: ["ACT999"], active: false });
  return { db, store };
}

const benef = async (s: PgliteCrmStore, email: string) =>
  (await s.findOrCreateBeneficiaryByEmail(email, {})).id;

test("codes_actions → high, sans revue (1 candidat)", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "code@x.com"), { codesPossibles: ["ACTX", "ACT123"] });
  assert.equal(r.aeId, AE_CODE);
  assert.equal(r.method, "code_session");
  assert.equal(r.confidence, "high");
  assert.equal(r.needsReview, false);
  assert.equal(r.candidates, 1);
});

test("repli SIRET → high", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "siret@x.com"), { siretFormation: "81757532100012" });
  assert.equal(r.aeId, AE_SIRET);
  assert.equal(r.method, "siret");
  assert.equal(r.confidence, "high");
  assert.equal(r.needsReview, false);
});

test("repli ville → medium + needs_review", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "ville@x.com"), { villeFormation: "Lille" });
  assert.equal(r.aeId, AE_VILLE);
  assert.equal(r.method, "ville");
  assert.equal(r.confidence, "medium");
  assert.equal(r.needsReview, true);
});

test("aucune AE (pas de siège) → null / none", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "none@x.com"), { villeFormation: "Marseille", siretFormation: "00000000000000" });
  assert.equal(r.aeId, null);
  assert.equal(r.method, "none");
  assert.equal(r.confidence, "none");
});

test("AE inactive jamais appariée", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "off@x.com"), { codesPossibles: ["ACT999"] });
  assert.equal(r.aeId, null);
});

test("priorité codes > siret > ville", async () => {
  const { store } = await setup();
  const r = await matchAutoEcole(store, await benef(store, "prio@x.com"), {
    codesPossibles: ["ACT123"], siretFormation: "81757532100012", villeFormation: "Lille",
  });
  assert.equal(r.aeId, AE_CODE);
  assert.equal(r.method, "code_session");
});

test("ambiguïté codes (2 AE même code) → needs_review + candidates=2", async () => {
  const { store } = await setup();
  await store.upsertAutoEcole({ id: AE_CODE2, raison_sociale: "AE Code Bis", codes_actions: ["ACT123"], active: true });
  const r = await matchAutoEcole(store, await benef(store, "ambig@x.com"), { codesPossibles: ["ACT123"] });
  assert.equal(r.confidence, "high");
  assert.equal(r.needsReview, true, "ambigu → revue");
  assert.equal(r.candidates, 2);
});

test("repli SIÈGE quand aucune AE locale (autre ville) → low + review", async () => {
  const { store } = await setup();
  await store.upsertAutoEcole({ id: AE_SIEGE, raison_sociale: "AE Madou (Siège Chessy)", ville: "Chessy", code_postal: "77700", is_siege: true, active: true });
  // bénéficiaire à Marseille, aucune AE locale → doit tomber sur le siège
  const r = await matchAutoEcole(store, await benef(store, "marseille@x.com"), { villeFormation: "Marseille" });
  assert.equal(r.aeId, AE_SIEGE);
  assert.equal(r.method, "siege");
  assert.equal(r.confidence, "low");
  assert.equal(r.needsReview, true);
});

test("ville-dans-le-code : overlap exact échoue (PCB vs PCB2) → code_ville high", async () => {
  const { store } = await setup();
  const AE_STPOL = "66666666-6666-6666-6666-666666666666";
  // AE avec codes en PCB2_… et ville St-Pol ; le dossier a PCB_… (pas d'overlap exact)
  await store.upsertAutoEcole({
    id: AE_STPOL, raison_sociale: "AE St-Pol", ville: "St-Pol-sur-Ternoise",
    codes_actions: ["PCB2_ST-POL-SUR-TERNOISE", "Bauto13_ST-POL-SUR-TERNOISE"], active: true,
  });
  // bénéficiaire : code PCB_… (≠ PCB2) + ville bénéficiaire ailleurs (Le Quesnoy)
  const r = await matchAutoEcole(store, await benef(store, "stpol@x.com"), {
    codesPossibles: ["PCB_ST-POL-SUR-TERNOISE", "88433529000034_PCB_ST-POL-SUR-TERNOISE"],
    villeFormation: "Le Quesnoy en Artois",
  });
  assert.equal(r.aeId, AE_STPOL, "matché par la ville encodée dans le code, pas le siège");
  assert.equal(r.method, "code_ville");
  assert.equal(r.confidence, "high");
});

test("une AE locale l'emporte sur le siège (siège exclu du niveau ville)", async () => {
  const { store } = await setup();
  await store.upsertAutoEcole({ id: AE_SIEGE, raison_sociale: "Siège", ville: "Chessy", is_siege: true, active: true });
  const r = await matchAutoEcole(store, await benef(store, "lille2@x.com"), { villeFormation: "Lille" });
  assert.equal(r.aeId, AE_VILLE, "AE locale Lille, pas le siège");
  assert.equal(r.method, "ville");
});
