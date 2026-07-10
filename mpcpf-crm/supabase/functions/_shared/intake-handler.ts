// intake-handler.ts — API du parcours appelée par le portail bénéficiaire.
// Logique pure (port CrmStore + Notifier injectés) -> testable.

import type { CrmStore, ProfileFields } from "./crm-store.ts";
import type { Notifier } from "./notifier.ts";
import type { HandlerResponse } from "./retell-handler.ts";
import { decideQuote, hexToBytes, sendQuote, sha256Hex, submitDocument, submitIntake } from "./journey.ts";
import { advanceInvoice, createInvoice } from "./billing.ts";

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
    notify?: boolean;
  }
  | {
    action: "decide_quote";
    beneficiary_id: string;
    quote_id: string;
    status: "accepted" | "refused" | "expired";
  }
  | {
    action: "create_invoice";
    beneficiary_id: string;
    financeur: string;
    amount_cents?: number;
    formation_label?: string;
    quote_id?: string;
    external_ref?: string;
    channel?: string;
  }
  | {
    action: "set_invoice_status";
    beneficiary_id: string;
    invoice_id: string;
    status: string;
    external_ref?: string;
  }
  | { action: "journey"; beneficiary_id: string }
  | { action: "validate_quote_token"; token: string };

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
        const doNotify = req.notify !== false;
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
          doNotify,
        );
        return {
          status: 200,
          body: {
            ok: true,
            quote_id: r.quoteId,
            notified: r.notified,
            next_step: r.nextStep,
            ...(r.validationUrl !== undefined ? { validation_url: r.validationUrl } : {}),
          },
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

      case "create_invoice": {
        if (!FINANCEURS.has(req.financeur)) {
          return { status: 400, body: { error: `financeur inconnu: ${req.financeur}` } };
        }
        const invoiceId = await createInvoice(store, {
          beneficiary_id: req.beneficiary_id,
          financeur: req.financeur,
          amount_cents: req.amount_cents,
          formation_label: req.formation_label,
          quote_id: req.quote_id,
          external_ref: req.external_ref,
          channel: req.channel,
        });
        return { status: 200, body: { ok: true, invoice_id: invoiceId } };
      }

      case "set_invoice_status": {
        const changed = await advanceInvoice(
          store,
          req.invoice_id,
          req.status,
          req.external_ref,
          req.beneficiary_id,
        );
        return { status: 200, body: { ok: true, changed } };
      }

      case "journey": {
        const next = await store.nextStep(req.beneficiary_id);
        return { status: 200, body: { ok: true, next_step: next } };
      }

      case "validate_quote_token": {
        // On reçoit le token brut en hex (32 octets = 64 chars hex) ; on le
        // décode en bytes pour calculer son SHA-256 avant la lookup.
        const rawBytes = hexToBytes(req.token);
        const sha256 = await sha256Hex(rawBytes);
        const found = await store.consumeQuoteToken(sha256);
        if (!found) {
          // Token inconnu, expiré ou déjà consommé → réponse neutre (pas d'énumération).
          return { status: 200, body: { ok: true, already_processed: true } };
        }
        const r = await decideQuote(store, {
          beneficiaryId: found.beneficiaryId,
          quoteId: found.quoteId,
          status: "accepted",
        });
        return { status: 200, body: { ok: true, validated: true, next_step: r.nextStep } };
      }

      default:
        return { status: 400, body: { error: "action inconnue" } };
    }
  } catch (err) {
    return { status: 500, body: { error: (err as Error).message } };
  }
}
