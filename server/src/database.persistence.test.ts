// @vitest-environment node

import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { createCustomerOrdersFromCart } from './domain/customerOrders.js';

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeWithDatabase = databaseConfigured ? describe : describe.skip;

let clients: PrismaClient[] = [];

function newClient() {
  const client = new PrismaClient();
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  clients = [];
});

describeWithDatabase('SQLite persistence', () => {
  it('persists a user and related session across independent Prisma clients', async () => {
    const email = `persistence-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const firstClient = newClient();

    const user = await firstClient.user.create({
      data: {
        email,
        publicId: `USR-${randomBytes(6).toString('hex').toUpperCase()}`,
        passwordHash: 'test-password-hash',
        sessions: {
          create: {
            tokenHash: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
      include: { sessions: true },
    });

    expect(user.id).toBeTruthy();
    expect(user.sessions).toHaveLength(1);
    await firstClient.$disconnect();

    const secondClient = newClient();
    const persistedUser = await secondClient.user.findUnique({
      where: { email },
      include: { sessions: true },
    });

    expect(persistedUser).not.toBeNull();
    expect(persistedUser?.id).toBe(user.id);
    expect(persistedUser?.passwordHash).toBe('test-password-hash');
    expect(persistedUser?.sessions).toHaveLength(1);
    expect(persistedUser?.sessions[0]?.userId).toBe(user.id);

    await secondClient.user.delete({ where: { id: user.id } });
    expect(await secondClient.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('enforces unique email addresses in the actual database', async () => {
    const email = `unique-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const client = newClient();

    const user = await client.user.create({
      data: {
        email,
        publicId: `USR-${randomBytes(6).toString('hex').toUpperCase()}`,
        passwordHash: 'test-password-hash',
      },
    });

    try {
      await expect(
        client.user.create({
          data: {
            email,
            publicId: `USR-${randomBytes(6).toString('hex').toUpperCase()}`,
            passwordHash: 'another-test-hash',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await client.user.delete({ where: { id: user.id } });
    }
  });

  it('rolls back the cart claim and order writes when stock validation fails inside a real transaction', async () => {
    const client = newClient();
    const suffix = randomBytes(8).toString('hex');
    const user = await client.user.create({
      data: {
        email: `rollback-${suffix}@example.test`,
        publicId: `USR-${suffix.toUpperCase()}`,
        passwordHash: 'test-only-hash',
      },
    });
    const address = await client.address.create({
      data: {
        userId: user.id,
        recipient: 'Transaction Test',
        line1: '1 Test Street',
        postalCode: '75001',
        city: 'Paris',
      },
    });
    const product = await client.product.create({
      data: { name: `rollback-${suffix}`, category: 'Test', priceCents: 1200, stock: 1 },
    });
    await client.cartItem.create({
      data: { userId: user.id, productId: product.id, quantity: 2 },
    });

    try {
      await expect(
        createCustomerOrdersFromCart(client, user.id, address),
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });

      // The cart was deleted before the stock check; the real DB transaction must restore it.
      expect(await client.cartItem.count({ where: { userId: user.id } })).toBe(1);
      expect(await client.order.count({ where: { userId: user.id } })).toBe(0);
      expect((await client.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(1);
    } finally {
      await client.cartItem.deleteMany({ where: { userId: user.id } });
      await client.product.delete({ where: { id: product.id } });
      await client.address.delete({ where: { id: address.id } });
      await client.user.delete({ where: { id: user.id } });
    }
  });

  it('never consumes another customer cart while creating an order for the authenticated customer', async () => {
    const client = newClient();
    const suffix = randomBytes(8).toString('hex');
    const first = await client.user.create({
      data: {
        email: `owner-a-${suffix}@example.test`,
        publicId: `USR-A-${suffix.toUpperCase()}`,
        passwordHash: 'test-only-hash',
      },
    });
    const second = await client.user.create({
      data: {
        email: `owner-b-${suffix}@example.test`,
        publicId: `USR-B-${suffix.toUpperCase()}`,
        passwordHash: 'test-only-hash',
      },
    });
    const address = await client.address.create({
      data: {
        userId: first.id,
        recipient: 'Customer A',
        line1: '2 Test Street',
        postalCode: '75002',
        city: 'Paris',
      },
    });
    const product = await client.product.create({
      data: { name: `isolation-${suffix}`, category: 'Test', priceCents: 900, stock: 2 },
    });
    await client.cartItem.createMany({
      data: [
        { userId: first.id, productId: product.id, quantity: 1 },
        { userId: second.id, productId: product.id, quantity: 1 },
      ],
    });

    try {
      const orders = await createCustomerOrdersFromCart(client, first.id, address);

      expect(orders).toHaveLength(1);
      expect(await client.cartItem.count({ where: { userId: first.id } })).toBe(0);
      expect(await client.cartItem.count({ where: { userId: second.id } })).toBe(1);
      expect(await client.order.count({ where: { userId: first.id } })).toBe(1);
      expect(await client.order.count({ where: { userId: second.id } })).toBe(0);
      expect((await client.product.findUniqueOrThrow({ where: { id: product.id } })).stock).toBe(1);
    } finally {
      await client.order.deleteMany({ where: { userId: first.id } });
      await client.cartItem.deleteMany({ where: { productId: product.id } });
      await client.product.delete({ where: { id: product.id } });
      await client.address.delete({ where: { id: address.id } });
      await client.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
    }
  });

});
