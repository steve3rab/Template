import type { Address, Prisma, PrismaClient } from '@prisma/client';

type ShippingAddress = Pick<
  Address,
  'id' | 'recipient' | 'line1' | 'line2' | 'postalCode' | 'city' | 'country'
>;

export type CustomerOrderCreationErrorCode = 'EMPTY_CART' | 'INSUFFICIENT_STOCK';

export class CustomerOrderCreationError extends Error {
  constructor(readonly code: CustomerOrderCreationErrorCode) {
    super(code);
    this.name = 'CustomerOrderCreationError';
  }
}

/**
 * Creates one order per seller from the customer's current cart.
 * Prices, seller ownership and stock are read from the database inside the
 * transaction; client-supplied totals are never trusted.
 */
export async function createCustomerOrdersFromCart(
  prisma: PrismaClient,
  userId: string,
  address: ShippingAddress,
): Promise<Prisma.OrderGetPayload<{ include: { items: true } }>[]> {
  return prisma.$transaction(async (tx) => {
    const cart = await tx.cartItem.findMany({ where: { userId } });
    if (!cart.length) throw new CustomerOrderCreationError('EMPTY_CART');

    const groups = new Map<
      string,
      {
        sellerId: string | null;
        totalCents: number;
        items: {
          productId: string;
          productName: string;
          unitPriceCents: number;
          quantity: number;
        }[];
      }
    >();

    for (const item of cart) {
      const product = await tx.product.findFirst({
        where: { id: item.productId, active: true },
      });
      if (!product || product.stock < item.quantity) {
        throw new CustomerOrderCreationError('INSUFFICIENT_STOCK');
      }

      const key = product.sellerId ?? 'platform';
      const group = groups.get(key) ?? { sellerId: product.sellerId, totalCents: 0, items: [] };
      group.totalCents += product.priceCents * item.quantity;
      group.items.push({
        productId: product.id,
        productName: product.name,
        unitPriceCents: product.priceCents,
        quantity: item.quantity,
      });
      groups.set(key, group);
    }

    const created: Prisma.OrderGetPayload<{ include: { items: true } }>[] = [];
    for (const group of groups.values()) {
      const order = await tx.order.create({
        data: {
          userId,
          sellerId: group.sellerId,
          addressId: address.id,
          totalCents: group.totalCents,
          shippingRecipient: address.recipient,
          shippingLine1: address.line1,
          shippingLine2: address.line2,
          shippingPostal: address.postalCode,
          shippingCity: address.city,
          shippingCountry: address.country,
          items: { create: group.items },
        },
        include: { items: true },
      });
      created.push(order);
    }

    for (const item of cart) {
      const stockUpdate = await tx.product.updateMany({
        where: { id: item.productId, active: true, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (stockUpdate.count !== 1) {
        throw new CustomerOrderCreationError('INSUFFICIENT_STOCK');
      }
    }

    await tx.cartItem.deleteMany({ where: { userId } });
    return created;
  });
}
