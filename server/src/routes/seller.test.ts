// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSellerRoutes } from './seller.js';

const seller = { id: 'seller-1', role: 'SELLER' } as User;
const admin = { id: 'admin-1', role: 'ADMIN' } as User;
let app: FastifyInstance;

function setup(resolveUser = async () => seller) {
  const productFindMany = vi.fn(async () => []);
  const productFindFirst = vi.fn(async () => null);
  const productCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'product-new',
    ...data,
  }));
  const productUpdate = vi.fn(async () => ({ id: 'product-1' }));
  const orderFindMany = vi.fn(async () => []);
  const orderFindFirst = vi.fn(async () => null);
  const orderUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'order-1',
    ...data,
  }));
  const txProductUpdate = vi.fn(async () => ({ id: 'product-1' }));
  const prisma = {
    product: {
      findMany: productFindMany,
      findFirst: productFindFirst,
      create: productCreate,
      update: productUpdate,
    },
    order: { findMany: orderFindMany, findFirst: orderFindFirst, update: orderUpdate },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ order: { update: orderUpdate }, product: { update: txProductUpdate } }),
    ),
  };
  app = Fastify({ logger: false });
  app.register(rateLimit, { global: false });
  registerSellerRoutes(app, prisma as unknown as PrismaClient, resolveUser as never);
  return {
    prisma,
    productFindMany,
    productFindFirst,
    productCreate,
    productUpdate,
    orderFindMany,
    orderFindFirst,
    orderUpdate,
    txProductUpdate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('seller data isolation and route validation', () => {
  it('rate-limits repeated seller product writes per client IP', async () => {
    setup();
    await app.ready();

    const responses = await Promise.all(
      Array.from({ length: 21 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/seller/products',
          payload: { name: 'x', category: 'Clothing', priceCents: -1, stock: -1 },
        }),
      ),
    );

    expect(responses.slice(0, 20).every((response) => response.statusCode === 400)).toBe(true);
    expect(responses[20]?.statusCode).toBe(429);
  });

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

  it('returns 401 when there is no authenticated user', async () => {
    setup(async () => null as never);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/seller/products' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for a customer role', async () => {
    setup(async () => ({ id: 'customer-1', role: 'CUSTOMER' }) as User);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/seller/products' });
    expect(response.statusCode).toBe(403);
  });

  it('allows admins to list all products without seller scoping', async () => {
    const { productFindMany } = setup(async () => admin);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/seller/products' });
    expect(response.statusCode).toBe(200);
    expect(productFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('creates a product owned by the authenticated seller', async () => {
    const { productCreate } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/seller/products',
      payload: {
        name: '  Linen shirt  ',
        category: 'Clothing',
        priceCents: 3500,
        stock: 4,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(productCreate).toHaveBeenCalledWith({
      data: {
        name: 'Linen shirt',
        description: '',
        category: 'Clothing',
        priceCents: 3500,
        stock: 4,
        active: true,
        sellerId: seller.id,
      },
    });
    expect(response.json().product.sellerId).toBe(seller.id);
  });

  it('rejects invalid product creation and does not write to the database', async () => {
    const { productCreate } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/seller/products',
      payload: { name: 'x', category: 'Clothing', priceCents: -1, stock: -2 },
    });
    expect(response.statusCode).toBe(400);
    expect(productCreate).not.toHaveBeenCalled();
  });

  it('rejects empty or invalid product updates', async () => {
    const { productFindFirst, productUpdate } = setup();
    await app.ready();
    const empty = await app.inject({
      method: 'PATCH',
      url: '/api/seller/products/product-1',
      payload: {},
    });
    const invalidId = await app.inject({
      method: 'PATCH',
      url: '/api/seller/products/',
      payload: { name: 'Updated shirt' },
    });
    expect(empty.statusCode).toBe(400);
    expect(invalidId.statusCode).toBeGreaterThanOrEqual(400);
    expect(productFindFirst).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
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

  it('deactivates an owned product rather than physically deleting it', async () => {
    const { productFindFirst, productUpdate } = setup();
    productFindFirst.mockResolvedValueOnce({ id: 'product-1' } as never);
    await app.ready();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/seller/products/product-1',
    });
    expect(response.statusCode).toBe(204);
    expect(productFindFirst).toHaveBeenCalledWith({
      where: { id: 'product-1', sellerId: seller.id },
    });
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { active: false },
    });
  });

  it('returns 404 instead of deactivating a product the seller does not own', async () => {
    const { productUpdate } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'DELETE',
      url: '/api/seller/products/missing',
    });
    expect(response.statusCode).toBe(404);
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

  it('rejects malformed order status requests', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'DELIVERED' },
    });
    expect(response.statusCode).toBe(400);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('blocks fulfillment before payment is confirmed', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      items: [],
    } as never);
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'PROCESSING' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/confirmed payment/i);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('blocks cancelling paid orders until a refund workflow exists', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'PAID',
      items: [],
    } as never);
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'CANCELLED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/refund workflow/i);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('blocks cancelling unpaid orders while a payment session is active', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentReference: 'cs_active',
      items: [],
    } as never);
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'CANCELLED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/payment session must expire/i);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid order status transitions', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'PAID',
      items: [],
    } as never);
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'DELIVERED' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/transition/i);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it(
    'cancels an unpaid order without a payment session and restores linked product stock',
    async () => {
      const { orderFindFirst, orderUpdate, txProductUpdate, prisma } = setup();
      orderFindFirst.mockResolvedValueOnce({
        id: 'order-1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: null,
        items: [{ productId: 'product-1', quantity: 3 }, { productId: null, quantity: 1 }],
      } as never);
      await app.ready();
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/seller/orders/order-1/status',
        payload: { status: 'CANCELLED' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().order.status).toBe('CANCELLED');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(orderUpdate).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: { status: 'CANCELLED' },
        include: { items: true },
      });
      expect(txProductUpdate).toHaveBeenCalledTimes(1);
      expect(txProductUpdate).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: { stock: { increment: 3 } },
      });
    },
  );
  it('validates dashboard periods and aggregates seller metrics', async () => {
    const { orderFindMany, productFindMany } = setup();
    orderFindMany.mockResolvedValueOnce([
      {
        paymentStatus: 'PAID',
        totalCents: 4000,
        items: [{ quantity: 2 }],
      },
      {
        paymentStatus: 'UNPAID',
        totalCents: 9000,
        items: [{ quantity: 1 }, { quantity: 3 }],
      },
    ] as never);
    productFindMany.mockResolvedValueOnce([
      { id: 'p1', stock: 2 },
      { id: 'p2', stock: 5 },
      { id: 'p3', stock: 6 },
    ] as never);
    await app.ready();
    const invalid = await app.inject({ method: 'GET', url: '/api/seller/dashboard?days=14' });
    expect(invalid.statusCode).toBe(400);
    const response = await app.inject({ method: 'GET', url: '/api/seller/dashboard?days=7' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      periodDays: 7,
      revenueCents: 4000,
      orders: 2,
      paidOrders: 1,
      unitsSold: 6,
      products: 3,
      lowStockProducts: 2,
      currency: 'EUR',
    });
    expect(orderFindMany).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        sellerId: seller.id,
        createdAt: { gte: expect.any(Date) },
      }),
      include: { items: { include: { product: true } } },
    });
  });

  it('allows admin dashboard queries across all sellers', async () => {
    const { orderFindMany, productFindMany } = setup(async () => admin);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/seller/dashboard?days=90' });
    expect(response.statusCode).toBe(200);
    expect(orderFindMany).toHaveBeenCalledWith({
      where: { createdAt: { gte: expect.any(Date) } },
      include: { items: { include: { product: true } } },
    });
    expect(productFindMany).toHaveBeenCalledWith({ where: {} });
  });
});
