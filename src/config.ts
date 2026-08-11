import 'dotenv/config';
import { z } from 'zod';

/**
 * Configuration validée au démarrage. Si une variable critique manque ou est
 * invalide, le process échoue immédiatement (fail-fast) — on ne démarre jamais
 * une passerelle de paiement à moitié configurée.
 */
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  MERCHANT_API_KEYS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  // Défaut volontairement marqué "changeme" pour que le garde-fou production
  // (plus bas) refuse de démarrer si on ne l'a pas remplacé.
  WEBHOOK_SIGNING_SECRET: z
    .string()
    .min(8, 'WEBHOOK_SIGNING_SECRET trop court')
    .default('dev_changeme_secret'),

  LIGDICASH_MOCK: z
    .string()
    .default('true')
    .transform((v) => v.toLowerCase() === 'true'),
  LIGDICASH_BASE_URL: z.string().url().default('https://app.ligdicash.com/pay/v01'),
  LIGDICASH_API_KEY: z.string().default(''),
  LIGDICASH_API_TOKEN: z.string().default(''),
  LIGDICASH_WEBHOOK_SECRET: z.string().default(''),

  PUBLIC_BASE_URL: z.string().url().default('http://localhost:4000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('❌ Configuration invalide:\n', parsed.error.format());
  process.exit(1);
}

const env = parsed.data;

// Garde-fou: en production on refuse les valeurs par défaut "changeme".
if (env.NODE_ENV === 'production') {
  if (env.MERCHANT_API_KEYS.length === 0) {
    throw new Error('MERCHANT_API_KEYS est requis en production.');
  }
  if (env.WEBHOOK_SIGNING_SECRET.includes('changeme')) {
    throw new Error('WEBHOOK_SIGNING_SECRET doit être changé en production.');
  }
  if (env.LIGDICASH_MOCK) {
    throw new Error('LIGDICASH_MOCK ne peut pas être actif en production.');
  }
}

export const config = {
  port: env.PORT,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  isProduction: env.NODE_ENV === 'production',
  merchantApiKeys: env.MERCHANT_API_KEYS,
  webhookSigningSecret: env.WEBHOOK_SIGNING_SECRET,
  publicBaseUrl: env.PUBLIC_BASE_URL,
  ligdicash: {
    mock: env.LIGDICASH_MOCK,
    baseUrl: env.LIGDICASH_BASE_URL,
    apiKey: env.LIGDICASH_API_KEY,
    apiToken: env.LIGDICASH_API_TOKEN,
    webhookSecret: env.LIGDICASH_WEBHOOK_SECRET,
  },
} as const;

export type AppConfig = typeof config;
