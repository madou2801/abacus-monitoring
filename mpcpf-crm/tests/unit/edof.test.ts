// Test de non-régression V4 (spec-crm-tiers-payeur §3) : la brique « lien d'inscription
// CPF » avait été supprimée lors d'un remaniement SANS qu'aucun test ne le signale. Ce test
// couvre la logique pure (mapping catalogue→EDOF + sélection de ville + URL de suivi) et,
// par sa seule existence, échoue si le module `web/lib/edof.ts` est de nouveau retiré.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOGUE_EDOF_MAP,
  resolveEdofFormationNumero,
  pickCityRow,
  cpfTrackedUrl,
  cpfLinkEmailHtml,
} from "../../web/lib/edof.ts";

test("mapping catalogue → formation_numero EDOF : cas nominaux", () => {
  assert.equal(resolveEdofFormationNumero("B_30H"), "PCB");
  assert.equal(resolveEdofFormationNumero("B"), "Bauto13"); // BVA 13h
  assert.equal(resolveEdofFormationNumero("B_18H"), "PCB2_18HBA");
  assert.equal(resolveEdofFormationNumero("A2"), "PCA1");
  assert.equal(resolveEdofFormationNumero("BE_10H"), "PCBE");
  assert.equal(resolveEdofFormationNumero("C"), "MPL_C");
  assert.equal(resolveEdofFormationNumero("DE"), "MPL_DE");
  assert.equal(resolveEdofFormationNumero("CODE_ETG"), "PDR1");
  // B_MAN30 et B_30H mappent tous deux vers PCB (EDOF ne distingue pas la boîte au-delà de 18h).
  assert.equal(resolveEdofFormationNumero("B_MAN30"), "PCB");
});

test("codes SANS lien EDOF exact → null (pas d'auto-résolution, fallback bouton CRM)", () => {
  assert.equal(resolveEdofFormationNumero("A2_25H"), null);
  assert.equal(resolveEdofFormationNumero("A2_HC10"), null);
  assert.equal(resolveEdofFormationNumero("BE"), null); // BE 5h : pas de lien EDOF
  assert.equal(resolveEdofFormationNumero("EVAL"), null);
  assert.equal(resolveEdofFormationNumero("INC_PERMIS_FEU"), null); // sécurité, pas permis CPF
  assert.equal(resolveEdofFormationNumero("CODE_INEXISTANT"), null);
  assert.equal(resolveEdofFormationNumero(""), null);
  assert.equal(resolveEdofFormationNumero(null), null);
  assert.equal(resolveEdofFormationNumero(undefined), null);
});

test("le mapping ne contient que des permis (aucune formation non-permis)", () => {
  // Garde-fou : le lien CPF/EDOF ne concerne QUE les permis (le reste = AIF/Kairos/OPCO).
  for (const [code, fn] of Object.entries(CATALOGUE_EDOF_MAP)) {
    assert.match(fn, /^(Bauto13|PCB|PCA1|PCBE|MPL_|PDR)/, `${code} → ${fn} inattendu`);
  }
});

test("pickCityRow : département du bénéficiaire prioritaire", () => {
  const rows = [
    { code_postal: "59111", ville: "Bouchain" },
    { code_postal: "77700", ville: "Chessy" },
    { code_postal: "93240", ville: "Stains" },
  ];
  assert.equal(pickCityRow(rows, "93800")?.ville, "Stains"); // dept 93
  assert.equal(pickCityRow(rows, "59200")?.ville, "Bouchain"); // dept 59
});

test("pickCityRow : Chessy (siège) en repli quand le département n'est pas couvert", () => {
  const rows = [
    { code_postal: "59111", ville: "Bouchain" },
    { code_postal: "77700", ville: "Chessy" },
    { code_postal: "93240", ville: "Stains" },
  ];
  assert.equal(pickCityRow(rows, "12000")?.ville, "Chessy"); // dept 12 absent → Chessy
});

test("pickCityRow : 1re ville en dernier recours (ni dept, ni Chessy) + tableau vide", () => {
  const rows = [
    { code_postal: "38190", ville: "Villard-Bonnot" },
    { code_postal: "25320", ville: "Chemaudin" },
  ];
  assert.equal(pickCityRow(rows, "12000")?.ville, "Villard-Bonnot"); // aucun match → 1re
  assert.equal(pickCityRow([], "93000"), null);
  assert.equal(pickCityRow(rows, "")?.ville, "Villard-Bonnot"); // cp vide → 1re
});

test("cpfTrackedUrl : URL de suivi base64url décodable vers la cible", () => {
  const target =
    "https://www.moncompteformation.gouv.fr/espace-prive/html/#/formation/recherche/88433529000034_PCB/88433529000034_PCB_Chessy";
  const url = cpfTrackedUrl("benef-123", target);
  assert.match(url, /\/t\/cpf\/benef-123\//);
  const enc = url.split("/t/cpf/benef-123/")[1];
  assert.doesNotMatch(enc, /[+/=]/); // partie encodée = base64url pur (pas de +, /, =)
  const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = Buffer.from(b64 + "=".repeat((4 - (b64.length % 4)) % 4), "base64").toString("utf8");
  assert.equal(decoded, target);
});

test("cpfLinkEmailHtml : contient le lien tracké, échappe le message et n'injecte pas de HTML", () => {
  const html = cpfLinkEmailHtml("Noa", "Permis B 30h", "Permis B 30h+1h", "Chessy", "https://api.monpermiscpf.com/t/cpf/x/y", "<script>alert(1)</script>");
  assert.match(html, /https:\/\/api\.monpermiscpf\.com\/t\/cpf\/x\/y/);
  assert.match(html, /Noa/);
  assert.doesNotMatch(html, /<script>/); // le message est échappé
  assert.match(html, /&lt;script&gt;/);
});
