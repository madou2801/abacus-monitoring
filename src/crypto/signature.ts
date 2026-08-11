import { createHmac, timingSafeEqual } from 'node:crypto';

/** Calcule un HMAC-SHA256 en hexadécimal. */
export function hmacSha256(secret: string, payload: string | Buffer): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Compare deux signatures en temps constant pour éviter les attaques par
 * analyse temporelle (timing attacks). Renvoie false si les longueurs diffèrent.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Vérifie qu'une signature reçue correspond bien au payload signé. */
export function verifyHmac(secret: string, payload: string | Buffer, received: string): boolean {
  if (!received) return false;
  const expected = hmacSha256(secret, payload);
  return safeEqual(expected, received.trim());
}
