import { config } from '../config.js';
import { ApiError } from '../errors/ApiError.js';
import type { PaymentMethod, ProviderName } from '../domain/types.js';
import { LigDiCashProvider } from './ligdicash/ligdicash.provider.js';
import type { PaymentProvider } from './types.js';

/**
 * Registre central des fournisseurs. C'est ici qu'on enregistrera Flutterwave,
 * PayDunya, etc. Le routage choisit le bon fournisseur selon la méthode et la
 * devise (logique de routing extensible).
 */
export class ProviderRegistry {
  private readonly providers = new Map<ProviderName, PaymentProvider>();

  register(provider: PaymentProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: ProviderName): PaymentProvider {
    const p = this.providers.get(name);
    if (!p) throw ApiError.badRequest('unknown_provider', `Fournisseur inconnu: ${name}`);
    return p;
  }

  /**
   * Sélectionne un fournisseur capable de traiter (method, currency). Pour le
   * MVP mono-provider, renvoie LigDiCash s'il convient. Le routing pourra
   * évoluer (préférences marchand, coût, disponibilité, géo).
   */
  resolve(method: PaymentMethod, currency: string, preferred?: ProviderName): PaymentProvider {
    if (preferred) {
      const p = this.get(preferred);
      if (!p.supports(method, currency)) {
        throw ApiError.badRequest(
          'provider_unsupported',
          `${preferred} ne supporte pas ${method}/${currency}.`,
        );
      }
      return p;
    }
    for (const p of this.providers.values()) {
      if (p.supports(method, currency)) return p;
    }
    throw ApiError.badRequest(
      'no_provider',
      `Aucun fournisseur disponible pour ${method}/${currency}.`,
    );
  }
}

export function buildRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(new LigDiCashProvider(config.ligdicash));
  // Futur: registry.register(new FlutterwaveProvider(config.flutterwave));
  return registry;
}
