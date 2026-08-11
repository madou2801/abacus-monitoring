// matching.ts — appariement bénéficiaire ↔ auto-école (porté du Matcher Sync v8).
// Logique pure (port CrmStore injecté) -> testable. 3 niveaux : codes_actions,
// SIRET, ville. Le CRM consolide le rattachement ; le dispatch (notif AE, compte)
// reste géré côté pipeline existant pour l'instant.

import type { AutoEcoleMatch, CrmStore, DossierFormation } from "./crm-store.ts";

/**
 * Apparie une auto-école au dossier bénéficiaire. Si `info` est fourni, met
 * d'abord à jour les critères d'appariement (codes possibles / SIRET / ville).
 * Renvoie l'id de l'AE trouvée (ou null) et la méthode utilisée.
 */
export async function matchAutoEcole(
  store: CrmStore,
  beneficiaryId: string,
  info?: DossierFormation,
): Promise<AutoEcoleMatch> {
  if (info) await store.setDossierFormation(beneficiaryId, info);
  return store.matchAutoEcole(beneficiaryId);
}
