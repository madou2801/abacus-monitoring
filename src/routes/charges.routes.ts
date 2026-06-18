import { Router, type Request } from 'express';
import type { Container } from '../container.js';
import { requireApiKey } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createChargeSchema, type CreateChargeBody } from './schemas.js';
import { serializeCharge } from './serializers.js';

export function chargesRouter(c: Container): Router {
  const router = Router();

  router.post(
    '/',
    requireApiKey,
    validateBody(createChargeSchema),
    asyncHandler(async (req: Request, res) => {
      const body = req.body as CreateChargeBody;
      const idempotencyKey = req.header('idempotency-key') ?? undefined;
      const charge = await c.charges.create({
        amount: body.amount,
        currency: body.currency,
        method: body.method,
        provider: body.provider,
        customer: body.customer,
        description: body.description,
        reference: body.reference,
        returnUrl: body.return_url,
        metadata: body.metadata,
        idempotencyKey,
      });
      res.status(201).json(serializeCharge(charge));
    }),
  );

  router.get(
    '/:id',
    requireApiKey,
    asyncHandler(async (req, res) => {
      const charge = await c.charges.get(String(req.params.id));
      res.json(serializeCharge(charge));
    }),
  );

  return router;
}
