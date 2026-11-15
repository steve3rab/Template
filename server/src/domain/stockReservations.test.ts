import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { releaseExpiredUnlinkedReservations } from './stockReservations.js';

function setup(
  orders: Array<{
    id: string;
    items: Array<{ productId: string | null; quantity: number }>;
  }>,
  cancellationCount = 1,
) {
  const orderFindMany = vi.fn(async () => orders);
  const orderUpdateMany = vi.fn(async () => ({ count: cancellationCount }));
  const productUpdateMany = vi.fn(async () => ({ count: 1 }));
  const transactionClient = {
    order: { updateMany: orderUpdateMany },
    product: { updateMany: productUpdateMany },
  };
  const prisma = {
    order: { findMany: orderFindMany },
    $transaction: vi.fn(
      async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    ),
  } as unknown as PrismaClient;

  return { prisma, orderFindMany, orderUpdateMany, productUpdateMany };
}

describe('releaseExpiredUnlinkedReservations', () => {
  const now = new Date('2026-11-15T12:00:00.000Z');

  it('cancels an expired unpaid order and restores every linked product quantity atomically', async () => {
    const store = setup([
      {
        id: 'order-1',
        items: [
          { productId: 'product-1', quantity: 2 },
          { productId: 'product-2', quantity: 1 },
          { productId: null, quantity: 4 },
        ],
      },
    ]);

    await expect(releaseExpiredUnlinkedReservations(store.prisma, now)).resolves.toBe(1);

    expect(store.orderFindMany).toHaveBeenCalledWith({
      where: {
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: null,
        reservationExpiresAt: { lte: now },
      },
      include: { items: { select: { productId: true, quantity: true } } },
      orderBy: { reservationExpiresAt: 'asc' },
      take: 100,
    });
    expect(store.orderUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        paymentReference: null,
        reservationExpiresAt: { lte: now },
      },
      data: { status: 'CANCELLED' },
    });
    expect(store.productUpdateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'product-1' },
      data: { stock: { increment: 2 } },
    });
    expect(store.productUpdateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'product-2' },
      data: { stock: { increment: 1 } },
    });
    expect(store.productUpdateMany).toHaveBeenCalledTimes(2);
  });

  it('does not restore stock when another process already cancelled or paid the order', async () => {
    const store = setup([{ id: 'order-raced', items: [{ productId: 'product-1', quantity: 3 }] }], 0);

    await expect(releaseExpiredUnlinkedReservations(store.prisma, now)).resolves.toBe(0);

    expect(store.orderUpdateMany).toHaveBeenCalledTimes(1);
    expect(store.productUpdateMany).not.toHaveBeenCalled();
  });

  it('does not query or release orders that still have a Stripe session reference', async () => {
    const store = setup([]);

    await expect(releaseExpiredUnlinkedReservations(store.prisma, now)).resolves.toBe(0);

    expect(store.orderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ paymentReference: null }),
      }),
    );
    expect(store.orderUpdateMany).not.toHaveBeenCalled();
    expect(store.productUpdateMany).not.toHaveBeenCalled();
  });
});
