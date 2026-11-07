import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { requireUser } from '../auth/requireUser.js';
import {
  createCustomerOrdersFromCart,
  CustomerOrderCreationError,
} from '../domain/customerOrders.js';
import { createOrderInputSchema } from '../schemas/commerce.js';

export function registerCustomerOrderRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  app.post(
    '/api/customer/orders',
    { config: { rateLimit: { max: 5, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const user = await requireUser(request, reply, prisma, resolveUser);
      if (!user) return;

      const body = createOrderInputSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'A saved shipping address is required.' });
      }

      const address = await prisma.address.findFirst({
        where: { id: body.data.addressId, userId: user.id },
      });
      if (!address) return reply.code(404).send({ error: 'Address not found.' });

      try {
        const orders = await createCustomerOrdersFromCart(prisma, user.id, address);
        return reply.code(201).send({ order: orders[0], orders });
      } catch (error) {
        if (error instanceof CustomerOrderCreationError) {
          if (error.code === 'EMPTY_CART') {
            return reply.code(400).send({ error: 'Cart is empty.' });
          }
          if (error.code === 'CART_CHANGED') {
            return reply.code(409).send({
              error: 'Cart changed while checkout was being prepared. Refresh and retry.',
            });
          }
          return reply.code(409).send({ error: 'Insufficient stock for one or more products.' });
        }
        throw error;
      }
    },
  );

  app.get('/api/customer/orders', async (request, reply) => {
    const user = await requireUser(request, reply, prisma, resolveUser);
    if (!user) return;
    return {
      orders: await prisma.order.findMany({
        where: { userId: user.id },
        include: {
          items: true,
          financialTransactions: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    };
  });
}
