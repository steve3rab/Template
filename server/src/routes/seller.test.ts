// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSellerRoutes } from './seller.js';

const seller = { id: 'seller-1', role: 'SELLER' } as User;
const admin = { id: 'admin-1', role: 'ADMIN' } as User;
let app: FastifyInstance;

function setup(resolveUser = async () => seller, rateLimitMax = 1000) {
  const productFindMany = vi.fn(async () => []);
  const productFindFirst = vi.fn(async () => null);
  const productCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'product-new',
    ...data,
  }));
  const productUpdate = vi.fn(async () => ({ id: 'product-1' }));
  const orderFindMany = vi.fn(async () => []);
  const orderAggregate = vi.fn(async (args: { where?: { paymentStatus?: string } }) =>
    args.where?.paymentStatus === 'PAID'
      ? { _count: { _all: 1 }, _sum: { totalCents: 4000 } }
      : { _count: { _all: 2 }, _sum: { totalCents: 13000 } },
  );
  const orderItemAggregate = vi.fn(async () => ({ _sum: { quantity: 6 } }));
  const productCount = vi.fn(async (args: { where?: { stock?: { lte: number } } } = {}) =>
    args.where?.stock ? 2 : 3,
  );
  const orderFindFirst = vi.fn(async () => null);
  const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
  const txProductUpdate = vi.fn(async () => ({ id: 'product-1' }));
  const prisma = {
    product: {
      findMany: productFindMany,
      findFirst: productFindFirst,
      create: productCreate,
      update: productUpdate,
      count: productCount,
    },
    order: {
      findMany: orderFindMany,
      findFirst: orderFindFirst,
      updateMany: orderUpdateMany,
      aggregate: orderAggregate,
    },
    orderItem: { aggregate: orderItemAggregate },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ order: { updateMany: orderUpdateMany }, product: { update: txProductUpdate } }),
    ),
  };
  app = Fastify({ logger: false });
  app.register(rateLimit, {
    global: true,
    max: rateLimitMax,
    timeWindow: '1 minute',
    keyGenerator: () => 'test-client',
  });
  app.after(() => {
    registerSellerRoutes(app, prisma as unknown as PrismaClient, resolveUser as never);
  });
  return {
    prisma,
    productFindMany,
    productFindFirst,
    productCreate,
    productUpdate,
    orderFindMany,
    orderAggregate,
    orderItemAggregate,
    productCount,
    orderFindFirst,
    orderUpdateMany,
    txProductUpdate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('seller data isolation and route validation', () => {
  it('rate-limits repeated seller product writes per client IP', async () => {
    setup(async () => seller, 20);
    await app.ready();

    const responses = [];
    for (let index = 0; index < 21; index += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/api/seller/products',
          payload: { name: 'Test product', category: 'Clothing', priceCents: 1000, stock: 1 },
        }),
      );
    }

    expect(responses.slice(0, 20).every((response) => response.statusCode === 201)).toBe(true);
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

  it('stores uploaded product photos, sizes and dimensions', async () => {
    const { productCreate } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'POST',
      url: '/api/seller/products',
      payload: {
        name: 'Canvas tote',
        category: 'Accessories',
        priceCents: 2500,
        stock: 8,
        imageUrls: ['data:image/png;base64,iVBORw0KGgo='],
        sizes: ['Small', 'Medium'],
        dimensions: { length: 32, width: 28, height: 12, unit: 'cm' },
      },
    });

    expect(response.statusCode).toBe(201);
    const createCall = productCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(createCall.data.imageUrl).toBe('data:image/png;base64,iVBORw0KGgo=');
    expect(JSON.parse(String(createCall.data.imageUrls))).toEqual([
      'data:image/png;base64,iVBORw0KGgo=',
    ]);
    expect(JSON.parse(String(createCall.data.sizes))).toEqual(['Small', 'Medium']);
    expect(JSON.parse(String(createCall.data.dimensions))).toMatchObject({
      length: 32,
      unit: 'cm',
    });
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

  it('clears the legacy image URL when a seller removes every product photo', async () => {
    const { productFindFirst, productUpdate } = setup();
    productFindFirst.mockResolvedValueOnce({ id: 'product-1' } as never);
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/products/product-1',
      payload: { imageUrls: [] },
    });

    expect(response.statusCode).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { active: true, description: '', imageUrls: '[]', imageUrl: null },
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
    const { orderFindFirst, orderUpdateMany } = setup();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects malformed order status requests', async () => {
    const { orderFindFirst, orderUpdateMany } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'NOT_A_VALID_STATUS' },
    });
    expect(response.statusCode).toBe(400);
    expect(orderFindFirst).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('blocks fulfillment before payment is confirmed', async () => {
    const { orderFindFirst, orderUpdateMany } = setup();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('blocks cancelling paid orders until a refund workflow exists', async () => {
    const { orderFindFirst, orderUpdateMany } = setup();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('blocks cancelling unpaid orders while a payment session is active', async () => {
    const { orderFindFirst, orderUpdateMany } = setup();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid order status transitions', async () => {
    const { orderFindFirst, orderUpdateMany } = setup();
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
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it('cancels an unpaid order without a payment session and restores linked product stock', async () => {
    const { orderFindFirst, orderUpdate, txProductUpdate, prisma } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentReference: null,
      items: [
        { productId: 'product-1', quantity: 3 },
        { productId: null, quantity: 1 },
      ],
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
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: null,
      },
      data: { status: 'CANCELLED' },
    });
    expect(txProductUpdate).toHaveBeenCalledTimes(1);
    expect(txProductUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { stock: { increment: 3 } },
    });
  });
  it('does not restore stock when a concurrent order update wins first', async () => {
    const { orderFindFirst, orderUpdateMany, txProductUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentReference: null,
      items: [{ productId: 'product-1', quantity: 2 }],
    } as never);
    orderUpdateMany.mockResolvedValueOnce({ count: 0 });
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'CANCELLED' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toMatch(/changed while this update/i);
    expect(txProductUpdate).not.toHaveBeenCalled();
  });

  it('validates dashboard periods and aggregates seller metrics in the database', async () => {
    const { orderAggregate, orderItemAggregate, productCount } = setup();
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
    expect(orderAggregate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          sellerId: seller.id,
          createdAt: { gte: expect.any(Date) },
        }),
        _count: { _all: true },
      }),
    );
    expect(orderAggregate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ sellerId: seller.id, paymentStatus: 'PAID' }),
        _sum: { totalCents: true },
      }),
    );
    expect(orderItemAggregate).toHaveBeenCalledWith({
      where: {
        order: {
          is: { sellerId: seller.id, createdAt: { gte: expect.any(Date) } },
        },
      },
      _sum: { quantity: true },
    });
    expect(productCount).toHaveBeenNthCalledWith(1, { where: { sellerId: seller.id } });
    expect(productCount).toHaveBeenNthCalledWith(2, {
      where: { sellerId: seller.id, stock: { lte: 5 } },
    });
  });

  it('allows admin dashboard queries across all sellers', async () => {
    const { orderAggregate, orderItemAggregate, productCount } = setup(async () => admin);
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/seller/dashboard?days=90' });
    expect(response.statusCode).toBe(200);
    expect(orderAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: expect.any(Date) } },
      }),
    );
    expect(orderItemAggregate).toHaveBeenCalledWith({
      where: { order: { is: { createdAt: { gte: expect.any(Date) } } } },
      _sum: { quantity: true },
    });
    expect(productCount).toHaveBeenNthCalledWith(1, { where: {} });
    expect(productCount).toHaveBeenNthCalledWith(2, { where: { stock: { lte: 5 } } });
  });
});
