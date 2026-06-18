import { config } from '../config.js';
import { logger } from '../logger.js';
import { hmacSha256 } from '../crypto/signature.js';
import { generateId } from './id.js';
import type { Transaction } from '../domain/types.js';

/**
 * Émet les webhooks SORTANTS vers le marchand, signés en HMAC-SHA256 (comme
 * Stripe avec `Stripe-Signature`). Pour le MVP, on logue l'événement signé ;
 * brancher un envoi HTTP réel (avec retries/backoff) est trivial ici.
 */
export interface OutboundEvent {
  id: string;
  type: string; // ex: "charge.succeeded", "payout.failed"
  createdAt: string;
  data: Transaction;
}

export class WebhookNotifier {
  emit(type: string, data: Transaction): void {
    const event: OutboundEvent = {
      id: generateId('evt'),
      type,
      createdAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(event);
    const signature = hmacSha256(config.webhookSigningSecret, body);

    // TODO production: POST vers l'URL webhook du marchand avec en-tête
    // `X-Abacus-Signature: <signature>`, file d'attente + retries idempotents.
    logger.info(
      { eventId: event.id, type, signature: signature.slice(0, 12) + '…' },
      'Webhook sortant émis',
    );
  }
}
