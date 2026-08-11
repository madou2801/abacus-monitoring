import { config } from '../config.js';
import { logger } from '../logger.js';
import { ApiError } from '../errors/ApiError.js';
import { makeMoney } from '../money/money.js';
import type { Payout, PaymentMethod, ProviderName } from '../domain/types.js';
import { TERMINAL_STATUSES } from '../domain/types.js';
import type { Repository } from '../domain/repository.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { WebhookNotifier } from './notifier.js';
import { generateId } from './id.js';

export interface CreatePayoutParams {
  amount: number;
  currency: string;
  method: PaymentMethod;
  provider?: ProviderName;
  recipient: { name?: string; email?: string; phone?: string };
  description?: string;
  reference?: string;
  metadata?: Record<string, string>;
  idempotencyKey?: string;
}

export class PayoutService {
  constructor(
    private readonly repo: Repository,
    private readonly registry: ProviderRegistry,
    private readonly notifier: WebhookNotifier,
  ) {}

  async create(params: CreatePayoutParams): Promise<Payout> {
    if (params.idempotencyKey) {
      const existing = await this.repo.findPayoutByIdempotencyKey(params.idempotencyKey);
      if (existing) return existing;
    }

    if (params.method === 'mobile_money' && !params.recipient.phone) {
      throw ApiError.badRequest('missing_recipient_phone', 'Numéro du bénéficiaire requis.');
    }

    const money = makeMoney(params.amount, params.currency);
    const provider = this.registry.resolve(params.method, money.currency, params.provider);

    const now = new Date().toISOString();
    const payout: Payout = {
      id: generateId('pyt'),
      object: 'payout',
      status: 'pending',
      money,
      method: params.method,
      provider: provider.name,
      recipient: params.recipient,
      description: params.description,
      reference: params.reference,
      metadata: params.metadata,
      idempotencyKey: params.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.savePayout(payout);

    try {
      const result = await provider.createPayout({
        payoutId: payout.id,
        money,
        method: params.method,
        recipient: params.recipient,
        description: params.description,
        reference: params.reference,
        callbackUrl: `${config.publicBaseUrl}/v1/webhooks/${provider.name}`,
        metadata: params.metadata,
      });
      payout.providerReference = result.providerReference;
      payout.status = result.status;
      payout.updatedAt = new Date().toISOString();
      await this.repo.savePayout(payout);
    } catch (err) {
      payout.status = 'failed';
      payout.failureReason =
        err instanceof ApiError ? err.message : 'Échec de décaissement côté fournisseur.';
      payout.updatedAt = new Date().toISOString();
      await this.repo.savePayout(payout);
      logger.error({ payoutId: payout.id, err }, 'Échec createPayout fournisseur');
      throw err;
    }
    return payout;
  }

  async get(id: string): Promise<Payout> {
    const payout = await this.repo.getPayout(id);
    if (!payout) throw ApiError.notFound(`Payout introuvable: ${id}`);
    if (!TERMINAL_STATUSES.has(payout.status) && payout.providerReference) {
      try {
        const provider = this.registry.get(payout.provider);
        const fresh = await provider.getPayoutStatus(payout.providerReference);
        if (fresh.status !== payout.status) {
          await this.applyStatus(payout, fresh.status, fresh.failureReason);
        }
      } catch (err) {
        logger.warn({ payoutId: id, err }, 'Rafraîchissement de statut échoué (non bloquant)');
      }
    }
    return payout;
  }

  async applyStatus(payout: Payout, status: Payout['status'], failureReason?: string): Promise<void> {
    if (TERMINAL_STATUSES.has(payout.status)) return;
    if (status === payout.status) return;
    payout.status = status;
    if (failureReason) payout.failureReason = failureReason;
    payout.updatedAt = new Date().toISOString();
    await this.repo.savePayout(payout);
    if (TERMINAL_STATUSES.has(status)) {
      this.notifier.emit(`payout.${status}`, payout);
    }
  }
}
