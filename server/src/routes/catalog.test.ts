// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCatalogRoutes } from './catalog.js';

let app: FastifyInstance;

function setup() {
  const findMany = vi.fn(async () => []);
  const count = vi.fn(async () => 0);
  app = Fastify({ logger: false });
  registerCatalogRoutes(app, { product: { findMany, count } } as unknown as PrismaClient);
  return { findMany, count };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('public product catalog', () => {
  it('returns active products with stable default ordering and pagination metadata', async () => {
    const { findMany, count } = setup();
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/products' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      products: [],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 100,
    });
    expect(count).toHaveBeenCalledWith({ where: { active: true } });
  });

  it('combines text, category, stock, price, sorting and pagination filters', async () => {
    const { findMany, count } = setup();
    await app.ready();
    const response = await app.inject({
      method: 'GET',
      url: '/api/products?category=Accessoires&search=sac&inStock=true&minPriceCents=1000&maxPriceCents=9000&sort=price-asc&page=2&pageSize=12',
    });
    expect(response.statusCode).toBe(200);
    const where = {
      active: true,
      category: 'Accessoires',
      OR: [
        { name: { contains: 'sac' } },
        { description: { contains: 'sac' } },
        { category: { contains: 'sac' } },
      ],
      stock: { gt: 0 },
      priceCents: { gte: 1000, lte: 9000 },
    };
    expect(findMany).toHaveBeenCalledWith({
      where,
      orderBy: { priceCents: 'asc' },
      skip: 12,
      take: 12,
    });
    expect(count).toHaveBeenCalledWith({ where });
  });

  it('supports descending price and alphabetical sorting', async () => {
    const { findMany } = setup();
    await app.ready();
    await app.inject({ method: 'GET', url: '/api/products?sort=price-desc' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { priceCents: 'desc' } }),
    );
    await app.inject({ method: 'GET', url: '/api/products?sort=name-asc' });
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: { name: 'asc' } }),
    );
  });

  it.each([
    'category=' + 'x'.repeat(61),
    'page=0',
    'pageSize=101',
    'sort=invalid',
    'minPriceCents=9000&maxPriceCents=1000',
    'inStock=yes',
  ])('rejects invalid filters (%s) without querying the database', async (query) => {
    const { findMany, count } = setup();
    await app.ready();
    const response = await app.inject({ method: 'GET', url: '/api/products?' + query });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('Invalid product filters.');
    expect(findMany).not.toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });
});
