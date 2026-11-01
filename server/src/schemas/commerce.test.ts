import { describe, expect, it } from 'vitest';
import {
  addressInputSchema,
  cartInputSchema,
  checkoutInputSchema,
  productInputSchema,
  productQuerySchema,
  resourceIdParamsSchema,
  roleInputSchema,
  sellerOrderStatusSchema,
} from './commerce.js';

describe('commerce input schemas', () => {
  it('trims product text and supplies safe defaults', () => {
    expect(
      productInputSchema.parse({
        name: '  Linen shirt  ',
        category: '  Clothing ',
        priceCents: 3500,
        stock: 0,
      }),
    ).toMatchObject({
      name: 'Linen shirt',
      description: '',
      category: 'Clothing',
      active: true,
    });
  });

  it.each([
    { name: 'x', category: 'Clothing', priceCents: 100, stock: 0 },
    { name: 'Valid name', category: 'x', priceCents: 100, stock: 0 },
    { name: 'Valid name', category: 'Clothing', priceCents: 0, stock: 0 },
    { name: 'Valid name', category: 'Clothing', priceCents: 100.5, stock: 0 },
    { name: 'Valid name', category: 'Clothing', priceCents: 100, stock: -1 },
    { name: 'Valid name', category: 'Clothing', priceCents: 100, stock: 1_000_001 },
    {
      name: 'Valid name',
      category: 'Clothing',
      priceCents: 100,
      stock: 0,
      imageUrl: 'javascript:alert(1)',
    },
  ])('rejects invalid product data: %o', (input) => {
    expect(productInputSchema.safeParse(input).success).toBe(false);
  });

  it('accepts only HTTP(S) image URLs', () => {
    expect(
      productInputSchema.safeParse({
        name: 'Valid name',
        category: 'Clothing',
        priceCents: 100,
        stock: 0,
        imageUrl: 'https://example.com/item.png',
      }).success,
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        name: 'Valid name',
        category: 'Clothing',
        priceCents: 100,
        stock: 0,
        imageUrl: 'data:image/png;base64,abc',
      }).success,
    ).toBe(false);
  });

  it('normalizes country codes and rejects invalid ones', () => {
    const address = {
      recipient: 'Ada Lovelace',
      line1: '10 Main Street',
      postalCode: '75001',
      city: 'Paris',
      country: 'fr',
    };
    expect(addressInputSchema.parse(address).country).toBe('FR');
    expect(addressInputSchema.safeParse({ ...address, country: 'France' }).success).toBe(false);
  });

  it('rejects duplicated or oversized cart input', () => {
    expect(
      cartInputSchema.safeParse({
        items: [
          { productId: 'p1', quantity: 1 },
          { productId: 'p1', quantity: 2 },
        ],
      }).success,
    ).toBe(false);
    expect(
      cartInputSchema.safeParse({
        items: Array.from({ length: 101 }, (_, i) => ({
          productId: `p${i}`,
          quantity: 1,
        })),
      }).success,
    ).toBe(false);
    expect(
      cartInputSchema.safeParse({ items: [{ productId: 'p1', quantity: 101 }] }).success,
    ).toBe(false);
  });

  it('rejects duplicate, blank and excessive checkout order ids', () => {
    expect(checkoutInputSchema.safeParse({ orderIds: ['o1', 'o1'] }).success).toBe(false);
    expect(checkoutInputSchema.safeParse({ orderIds: ['   '] }).success).toBe(false);
    expect(
      checkoutInputSchema.safeParse({
        orderIds: Array.from({ length: 16 }, (_, i) => `o${i}`),
      }).success,
    ).toBe(false);
  });

  it('validates resource identifiers, product filters, roles and order statuses', () => {
    expect(resourceIdParamsSchema.safeParse({ id: '   ' }).success).toBe(false);
    expect(resourceIdParamsSchema.parse({ id: '  product-1  ' }).id).toBe('product-1');
    expect(productQuerySchema.safeParse({ category: 'x'.repeat(61) }).success).toBe(false);
    expect(roleInputSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(sellerOrderStatusSchema.safeParse({ status: 'REFUNDED' }).success).toBe(false);
  });
});
