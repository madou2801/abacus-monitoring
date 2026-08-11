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
const CRM_BASE_URL = (typeof Deno !== "undefined" ? Deno.env.get("CRM_BASE_URL") : undefined) ??
  "https://crm.monpermiscpf.com";

// Convertit un tableau de bytes en chaîne hexadécimale.
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Décode une chaîne hexadécimale en Uint8Array.
export function hexToBytes(hex: string): Uint8Array {
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    result[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return result;
}

// Calcule le SHA-256 d'un Uint8Array et renvoie le résultat en hex.
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

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
 *
 * Quand `notify` est `false`, aucune notification n'est envoyée : un token
 * usage-unique (validité 30 j) est généré et l'URL de validation est retournée
 * dans `validationUrl`.
 */
export async function sendQuote(
  store: CrmStore,
  notifier: Notifier,
  quote: QuoteInput,
  contact?: { email?: string | null; phone?: string | null },
  notify_: boolean = true,
): Promise<{ quoteId: string; nextStep: string | null; notified: boolean; validationUrl?: string }> {
  const quoteId = await store.createQuote(quote);
  await store.transmitQuote(quoteId);

  let notified = false;
  let validationUrl: string | undefined;
  const label = FINANCEUR_LABELS[quote.financeur] ?? quote.financeur;
  const amount = quote.amount_cents != null
    ? ` (${(quote.amount_cents / 100).toFixed(2)} €)`
    : "";

  if (notify_) {
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
  } else {
    // Génère un token usage-unique (30 jours) et retourne l'URL de validation.
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const tokenHex = bytesToHex(tokenBytes);
    const sha256 = await sha256Hex(tokenBytes);
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    await store.createQuoteToken(quoteId, sha256, expiresAt);
    validationUrl = `${CRM_BASE_URL}/devis/valider?t=${tokenHex}`;
  }

  const nextStep = await store.nextStep(quote.beneficiary_id);
  return { quoteId, nextStep, notified, validationUrl };
}

/**
 * Marque la décision du financeur sur un devis et fait progresser le parcours.
 */
export async function decideQuote(
  store: CrmStore,
  args: { beneficiaryId: string; quoteId: string; status: "accepted" | "refused" | "expired" },
): Promise<JourneyResult> {
  await store.setQuoteStatus(args.quoteId, args.status, args.beneficiaryId);
  const nextStep = await store.advanceJourney(args.beneficiaryId, "devis");
  return { nextStep, notified: false };
}
