import { describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORIES } from './categories';

describe('PRODUCT_CATEGORIES', () => {
  it('defines each customer-facing product category exactly once', () => {
    expect(PRODUCT_CATEGORIES).toEqual(['Vêtements', 'Chaussures', 'Accessoires', 'Maison']);
    expect(new Set(PRODUCT_CATEGORIES).size).toBe(PRODUCT_CATEGORIES.length);
  });
});
