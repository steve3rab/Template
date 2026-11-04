import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { resourceIdParamsSchema, roleInputSchema } from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerAdminRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  app.get('/api/admin/me', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    return {
      admin: {
        id: admin.id,
        publicId: admin.publicId,
        email: admin.email,
        role: admin.role,
      },
    };
  });

  app.get('/api/admin/dashboard', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const [users, sellers, products, activeProducts, orders, paidOrderMetrics] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'SELLER' } }),
      prisma.product.count(),
      prisma.product.count({ where: { active: true } }),
      prisma.order.count(),
      prisma.order.aggregate({
        where: { paymentStatus: 'PAID' },
        _count: { _all: true },
        _sum: { totalCents: true },
      }),
    ]);
    return {
      users,
      sellers,
      products,
      activeProducts,
      orders,
      paidOrders: paidOrderMetrics._count._all,
      revenueCents: paidOrderMetrics._sum.totalCents ?? 0,
    };
  });

  app.get('/api/admin/users', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const users = await prisma.user.findMany({
      select: { id: true, publicId: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { users };
  });

  app.get('/api/admin/products', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const products = await prisma.product.findMany({
      include: { seller: { select: { id: true, publicId: true, email: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return { products };
  });

  app.patch('/api/admin/products/:id/visibility', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body =
      typeof request.body === 'object' &&
      request.body !== null &&
      'active' in request.body &&
      typeof (request.body as { active?: unknown }).active === 'boolean'
        ? (request.body as { active: boolean })
        : null;
    if (!params.success || !body) {
      return reply.code(400).send({ error: 'Invalid visibility update.' });
    }
    const product = await prisma.product.update({
      where: { id: params.data.id },
      data: { active: body.active },
    });
    return { product };
  });

  app.get('/api/admin/orders', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const orders = await prisma.order.findMany({
      include: {
        customer: { select: { id: true, publicId: true, email: true } },
        seller: { select: { id: true, publicId: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { orders };
  });

  app.post('/api/admin/users/:id/role', async (request, reply) => {
    const admin = await requireUser(request, reply, prisma, resolveUser, ['ADMIN']);
    if (!admin) return;
    const params = resourceIdParamsSchema.safeParse(request.params);
    const body = roleInputSchema.safeParse(request.body);
    if (!params.success || !body.success)
      return reply.code(400).send({ error: 'Invalid role update.' });
    if (params.data.id === admin.id)
      return reply.code(400).send({ error: 'Cannot change your own role.' });
    const target = await prisma.user.findUnique({
      where: { id: params.data.id },
      select: { id: true },
    });
    if (!target) return reply.code(404).send({ error: 'User not found.' });
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { role: body.data.role },
      select: { id: true, email: true, role: true },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    return { user };
  });
}
