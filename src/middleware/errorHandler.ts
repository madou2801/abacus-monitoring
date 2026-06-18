import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../errors/ApiError.js';
import { logger } from '../logger.js';

/** Réponse d'erreur normalisée (forme stable, façon Stripe). */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  // Erreur inattendue: on logue tout, on ne renvoie rien d'interne au client.
  logger.error({ err }, 'Erreur non gérée');
  res.status(500).json({
    error: { code: 'internal_error', message: 'Une erreur interne est survenue.' },
  });
}

/** 404 par défaut pour toute route inconnue. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: 'Route inconnue.' } });
}
