import type { Money } from '../money/money.js';
import type { Customer, PaymentMethod, ProviderName, TransactionStatus } from '../domain/types.js';

/**
 * Contrat que TOUT fournisseur de paiement doit implémenter. C'est cette
 * interface qui rend la plateforme « multi-fournisseurs » : ajouter Flutterwave,
 * PayDunya, Orange Money direct... = écrire une nouvelle classe qui l'implémente.
 */
export interface PaymentProvider {
  readonly name: ProviderName;

  /** Méthodes de paiement réellement supportées par ce fournisseur. */
  supports(method: PaymentMethod, currency: string): boolean;

  /** Initie un encaissement. Retourne l'état initial normalisé. */
  createCharge(input: CreateChargeInput): Promise<ProviderChargeResult>;

  /** Interroge le fournisseur pour le statut à jour d'un encaissement. */
  getChargeStatus(providerReference: string): Promise<ProviderStatusResult>;

  /** Initie un décaissement vers un bénéficiaire. */
  createPayout(input: CreatePayoutInput): Promise<ProviderPayoutResult>;

  /** Interroge le statut d'un décaissement. */
  getPayoutStatus(providerReference: string): Promise<ProviderStatusResult>;

  /**
   * Vérifie l'authenticité d'un webhook entrant (signature/secret) et en
   * extrait la référence + le statut normalisé. Lève une erreur si invalide.
   */
  parseWebhook(input: WebhookInput): ProviderWebhookEvent;
}

export interface CreateChargeInput {
  chargeId: string;
  money: Money;
  method: PaymentMethod;
  customer?: Customer;
  description?: string;
  reference?: string;
  /** URL vers laquelle le fournisseur notifie l'issue (webhook entrant). */
  callbackUrl: string;
  /** URL de retour du payeur après paiement hébergé. */
  returnUrl?: string;
  metadata?: Record<string, string>;
}

export interface CreatePayoutInput {
  payoutId: string;
  money: Money;
  method: PaymentMethod;
  recipient: Customer;
  description?: string;
  reference?: string;
  callbackUrl: string;
  metadata?: Record<string, string>;
}

export interface ProviderChargeResult {
  providerReference: string;
  status: TransactionStatus;
  /** Présent pour les flux avec redirection (checkout hébergé). */
  checkoutUrl?: string;
}

export interface ProviderPayoutResult {
  providerReference: string;
  status: TransactionStatus;
}

export interface ProviderStatusResult {
  status: TransactionStatus;
  failureReason?: string;
}

export interface WebhookInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface ProviderWebhookEvent {
  providerReference: string;
  status: TransactionStatus;
  failureReason?: string;
}
