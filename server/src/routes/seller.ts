import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import {
  productInputSchema,
  resourceIdParamsSchema,
  sellerOrderStatusSchema,
} from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';
import { canTransitionOrderStatus } from '../domain/orderTransitions.js';

export function registerSellerRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  app.get(
    '/api/seller/products',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
      if (!seller) return;
      const products = await prisma.product.findMany({
        where: seller.role === 'ADMIN' ? {} : { sellerId: seller.id },
        orderBy: { updatedAt: 'desc' },
      });
      return { products };
    },
  );

  app.post(
    '/api/seller/products',
    {
      bodyLimit: 10 * 1024 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
      if (!seller) return;
      const body = productInputSchema.safeParse(request.body);
      if (!body.success) return reply.code(400).send({ error: 'Invalid product data.' });
      const productData = Object.fromEntries(
        Object.entries(body.data).filter(([, value]) => value !== undefined),
      ) as unknown as Prisma.ProductUncheckedCreateInput;
      if (typeof productData.imageUrls === 'string') {
        const images = JSON.parse(productData.imageUrls) as string[];
        if (images.length > 0 && !productData.imageUrl) productData.imageUrl = images[0] ?? null;
      }
      const product = await prisma.product.create({
        data: { ...productData, sellerId: seller.id },
      });
      return reply.code(201).send({ product });
    },
  );

  app.patch(
    '/api/seller/products/:id',
    {
      bodyLimit: 10 * 1024 * 1024,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const seller = await requireUser(request, reply, prisma, resolveUser, ['SELLER', 'ADMIN']);
      if (!seller) return;
      const params = resourceIdParamsSchema.safeParse(request.params);
      const hasUpdateFields =
        typeof request.body === 'object' &&
        request.body !== null &&
        !Array.isArray(request.body) &&
        Object.keys(request.body).length > 0;
      const body = productInputSchema.partial().safeParse(request.body);
      if (
        !params.success ||
        !body.success ||
        !hasUpdateFields ||
        Object.keys(body.data).length === 0
      ) {
        return reply.code(400).send({ error: 'Invalid product update.' });
      }
      const existing = await prisma.product.findFirst({
        where: { id: params.data.id, ...(seller.role === 'ADMIN' ? {} : { sellerId: seller.id }) },
      });
      if (!existing) return reply.code(404).send({ error: 'Product not found.' });
      const productData = Object.fromEntries(
        Object.entries(body.data).filter(([, value]) => value !== undefined),
      ) as Prisma.ProductUpdateInput;
      if (typeof productData.imageUrls === 'string' && productData.imageUrl === undefined) {
        const images = JSON.parse(productData.imageUrls) as string[];
        productData.imageUrl = images[0] ?? null;
      }
      const product = await prisma.product.update({
        where: { id: existing.id },
        data: productData,
      });
      return { product };
    },
  );

  app.delete(
    '/api/seller/products/:id',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
    },
  );

  app.get(
    '/api/seller/orders',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
    },
  );

  app.patch(
    '/api/seller/orders/:id/status',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
      if (!canTransitionOrderStatus(order.status, body.data.status))
        return reply.code(409).send({ error: 'Invalid order status transition.' });
      if (
        ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(body.data.status) &&
        order.paymentStatus !== 'PAID'
      ) {
        return reply
          .code(409)
          .send({ error: 'A confirmed payment is required before fulfillment.' });
      }
      if (
        body.data.status === 'CANCELLED' &&
        ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus)
      ) {
        return reply
          .code(409)
          .send({ error: 'Paid orders must be fully refunded before cancellation.' });
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
        // Compare-and-set prevents two concurrent requests from applying transitions
        // based on the same stale order snapshot. Include payment fields so a webhook
        // racing with a seller action cannot be overwritten by that stale action.
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: order.status,
            paymentStatus: order.paymentStatus,
            paymentReference: order.paymentReference,
          },
          data: { status: body.data.status },
        });
        if (changed.count !== 1) return null;

        if (body.data.status === 'CANCELLED') {
          for (const item of order.items) {
            if (item.productId) {
              await tx.product.update({
                where: { id: item.productId },
                data: { stock: { increment: item.quantity } },
              });
            }
          }
        }
        return { ...order, status: body.data.status };
      });
      if (!updated) {
        return reply.code(409).send({
          error: 'Order changed while this update was being processed. Refresh and retry.',
        });
      }
      return { order: updated };
    },
  );

  app.get(
    '/api/seller/dashboard',
    {
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
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
      const itemOrderFilter =
        seller.role === 'ADMIN'
          ? { createdAt: { gte: since } }
          : { sellerId: seller.id, createdAt: { gte: since } };
      const productFilter = seller.role === 'ADMIN' ? {} : { sellerId: seller.id };
      const [orderMetrics, paidOrderMetrics, itemMetrics, products, lowStockProducts] =
        await Promise.all([
          prisma.order.aggregate({ where, _count: { _all: true } }),
          prisma.order.aggregate({
            where: { ...where, paymentStatus: 'PAID' },
            _count: { _all: true },
            _sum: { totalCents: true },
          }),
          prisma.orderItem.aggregate({
            where: { order: { is: itemOrderFilter } },
            _sum: { quantity: true },
          }),
          prisma.product.count({ where: productFilter }),
          prisma.product.count({ where: { ...productFilter, stock: { lte: 5 } } }),
        ]);
      return {
        periodDays: days,
        revenueCents: paidOrderMetrics._sum.totalCents ?? 0,
        orders: orderMetrics._count._all,
        paidOrders: paidOrderMetrics._count._all,
        unitsSold: itemMetrics._sum.quantity ?? 0,
        products,
        lowStockProducts,
        currency: 'EUR',
        note: 'Les paiements restent UNPAID tant qu’un prestataire de paiement et ses webhooks ne sont pas configurés.',
      };
    },
  );
}
