import { Router, type Request } from 'express';
import type { Container } from '../container.js';
import { requireApiKey } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createPayoutSchema, type CreatePayoutBody } from './schemas.js';
import { serializePayout } from './serializers.js';

export function payoutsRouter(c: Container): Router {
  const router = Router();

  router.post(
    '/',
    requireApiKey,
    validateBody(createPayoutSchema),
    asyncHandler(async (req: Request, res) => {
      const body = req.body as CreatePayoutBody;
      const idempotencyKey = req.header('idempotency-key') ?? undefined;
      const payout = await c.payouts.create({
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        provider: body.provider,
        recipient: body.recipient,
        description: body.description,
        reference: body.reference,
        metadata: body.metadata,
        idempotencyKey,
      });
      res.status(201).json(serializePayout(payout));
    }),
  );

  router.get(
    '/:id',
    requireApiKey,
    asyncHandler(async (req, res) => {
      const payout = await c.payouts.get(String(req.params.id));
      res.json(serializePayout(payout));
    }),
  );

  return router;
}
