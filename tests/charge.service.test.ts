import { describe, it, expect, beforeEach } from 'vitest';
import { buildContainer, type Container } from '../src/container.js';
import { TERMINAL_STATUSES } from '../src/domain/types.js';

describe('ChargeService (provider LigDiCash en mode mock)', () => {
  let c: Container;
  beforeEach(() => {
    c = buildContainer();
  });

  it('crée une charge en attente avec une URL de checkout', async () => {
    const charge = await c.charges.create({
      amount: 5000,
      currency: 'XOF',
      method: 'mobile_money',
      customer: { phone: '+22670000000' },
      description: 'Test',
    });
    expect(charge.id).toMatch(/^chg_/);
    expect(charge.status).toBe('pending');
    expect(charge.provider).toBe('ligdicash');
    expect(charge.checkoutUrl).toContain('mock/checkout');
    expect(charge.providerReference).toBeDefined();
  });

  it('est idempotent: même clé ⇒ même charge', async () => {
    const params = {
      amount: 5000,
      currency: 'XOF',
      method: 'mobile_money' as const,
      idempotencyKey: 'idem-123',
    };
    const a = await c.charges.create(params);
    const b = await c.charges.create(params);
    expect(b.id).toBe(a.id);
  });

  it('rafraîchit vers un statut terminal lors du GET', async () => {
    const created = await c.charges.create({
      amount: 5000,
      currency: 'XOF',
      method: 'mobile_money',
    });
    const fetched = await c.charges.get(created.id);
    expect(TERMINAL_STATUSES.has(fetched.status)).toBe(true);
  });

  it('applique un webhook entrant et passe la charge à succeeded', async () => {
    const created = await c.charges.create({
      amount: 5000,
      currency: 'XOF',
      method: 'mobile_money',
    });
    const payload = JSON.stringify({ token: created.providerReference, status: 'completed' });
    await c.webhooks.handle('ligdicash', {
      rawBody: Buffer.from(payload),
      headers: { 'content-type': 'application/json' },
    });
    const updated = await c.repo.getCharge(created.id);
    expect(updated?.status).toBe('succeeded');
  });

  it('refuse une devise non supportée par le fournisseur', async () => {
    await expect(
      c.charges.create({ amount: 100, currency: 'NGN', method: 'mobile_money' }),
    ).rejects.toThrow();
  });
});
