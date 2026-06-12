// retell-handler.ts — orchestration du webhook Retell, indépendante du runtime.
// Dépendances injectées (store, storage, fetch) pour être testable hors réseau.

import type { CrmStore, StoragePort } from "./crm-store.ts";
import type { FetchLike } from "./recording.ts";
import { storeRecording } from "./recording.ts";
import {
  beneficiaryPhone,
  normalizeRetellCall,
  verifyRetellSignature,
} from "./retell.ts";
import { applyCallAutomations } from "./automation.ts";
import type { RetellWebhookPayload } from "./types.ts";

export interface RetellHandlerDeps {
  store: CrmStore;
  storage: StoragePort;
  fetchFn: FetchLike;
  apiKey: string | undefined;
  verifySignature?: boolean; // défaut true
}

export interface HandlerResponse {
  status: number;
  body: Record<string, unknown>;
}

const TERMINAL_EVENTS = new Set(["call_ended", "call_analyzed"]);

export async function handleRetellWebhook(
  rawBody: string,
  signature: string | null | undefined,
  deps: RetellHandlerDeps,
): Promise<HandlerResponse> {
  const mustVerify = deps.verifySignature !== false;

  // 1) Vérification de signature
  const sigValid = await verifyRetellSignature(rawBody, signature, deps.apiKey);
  if (mustVerify && !sigValid) {
    return { status: 401, body: { error: "signature invalide" } };
  }

  // 2) Parsing
  let payload: RetellWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "JSON invalide" } };
  }
  if (!payload?.call?.call_id || !payload?.event) {
    return { status: 400, body: { error: "payload Retell incomplet" } };
  }

  const data = normalizeRetellCall(payload);

  // 3) Idempotence : (provider, event_type, call_id) unique
  const wh = await deps.store.recordWebhook({
    provider: "retell",
    event_type: data.event,
    external_id: data.retell_call_id,
    signature_valid: sigValid,
    payload,
  });
  if (wh.alreadyProcessed) {
    return { status: 200, body: { ok: true, deduplicated: true } };
  }

  try {
    // 4) Rapprochement bénéficiaire par téléphone
    const phone = beneficiaryPhone(payload.call);
    const benef = await deps.store.findOrCreateBeneficiaryByPhone(phone, {
      phone,
    });
    const beneficiaryId = benef?.id ?? null;

    // 5) Upsert de l'appel
    const { id: callId } = await deps.store.upsertCall({
      retell_call_id: data.retell_call_id,
      beneficiary_id: beneficiaryId,
      agent_id: data.agent_id,
      direction: data.direction,
      from_number: data.from_number,
      to_number: data.to_number,
      call_status: data.call_status,
      disconnection_reason: data.disconnection_reason,
      started_at: data.started_at,
      ended_at: data.ended_at,
      duration_ms: data.duration_ms,
      recording_source_url: data.recording_source_url,
      call_successful: data.call_successful,
      sentiment: data.sentiment,
      summary: data.summary,
      outcome: data.outcome,
      metadata: data.metadata,
    });

    const response: Record<string, unknown> = {
      ok: true,
      event: data.event,
      call_id: callId,
      beneficiary_id: beneficiaryId,
      outcome: data.outcome,
    };

    if (TERMINAL_EVENTS.has(data.event)) {
      // 6) Transcript
      if (data.transcript || data.transcript_object) {
        const wordCount = data.transcript
          ? data.transcript.trim().split(/\s+/).filter(Boolean).length
          : null;
        await deps.store.upsertTranscript(callId, {
          full_text: data.transcript,
          utterances: data.transcript_object ?? null,
          word_count: wordCount,
          language: "fr",
        });
        response.transcript_saved = true;
      }

      // 7) Enregistrement audio -> Supabase Storage (best-effort)
      if (data.recording_source_url) {
        try {
          const ref = await storeRecording({
            recordingUrl: data.recording_source_url,
            beneficiaryId,
            retellCallId: data.retell_call_id,
            storage: deps.storage,
            fetchFn: deps.fetchFn,
          });
          if (ref) {
            await deps.store.attachRecording(callId, ref);
            response.recording_path = ref.path;
          }
        } catch (err) {
          response.recording_error = (err as Error).message;
        }
      }

      // 8) Automatisations (transition pipeline + relances)
      if (beneficiaryId) {
        const auto = await applyCallAutomations(deps.store, {
          beneficiaryId,
          outcome: data.outcome,
        });
        response.automation = auto;
      }
    }

    await deps.store.markWebhookProcessed(wh.id, true);
    return { status: 200, body: response };
  } catch (err) {
    await deps.store.markWebhookProcessed(wh.id, false, (err as Error).message);
    return { status: 500, body: { error: (err as Error).message } };
  }
}
