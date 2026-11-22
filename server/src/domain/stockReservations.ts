import type { PrismaClient } from '@prisma/client';

export const STOCK_RESERVATION_TTL_MS = 30 * 60 * 1000;
const EXPIRY_BATCH_SIZE = 100;

/**
 * Releases stock held by unpaid orders that never acquired a Stripe Checkout
 * session. Orders linked to Stripe are deliberately excluded: their stock is
 * released only by the signed checkout.session.expired webhook, avoiding a
 * race with a payment that Stripe has accepted but whose webhook is delayed.
 *
 * Each cancellation and stock restoration is one transaction. The conditional
 * update is the idempotency guard shared with seller cancellation and webhooks.
 */
export async function releaseExpiredUnlinkedReservations(
  prisma: PrismaClient,
  now = new Date(),
): Promise<number> {
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      paymentReference: null,
      reservationExpiresAt: { lte: now },
    },
    select: {
      id: true,
      items: { select: { productId: true, quantity: true } },
    },
    orderBy: { reservationExpiresAt: 'asc' },
    take: EXPIRY_BATCH_SIZE,
  });

  let released = 0;
  for (const order of expiredOrders) {
    const didRelease = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.updateMany({
        where: {
          id: order.id,
          status: 'PENDING',
          paymentStatus: 'UNPAID',
          paymentReference: null,
          reservationExpiresAt: { lte: now },
        },
        data: { status: 'CANCELLED' },
      });
      if (cancelled.count !== 1) return false;

      for (const item of order.items) {
        if (!item.productId) continue;
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
      return true;
    });
    if (didRelease) released += 1;
  }

  return released;
}
