import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { productIdParamsSchema } from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerFavoriteRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  app.get('/api/customer/favorites', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const favorites = await prisma.favorite.findMany({
      where: { userId: user.id },
      include: { product: true },
    });
    return { favorites };
  });

  app.post('/api/customer/favorites/:productId', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    const params = productIdParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: 'Invalid product id.' });
    const product = await prisma.product.findFirst({
      where: { id: params.data.productId, active: true },
    });
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
    await prisma.favorite.deleteMany({
      where: { userId: user.id, productId: params.data.productId },
    });
    return reply.code(204).send();
  });
}
