// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerSellerRoutes } from './seller.js';

const seller = { id: 'seller-1', role: 'SELLER' } as User;
const admin = { id: 'admin-1', role: 'ADMIN' } as User;
let app: FastifyInstance;

function setup(role: 'SELLER' | 'ADMIN' = 'SELLER') {
  const productFindMany = vi.fn(async () => []);
  const productFindFirst = vi.fn(async (): Promise<{ id: string; sellerId: string; active: boolean } | null> => ({
    id: 'product-1',
    sellerId: 'seller-1',
    active: true,
  }));
  const productCreate = vi.fn(async ({ data }: { data: unknown }) => ({ id: 'product-new', ...data as object }));
  const productUpdate = vi.fn(async ({ data }: { data: unknown }) => ({ id: 'product-1', ...data as object }));
  const orderFindMany = vi.fn(async () => []);
  const orderFindFirst = vi.fn(async () => ({
    id: 'order-1',
    sellerId: 'seller-1',
    status: 'PENDING',
    paymentStatus: 'UNPAID',
    paymentReference: null,
    items: [{ productId: 'product-1', quantity: 2 }],
  }));
  const orderUpdate = vi.fn(async () => ({ id: 'order-1', status: 'PROCESSING', items: [] }));
  const txProductUpdate = vi.fn(async () => ({ id: 'product-1' }));
  const txOrderUpdate = vi.fn(async () => ({ id: 'order-1', status: 'CANCELLED', items: [] }));
  const transaction = {
    order: { update: txOrderUpdate },
    product: { update: txProductUpdate },
  };
  const prisma = {
    product: {
      findMany: productFindMany,
      findFirst: productFindFirst,
      create: productCreate,
      update: productUpdate,
    },
    order: {
      findMany: orderFindMany,
      findFirst: orderFindFirst,
      update: orderUpdate,
    },
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)),
  };
  app = Fastify({ logger: false });
  const current = role === 'ADMIN' ? admin : seller;
  registerSellerRoutes(app, prisma as unknown as PrismaClient, (async () => current) as never);
  return {
    prisma, productFindMany, productFindFirst, productCreate, productUpdate,
    orderFindMany, orderFindFirst, orderUpdate, txProductUpdate, txOrderUpdate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('seller workspace authorization and rules', () => {
  it('scopes seller products and orders to the authenticated seller', async () => {
    const { productFindMany, orderFindMany } = setup();
    await app.ready();

    const products = await app.inject({ method: 'GET', url: '/api/seller/products' });
    const orders = await app.inject({ method: 'GET', url: '/api/seller/orders' });

    expect(products.statusCode).toBe(200);
    expect(productFindMany).toHaveBeenCalledWith({
      where: { sellerId: seller.id },
      orderBy: { updatedAt: 'desc' },
    });
    expect(orders.statusCode).toBe(200);
    expect(orderFindMany).toHaveBeenCalledWith({
      where: { sellerId: seller.id },
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('allows admins to query products without seller scoping', async () => {
    const { productFindMany } = setup('ADMIN');
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/seller/products' });

    expect(response.statusCode).toBe(200);
    expect(productFindMany).toHaveBeenCalledWith({ where: {}, orderBy: { updatedAt: 'desc' } });
  });

  it('forces the creating seller ID and does not accept caller-controlled ownership', async () => {
    const { productCreate } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/seller/products',
      payload: {
        name: 'Produit test',
        category: 'Accessoires',
        priceCents: 1200,
        stock: 5,
        sellerId: 'victim-seller',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(productCreate).toHaveBeenCalledWith({
      data: {
        name: 'Produit test',
        description: '',
        category: 'Accessoires',
        priceCents: 1200,
        stock: 5,
        active: true,
        sellerId: seller.id,
      },
    });
  });

  it('does not allow a seller to modify another seller product', async () => {
    const { productFindFirst, productUpdate } = setup();
    productFindFirst.mockResolvedValueOnce(null);
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/products/foreign-product',
      payload: { name: 'Intrusion' },
    });

    expect(response.statusCode).toBe(404);
    expect(productFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-product', sellerId: seller.id },
    });
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('rejects fulfillment before payment has been confirmed', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'PROCESSING' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().error).toContain('confirmed payment');
    expect(orderFindFirst).toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('rejects invalid status transitions without updating the order', async () => {
    const { orderFindFirst, orderUpdate } = setup();
    orderFindFirst.mockResolvedValueOnce({
      id: 'order-1',
      sellerId: seller.id,
      status: 'DELIVERED',
      paymentStatus: 'PAID',
      paymentReference: null,
      items: [],
    } as never);
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/seller/orders/order-1/status',
      payload: { status: 'PROCESSING' },
    });

    expect(response.statusCode).toBe(409);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it('validates the allowed dashboard periods before querying metrics', async () => {
    const { orderFindMany } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/seller/dashboard?days=14' });

    expect(response.statusCode).toBe(400);
    expect(orderFindMany).not.toHaveBeenCalled();
  });
});
