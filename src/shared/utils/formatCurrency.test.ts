import { describe, expect, it } from 'vitest';
import { formatCents, formatCurrency } from './formatCurrency';

describe('currency formatting', () => {
  it('formats whole and fractional euro amounts consistently', () => {
    expect(formatCurrency(12)).toContain('12');
    expect(formatCurrency(12.5)).toContain('12,50');
  });

  it('converts integer cents at the presentation boundary', () => {
    expect(formatCents(1299)).toContain('12,99');
    expect(formatCents(0)).toContain('0,00');
  });

  it('returns a visible placeholder for non-finite values', () => {
    expect(formatCurrency(Number.NaN)).toBe('—');
    expect(formatCents(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('supports another currency and locale', () => {
    expect(formatCurrency(10, 'USD', 'en-US')).toContain('$10.00');
  });
});
