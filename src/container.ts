import { InMemoryRepository, type Repository } from './domain/repository.js';
import { buildRegistry, type ProviderRegistry } from './providers/registry.js';
import { ChargeService } from './services/charge.service.js';
import { PayoutService } from './services/payout.service.js';
import { WebhookService } from './services/webhook.service.js';
import { WebhookNotifier } from './services/notifier.js';

/** Assemble toutes les dépendances. Un seul point de câblage = tests faciles. */
export interface Container {
  repo: Repository;
  registry: ProviderRegistry;
  notifier: WebhookNotifier;
  charges: ChargeService;
  payouts: PayoutService;
  webhooks: WebhookService;
}

export function buildContainer(overrides: Partial<Container> = {}): Container {
  const repo = overrides.repo ?? new InMemoryRepository();
  const registry = overrides.registry ?? buildRegistry();
  const notifier = overrides.notifier ?? new WebhookNotifier();
  const charges = overrides.charges ?? new ChargeService(repo, registry, notifier);
  const payouts = overrides.payouts ?? new PayoutService(repo, registry, notifier);
  const webhooks =
    overrides.webhooks ?? new WebhookService(repo, registry, charges, payouts);
  return { repo, registry, notifier, charges, payouts, webhooks };
}
