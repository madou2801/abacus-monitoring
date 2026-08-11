import { ApiError } from '../errors/ApiError.js';

/**
 * Règle d'or des systèmes de paiement: ne JAMAIS représenter de l'argent avec
 * un nombre à virgule flottante. On stocke des entiers exprimés dans la plus
 * petite unité de la devise (« minor units »), comme Stripe.
 *
 *   - XOF (Franc CFA UEMOA) : 0 décimale  → 1000 = 1000 F CFA
 *   - XAF (Franc CFA CEMAC) : 0 décimale  → 1000 = 1000 F CFA
 *   - NGN (Naira)           : 2 décimales → 1000 = 10,00 ₦ (kobo)
 *   - GHS, KES, ZAR, ...    : 2 décimales
 *   - USD, EUR              : 2 décimales
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  XOF: 0,
  XAF: 0,
  NGN: 2,
  GHS: 2,
  KES: 2,
  ZAR: 2,
  UGX: 0,
  RWF: 0,
  USD: 2,
  EUR: 2,
};

export type CurrencyCode = string;

export interface Money {
  /** Montant entier en plus petite unité (minor units). */
  readonly amount: number;
  /** Code ISO-4217 en majuscules. */
  readonly currency: CurrencyCode;
}

export function isSupportedCurrency(currency: string): boolean {
  return currency.toUpperCase() in CURRENCY_DECIMALS;
}

export function currencyDecimals(currency: string): number {
  const d = CURRENCY_DECIMALS[currency.toUpperCase()];
  if (d === undefined) {
    throw ApiError.badRequest('unsupported_currency', `Devise non supportée: ${currency}`);
  }
  return d;
}

/**
 * Construit un Money validé. `amount` doit être un entier positif exprimé dans
 * la plus petite unité de la devise.
 */
export function makeMoney(amount: number, currency: string): Money {
  const cur = currency.toUpperCase();
  if (!isSupportedCurrency(cur)) {
    throw ApiError.badRequest('unsupported_currency', `Devise non supportée: ${currency}`);
  }
  if (!Number.isInteger(amount)) {
    throw ApiError.badRequest(
      'invalid_amount',
      `Le montant doit être un entier en plus petite unité (${cur}).`,
    );
  }
  if (amount <= 0) {
    throw ApiError.badRequest('invalid_amount', 'Le montant doit être strictement positif.');
  }
  if (amount > Number.MAX_SAFE_INTEGER) {
    throw ApiError.badRequest('invalid_amount', 'Montant trop élevé.');
  }
  return { amount, currency: cur };
}

/** Formate un Money pour l'affichage humain (logs, reçus). */
export function formatMoney(money: Money): string {
  const decimals = currencyDecimals(money.currency);
  const value = money.amount / 10 ** decimals;
  return `${value.toFixed(decimals)} ${money.currency}`;
}

/**
 * Convertit le montant entier interne vers l'unité majeure attendue par
 * certains fournisseurs (ex: LigDiCash attend des francs entiers en XOF).
 */
export function toMajorUnit(money: Money): number {
  return money.amount / 10 ** currencyDecimals(money.currency);
}
