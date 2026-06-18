import type { NextFunction, Request, Response } from 'express';

/**
 * Express 4 ne capture pas les rejets de promesses dans les handlers async.
 * Ce wrapper transmet toute erreur asynchrone au middleware d'erreurs.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
