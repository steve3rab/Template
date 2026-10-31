import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { cartInputSchema } from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerCartRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
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
}
