// wedof-handler.ts — orchestration du webhook Wedof (statuts CPF).

import type { CrmStore } from "./crm-store.ts";
import { applyWedofAutomations } from "./automation.ts";
import type { WedofWebhookPayload } from "./types.ts";
import type { HandlerResponse } from "./retell-handler.ts";

export interface WedofHandlerDeps {
  store: CrmStore;
  secret?: string; // secret partagé optionnel
  verifySignature?: boolean;
}

function extractState(p: WedofWebhookPayload): string | null {
  if (p.data?.state) return String(p.data.state);
  // Sinon dérivé du type "registrationFolder.<state>"
  const type = p.type ?? p.event ?? "";
  const parts = type.split(".");
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

export async function handleWedofWebhook(
  rawBody: string,
  providedSecret: string | null | undefined,
  deps: WedofHandlerDeps,
): Promise<HandlerResponse> {
  // Fail-closed : sauf désactivation EXPLICITE (verifySignature=false), un secret
  // manquant refuse la requête au lieu de la laisser passer.
  const mustVerify = deps.verifySignature !== false;
  if (mustVerify) {
    if (!deps.secret) {
      return { status: 503, body: { error: "config: secret Wedof manquant" } };
    }
    if (providedSecret !== deps.secret) {
      return { status: 401, body: { error: "secret Wedof invalide" } };
    }
  }

  let payload: WedofWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "JSON invalide" } };
  }

  const data = payload.data ?? {};
  const folderId = data.id != null ? String(data.id) : null;
  const eventType = payload.type ?? payload.event ?? "wedof.event";
  const state = extractState(payload);
  const previousState = data.previousState ? String(data.previousState) : null;

  if (!folderId && !data.email) {
    return { status: 400, body: { error: "payload Wedof sans identifiant ni email" } };
  }

  const wh = await deps.store.recordWebhook({
    provider: "wedof",
    event_type: eventType,
    external_id: `${folderId ?? data.email}:${state ?? "?"}`,
    signature_valid: !mustVerify ? true : providedSecret === deps.secret,
    payload,
  });
  if (wh.alreadyProcessed) {
    return { status: 200, body: { ok: true, deduplicated: true } };
  }

  try {
    // Rapprochement : folder Wedof -> email -> création
    let benef = folderId
      ? await deps.store.findBeneficiaryByWedofFolder(folderId)
      : null;
    if (!benef && data.email) {
      benef = await deps.store.findOrCreateBeneficiaryByEmail(String(data.email), {
        first_name: data.firstName ? String(data.firstName) : null,
        last_name: data.lastName ? String(data.lastName) : null,
        phone: data.phoneNumber ? String(data.phoneNumber) : null,
        wedof_folder_id: folderId,
      });
    }

    if (!benef) {
      await deps.store.markWebhookProcessed(wh.id, true);
      return { status: 202, body: { ok: true, matched: false } };
    }

    // externalId Wedof = n° de dossier CPF/EDOF (visible sur Mon Compte Formation).
    const externalId = data.externalId != null && data.externalId !== "" ? String(data.externalId) : null;
    await deps.store.updateBeneficiaryWedof(benef.id, {
      wedof_state: state,
      wedof_folder_id: folderId ?? benef.wedof_folder_id,
      ...(externalId ? { wedof_external_id: externalId } : {}),
    });

    await deps.store.insertWedofEvent({
      beneficiary_id: benef.id,
      wedof_folder_id: folderId,
      event_type: eventType,
      state,
      previous_state: previousState,
      raw: payload,
    });

    const auto = await applyWedofAutomations(deps.store, {
      beneficiaryId: benef.id,
      state,
    });

    await deps.store.markWebhookProcessed(wh.id, true);
    return {
      status: 200,
      body: {
        ok: true,
        beneficiary_id: benef.id,
        state,
        automation: auto,
      },
    };
  } catch (err) {
    await deps.store.markWebhookProcessed(wh.id, false, (err as Error).message);
    return { status: 500, body: { error: (err as Error).message } };
  }
}
