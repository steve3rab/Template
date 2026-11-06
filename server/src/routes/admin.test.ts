// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAdminRoutes } from './admin.js';

const admin = { id: 'admin-1', role: 'ADMIN' } as User;
const seller = { id: 'seller-1', role: 'SELLER' } as User;
let app: FastifyInstance;

function setup(role: User['role'] = 'ADMIN', overrides: Record<string, unknown> = {}) {
  const user = role === 'ADMIN' ? admin : role === 'SELLER' ? seller : ({ id: 'customer-1', role: 'CUSTOMER' } as User);
  const userFindUnique = vi.fn(async () => ({ id: 'target-user' }));
  const userUpdate = vi.fn(async () => ({
    id: 'target-user',
    email: 'target@example.test',
    role: 'SELLER',
  }));
  const sessionDeleteMany = vi.fn(async () => ({ count: 2 }));
  const userCount = vi.fn(async ({ where }: { where?: { role?: string } } = {}) =>
    where?.role === 'SELLER' ? 2 : 12,
  );
  const userFindMany = vi.fn(async () => []);
  const productCount = vi.fn(async ({ where }: { where?: { active?: boolean } } = {}) =>
    where?.active ? 18 : 25,
  );
  const productFindMany = vi.fn(async () => []);
  const productFindUnique = vi.fn(async () => ({ id: 'product-1' }));
  const productUpdate = vi.fn(async () => ({ id: 'product-1', active: false }));
  const orderCount = vi.fn(async () => 7);
  const orderFindMany = vi.fn(async () => []);
  const orderAggregate = vi.fn(async () => ({ _count: { _all: 2 }, _sum: { totalCents: 3000 } }));
  const prisma = {
    user: {
      findUnique: userFindUnique,
      update: userUpdate,
      count: userCount,
      findMany: userFindMany,
    },
    product: {
      count: productCount,
      findMany: productFindMany,
      findUnique: productFindUnique,
      update: productUpdate,
    },
    order: { count: orderCount, findMany: orderFindMany, aggregate: orderAggregate },
    session: { deleteMany: sessionDeleteMany },
    ...overrides,
  };
  app = Fastify({ logger: false });
  registerAdminRoutes(app, prisma as unknown as PrismaClient, (async () => user) as never);
  return {
    prisma,
    userFindUnique,
    userUpdate,
    sessionDeleteMany,
    userCount,
    userFindMany,
    productCount,
    productFindMany,
    productFindUnique,
    productUpdate,
    orderCount,
    orderFindMany,
    orderAggregate,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('admin role management', () => {
  it('exposes a dedicated administrator identity endpoint only to admins', async () => {
    setup('SELLER');
    await app.ready();
    const denied = await app.inject({ method: 'GET', url: '/api/admin/me' });
    expect(denied.statusCode).toBe(403);
    await app.close();

    setup('ADMIN');
    await app.ready();
    const allowed = await app.inject({ method: 'GET', url: '/api/admin/me' });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().admin).toMatchObject({ id: 'admin-1', role: 'ADMIN' });
  });

  it('returns global administrator KPIs, including confirmed revenue only', async () => {
    const { userCount, productCount, orderCount, orderAggregate } = setup('ADMIN');
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/admin/dashboard' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      users: 12,
      sellers: 2,
      products: 25,
      activeProducts: 18,
      orders: 7,
      paidOrders: 2,
      revenueCents: 3000,
    });
    expect(userCount).toHaveBeenCalledTimes(2);
    expect(productCount).toHaveBeenCalledTimes(2);
    expect(orderCount).toHaveBeenCalledTimes(1);
    expect(orderAggregate).toHaveBeenCalledWith({
      where: { paymentStatus: 'PAID' },
      _count: { _all: true },
      _sum: { totalCents: true },
    });
  });

  it('returns zero revenue when no paid orders exist', async () => {
    const { orderAggregate } = setup('ADMIN');
    orderAggregate.mockResolvedValueOnce({
      _count: { _all: 0 },
      _sum: { totalCents: null as unknown as number },
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/admin/dashboard' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ paidOrders: 0, revenueCents: 0 });
  });

  it('lists user accounts with their stable public identifiers', async () => {
    const { userFindMany } = setup('ADMIN');
    userFindMany.mockResolvedValueOnce([
      {
        id: 'user-1',
        publicId: 'USR-0001',
        email: 'person@example.test',
        role: 'CUSTOMER',
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ] as never);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(response.statusCode).toBe(200);
    expect(response.json().users[0]).toMatchObject({
      id: 'user-1',
      publicId: 'USR-0001',
      email: 'person@example.test',
      role: 'CUSTOMER',
    });
  });

  it('lets admins hide or republish a catalogue product', async () => {
    const { productUpdate } = setup('ADMIN');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/products/product-1/visibility',
      payload: { active: false },
    });
    expect(response.statusCode).toBe(200);
    expect(productUpdate).toHaveBeenCalledWith({
      where: { id: 'product-1' },
      data: { active: false },
    });
  });

  it('returns 404 when an administrator moderates a missing product', async () => {
    const { productFindUnique, productUpdate } = setup('ADMIN');
    productFindUnique.mockResolvedValueOnce(null as never);
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/products/missing-product/visibility',
      payload: { active: false },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('Product not found.');
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('rejects unknown fields in product visibility updates', async () => {
    const { productFindUnique, productUpdate } = setup('ADMIN');
    await app.ready();

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/admin/products/product-1/visibility',
      payload: { active: false, role: 'ADMIN' },
    });

    expect(response.statusCode).toBe(400);
    expect(productFindUnique).not.toHaveBeenCalled();
    expect(productUpdate).not.toHaveBeenCalled();
  });

  it('denies non-admins before any database access', async () => {
    const { userFindUnique, userUpdate } = setup('SELLER');
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/target-user/role',
      payload: { role: 'SELLER' },
    });

    expect(response.statusCode).toBe(403);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it('rejects malformed role names', async () => {
    const { userFindUnique } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/target-user/role',
      payload: { role: 'ADMIN' },
    });

    expect(response.statusCode).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('prevents an administrator from changing their own role', async () => {
    const { userFindUnique, userUpdate, sessionDeleteMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/admin-1/role',
      payload: { role: 'SELLER' },
    });

    expect(response.statusCode).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown user and does not mutate sessions', async () => {
    const { userFindUnique, userUpdate, sessionDeleteMany } = setup();
    userFindUnique.mockResolvedValueOnce(null as never);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/missing-user/role',
      payload: { role: 'CUSTOMER' },
    });

    expect(response.statusCode).toBe(404);
    expect(userFindUnique).toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(sessionDeleteMany).not.toHaveBeenCalled();
  });

  it('updates the role safely and invalidates all sessions for the target account', async () => {
    const { userUpdate, sessionDeleteMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/users/target-user/role',
      payload: { role: 'SELLER' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toEqual({
      id: 'target-user',
      email: 'target@example.test',
      role: 'SELLER',
    });
    expect(userUpdate).toHaveBeenCalledWith({
      where: { id: 'target-user' },
      data: { role: 'SELLER' },
      select: { id: true, email: true, role: true },
    });
    expect(sessionDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'target-user' },
    });
  });
  it.each(['SELLER', 'CUSTOMER'] as const)(
    'denies %s from every administrator route before database access',
    async (role) => {
      const { userFindUnique, userUpdate, userCount, productCount, orderCount } = setup(role);
      await app.ready();

      const responses = await Promise.all([
        app.inject({ method: 'GET', url: '/api/admin/me' }),
        app.inject({ method: 'GET', url: '/api/admin/dashboard' }),
        app.inject({ method: 'GET', url: '/api/admin/users' }),
        app.inject({ method: 'PATCH', url: '/api/admin/products/product-1/visibility', payload: { active: false } }),
        app.inject({ method: 'POST', url: '/api/admin/users/target-user/role', payload: { role: 'SELLER' } }),
      ]);

      expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403]);
      expect(userFindUnique).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
      expect(userCount).not.toHaveBeenCalled();
      expect(productCount).not.toHaveBeenCalled();
      expect(orderCount).not.toHaveBeenCalled();
    },
  );

});
