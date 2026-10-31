import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { createOrderInputSchema } from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerCustomerOrderRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
app.post('/api/customer/orders', async (request, reply) => {
  const user = await requireUser(request, reply, prisma, resolveUser);
  if (!user) return;
  const body = createOrderInputSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'A saved shipping address is required.' });
  const address = await prisma.address.findFirst({ where: { id: body.data.addressId, userId: user.id } });
  if (!address) return reply.code(404).send({ error: 'Address not found.' });
  const cart = await prisma.cartItem.findMany({ where: { userId: user.id } });
  if (!cart.length) return reply.code(400).send({ error: 'Cart is empty.' });
  try {
    const orders = await prisma.$transaction(async (tx) => {
      const groups = new Map<string, { sellerId: string | null; totalCents: number; items: { productId: string; productName: string; unitPriceCents: number; quantity: number }[] }>();
      for (const item of cart) {
        const product = await tx.product.findFirst({ where: { id: item.productId, active: true } });
        if (!product || product.stock < item.quantity) throw new Error('INSUFFICIENT_STOCK');
        const key = product.sellerId ?? 'platform';
        const group = groups.get(key) ?? { sellerId: product.sellerId, totalCents: 0, items: [] };
        group.totalCents += product.priceCents * item.quantity;
        group.items.push({ productId: product.id, productName: product.name, unitPriceCents: product.priceCents, quantity: item.quantity });
        groups.set(key, group);
      }
      const created = [];
      for (const group of groups.values()) {
        const order = await tx.order.create({
          data: {
            userId: user.id,
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
      for (const item of cart) await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
      await tx.cartItem.deleteMany({ where: { userId: user.id } });
      return created;
    });
    return reply.code(201).send({ order: orders[0], orders });
  } catch (error) {
    if (error instanceof Error && error.message === 'INSUFFICIENT_STOCK') return reply.code(409).send({ error: 'Insufficient stock for one or more products.' });
    throw error;
  }
});

app.get('/api/customer/orders', async (request, reply) => {
  const user = await requireUser(request, reply, prisma, resolveUser);
  if (!user) return;
  return { orders: await prisma.order.findMany({ where: { userId: user.id }, include: { items: true }, orderBy: { createdAt: 'desc' } }) };
});
}
