import { Router } from 'express';
import { config } from '../config.js';

export function healthRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'abacus-pay',
      version: '0.1.0',
      environment: config.nodeEnv,
      time: new Date().toISOString(),
    });
  });
  return router;
}
