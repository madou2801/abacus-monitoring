import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { ApiError } from '../errors/ApiError.js';

/**
 * Valide `req.body` contre un schéma Zod et remplace le body par la version
 * typée/nettoyée. Toute entrée non conforme est rejetée en 400 avec détails.
 */
export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      throw ApiError.badRequest(
        'validation_error',
        'Requête invalide.',
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    req.body = result.data;
    next();
  };
}

export { z };
