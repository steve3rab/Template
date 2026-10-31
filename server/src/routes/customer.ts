import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import {
  addressInputSchema,
  cartInputSchema,
  createOrderInputSchema,
  productIdParamsSchema,
  resourceIdParamsSchema,
} from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerCustomerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): Promise<void> {
  app.get('/api/customer/cart', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { product: true } });
    return { items };
  });

  app.put('/api/customer/cart', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const body = cartInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid cart.' });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.cartItem.deleteMany({ where: { userId: user.id } });
        for (const item of body.data.items) {
          if (item.quantity === 0) continue;
          const product = await tx.product.findFirst({ where: { id: item.productId, active: true } });
          if (!product) throw new Error('Product unavailable.');
          await tx.cartItem.create({ data: { userId: user.id, productId: product.id, quantity: item.quantity } });
        }
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Product unavailable.') return reply.code(400).send({ error: 'One or more products are unavailable.' });
      throw error;
    }
    const items = await prisma.cartItem.findMany({ where: { userId: user.id }, include: { product: true } });
    return { items };
  });

  app.get('/api/customer/favorites', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const favorites = await prisma.favorite.findMany({ where: { userId: user.id }, include: { product: true } });
    return { favorites };
  });

  app.post('/api/customer/favorites/:productId', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const params = productIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid product id.' });
    const product = await prisma.product.findFirst({ where: { id: params.data.productId, active: true } });
    if (!product) return reply.code(404).send({ error: 'Product not found.' });
    const favorite = await prisma.favorite.upsert({
      where: { userId_productId: { userId: user.id, productId: product.id } },
      create: { userId: user.id, productId: product.id },
      update: {},
    });
    return reply.code(201).send({ favorite });
  });

  app.delete('/api/customer/favorites/:productId', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const params = productIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid product id.' });
    await prisma.favorite.deleteMany({ where: { userId: user.id, productId: params.data.productId } });
    return reply.code(204).send();
  });

  app.get('/api/customer/addresses', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    return { addresses: await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }) };
  });

  app.post('/api/customer/addresses', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const body = addressInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid address data.' });
    const address = await prisma.$transaction(async (tx) => {
      if (body.data.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...body.data, userId: user.id } });
    });
    return reply.code(201).send({ address });
  });

  app.delete('/api/customer/addresses/:id', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid address id.' });
    const result = await prisma.address.deleteMany({ where: { id: params.data.id, userId: user.id } });
    if (!result.count) return reply.code(404).send({ error: 'Address not found.' });
    return reply.code(204).send();
  });

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
