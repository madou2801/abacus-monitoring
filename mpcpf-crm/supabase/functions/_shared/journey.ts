// journey.ts — orchestration du parcours bénéficiaire (formulaires, pièces,
// devis multi-financeurs), avec relances et notifications branchées.

import type { CrmStore, ProfileFields, QuoteInput, RecordingRef } from "./crm-store.ts";
import { notify, type Notifier } from "./notifier.ts";

// Libellés des financeurs pour les messages.
export const FINANCEUR_LABELS: Record<string, string> = {
  edof: "CPF",
  kairos: "France Travail",
  opco: "votre OPCO",
  entreprise: "votre employeur",
  autofinancement: "paiement direct",
};

const BASE_PORTAL_URL = "https://portail.monpermiscpf.com";

function intakeLink(beneficiaryId: string): string {
  return `${BASE_PORTAL_URL}/dossier/${beneficiaryId}`;
}

export interface JourneyResult {
  nextStep: string | null;
  notified: boolean;
}

/**
 * Enregistre une soumission de formulaire, met à jour le profil le cas échéant,
 * puis fait progresser le parcours. Renvoie la prochaine étape attendue.
 */
export async function submitIntake(
  store: CrmStore,
  args: {
    beneficiaryId: string;
    formType: string;
    source?: string;
    payload?: Record<string, unknown>;
    profile?: ProfileFields;
  },
): Promise<JourneyResult> {
  if (args.profile) await store.updateProfile(args.beneficiaryId, args.profile);
  await store.insertIntake({
    beneficiary_id: args.beneficiaryId,
    form_type: args.formType,
    source: args.source ?? "portail",
    payload: args.payload ?? {},
    completed: true,
  });
  const nextStep = await store.advanceJourney(args.beneficiaryId, args.source ?? "portail");
  return { nextStep, notified: false };
}

/**
 * Rattache une pièce justificative (déjà déposée dans Storage) au dossier,
 * puis réévalue le parcours.
 */
export async function submitDocument(
  store: CrmStore,
  args: { beneficiaryId: string; docType: string; ref: RecordingRef },
): Promise<JourneyResult> {
  await store.recordDocument(args.beneficiaryId, args.docType, args.ref);
  const nextStep = await store.nextStep(args.beneficiaryId);
  return { nextStep, notified: false };
}

/**
 * Crée et transmet un devis (EDOF / Kairos / OPCO / entreprise), planifie la
 * relance d'acceptation et notifie le bénéficiaire si un canal est fourni.
 */
export async function sendQuote(
  store: CrmStore,
  notifier: Notifier,
  quote: QuoteInput,
  contact?: { email?: string | null; phone?: string | null },
): Promise<{ quoteId: string; nextStep: string | null; notified: boolean }> {
  const quoteId = await store.createQuote(quote);
  await store.transmitQuote(quoteId);

  let notified = false;
  const label = FINANCEUR_LABELS[quote.financeur] ?? quote.financeur;
  const amount = quote.amount_cents != null
    ? ` (${(quote.amount_cents / 100).toFixed(2)} €)`
    : "";
  if (contact?.email) {
    await notify(store, notifier, quote.beneficiary_id, {
      channel: "email",
      to: contact.email,
      subject: "Votre devis de formation au permis",
      body:
        `Bonjour, votre devis financé par ${label}${amount} est disponible. ` +
        `Consultez et validez-le ici : ${intakeLink(quote.beneficiary_id)}`,
      templateCode: "tpl_quote_sent",
    });
    notified = true;
  } else if (contact?.phone) {
    await notify(store, notifier, quote.beneficiary_id, {
      channel: "sms",
      to: contact.phone,
      body: `MonPermisCPF : votre devis ${label} est prêt. Validez-le : ${intakeLink(quote.beneficiary_id)}`,
      templateCode: "tpl_quote_sent",
    });
    notified = true;
  }

  const nextStep = await store.nextStep(quote.beneficiary_id);
  return { quoteId, nextStep, notified };
}

/**
 * Marque la décision du financeur sur un devis et fait progresser le parcours.
 */
export async function decideQuote(
  store: CrmStore,
  args: { beneficiaryId: string; quoteId: string; status: "accepted" | "refused" | "expired" },
): Promise<JourneyResult> {
  await store.setQuoteStatus(args.quoteId, args.status);
  const nextStep = await store.advanceJourney(args.beneficiaryId, "devis");
  return { nextStep, notified: false };
}
