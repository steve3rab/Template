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
