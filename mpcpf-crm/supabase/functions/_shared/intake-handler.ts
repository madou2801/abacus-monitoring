// intake-handler.ts — API du parcours appelée par le portail bénéficiaire.
// Logique pure (port CrmStore + Notifier injectés) -> testable.

import type { CrmStore, ProfileFields } from "./crm-store.ts";
import type { Notifier } from "./notifier.ts";
import type { HandlerResponse } from "./retell-handler.ts";
import { decideQuote, sendQuote, submitDocument, submitIntake } from "./journey.ts";

export interface IntakeDeps {
  store: CrmStore;
  notifier: Notifier;
}

type IntakeRequest =
  | {
    action: "submit_intake";
    beneficiary: { id?: string; email?: string; phone?: string };
    form_type: string;
    source?: string;
    payload?: Record<string, unknown>;
    profile?: ProfileFields;
  }
  | {
    action: "submit_document";
    beneficiary_id: string;
    doc_type: string;
    bucket: string;
    path: string;
    bytes?: number;
  }
  | {
    action: "send_quote";
    beneficiary_id: string;
    financeur: string;
    formation_label?: string;
    amount_cents?: number;
    external_ref?: string;
    contact?: { email?: string | null; phone?: string | null };
  }
  | {
    action: "decide_quote";
    beneficiary_id: string;
    quote_id: string;
    status: "accepted" | "refused" | "expired";
  }
  | { action: "journey"; beneficiary_id: string };

const FINANCEURS = new Set(["edof", "kairos", "opco", "entreprise", "autofinancement"]);

async function resolveBeneficiary(
  store: CrmStore,
  b: { id?: string; email?: string; phone?: string },
  profile?: ProfileFields,
): Promise<string | null> {
  if (b.id) return b.id;
  if (b.email) {
    const benef = await store.findOrCreateBeneficiaryByEmail(b.email, {
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      phone: b.phone ?? null,
    });
    return benef.id;
  }
  if (b.phone) {
    const benef = await store.findOrCreateBeneficiaryByPhone(b.phone, {
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
    });
    return benef?.id ?? null;
  }
  return null;
}

export async function handleIntakeRequest(
  req: IntakeRequest,
  deps: IntakeDeps,
): Promise<HandlerResponse> {
  const { store, notifier } = deps;
  try {
    switch (req.action) {
      case "submit_intake": {
        const id = await resolveBeneficiary(store, req.beneficiary, req.profile);
        if (!id) return { status: 400, body: { error: "email ou téléphone requis" } };
        const r = await submitIntake(store, {
          beneficiaryId: id,
          formType: req.form_type,
          source: req.source,
          payload: req.payload,
          profile: req.profile,
        });
        return { status: 200, body: { ok: true, beneficiary_id: id, next_step: r.nextStep } };
      }

      case "submit_document": {
        const r = await submitDocument(store, {
          beneficiaryId: req.beneficiary_id,
          docType: req.doc_type,
          ref: { bucket: req.bucket, path: req.path, bytes: req.bytes ?? 0 },
        });
        return { status: 200, body: { ok: true, next_step: r.nextStep } };
      }

      case "send_quote": {
        if (!FINANCEURS.has(req.financeur)) {
          return { status: 400, body: { error: `financeur inconnu: ${req.financeur}` } };
        }
        const r = await sendQuote(
          store,
          notifier,
          {
            beneficiary_id: req.beneficiary_id,
            financeur: req.financeur,
            formation_label: req.formation_label,
            amount_cents: req.amount_cents,
            external_ref: req.external_ref,
          },
          req.contact,
        );
        return {
          status: 200,
          body: { ok: true, quote_id: r.quoteId, notified: r.notified, next_step: r.nextStep },
        };
      }

      case "decide_quote": {
        const r = await decideQuote(store, {
          beneficiaryId: req.beneficiary_id,
          quoteId: req.quote_id,
          status: req.status,
        });
        return { status: 200, body: { ok: true, next_step: r.nextStep } };
      }

      case "journey": {
        const next = await store.nextStep(req.beneficiary_id);
        return { status: 200, body: { ok: true, next_step: next } };
      }

      default:
        return { status: 400, body: { error: "action inconnue" } };
    }
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
}
