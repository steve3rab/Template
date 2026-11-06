import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { createCustomerOrdersFromCart, CustomerOrderCreationError } from './customerOrders.js';

const address = {
  id: 'address-1',
  recipient: 'Camille Martin',
  line1: '12 rue des Lilas',
  line2: null,
  postalCode: '75011',
  city: 'Paris',
  country: 'FR',
};

type SetupOptions = {
  cart?: Array<{ productId: string; quantity: number }>;
  stock?: number;
};

function setup(options: SetupOptions = {}) {
  const cartItemFindMany = vi.fn(async () => {
    return options.cart ?? [{ productId: 'product-1', quantity: 2 }];
  });
  const cartItemDeleteMany = vi.fn(async () => ({ count: 1 }));
  const productFindFirst = vi.fn(async () => ({
    id: 'product-1',
    name: 'Chemise',
    sellerId: 'seller-1',
    active: true,
    stock: options.stock ?? 5,
    priceCents: 2500,
  }));
  const productUpdateMany = vi.fn(async () => ({ count: 1 }));
  const orderCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'order-1',
    ...data,
    items: [],
  }));
  const tx = {
    cartItem: { findMany: cartItemFindMany, deleteMany: cartItemDeleteMany },
    product: { findFirst: productFindFirst, updateMany: productUpdateMany },
    order: { create: orderCreate },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => {
      return callback(tx);
    }),
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    cartItemFindMany,
    cartItemDeleteMany,
    productFindFirst,
    productUpdateMany,
    orderCreate,
  };
}

describe('createCustomerOrdersFromCart', () => {
  it('creates an order using database prices and reserves stock in one transaction', async () => {
    const store = setup();

    const orders = await createCustomerOrdersFromCart(store.prisma, 'customer-1', address);

    expect(orders).toHaveLength(1);
    expect(store.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(store.orderCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'customer-1',
        sellerId: 'seller-1',
        addressId: address.id,
        totalCents: 5000,
        items: {
          create: [
            {
              productId: 'product-1',
              productName: 'Chemise',
              unitPriceCents: 2500,
              quantity: 2,
            },
          ],
        },
      }),
      include: { items: true },
    });
    expect(store.productUpdateMany).toHaveBeenCalledWith({
      where: { id: 'product-1', active: true, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(store.cartItemDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'customer-1' },
    });
  });

  it('rejects an empty cart before creating orders or changing inventory', async () => {
    const store = setup({ cart: [] });

    await expect(
      createCustomerOrdersFromCart(store.prisma, 'customer-1', address),
    ).rejects.toMatchObject({ code: 'EMPTY_CART' });

    expect(store.orderCreate).not.toHaveBeenCalled();
    expect(store.productUpdateMany).not.toHaveBeenCalled();
    expect(store.cartItemDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock before creating orders', async () => {
    const store = setup({ stock: 1 });

    await expect(
      createCustomerOrdersFromCart(store.prisma, 'customer-1', address),
    ).rejects.toBeInstanceOf(CustomerOrderCreationError);

    expect(store.orderCreate).not.toHaveBeenCalled();
    expect(store.productUpdateMany).not.toHaveBeenCalled();
    expect(store.cartItemDeleteMany).not.toHaveBeenCalled();
  });

  it('does not clear the cart when a conditional stock reservation loses a race', async () => {
    const store = setup();
    store.productUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      createCustomerOrdersFromCart(store.prisma, 'customer-1', address),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

    expect(store.productUpdateMany).toHaveBeenCalledTimes(1);
    expect(store.cartItemDeleteMany).not.toHaveBeenCalled();
  });
});
