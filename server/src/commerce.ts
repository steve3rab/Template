import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from './auth/requireUser.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerCustomerRoutes } from './routes/customer.js';
import { registerPasswordResetRoutes } from './routes/passwordReset.js';
import { registerSellerRoutes } from './routes/seller.js';

/**
 * Composition root for commerce endpoints. Keep route implementations in their
 * feature modules so each area can evolve and be tested independently.
 */
export function registerCommerceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
  registerCatalogRoutes(app, prisma);
  registerAdminRoutes(app, prisma, resolveUser);
  registerSellerRoutes(app, prisma, resolveUser);
  registerCustomerRoutes(app, prisma, resolveUser);
  registerPasswordResetRoutes(app, prisma);
}
