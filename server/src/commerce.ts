import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import {
  addressInputSchema,
  cartInputSchema,
  createOrderInputSchema,
  passwordResetCompleteSchema,
  passwordResetRequestSchema,
  productIdParamsSchema,
  productInputSchema,
  productQuerySchema,
  resourceIdParamsSchema,
  roleInputSchema,
  sellerOrderStatusSchema,
} from './schemas/commerce.js';

const hashToken = (value: string) =>
  createHmac('sha256', process.env.SESSION_SECRET ?? 'local-development-only-change-this-secret')
    .update(value)
    .digest('hex');

type ResolveUser = (request: FastifyRequest, prisma: PrismaClient) => Promise<User | null>;


async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
  allowedRoles?: string[],
) {
  const user = await resolveUser(request, prisma);
  if (!user) {
    await reply.code(401).send({ error: 'Not authenticated.' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    await reply.code(403).send({ error: 'Insufficient permissions.' });
    return null;
  }
  return user;
}

export async function registerCommerceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
) {
  app.get('/api/products', async (request) => {
    const query = productQuerySchema.safeParse(request.query);
    if (!query.success) return { products: [] };
    const products = await prisma.product.findMany({
      where: { active: true, ...(query.data.category ? { category: query.data.category } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return { products };
  });

  app.post('/api/admin/users/:id/role', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body = roleInputSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid role update.' });
    if (params.data.id === admin.id) return reply.code(400).send({ error: 'Cannot change your own role.' });
    const target = await prisma.user.findUnique({ where: { id: params.data.id }, select: { id: true } });
    if (!target) return reply.code(404).send({ error: 'User not found.' });
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.data.role },
      select: { id: true, email: true, role: true },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    return { user };
  });

  app.get('/api/seller/products', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const products = await prisma.product.findMany({
      where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id },
      orderBy: { updatedAt: 'desc' },
    });
    return { products };
  });

  app.post('/api/seller/products', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const body = productInputSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid product data.' });
    const product = await prisma.product.create({
      data: { ...body.data, sellerId: seller.id },
    });
    return reply.code(201).send({ product });
  });

  app.patch('/api/seller/products/:id', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body = productInputSchema.partial().safeParse(request.body);
    if (!params.success || !body.success || Object.keys(body.data).length === 0) {
      return reply.code(400).send({ error: 'Invalid product update.' });
    }
    const existing = await prisma.product.findFirst({
      where: { id: params.data.id, ...(seller.role === 'ADMIN' ? {} : { sellerId: seller.id }) },
    });
    if (!existing) return reply.code(404).send({ error: 'Product not found.' });
    const product = await prisma.product.update({ where: { id: existing.id }, data: body.data });
    return { product };
  });

  app.delete('/api/seller/products/:id', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid product id.' });
    const existing = await prisma.product.findFirst({
      where: { id: params.data.id, ...(seller.role === 'ADMIN' ? {} : { sellerId: seller.id }) },
    });
    if (!existing) return reply.code(404).send({ error: 'Product not found.' });
    await prisma.product.update({ where: { id: existing.id }, data: { active: false } });
    return reply.code(204).send();
  });

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

  app.get('/api/seller/orders', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const orders = await prisma.order.findMany({
      where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id },
      include: { items: { include: { product: true } }, customer: { select: { id: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { orders };
  });

  app.patch('/api/seller/orders/:id/status', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body = sellerOrderStatusSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: 'Invalid order status.' });
    const order = await prisma.order.findFirst({
      where: { id: params.data.id, ...(seller.role === 'ADMIN' ? {} : { sellerId: seller.id }) },
      include: { items: true },
    });
    if (!order) return reply.code(404).send({ error: 'Order not found.' });
    const transitions: Record<string, string[]> = {
      PENDING: ['PROCESSING', 'CANCELLED'],
      PROCESSING: ['SHIPPED', 'CANCELLED'],
      SHIPPED: ['DELIVERED'],
    };
    if (!transitions[order.status]?.includes(body.data.status)) return reply.code(409).send({ error: 'Invalid order status transition.' });
    if (['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(body.data.status) && order.paymentStatus !== 'PAID') {
      return reply.code(409).send({ error: 'A confirmed payment is required before fulfillment.' });
    }
    if (body.data.status === 'CANCELLED' && order.paymentStatus === 'PAID') {
      return reply.code(409).send({ error: 'Paid orders require a refund workflow before cancellation.' });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({ where: { id: order.id }, data: { status: body.data.status }, include: { items: true } });
      if (body.data.status === 'CANCELLED') {
        for (const item of order.items) {
          if (item.productId) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
        }
      }
      return result;
    });
    return { order: updated };
  });

  app.get('/api/seller/dashboard', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const days = Number((request.query as { days?: string }).days ?? '30');
    if (![7, 30, 90].includes(days)) return reply.code(400).send({ error: 'days must be 7, 30 or 90.' });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = seller.role === 'ADMIN'
      ? { createdAt: { gte: since } }
      : { sellerId: seller.id, createdAt: { gte: since } };
    const orders = await prisma.order.findMany({ where, include: { items: { include: { product: true } } } });
    const paidOrders = orders.filter((order) => order.paymentStatus === 'PAID');
    const revenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const unitsSold = orders.reduce((sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + item.quantity, 0), 0);
    const products = await prisma.product.findMany({ where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id } });
    return {
      periodDays: days,
      revenueCents,
      orders: orders.length,
      paidOrders: paidOrders.length,
      unitsSold,
      products: products.length,
      lowStockProducts: products.filter((product) => product.stock <= 5).length,
      currency: 'EUR',
      note: 'Les paiements restent UNPAID tant qu’un prestataire de paiement et ses webhooks ne sont pas configurés.',
    };
  });

  app.post('/api/auth/password-reset/request', {
    config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const body = passwordResetRequestSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid email.' });
    const user = await prisma.user.findUnique({ where: { email: body.data.email } });
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      });
      const webhook = process.env.PASSWORD_RESET_WEBHOOK_URL;
      if (webhook) {
        const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173';
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(process.env.PASSWORD_RESET_WEBHOOK_TOKEN ? { authorization: `Bearer ${process.env.PASSWORD_RESET_WEBHOOK_TOKEN}` } : {}) },
          body: JSON.stringify({ email: user.email, resetUrl: `${origin}/reset-password?token=${token}`, expiresInMinutes: 30 }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (!response?.ok) request.log.error('Password reset delivery failed.');
      } else if (process.env.NODE_ENV !== 'production') {
        request.log.info({ resetToken: token }, 'Development-only password reset token');
      } else {
        request.log.error('PASSWORD_RESET_WEBHOOK_URL is missing; password reset email was not delivered.');
      }
    }
    return reply.send({ message: 'Si cette adresse correspond à un compte, un lien de réinitialisation sera envoyé.' });
  });

  app.post('/api/auth/password-reset/complete', async (request, reply) => {
    const body = passwordResetCompleteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid reset request.' });
    const tokenHash = hashToken(body.data.token);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
    if (!reset || reset.usedAt || reset.expiresAt.getTime() <= Date.now()) return reply.code(400).send({ error: 'Reset token is invalid or expired.' });
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: await argon2.hash(body.data.password, { type: argon2.argon2id }) } });
      await tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
      await tx.session.deleteMany({ where: { userId: reset.userId } });
    });
    return reply.send({ message: 'Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.' });
  });
}
