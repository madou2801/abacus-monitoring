import { logger } from '../../logger.js';
import { ApiError } from '../../errors/ApiError.js';
import { toMajorUnit } from '../../money/money.js';
import type { ProviderName, TransactionStatus } from '../../domain/types.js';
import { verifyHmac } from '../../crypto/signature.js';
import type {
  CreateChargeInput,
  CreatePayoutInput,
  PaymentProvider,
  ProviderChargeResult,
  ProviderPayoutResult,
  ProviderStatusResult,
  ProviderWebhookEvent,
  WebhookInput,
} from '../types.js';

export interface LigDiCashConfig {
  mock: boolean;
  baseUrl: string;
  apiKey: string;
  apiToken: string;
  webhookSecret: string;
}

/**
 * Adaptateur LigDiCash (zone UEMOA: BF, CI, ML, NE, TG, BJ, SN).
 * Implémente le flux « payin avec redirection » + payout + webhook.
 *
 * En mode `mock`, aucune requête réseau n'est émise : les réponses sont
 * simulées de façon déterministe pour développer et tester sans clés réelles.
 *
 * Réf. (de mémoire, à reconfirmer avec la doc officielle avant prod):
 *   - Headers: `Apikey`, `Authorization: Bearer <token>`
 *   - Créer facture: POST /redirect/checkout-invoice/create
 *   - Statut:        GET  /redirect/checkout-invoice/confirm/?invoiceToken=...
 */
export class LigDiCashProvider implements PaymentProvider {
  readonly name: ProviderName = 'ligdicash';
  private readonly cfg: LigDiCashConfig;

  constructor(cfg: LigDiCashConfig) {
    this.cfg = cfg;
    if (!cfg.mock && (!cfg.apiKey || !cfg.apiToken)) {
      throw new Error('LigDiCash: apiKey et apiToken requis hors mode mock.');
    }
  }

  supports(method: string, currency: string): boolean {
    return (method === 'mobile_money' || method === 'card') && currency.toUpperCase() === 'XOF';
  }

  async createCharge(input: CreateChargeInput): Promise<ProviderChargeResult> {
    if (this.cfg.mock) {
      const ref = `lig_mock_${input.chargeId}`;
      return {
        providerReference: ref,
        status: 'pending',
        checkoutUrl: `${this.cfg.baseUrl}/mock/checkout/${ref}`,
      };
    }

    const body = {
      commande: {
        invoice: {
          items: [
            {
              name: input.description ?? 'Paiement',
              description: input.description ?? 'Paiement',
              quantity: 1,
              unit_price: toMajorUnit(input.money),
              total_price: toMajorUnit(input.money),
            },
          ],
          total_amount: toMajorUnit(input.money),
          devise: input.money.currency,
          description: input.description ?? 'Paiement',
          customer: input.customer?.phone ?? '',
          customer_firstname: input.customer?.name ?? '',
          customer_email: input.customer?.email ?? '',
        },
        store: { name: 'AbacusPay', website_url: this.cfg.baseUrl },
        actions: {
          cancel_url: input.returnUrl ?? this.cfg.baseUrl,
          return_url: input.returnUrl ?? this.cfg.baseUrl,
          callback_url: input.callbackUrl,
        },
        custom_data: { charge_id: input.chargeId, reference: input.reference ?? '' },
      },
    };

    const res = await this.request('POST', '/redirect/checkout-invoice/create', body);
    const token = res.token ?? res.invoiceToken;
    const url = res.response_text ?? res.url;
    if (!token || !url) {
      throw ApiError.providerError('Réponse LigDiCash inattendue (token/url manquant).', res);
    }
    return { providerReference: String(token), status: 'pending', checkoutUrl: String(url) };
  }

  async getChargeStatus(providerReference: string): Promise<ProviderStatusResult> {
    if (this.cfg.mock) {
      // Mock déterministe: les refs paires "réussissent", impaires "échouent".
      return { status: this.mockTerminalStatus(providerReference) };
    }
    const res = await this.request(
      'GET',
      `/redirect/checkout-invoice/confirm/?invoiceToken=${encodeURIComponent(providerReference)}`,
    );
    return { status: mapLigStatus(res.status ?? res.response_text), failureReason: res.error };
  }

  async createPayout(input: CreatePayoutInput): Promise<ProviderPayoutResult> {
    if (!input.recipient.phone) {
      throw ApiError.badRequest('missing_recipient_phone', 'Numéro du bénéficiaire requis.');
    }
    if (this.cfg.mock) {
      return { providerReference: `lig_payout_mock_${input.payoutId}`, status: 'processing' };
    }
    const body = {
      commande: {
        invoice: {
          total_amount: toMajorUnit(input.money),
          devise: input.money.currency,
          description: input.description ?? 'Décaissement',
        },
        customer: input.recipient.phone,
        custom_data: { payout_id: input.payoutId },
        actions: { callback_url: input.callbackUrl },
      },
    };
    const res = await this.request('POST', '/straight/payout/create', body);
    const token = res.token ?? res.invoiceToken;
    if (!token) throw ApiError.providerError('Réponse payout LigDiCash inattendue.', res);
    return { providerReference: String(token), status: 'processing' };
  }

  async getPayoutStatus(providerReference: string): Promise<ProviderStatusResult> {
    if (this.cfg.mock) {
      return { status: this.mockTerminalStatus(providerReference) };
    }
    const res = await this.request(
      'GET',
      `/straight/payout/confirm/?invoiceToken=${encodeURIComponent(providerReference)}`,
    );
    return { status: mapLigStatus(res.status ?? res.response_text), failureReason: res.error };
  }

  parseWebhook(input: WebhookInput): ProviderWebhookEvent {
    // Vérification de signature (hors mock). LigDiCash transmet généralement un
    // token/hashkey ; on vérifie un HMAC du corps avec le secret partagé.
    if (!this.cfg.mock) {
      const sig = headerValue(input.headers, 'x-ligdicash-signature') ?? '';
      if (!verifyHmac(this.cfg.webhookSecret, input.rawBody, sig)) {
        throw ApiError.unauthorized('Signature de webhook LigDiCash invalide.');
      }
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(input.rawBody.toString('utf8'));
    } catch {
      throw ApiError.badRequest('invalid_webhook', 'Corps de webhook illisible.');
    }

    const ref = (payload.token ?? payload.invoiceToken ?? payload.external_id) as string | undefined;
    if (!ref) {
      throw ApiError.badRequest('invalid_webhook', 'Référence absente du webhook.');
    }
    return {
      providerReference: String(ref),
      status: mapLigStatus(payload.status ?? payload.response_code),
      failureReason: typeof payload.error === 'string' ? payload.error : undefined,
    };
  }

  // ── helpers ────────────────────────────────────────────────

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<Record<string, any>> {
    const url = `${this.cfg.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Apikey: this.cfg.apiKey,
          Authorization: `Bearer ${this.cfg.apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let json: Record<string, any> = {};
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        throw ApiError.providerError('Réponse non-JSON du fournisseur.', { status: res.status });
      }
      if (!res.ok) {
        logger.warn({ provider: 'ligdicash', status: res.status }, 'Erreur HTTP fournisseur');
        throw ApiError.providerError(`LigDiCash a renvoyé ${res.status}.`, json);
      }
      return json;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw ApiError.providerError('Délai dépassé en contactant LigDiCash.');
      }
      throw ApiError.providerError('Connexion à LigDiCash impossible.', {
        message: (err as Error).message,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private mockTerminalStatus(ref: string): TransactionStatus {
    // Hash trivial et déterministe pour des tests reproductibles.
    const last = ref.replace(/[^0-9a-f]/gi, '').slice(-1) || '0';
    const code = parseInt(last, 16);
    return Number.isNaN(code) || code % 4 !== 0 ? 'succeeded' : 'failed';
  }
}

/** Traduit les statuts LigDiCash vers les statuts unifiés. */
function mapLigStatus(raw: unknown): TransactionStatus {
  const s = String(raw ?? '').toLowerCase();
  if (['completed', 'success', 'succeeded', '00', 'paid', 'confirmed'].includes(s)) {
    return 'succeeded';
  }
  if (['pending', 'created', 'nstarted', 'initiated'].includes(s)) return 'pending';
  if (['processing', 'inprogress', 'in_progress'].includes(s)) return 'processing';
  if (['cancelled', 'canceled', 'expired'].includes(s)) return 'cancelled';
  if (['failed', 'error', 'declined'].includes(s)) return 'failed';
  return 'pending';
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}
