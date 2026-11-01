// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSellerRoutes } from './seller.js';

const seller = { id: 'seller-1', role: 'SELLER' } as User;
let app: FastifyInstance;

function setup() {
  const productFindMany = vi.fn(async () => []);
  const productFindFirst = vi.fn(async () => null);
  const productUpdate = vi.fn(async () => ({ id: 'product-foreign' }));
  const orderFindMany = vi.fn(async () => []);
  const orderFindFirst = vi.fn(async () => null);
  const orderUpdate = vi.fn(async () => ({ id: 'order-foreign' }));
  const prisma = {
    product: { findMany: productFindMany, findFirst: productFindFirst, update: productUpdate },
    order: { findMany: orderFindMany, findFirst: orderFindFirst, update: orderUpdate },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ order: { update: orderUpdate }, product: { update: vi.fn() } }),
    ),
  };
  app = Fastify({ logger: false });
  registerSellerRoutes(app, prisma as unknown as PrismaClient, (async () => seller) as never);
  return {
    prisma,
    productFindMany,
    productFindFirst,
    productUpdate,
    orderFindMany,
    orderFindFirst,
    orderUpdate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('seller data isolation', () => {
  it('limits product listing to the authenticated seller', async () => {
    const { productFindMany } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/seller/products' });

    expect(response.statusCode).toBe(200);
    expect(productFindMany).toHaveBeenCalledWith({
      where: { sellerId: seller.id },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('does not allow a seller to modify another seller product', async () => {
    const { productFindFirst, productUpdate } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/products/product-foreign',
      payload: { name: 'Hijacked product' },
    });

    expect(response.statusCode).toBe(404);
    expect(productFindFirst).toHaveBeenCalledWith({
      where: { id: 'product-foreign', sellerId: seller.id },
    });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('limits order listing to the authenticated seller', async () => {
    const { orderFindMany } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/seller/orders' });

    expect(response.statusCode).toBe(200);
    expect(orderFindMany).toHaveBeenCalledWith({
      where: { sellerId: seller.id },
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('does not allow a seller to change another seller order status', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-foreign/status',
      payload: { status: 'PROCESSING' },
    });

    expect(response.statusCode).toBe(404);
    expect(orderFindFirst).toHaveBeenCalledWith({
      where: { id: 'order-foreign', sellerId: seller.id },
      include: { items: true },
    });
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
