// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomerOrderRoutes } from './orders.js';

const user = { id: 'customer-1', role: 'CUSTOMER' } as User;
const address = {
  id: 'address-1',
  userId: user.id,
  recipient: 'Camille Martin',
  line1: '12 rue des Lilas',
  line2: null,
  postalCode: '75011',
  city: 'Paris',
  country: 'FR',
};
let app: FastifyInstance;

function makePrisma() {
  const addressFindFirst = vi.fn(async ({ where }: { where: { id: string } }) =>
    where.id === address.id ? address : null,
  );
  const txCartFindMany = vi.fn(async (): Promise<{ productId: string; quantity: number }[]> => []);
  const txCartDeleteMany = vi.fn(async () => ({ count: 1 }));
  const txProductFindFirst = vi.fn(
    async (): Promise<{
      id: string;
      name: string;
      sellerId: string | null;
      active: boolean;
      stock: number;
      priceCents: number;
    } | null> => null,
  );
  const txProductUpdateMany = vi.fn(async () => ({ count: 1 }));
  const txOrderCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'order-new',
    ...data,
  }));
  const transaction = {
    cartItem: { findMany: txCartFindMany, deleteMany: txCartDeleteMany },
    product: { findFirst: txProductFindFirst, updateMany: txProductUpdateMany },
    order: { create: txOrderCreate },
  };
  const prisma = {
    address: { findFirst: addressFindFirst },
    cartItem: {
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    order: { findMany: vi.fn(async () => []) },
    product: {
      findFirst: vi.fn(async () => null),
      updateMany: txProductUpdateMany,
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  return {
    prisma,
    addressFindFirst,
    txCartFindMany,
    txCartDeleteMany,
    txProductFindFirst,
    txProductUpdateMany,
    txOrderCreate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

async function startApp(prisma: PrismaClient, resolveUser: () => Promise<User | null>) {
  app = Fastify({ logger: false });
  registerCustomerOrderRoutes(app, prisma, resolveUser);
  await app.ready();
}

describe('customer order access control', () => {
  it('rejects order history requests without an authenticated user', async () => {
    const store = makePrisma();
    await startApp(store.prisma as unknown as PrismaClient, async () => null);

    const response = await app.inject({ method: 'GET', url: '/api/customer/orders' });

    expect(response.statusCode).toBe(401);
    expect(store.prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('scopes order history to the authenticated customer', async () => {
    const store = makePrisma();
    await startApp(store.prisma as unknown as PrismaClient, async () => user);

    const response = await app.inject({ method: 'GET', url: '/api/customer/orders' });

    expect(response.statusCode).toBe(200);
    expect(store.prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('cannot create an order using another customer’s address', async () => {
    const store = makePrisma();
    await startApp(store.prisma as unknown as PrismaClient, async () => user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/orders',
      payload: { addressId: 'address-owned-by-someone-else' },
    });

    expect(response.statusCode).toBe(404);
    expect(store.addressFindFirst).toHaveBeenCalledWith({
      where: { id: 'address-owned-by-someone-else', userId: user.id },
    });
    expect(store.txCartFindMany).not.toHaveBeenCalled();
  });

  it('rejects an empty cart without creating an order or clearing cart state', async () => {
    const store = makePrisma();
    await startApp(store.prisma as unknown as PrismaClient, async () => user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/orders',
      payload: { addressId: address.id },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Cart is empty.' });
    expect(store.txOrderCreate).not.toHaveBeenCalled();
    expect(store.txProductUpdateMany).not.toHaveBeenCalled();
    expect(store.txCartDeleteMany).not.toHaveBeenCalled();
  });

  it('rejects insufficient stock before creating orders or reserving inventory', async () => {
    const store = makePrisma();
    store.txCartFindMany.mockResolvedValueOnce([{ productId: 'product-1', quantity: 2 }]);
    store.txProductFindFirst.mockResolvedValueOnce({
      id: 'product-1',
      name: 'Chemise',
      sellerId: 'seller-1',
      active: true,
      stock: 1,
      priceCents: 2500,
    });
    await startApp(store.prisma as unknown as PrismaClient, async () => user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/orders',
      payload: { addressId: address.id },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: 'Insufficient stock for one or more products.',
    });
    expect(store.txOrderCreate).not.toHaveBeenCalled();
    expect(store.txProductUpdateMany).not.toHaveBeenCalled();
    expect(store.txCartDeleteMany).not.toHaveBeenCalled();
  });

  it('splits multi-seller carts and reserves stock using server-side prices', async () => {
    const store = makePrisma();
    store.txCartFindMany.mockResolvedValueOnce([
      { productId: 'product-1', quantity: 2 },
      { productId: 'product-2', quantity: 1 },
    ]);
    store.txProductFindFirst
      .mockResolvedValueOnce({
        id: 'product-1',
        name: 'Chemise',
        sellerId: 'seller-1',
        active: true,
        stock: 5,
        priceCents: 2500,
      })
      .mockResolvedValueOnce({
        id: 'product-2',
        name: 'Sac',
        sellerId: 'seller-2',
        active: true,
        stock: 3,
        priceCents: 1200,
      });
    await startApp(store.prisma as unknown as PrismaClient, async () => user);

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/orders',
      payload: { addressId: address.id, totalCents: 1 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().orders).toHaveLength(2);
    expect(store.txOrderCreate).toHaveBeenCalledTimes(2);
    expect(store.txOrderCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
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
      }),
    );
    expect(store.txOrderCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          sellerId: 'seller-2',
          addressId: address.id,
          totalCents: 1200,
        }),
        include: { items: true },
      }),
    );
    expect(store.txProductUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'product-1', active: true, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
    expect(store.txProductUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'product-2', active: true, stock: { gte: 1 } },
      data: { stock: { decrement: 1 } },
    });
    expect(store.txCartDeleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
  });
});
