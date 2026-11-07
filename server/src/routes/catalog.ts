import type { Prisma } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { productQuerySchema } from '../schemas/commerce.js';

export function registerCatalogRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.get('/api/products', async (request, reply) => {
    const query = productQuerySchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: 'Invalid product filters.' });

    const filters = query.data;
    const where: Prisma.ProductWhereInput = {
      active: true,
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search } },
              { description: { contains: filters.search } },
              { category: { contains: filters.search } },
            ],
          }
        : {}),
      ...(filters.inStock ? { stock: { gt: 0 } } : {}),
      ...(filters.minPriceCents !== undefined || filters.maxPriceCents !== undefined
        ? {
            priceCents: {
              ...(filters.minPriceCents !== undefined ? { gte: filters.minPriceCents } : {}),
              ...(filters.maxPriceCents !== undefined ? { lte: filters.maxPriceCents } : {}),
            },
          }
        : {}),
    };
    const orderBy: Prisma.ProductOrderByWithRelationInput =
      filters.sort === 'price-asc'
        ? { priceCents: 'asc' }
        : filters.sort === 'price-desc'
          ? { priceCents: 'desc' }
          : filters.sort === 'name-asc'
            ? { name: 'asc' }
            : { createdAt: 'desc' };
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total,
        totalPages: Math.ceil(total / filters.pageSize),
      },
    };
  });
}
