// lucie.ts — capture d'informations à l'issue d'un appel de l'agent Lucie
// (Retell, inbound/outbound) + confirmation SMS/email et amorce du parcours.

import type { CrmStore, ProfileFields } from "./crm-store.ts";
import type { RetellCall } from "./types.ts";
import { notify, type Notifier } from "./notifier.ts";

// Normalise une valeur de financement renvoyée par Lucie vers un code financeur.
function mapFinanceur(raw: unknown): string | null {
  const v = String(raw ?? "").toLowerCase();
  if (!v) return null;
  if (v.includes("cpf") || v.includes("edof")) return "edof";
  if (v.includes("travail") || v.includes("kairos") || v.includes("pole") || v.includes("ft")) {
    return "kairos";
  }
  if (v.includes("opco")) return "opco";
  if (v.includes("entreprise") || v.includes("employeur")) return "entreprise";
  if (v.includes("perso") || v.includes("auto")) return "autofinancement";
  return null;
}

function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const val = obj[k];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  return undefined;
}

export interface LucieExtract {
  profile: ProfileFields;
  email?: string;
  formation?: string;
}

/**
 * Extrait les infos structurées capturées par Lucie depuis les données
 * d'analyse Retell (custom_analysis_data) et les variables dynamiques.
 */
export function extractLucieInfo(call: RetellCall): LucieExtract {
  const custom = (call.call_analysis?.custom_analysis_data ?? {}) as Record<string, unknown>;
  const dyn = (call.retell_llm_dynamic_variables ?? {}) as Record<string, unknown>;
  const src = { ...dyn, ...custom };

  const financeur = mapFinanceur(pick(src, "financement", "financeur", "funding"));
  const ftFlag = pick(src, "france_travail", "pole_emploi", "is_france_travail");
  const isFranceTravail = financeur === "kairos" ||
    (ftFlag != null && ["true", "oui", "yes", "1"].includes(ftFlag.toLowerCase()));

  const email = pick(src, "email", "mail", "courriel");

  const profile: ProfileFields = {
    first_name: pick(src, "prenom", "first_name", "firstname") ?? null,
    last_name: pick(src, "nom", "last_name", "lastname") ?? null,
    email: email ?? null,
    financeur: financeur ?? null,
    is_france_travail: isFranceTravail ? true : null,
  };

  return { profile, email, formation: pick(src, "formation", "permis", "objectif") };
}

/**
 * À exécuter après un appel décroché : enregistre les infos captées, confirme
 * par SMS/email avec le lien du formulaire d'intake, et planifie la relance
 * intake si le formulaire n'est pas encore complété.
 */
export async function captureLucieCall(
  store: CrmStore,
  notifier: Notifier,
  args: { beneficiaryId: string; call: RetellCall; phone: string | null },
): Promise<{ profileUpdated: boolean; notified: boolean; relanceScheduled: boolean }> {
  const info = extractLucieInfo(args.call);

  const hasProfile = Object.values(info.profile).some((v) => v != null);
  if (hasProfile) await store.updateProfile(args.beneficiaryId, info.profile);

  // Enregistre la prise d'infos comme une soumission "lucie".
  await store.insertIntake({
    beneficiary_id: args.beneficiaryId,
    form_type: "lucie_capture",
    source: "lucie",
    payload: { formation: info.formation, financeur: info.profile.financeur },
    completed: true,
  });

  const link = `https://portail.monpermiscpf.com/dossier/${args.beneficiaryId}`;
  let notified = false;
  if (info.email) {
    await notify(store, notifier, args.beneficiaryId, {
      channel: "email",
      to: info.email,
      subject: "Votre dossier permis MonPermisCPF",
      body: `Merci pour votre appel. Complétez votre dossier ici : ${link}`,
      templateCode: "tpl_intake_invite",
    });
    notified = true;
  } else if (args.phone) {
    await notify(store, notifier, args.beneficiaryId, {
      channel: "sms",
      to: args.phone,
      body: `MonPermisCPF : merci pour votre appel ! Finalisez votre dossier : ${link}`,
      templateCode: "tpl_intake_invite",
    });
    notified = true;
  }

  // Relance intake si le parcours n'a pas encore démarré.
  const next = await store.nextStep(args.beneficiaryId);
  let relanceScheduled = false;
  if (next === "intake") {
    const id = await store.scheduleFollowUp(args.beneficiaryId, "relance_intake");
    relanceScheduled = id != null;
  }

  return { profileUpdated: hasProfile, notified, relanceScheduled };
}
