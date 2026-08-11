import { config } from '../config.js';
import { logger } from '../logger.js';
import { ApiError } from '../errors/ApiError.js';
import { makeMoney } from '../money/money.js';
import type { Charge, PaymentMethod, ProviderName } from '../domain/types.js';
import { TERMINAL_STATUSES } from '../domain/types.js';
import type { Repository } from '../domain/repository.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { WebhookNotifier } from './notifier.js';
import { generateId } from './id.js';

export interface CreateChargeParams {
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider?: ProviderName;
  customer?: { name?: string; email?: string; phone?: string };
  description?: string;
  reference?: string;
  returnUrl?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export class ChargeService {
  constructor(
    private readonly repo: Repository,
    private readonly registry: ProviderRegistry,
    private readonly notifier: WebhookNotifier,
  ) {}

  async create(params: CreateChargeParams): Promise<Charge> {
    // Idempotence: même clé ⇒ on renvoie la charge déjà créée, sans re-débiter.
    if (params.idempotencyKey) {
      const existing = await this.repo.findChargeByIdempotencyKey(params.idempotencyKey);
      if (existing) return existing;
    }

    const money = makeMoney(params.amount, params.currency);
    const provider = this.registry.resolve(params.method, money.currency, params.provider);

    const now = new Date().toISOString();
    const charge: Charge = {
      id: generateId('chg'),
      object: 'charge',
      status: 'pending',
      money,
      method: params.method,
      provider: provider.name,
      customer: params.customer,
      description: params.description,
      reference: params.reference,
      metadata: params.metadata,
      idempotencyKey: params.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };

    // On persiste AVANT l'appel fournisseur: si le process meurt après le débit,
    // on garde une trace réconciliable via les webhooks/polling.
    await this.repo.saveCharge(charge);

    try {
      const result = await provider.createCharge({
        chargeId: charge.id,
        money,
        method: params.method,
        customer: params.customer,
        description: params.description,
        reference: params.reference,
        callbackUrl: `${config.publicBaseUrl}/v1/webhooks/${provider.name}`,
        returnUrl: params.returnUrl,
        metadata: params.metadata,
      });
      charge.providerReference = result.providerReference;
      charge.status = result.status;
      charge.checkoutUrl = result.checkoutUrl;
      charge.updatedAt = new Date().toISOString();
      await this.repo.saveCharge(charge);
    } catch (err) {
      charge.status = 'failed';
      charge.failureReason =
        err instanceof ApiError ? err.message : 'Échec de création côté fournisseur.';
      charge.updatedAt = new Date().toISOString();
      await this.repo.saveCharge(charge);
      logger.error({ chargeId: charge.id, err }, 'Échec createCharge fournisseur');
      throw err;
    }

    return charge;
  }

  async get(id: string): Promise<Charge> {
    const charge = await this.repo.getCharge(id);
    if (!charge) throw ApiError.notFound(`Charge introuvable: ${id}`);

    // Si non terminal, on rafraîchit le statut auprès du fournisseur (polling).
    if (!TERMINAL_STATUSES.has(charge.status) && charge.providerReference) {
      try {
        const provider = this.registry.get(charge.provider);
        const fresh = await provider.getChargeStatus(charge.providerReference);
        if (fresh.status !== charge.status) {
          await this.applyStatus(charge, fresh.status, fresh.failureReason);
        }
      } catch (err) {
        logger.warn({ chargeId: id, err }, 'Rafraîchissement de statut échoué (non bloquant)');
      }
    }
    return charge;
  }

  /** Applique une transition de statut (idempotente sur les états terminaux). */
  async applyStatus(charge: Charge, status: Charge['status'], failureReason?: string): Promise<void> {
    if (TERMINAL_STATUSES.has(charge.status)) return; // déjà figé
    if (status === charge.status) return;
    charge.status = status;
    if (failureReason) charge.failureReason = failureReason;
    charge.updatedAt = new Date().toISOString();
    await this.repo.saveCharge(charge);
    if (TERMINAL_STATUSES.has(status)) {
      this.notifier.emit(`charge.${status}`, charge);
    }
  }
}
