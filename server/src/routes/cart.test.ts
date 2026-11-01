// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCartRoutes } from './cart.js';

const customer = { id: 'customer-1', role: 'CUSTOMER' } as User;
let app: FastifyInstance;

function setup(resolveUser: () => Promise<User | null> = async () => customer) {
  const txCartDeleteMany = vi.fn(async () => ({ count: 0 }));
  const txProductFindFirst = vi.fn(async () => ({ id: 'product-1', active: true }));
  const txCartCreate = vi.fn(async ({ data }: { data: unknown }) => ({ ...data }));
  const transaction = {
    cartItem: { deleteMany: txCartDeleteMany, create: txCartCreate },
    product: { findFirst: txProductFindFirst },
  };
  const prisma = {
    cartItem: {
      findMany: vi.fn(async () => []),
    },
    product: {
      findFirst: vi.fn(async () => ({ id: 'product-1', active: true })),
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
    ),
  };
  app = Fastify({ logger: false });
  registerCartRoutes(
    app,
    prisma as unknown as PrismaClient,
    (async () => resolveUser()) as never,
  );
  return { prisma, transaction, txCartDeleteMany, txProductFindFirst, txCartCreate };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('customer cart routes', () => {
  it('requires authentication before querying a customer cart', async () => {
    const { prisma } = setup(async () => null);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/cart' });

    expect(response.statusCode).toBe(401);
    expect(prisma.cartItem.findMany).not.toHaveBeenCalled();
  });

  it('scopes reads to the authenticated customer', async () => {
    const { prisma } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/cart' });

    expect(response.statusCode).toBe(200);
    expect(prisma.cartItem.findMany).toHaveBeenCalledWith({
      where: { userId: customer.id },
      include: { product: true },
    });
  });

  it('rejects duplicate product IDs and leaves the persisted cart untouched', async () => {
    const { prisma, txCartDeleteMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/customer/cart',
      payload: {
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'product-1', quantity: 2 },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(txCartDeleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unavailable products without exposing internal errors', async () => {
    const { txProductFindFirst, txCartDeleteMany, txCartCreate } = setup();
    txProductFindFirst.mockResolvedValueOnce(null);
    await app.ready();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/customer/cart',
      payload: { items: [{ productId: 'inactive-product', quantity: 2 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'One or more products are unavailable.' });
    expect(txCartDeleteMany).toHaveBeenCalledWith({ where: { userId: customer.id } });
    expect(txCartCreate).not.toHaveBeenCalled();
  });

  it('persists valid items only for the current customer and omits zero quantities', async () => {
    const { txCartDeleteMany, txCartCreate, txProductFindFirst } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'PUT',
      url: '/api/customer/cart',
      payload: {
        items: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-zero', quantity: 0 },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(txCartDeleteMany).toHaveBeenCalledWith({ where: { userId: customer.id } });
    expect(txProductFindFirst).toHaveBeenCalledTimes(1);
    expect(txCartCreate).toHaveBeenCalledTimes(1);
    expect(txCartCreate).toHaveBeenCalledWith({
      data: { userId: customer.id, productId: 'product-1', quantity: 2 },
    });
  });
});
