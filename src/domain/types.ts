import type { Money } from '../money/money.js';

/**
 * Statuts unifiés, indépendants du fournisseur. Chaque adaptateur traduit ses
 * statuts propres vers ceux-ci.
 */
export type TransactionStatus =
  | 'pending' // créée, en attente d'action du payeur
  | 'processing' // le fournisseur traite (OTP envoyé, débit en cours)
  | 'succeeded' // fonds confirmés
  | 'failed' // refusée / échouée
  | 'cancelled'; // annulée / expirée

export const TERMINAL_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export type ProviderName = 'ligdicash' | 'flutterwave';

export type PaymentMethod = 'mobile_money' | 'card' | 'bank_transfer';

/** Coordonnées du payeur / bénéficiaire. */
export interface Customer {
  name?: string;
  email?: string;
  /** Numéro au format E.164, ex: +22670000000 */
  phone?: string;
}

/** Un encaissement (payin / collecte). */
export interface Charge {
  id: string; // chg_xxx
  object: 'charge';
  status: TransactionStatus;
  money: Money;
  method: PaymentMethod;
  provider: ProviderName;
  /** Référence de la transaction côté fournisseur. */
  providerReference?: string;
  /** URL de paiement hébergée (flux avec redirection). */
  checkoutUrl?: string;
  customer?: Customer;
  description?: string;
  /** Référence libre fournie par le marchand. */
  reference?: string;
  metadata?: Record<string, string>;
  failureReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

/** Un décaissement (payout / transfert sortant). */
export interface Payout {
  id: string; // pyt_xxx
  object: 'payout';
  status: TransactionStatus;
  money: Money;
  method: PaymentMethod;
  provider: ProviderName;
  providerReference?: string;
  /** Bénéficiaire (numéro mobile money obligatoire pour mobile_money). */
  recipient: Customer;
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  failureReason?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export type Transaction = Charge | Payout;
