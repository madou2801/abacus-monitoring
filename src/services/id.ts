import { randomBytes } from 'node:crypto';

/** Génère un identifiant préfixé façon Stripe: `chg_xxx`, `pyt_xxx`, `evt_xxx`. */
export function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('hex')}`;
}
