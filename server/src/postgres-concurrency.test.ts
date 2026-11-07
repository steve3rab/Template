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

  it('allows only one concurrent order status transition from the same snapshot', async () => {
    const user = await prisma.user.create({
      data: {
        publicId: `USR-${suffix}`,
        email: `concurrency-${suffix}@example.test`,
        passwordHash: 'test-only-hash',
        role: 'CUSTOMER',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        totalCents: 1000,
        shippingRecipient: 'Concurrency Test',
        shippingLine1: '1 Test Street',
        shippingPostal: '75001',
        shippingCity: 'Paris',
        shippingCountry: 'FR',
      },
    });

    const transitions = await Promise.all([
      prisma.order.updateMany({
        where: {
          id: order.id,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentReference: null,
        },
        data: { status: 'CANCELLED' },
      }),
      prisma.order.updateMany({
        where: {
          id: order.id,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentReference: null,
        },
        data: { status: 'PROCESSING' },
      }),
    ]);

    expect(transitions.reduce((total, result) => total + result.count, 0)).toBe(1);
    const finalOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(['CANCELLED', 'PROCESSING']).toContain(finalOrder.status);
    await prisma.order.delete({ where: { id: order.id } });
    await prisma.user.delete({ where: { id: user.id } });
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

    // Twenty independent contenders attempt to reserve the final unit at once.
    // The conditional stock predicate must make exactly one reservation succeed.
    const reservations = await Promise.all(
      Array.from({ length: 20 }, () =>
        prisma.product.updateMany({
          where: { id: product.id, active: true, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        }),
      ),
    );

    expect(reservations.reduce((total, result) => total + result.count, 0)).toBe(1);
    expect(reservations.filter((result) => result.count === 0)).toHaveLength(19);
    const finalProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(finalProduct.stock).toBe(0);
  });
});
