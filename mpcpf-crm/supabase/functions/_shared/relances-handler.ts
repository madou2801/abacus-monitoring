// relances-handler.ts — moteur de traitement des relances échues.
// Les "dispatchers" (envoi email, déclenchement d'appel) sont injectés afin
// de rester testables et de découpler du fournisseur réel.

import type { CrmStore } from "./crm-store.ts";
import type { FollowUpTask } from "./types.ts";

export type ChannelDispatcher = (
  task: FollowUpTask,
  store: CrmStore,
) => Promise<{ result: string }>;

export interface RelanceDeps {
  store: CrmStore;
  dispatchers: Record<string, ChannelDispatcher>;
  limit?: number;
  detectStale?: boolean;
}

export interface RelanceReport {
  staleScheduled: number;
  processed: number;
  done: number;
  failed: number;
  details: Array<{ task_id: string; channel: string; status: string; result?: string; error?: string }>;
}

export async function processRelances(deps: RelanceDeps): Promise<RelanceReport> {
  const report: RelanceReport = {
    staleScheduled: 0,
    processed: 0,
    done: 0,
    failed: 0,
    details: [],
  };

  // 1) Détection des dossiers dormants -> planifie des relances 'stale'.
  if (deps.detectStale) {
    report.staleScheduled = await deps.store.detectStaleAndSchedule();
  }

  // 2) Traitement des relances échues.
  const due = await deps.store.dueFollowUps(deps.limit ?? 100);
  for (const task of due) {
    report.processed++;
    const dispatcher = deps.dispatchers[task.channel];
    if (!dispatcher) {
      await deps.store.completeFollowUp(task.id, "failed", null, `canal inconnu: ${task.channel}`);
      report.failed++;
      report.details.push({ task_id: task.id, channel: task.channel, status: "failed", error: "canal inconnu" });
      continue;
    }
    try {
      const { result } = await dispatcher(task, deps.store);
      await deps.store.completeFollowUp(task.id, "done", result);
      report.done++;
      report.details.push({ task_id: task.id, channel: task.channel, status: "done", result });
    } catch (err) {
      const msg = (err as Error).message;
      await deps.store.completeFollowUp(task.id, "failed", null, msg);
      report.failed++;
      report.details.push({ task_id: task.id, channel: task.channel, status: "failed", error: msg });
    }
  }

  return report;
}
