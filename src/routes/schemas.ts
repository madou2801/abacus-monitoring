import { z } from 'zod';

const customerSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().max(160).optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/, 'Numéro invalide (format E.164 attendu).')
    .optional(),
});

const metadataSchema = z.record(z.string(), z.string().max(500)).optional();

const methodSchema = z.enum(['mobile_money', 'card', 'bank_transfer']);
const providerSchema = z.enum(['ligdicash', 'flutterwave']).optional();

export const createChargeSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  method: methodSchema,
  provider: providerSchema,
  customer: customerSchema.optional(),
  description: z.string().max(500).optional(),
  reference: z.string().max(120).optional(),
  return_url: z.string().url().optional(),
  metadata: metadataSchema,
});

export const createPayoutSchema = z.object({
  amount: z.number().int().positive(),
  currency: z.string().length(3),
  method: methodSchema,
  provider: providerSchema,
  recipient: customerSchema,
  description: z.string().max(500).optional(),
  reference: z.string().max(120).optional(),
  metadata: metadataSchema,
});

export type CreateChargeBody = z.infer<typeof createChargeSchema>;
export type CreatePayoutBody = z.infer<typeof createPayoutSchema>;
