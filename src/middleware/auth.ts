import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { ApiError } from '../errors/ApiError.js';
import { safeEqual } from '../crypto/signature.js';

/**
 * Authentifie le marchand via `Authorization: Bearer <clé secrète>`.
 * Comparaison en temps constant pour ne pas fuiter d'information par timing.
 */
export function requireApiKey(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw ApiError.unauthorized();
  }
  const presented = match[1]!.trim();
  const ok = config.merchantApiKeys.some((key) => safeEqual(key, presented));
  if (!ok) {
    throw ApiError.unauthorized('Clé API invalide.');
  }
  next();
}
