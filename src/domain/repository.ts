import type { Charge, Payout } from './types.js';

/**
 * Abstraction de persistance. L'implémentation par défaut est en mémoire pour
 * le MVP ; elle se remplace par Postgres/Prisma sans toucher aux services
 * (il suffit de fournir une autre implémentation de cette interface).
 *
 * NOTE production: une vraie base est indispensable (durabilité, idempotence
 * concurrente via contrainte UNIQUE sur idempotencyKey, audit).
 */
export interface Repository {
  saveCharge(charge: Charge): Promise<void>;
  getCharge(id: string): Promise<Charge | null>;
  findChargeByIdempotencyKey(key: string): Promise<Charge | null>;

  savePayout(payout: Payout): Promise<void>;
  getPayout(id: string): Promise<Payout | null>;
  findPayoutByIdempotencyKey(key: string): Promise<Payout | null>;

  /** Retrouve une charge OU un payout par sa référence fournisseur (webhooks). */
  findByProviderReference(provider: string, ref: string): Promise<Charge | Payout | null>;
}

export class InMemoryRepository implements Repository {
  private charges = new Map<string, Charge>();
  private payouts = new Map<string, Payout>();

  async saveCharge(charge: Charge): Promise<void> {
    this.charges.set(charge.id, { ...charge });
  }

  async getCharge(id: string): Promise<Charge | null> {
    const c = this.charges.get(id);
    return c ? { ...c } : null;
  }

  async findChargeByIdempotencyKey(key: string): Promise<Charge | null> {
    for (const c of this.charges.values()) {
      if (c.idempotencyKey === key) return { ...c };
    }
    return null;
  }

  async savePayout(payout: Payout): Promise<void> {
    this.payouts.set(payout.id, { ...payout });
  }

  async getPayout(id: string): Promise<Payout | null> {
    const p = this.payouts.get(id);
    return p ? { ...p } : null;
  }

  async findPayoutByIdempotencyKey(key: string): Promise<Payout | null> {
    for (const p of this.payouts.values()) {
      if (p.idempotencyKey === key) return { ...p };
    }
    return null;
  }

  async findByProviderReference(
    provider: string,
    ref: string,
  ): Promise<Charge | Payout | null> {
    for (const c of this.charges.values()) {
      if (c.provider === provider && c.providerReference === ref) return { ...c };
    }
    for (const p of this.payouts.values()) {
      if (p.provider === provider && p.providerReference === ref) return { ...p };
    }
    return null;
  }
}
