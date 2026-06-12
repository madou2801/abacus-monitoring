// automation.ts — règles métier : déclenche transitions de pipeline et
// relances à partir d'un appel Retell ou d'un évènement Wedof.
// Logique pure (s'appuie uniquement sur le port CrmStore) → testable.

import type { CrmStore } from "./crm-store.ts";
import type { CallOutcome } from "./types.ts";

export interface AutomationResult {
  stageChanged: boolean;
  newStage?: string;
  followUpsScheduled: string[]; // rule_codes effectivement planifiés
}

/**
 * Automatisations déclenchées par l'issue d'un appel Retell.
 */
export async function applyCallAutomations(
  store: CrmStore,
  args: { beneficiaryId: string; outcome: CallOutcome; actor?: string },
): Promise<AutomationResult> {
  const actor = args.actor ?? "retell-webhook";
  const result: AutomationResult = { stageChanged: false, followUpsScheduled: [] };

  switch (args.outcome) {
    case "answered":
    case "callback": {
      const changed = await store.setStage(
        args.beneficiaryId,
        "contact_etabli",
        actor,
        `Appel ${args.outcome}`,
      );
      result.stageChanged = changed;
      if (changed) result.newStage = "contact_etabli";
      if (args.outcome === "callback") {
        const id = await store.scheduleFollowUp(args.beneficiaryId, "relance_no_answer");
        if (id) result.followUpsScheduled.push("relance_no_answer");
      }
      break;
    }
    case "no_answer": {
      const id = await store.scheduleFollowUp(args.beneficiaryId, "relance_no_answer");
      if (id) result.followUpsScheduled.push("relance_no_answer");
      break;
    }
    case "voicemail": {
      const id = await store.scheduleFollowUp(args.beneficiaryId, "relance_voicemail");
      if (id) result.followUpsScheduled.push("relance_voicemail");
      break;
    }
    case "not_interested": {
      const changed = await store.setStage(
        args.beneficiaryId,
        "perdu",
        actor,
        "Non intéressé (issue d'appel)",
      );
      result.stageChanged = changed;
      if (changed) result.newStage = "perdu";
      break;
    }
  }

  return result;
}

// Correspondance état Wedof -> étape du pipeline.
export const WEDOF_STATE_TO_STAGE: Record<string, string> = {
  notprocessed: "inscrit",
  registered: "inscrit",
  tocheck: "inscrit",
  tovalidate: "inscrit",
  validated: "inscrit",
  accepted: "inscrit",
  intraining: "en_formation",
  inprogress: "en_formation",
  terminated: "certifie",
  completed: "certifie",
  serviceisdone: "certifie",
  canceled: "perdu",
  cancelled: "perdu",
  refused: "perdu",
  aborted: "perdu",
  rejected: "perdu",
};

// États Wedof signalant un dossier à compléter -> relance "pièces".
const WEDOF_DOC_STATES = new Set([
  "tocomplete",
  "notprocessed",
  "nothonored",
  "tocheck",
]);

/**
 * Automatisations déclenchées par un évènement de statut Wedof.
 */
export async function applyWedofAutomations(
  store: CrmStore,
  args: { beneficiaryId: string; state: string | null; actor?: string },
): Promise<AutomationResult> {
  const actor = args.actor ?? "wedof-webhook";
  const result: AutomationResult = { stageChanged: false, followUpsScheduled: [] };
  const state = (args.state ?? "").toLowerCase();

  const targetStage = WEDOF_STATE_TO_STAGE[state];
  if (targetStage) {
    const changed = await store.setStage(
      args.beneficiaryId,
      targetStage,
      actor,
      `Wedof: ${args.state}`,
    );
    result.stageChanged = changed;
    if (changed) result.newStage = targetStage;
  }

  if (WEDOF_DOC_STATES.has(state)) {
    const id = await store.scheduleFollowUp(args.beneficiaryId, "relance_wedof_doc", {
      wedof_state: args.state,
    });
    if (id) result.followUpsScheduled.push("relance_wedof_doc");
  }

  return result;
}
