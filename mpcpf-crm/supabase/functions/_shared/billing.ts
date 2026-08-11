// billing.ts — orchestration de la facturation du parcours bénéficiaire.
// Logique pure (port CrmStore injecté) -> testable. Le CRM PILOTE et CONSOLIDE
// la facturation tous financeurs (statuts unifiés) ; il ne re-facture pas le CPF
// que Wedof gère, mais en suit le cycle de vie via les refs externes.

import type { CrmStore, InvoiceInput } from "./crm-store.ts";

export interface InvoiceResult {
  invoiceId: string | null;
  created: boolean;
}

/** Crée une facture « à émettre » pour un dossier. */
export function createInvoice(store: CrmStore, input: InvoiceInput): Promise<string> {
  return store.createInvoice(input);
}

/**
 * À la certification d'un dossier, génère la facture à partir du dernier devis
 * accepté (financeur + montant). Idempotent : `create_invoice` dédoublonne par
 * dossier + financeur. Sans devis accepté, ne crée rien (facturation à initier
 * manuellement côté back-office).
 */
export async function issueInvoiceFromCertification(
  store: CrmStore,
  beneficiaryId: string,
): Promise<InvoiceResult> {
  const quote = await store.latestAcceptedQuote(beneficiaryId);
  if (!quote) return { invoiceId: null, created: false };

  const invoiceId = await store.createInvoice({
    beneficiary_id: beneficiaryId,
    financeur: quote.financeur,
    amount_cents: quote.amount_cents ?? undefined,
    formation_label: quote.formation_label ?? undefined,
    quote_id: quote.id,
  });
  return { invoiceId, created: true };
}

/**
 * Fait avancer une facture dans son cycle de vie
 * (emise / transmise / payee / encaissee / annulee). Renvoie true si changé.
 */
export function advanceInvoice(
  store: CrmStore,
  invoiceId: string,
  status: string,
  externalRef?: string | null,
  beneficiaryId?: string | null,
): Promise<boolean> {
  return store.setInvoiceStatus(invoiceId, status, externalRef ?? null, beneficiaryId ?? null);
}
