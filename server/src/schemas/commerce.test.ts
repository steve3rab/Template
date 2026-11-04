import { describe, expect, it } from 'vitest';
import {
  addressInputSchema,
  cartInputSchema,
  checkoutInputSchema,
  productInputSchema,
  productQuerySchema,
  productVisibilitySchema,
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

  it('accepts only HTTPS image URLs', () => {
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
    expect(
      productInputSchema.safeParse({
        name: 'Valid name',
        category: 'Clothing',
        priceCents: 100,
        stock: 0,
        imageUrl: 'http://example.com/item.png',
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        name: 'Valid name',
        category: 'Clothing',
        priceCents: 100,
        stock: 0,
        imageUrl: 'https://user:secret@example.com/item.png',
      }).success,
    ).toBe(false);
  });

  it('accepts safe uploaded product images, sizes and dimensions', () => {
    const parsed = productInputSchema.safeParse({
      name: 'Canvas tote',
      category: 'Accessories',
      priceCents: 2500,
      stock: 8,
      imageUrls: ['data:image/png;base64,iVBORw0KGgo=', 'https://example.com/tote.webp'],
      sizes: ['Small', 'Medium', 'Medium'],
      dimensions: { length: 32, width: 28, height: 12, unit: 'cm' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(JSON.parse(parsed.data.imageUrls ?? '[]')).toHaveLength(2);
      expect(JSON.parse(parsed.data.sizes ?? '[]')).toEqual(['Small', 'Medium']);
      expect(JSON.parse(parsed.data.dimensions ?? '{}')).toMatchObject({ length: 32, unit: 'cm' });
    }
  });

  it('checks uploaded image signatures and validates remote image URLs', () => {
    const base = { name: 'Canvas tote', category: 'Accessories', priceCents: 2500, stock: 8 };
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['data:image/png;base64,aGVsbG8='],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['https://'],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['data:image/jpeg;base64,/9j/'],
      }).success,
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['data:image/webp;base64,UklGRjAwMDBXRUJQ'],
      }).success,
    ).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['data:image/webp;base64,aGVsbG8='],
      }).success,
    ).toBe(false);
  });

  it('rejects unsupported image data, too many images and invalid dimensions', () => {
    const base = { name: 'Canvas tote', category: 'Accessories', priceCents: 2500, stock: 8 };
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: ['data:image/svg+xml;base64,PHN2Zz4='],
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        imageUrls: Array(6).fill('https://example.com/photo.png'),
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...base,
        dimensions: { length: -1, unit: 'cm' },
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
    expect(cartInputSchema.safeParse({ items: [{ productId: 'p1', quantity: 101 }] }).success).toBe(
      false,
    );
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

  it('accepts strict product visibility updates', () => {
    expect(productVisibilitySchema.parse({ active: false })).toEqual({ active: false });
    expect(productVisibilitySchema.safeParse({ active: 'false' }).success).toBe(false);
    expect(productVisibilitySchema.safeParse({ active: true, role: 'ADMIN' }).success).toBe(false);
  });

  it('validates resource identifiers, product filters, roles and order statuses', () => {
    expect(resourceIdParamsSchema.safeParse({ id: '   ' }).success).toBe(false);
    expect(resourceIdParamsSchema.parse({ id: '  product-1  ' }).id).toBe('product-1');
    expect(productQuerySchema.safeParse({ category: 'x'.repeat(61) }).success).toBe(false);
    expect(roleInputSchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(sellerOrderStatusSchema.safeParse({ status: 'REFUNDED' }).success).toBe(false);
  });
});
