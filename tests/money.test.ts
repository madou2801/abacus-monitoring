import { describe, it, expect } from 'vitest';
import { makeMoney, formatMoney, toMajorUnit, currencyDecimals } from '../src/money/money.js';
import { ApiError } from '../src/errors/ApiError.js';

describe('money', () => {
  it('accepte un montant entier en XOF (0 décimale)', () => {
    const m = makeMoney(1000, 'xof');
    expect(m).toEqual({ amount: 1000, currency: 'XOF' });
    expect(toMajorUnit(m)).toBe(1000);
    expect(formatMoney(m)).toBe('1000 XOF');
  });

  it('gère les décimales du NGN (2)', () => {
    const m = makeMoney(150000, 'NGN');
    expect(currencyDecimals('NGN')).toBe(2);
    expect(toMajorUnit(m)).toBe(1500);
    expect(formatMoney(m)).toBe('1500.00 NGN');
  });

  it('refuse un montant non entier', () => {
    expect(() => makeMoney(10.5, 'XOF')).toThrow(ApiError);
  });

  it('refuse un montant négatif ou nul', () => {
    expect(() => makeMoney(0, 'XOF')).toThrow(ApiError);
    expect(() => makeMoney(-5, 'XOF')).toThrow(ApiError);
  });

  it('refuse une devise non supportée', () => {
    expect(() => makeMoney(100, 'ABC')).toThrow(ApiError);
  });
});
