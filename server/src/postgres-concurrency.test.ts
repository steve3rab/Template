// @vitest-environment node

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../generated/postgres-client/index.js';

const databaseUrl = process.env.DATABASE_URL_POSTGRES;
const suite = describe.skipIf(!databaseUrl);
const prisma = new PrismaClient(
  databaseUrl ? { datasources: { db: { url: databaseUrl } } } : undefined,
);
const suffix = randomUUID();

suite('PostgreSQL concurrency guarantees', () => {
  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { name: `concurrency-${suffix}` } });
    await prisma.$disconnect();
  });

  it('allows only one concurrent stock reservation when one unit remains', async () => {
    const product = await prisma.product.create({
      data: {
        name: `concurrency-${suffix}`,
        category: 'Test',
        priceCents: 1000,
        stock: 1,
        active: true,
      },
    });

    const reservations = await Promise.all([
      prisma.product.updateMany({
        where: { id: product.id, active: true, stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      }),
      prisma.product.updateMany({
        where: { id: product.id, active: true, stock: { gte: 1 } },
        data: { stock: { decrement: 1 } },
      }),
    ]);

    expect(reservations.reduce((total, result) => total + result.count, 0)).toBe(1);
    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(finalProduct.stock).toBe(0);
  });
});
