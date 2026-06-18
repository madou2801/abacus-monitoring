import { Router, type Request } from 'express';
import express from 'express';
import type { Container } from '../container.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../errors/ApiError.js';
import type { ProviderName } from '../domain/types.js';

const KNOWN_PROVIDERS: ProviderName[] = ['ligdicash', 'flutterwave'];

export function webhooksRouter(c: Container): Router {
  const router = Router();

  // Le corps brut est requis pour vérifier la signature HMAC à l'octet près.
  router.post(
    '/:provider',
    express.raw({ type: '*/*', limit: '256kb' }),
    asyncHandler(async (req: Request, res) => {
      const provider = req.params.provider as ProviderName;
      if (!KNOWN_PROVIDERS.includes(provider)) {
        throw ApiError.notFound(`Fournisseur webhook inconnu: ${provider}`);
      }
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      await c.webhooks.handle(provider, { rawBody, headers: req.headers });
      // On accuse toujours réception (200) après traitement valide pour éviter
      // que le fournisseur ne renvoie indéfiniment le même événement.
      res.status(200).json({ received: true });
    }),
  );

  return router;
}
