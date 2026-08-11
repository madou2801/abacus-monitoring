import { describe, it, expect } from 'vitest';
import { hmacSha256, verifyHmac, safeEqual } from '../src/crypto/signature.js';

describe('signature HMAC', () => {
  it('vérifie une signature valide', () => {
    const secret = 'shhh-secret';
    const payload = Buffer.from('{"event":"charge.succeeded"}');
    const sig = hmacSha256(secret, payload);
    expect(verifyHmac(secret, payload, sig)).toBe(true);
  });

  it('rejette une signature falsifiée', () => {
    const secret = 'shhh-secret';
    const payload = Buffer.from('{"amount":1000}');
    const forged = hmacSha256('mauvais-secret', payload);
    expect(verifyHmac(secret, payload, forged)).toBe(false);
  });

  it('safeEqual est faux pour des longueurs différentes', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('abc', 'abc')).toBe(true);
  });
});
