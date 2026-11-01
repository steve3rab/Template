// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerAddressRoutes } from './addresses.js';

const customer = { id: 'customer-1', role: 'CUSTOMER' } as User;
let app: FastifyInstance;

function setup(resolveUser: () => Promise<User | null> = async () => customer) {
  const addressFindMany = vi.fn(async () => []);
  const addressFindFirst = vi.fn(async () => null);
  const addressCreate = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'address-new',
      ...data,
    }),
  );
  const addressDelete = vi.fn(async () => ({ id: 'address-1' }));
  const addressUpdate = vi.fn(
    async () => ({ id: 'address-2', isDefault: true }),
  );
  const addressUpdateMany = vi.fn(async () => ({ count: 1 }));
  const transaction = {
    address: {
      findFirst: addressFindFirst,
      create: addressCreate,
      delete: addressDelete,
      update: addressUpdate,
      updateMany: addressUpdateMany,
    },
  };
  const prisma = {
    address: { findMany: addressFindMany },
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  app = Fastify({ logger: false });
  registerAddressRoutes(
    app,
    prisma as unknown as PrismaClient,
    (async () => resolveUser()) as never,
  );
  return {
    prisma,
    addressFindMany,
    addressFindFirst,
    addressCreate,
    addressDelete,
    addressUpdate,
    addressUpdateMany,
  };
}

afterEach(async () => {
  if (app) await app.close();
});

const validAddress = {
  label: 'Domicile',
  recipient: 'Camille Martin',
  line1: '12 rue des Lilas',
  postalCode: '75011',
  city: 'Paris',
  country: 'FR',
  isDefault: true,
};

describe('customer address routes', () => {
  it('requires authentication before reading saved addresses', async () => {
    const { addressFindMany } = setup(async () => null);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/customer/addresses',
    });

    expect(response.statusCode).toBe(401);
    expect(addressFindMany).not.toHaveBeenCalled();
  });

  it('scopes address listing to the current customer and prioritizes the default', async () => {
    const { addressFindMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/api/customer/addresses',
    });

    expect(response.statusCode).toBe(200);
    expect(addressFindMany).toHaveBeenCalledWith({
      where: { userId: customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it('rejects malformed address input without opening a transaction', async () => {
    const { prisma, addressCreate } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/addresses',
      payload: { recipient: '', city: 'P' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid address data.' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(addressCreate).not.toHaveBeenCalled();
  });

  it('clears the customer’s previous default before creating a new default address', async () => {
    const { addressCreate, addressUpdateMany } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/customer/addresses',
      payload: validAddress,
    });

    expect(response.statusCode).toBe(201);
    expect(addressUpdateMany).toHaveBeenCalledWith({
      where: { userId: customer.id },
      data: { isDefault: false },
    });
    expect(addressCreate).toHaveBeenCalledWith({
      data: { userId: customer.id, ...validAddress },
    });
    expect(response.json().address).toMatchObject({
      id: 'address-new',
      userId: customer.id,
      isDefault: true,
    });
  });

  it('does not delete an address owned by another customer', async () => {
    const { addressFindFirst, addressDelete } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/customer/addresses/foreign-address',
    });

    expect(response.statusCode).toBe(404);
    expect(addressFindFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-address', userId: customer.id },
      select: { id: true, isDefault: true },
    });
    expect(addressDelete).not.toHaveBeenCalled();
  });

  it('promotes the most recent remaining address after deleting the default', async () => {
    const { addressFindFirst, addressDelete, addressUpdate } = setup();
    addressFindFirst
      .mockResolvedValueOnce({ id: 'address-1', isDefault: true } as never)
      .mockResolvedValueOnce({ id: 'address-2' } as never);
    await app.ready();

    const response = await app.inject({
      method: 'DELETE',
      url: '/api/customer/addresses/address-1',
    });

    expect(response.statusCode).toBe(204);
    expect(addressDelete).toHaveBeenCalledWith({
      where: { id: 'address-1' },
    });
    expect(addressFindFirst).toHaveBeenNthCalledWith(2, {
      where: { userId: customer.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    expect(addressUpdate).toHaveBeenCalledWith({
      where: { id: 'address-2' },
      data: { isDefault: true },
    });
  });
});
