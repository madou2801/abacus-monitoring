import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import type { Container } from './container.js';
import { healthRouter } from './routes/health.routes.js';
import { webhooksRouter } from './routes/webhooks.routes.js';
import { chargesRouter } from './routes/charges.routes.js';
import { payoutsRouter } from './routes/payouts.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp(container: Container): Express {
  const app = express();

  // Derrière un reverse-proxy (Nginx): nécessaire pour le rate-limit par IP.
  app.set('trust proxy', 1);

  // En-têtes de sécurité HTTP.
  app.use(helmet());

  // Journalisation structurée des requêtes (avec redaction des secrets).
  app.use(pinoHttp({ logger }));

  // Limitation de débit globale (anti-abus / brute-force sur les clés).
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Trop de requêtes.' } },
    }),
  );

  app.use('/health', healthRouter());

  // ⚠️ Les webhooks DOIVENT précéder express.json(): ils ont besoin du corps
  // brut (Buffer) pour vérifier la signature HMAC à l'octet près.
  app.use('/v1/webhooks', webhooksRouter(container));

  // À partir d'ici, corps JSON pour l'API marchand.
  app.use(express.json({ limit: '256kb' }));
  app.use('/v1/charges', chargesRouter(container));
  app.use('/v1/payouts', payoutsRouter(container));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
