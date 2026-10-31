// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCustomerOrderRoutes } from './orders.js';

const user = { id: 'customer-1', role: 'CUSTOMER' } as User;
let app: FastifyInstance;

function makePrisma() {
  return {
    address: { findFirst: vi.fn(async () => null) },
    cartItem: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({ count: 0 })) },
    order: { findMany: vi.fn(async () => []) },
    product: { findFirst: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 1 })) },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      product: { updateMany: vi.fn(async () => ({ count: 1 })) },
    })),
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('customer order access control', () => {
  it('rejects order history requests without an authenticated user', async () => {
    const prisma = makePrisma();
    app = Fastify({ logger: false });
    registerCustomerOrderRoutes(
      app,
      prisma as unknown as PrismaClient,
      async () => null,
    );
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/orders' });

    expect(response.statusCode).toBe(401);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
  });

  it('scopes order history to the authenticated customer', async () => {
    const prisma = makePrisma();
    app = Fastify({ logger: false });
    registerCustomerOrderRoutes(
      app,
      prisma as unknown as PrismaClient,
      async () => user,
    );
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/orders' });

    expect(response.statusCode).toBe(200);
    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { userId: user.id },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('cannot create an order using another customer’s address', async () => {
    const prisma = makePrisma();
    app = Fastify({ logger: false });
    registerCustomerOrderRoutes(
      app,
      prisma as unknown as PrismaClient,
      async () => user,
    );
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/orders',
      payload: { addressId: 'address-owned-by-someone-else' },
    });

    expect(response.statusCode).toBe(404);
    expect(prisma.address.findFirst).toHaveBeenCalledWith({
      where: { id: 'address-owned-by-someone-else', userId: user.id },
    });
    expect(prisma.cartItem.findMany).not.toHaveBeenCalled();
  });
});
