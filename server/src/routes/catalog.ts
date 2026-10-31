import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { productQuerySchema } from '../schemas/commerce.js';

export async function registerCatalogRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): Promise<void> {
    app.get('/api/products', async (request) => {
      const query = productQuerySchema.safeParse(request.query);
      if (!query.success) return { products: [] };
      const products = await prisma.product.findMany({
        where: { active: true, ...(query.data.category ? { category: query.data.category } : {}) },
        orderBy: { createdAt: 'desc' },
      });
      return { products };
    });
}
