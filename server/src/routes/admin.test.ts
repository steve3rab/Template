// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAdminRoutes } from './admin.js';

const admin = { id: 'admin-1', role: 'ADMIN' } as User;
const seller = { id: 'seller-1', role: 'SELLER' } as User;
let app: FastifyInstance;

function setup(
  role: User['role'] = 'ADMIN',
  overrides: Record<string, unknown> = {},
) {
  const user = role === 'ADMIN' ? admin : seller;
  const userFindUnique = vi.fn(async () => ({ id: 'target-user' }));
  const userUpdate = vi.fn(async () => ({ id: 'target-user', email: 'target@example.test', role: 'SELLER' }));
  const sessionDeleteMany = vi.fn(async () => ({ count: 2 }));
  const prisma = {
    user: { findUnique: userFindUnique, update: userUpdate },
    session: { deleteMany: sessionDeleteMany },
    ...overrides,
  };
  app = Fastify({ logger: false });
  registerAdminRoutes(app, prisma as unknown as PrismaClient, (async () => user) as never);
  return { prisma, userFindUnique, userUpdate, sessionDeleteMany };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('admin role management', () => {
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
    const { userFindUnique, userUpdate, sessionDeleteMany } = setup('ADMIN', {
      user: {
        findUnique: vi.fn(async () => null),
        update: vi.fn(),
      },
    });
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
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: 'target-user' } });
  });
});
