// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerFavoriteRoutes } from './favorites.js';

const customer = { id: 'customer-1', role: 'CUSTOMER' } as User;
let app: FastifyInstance;

function setup(resolveUser: () => Promise<User | null> = async () => customer) {
  const productFindFirst = vi.fn(async (): Promise<{ id: string; active: boolean } | null> => ({ id: 'product-1', active: true }));
  const favoriteFindMany = vi.fn(async () => []);
  const favoriteUpsert = vi.fn(async (args: unknown) => args);
  const favoriteDeleteMany = vi.fn(async () => ({ count: 1 }));
  const prisma = {
    product: { findFirst: productFindFirst },
    favorite: {
      findMany: favoriteFindMany,
      upsert: favoriteUpsert,
      deleteMany: favoriteDeleteMany,
    },
  };
  app = Fastify({ logger: false });
  registerFavoriteRoutes(app, prisma as unknown as PrismaClient, (async () =>
    resolveUser()) as never);
  return { prisma, productFindFirst, favoriteFindMany, favoriteUpsert, favoriteDeleteMany };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('customer favorites routes', () => {
  it('requires authentication before reading favorites', async () => {
    const { favoriteFindMany } = setup(async () => null);
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/favorites' });

    expect(response.statusCode).toBe(401);
    expect(favoriteFindMany).not.toHaveBeenCalled();
  });

  it('scopes favorite reads to the authenticated customer', async () => {
    const { favoriteFindMany } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/customer/favorites' });

    expect(response.statusCode).toBe(200);
    expect(favoriteFindMany).toHaveBeenCalledWith({
      where: { userId: customer.id },
      include: { product: true },
    });
  });

  it('validates the product ID before querying the database', async () => {
    const { productFindFirst, favoriteUpsert } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/favorites/%20',
    });

    expect(response.statusCode).toBe(400);
    expect(productFindFirst).not.toHaveBeenCalled();
    expect(favoriteUpsert).not.toHaveBeenCalled();
  });

  it('does not favorite inactive or missing products', async () => {
    const { productFindFirst, favoriteUpsert } = setup();
    productFindFirst.mockResolvedValueOnce(null);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/favorites/missing-product',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'Product not found.' });
    expect(favoriteUpsert).not.toHaveBeenCalled();
  });

  it('uses an idempotent upsert scoped to the current customer', async () => {
    const { favoriteUpsert } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/favorites/product-1',
    });

    expect(response.statusCode).toBe(201);
    expect(favoriteUpsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: customer.id, productId: 'product-1' } },
      create: { userId: customer.id, productId: 'product-1' },
      update: {},
    });
  });

  it('removes a favorite only for the current customer', async () => {
    const { favoriteDeleteMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/customer/favorites/product-1',
    });

    expect(response.statusCode).toBe(204);
    expect(favoriteDeleteMany).toHaveBeenCalledWith({
      where: { userId: customer.id, productId: 'product-1' },
    });
  });
});
