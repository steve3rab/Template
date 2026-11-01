import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import {
  productInputSchema,
  resourceIdParamsSchema,
  sellerOrderStatusSchema,
} from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerSellerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
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
    const productData = Object.fromEntries(
      Object.entries(body.data).filter(([, value]) => value !== undefined),
    ) as unknown as Prisma.ProductUncheckedCreateInput;
    const product = await prisma.product.create({
      data: { ...productData, sellerId: seller.id },
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
    const productData = Object.fromEntries(
      Object.entries(body.data).filter(([, value]) => value !== undefined),
    ) as Prisma.ProductUpdateInput;
    const product = await prisma.product.update({ where: { id: existing.id }, data: productData });
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

  app.get('/api/seller/orders', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const orders = await prisma.order.findMany({
      where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id },
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return { orders };
  });

  app.patch('/api/seller/orders/:id/status', async (request, reply) => {
    const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
    if (!seller) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body = sellerOrderStatusSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: 'Invalid order status.' });
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
    if (!transitions[order.status]?.includes(body.data.status))
      return reply.code(409).send({ error: 'Invalid order status transition.' });
    if (
      ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(body.data.status) &&
      order.paymentStatus !== 'PAID'
    ) {
      return reply.code(409).send({ error: 'A confirmed payment is required before fulfillment.' });
    }
    if (body.data.status === 'CANCELLED' && order.paymentStatus === 'PAID') {
      return reply
        .code(409)
        .send({ error: 'Paid orders require a refund workflow before cancellation.' });
    }
    if (
      body.data.status === 'CANCELLED' &&
      order.paymentStatus === 'UNPAID' &&
      order.paymentReference
    ) {
      return reply.code(409).send({
        error: 'An active payment session must expire before this order can be cancelled.',
      });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: order.id },
        data: { status: body.data.status },
        include: { items: true },
      });
      if (body.data.status === 'CANCELLED') {
        for (const item of order.items) {
          if (item.productId)
            await tx.product.update({
              where: { id: item.productId },
              data: { stock: { increment: item.quantity } },
            });
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
    if (![7, 30, 90].includes(days))
      return reply.code(400).send({ error: 'days must be 7, 30 or 90.' });
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where =
      seller.role === 'ADMIN'
        ? { createdAt: { gte: since } }
        : { sellerId: seller.id, createdAt: { gte: since } };
    const orders = await prisma.order.findMany({
      where,
      include: { items: { include: { product: true } } },
    });
    const paidOrders = orders.filter((order) => order.paymentStatus === 'PAID');
    const revenueCents = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
    const unitsSold = orders.reduce(
      (sum, order) => sum + order.items.reduce((subtotal, item) => subtotal + item.quantity, 0),
      0,
    );
    const products = await prisma.product.findMany({
      where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id },
    });
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
}
