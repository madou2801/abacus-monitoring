import { pino } from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.logLevel,
  // Ne jamais logger de données sensibles (clés, OTP, numéros complets).
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-webhook-signature"]',
      '*.apiKey',
      '*.apiToken',
      '*.otp',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
  transport:
    config.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
});
