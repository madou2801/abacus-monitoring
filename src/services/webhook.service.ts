import { logger } from '../logger.js';
import { ApiError } from '../errors/ApiError.js';
import type { ProviderName } from '../domain/types.js';
import type { Repository } from '../domain/repository.js';
import type { ProviderRegistry } from '../providers/registry.js';
import type { WebhookInput } from '../providers/types.js';
import type { ChargeService } from './charge.service.js';
import type { PayoutService } from './payout.service.js';

/**
 * Traite les webhooks ENTRANTS des fournisseurs: vérifie la signature, retrouve
 * la transaction locale par sa référence fournisseur, applique le nouveau statut.
 * Idempotent: rejouer le même webhook ne change rien après un état terminal.
 */
export class WebhookService {
  constructor(
    private readonly repo: Repository,
    private readonly registry: ProviderRegistry,
    private readonly charges: ChargeService,
    private readonly payouts: PayoutService,
  ) {}

  async handle(providerName: ProviderName, input: WebhookInput): Promise<void> {
    const provider = this.registry.get(providerName);
    const event = provider.parseWebhook(input); // lève si signature invalide

    const tx = await this.repo.findByProviderReference(providerName, event.providerReference);
    if (!tx) {
      // On ne révèle pas l'existence/absence: on accuse réception (200) côté route,
      // mais on trace pour réconciliation.
      logger.warn(
        { provider: providerName, ref: event.providerReference },
        'Webhook reçu pour une transaction inconnue',
      );
      return;
    }

    if (tx.object === 'charge') {
      await this.charges.applyStatus(tx, event.status, event.failureReason);
    } else if (tx.object === 'payout') {
      await this.payouts.applyStatus(tx, event.status, event.failureReason);
    } else {
      throw ApiError.badRequest('unknown_object', 'Type de transaction inconnu.');
    }
    logger.info(
      { provider: providerName, id: tx.id, status: event.status },
      'Webhook entrant appliqué',
    );
  }
}
