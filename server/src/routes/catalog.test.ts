// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCatalogRoutes } from './catalog.js';

let app: FastifyInstance;

function setup() {
  const findMany = vi.fn(async () => []);
  app = Fastify({ logger: false });
  registerCatalogRoutes(app, { product: { findMany } } as unknown as PrismaClient);
  return { findMany };
}

afterEach(async () => {
  if (app) await app.close();
});

describe('public product catalog', () => {
  it('returns active products ordered by creation date', async () => {
    const { findMany } = setup();
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/api/products' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [] });
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('filters active products by a valid category', async () => {
    const { findMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/products?category=Accessoires',
    });

    expect(response.statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith({
      where: { active: true, category: 'Accessoires' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns an empty result and avoids database access for invalid filters', async () => {
    const { findMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: `/api/products?category=${'x'.repeat(61)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ products: [] });
    expect(findMany).not.toHaveBeenCalled();
  });
});
