import type { Charge, Payout } from '../domain/types.js';

/** Forme publique d'une charge (montant aplati, secrets exclus). */
export function serializeCharge(c: Charge) {
  return {
    id: c.id,
    object: c.object,
    status: c.status,
    amount: c.money.amount,
    currency: c.money.currency,
    method: c.method,
    provider: c.provider,
    checkout_url: c.checkoutUrl ?? null,
    customer: c.customer ?? null,
    description: c.description ?? null,
    reference: c.reference ?? null,
    metadata: c.metadata ?? {},
    failure_reason: c.failureReason ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

/** Forme publique d'un payout. */
export function serializePayout(p: Payout) {
  return {
    id: p.id,
    object: p.object,
    status: p.status,
    amount: p.money.amount,
    currency: p.money.currency,
    method: p.method,
    provider: p.provider,
    recipient: p.recipient,
    description: p.description ?? null,
    reference: p.reference ?? null,
    metadata: p.metadata ?? {},
    failure_reason: p.failureReason ?? null,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}
