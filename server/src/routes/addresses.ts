import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { ResolveUser } from '../auth/requireUser.js';
import { addressInputSchema, resourceIdParamsSchema } from '../schemas/commerce.js';
import { requireUser } from '../auth/requireUser.js';

export function registerAddressRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
): void {
app.get('/api/customer/addresses', async (request, reply) => {
  const user = await requireUser(request, reply, prisma, resolveUser);
  if (!user) return;
  return { addresses: await prisma.address.findMany({ where: { userId: user.id }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }) };
});

app.post('/api/customer/addresses', async (request, reply) => {
  const user = await requireUser(request, reply, prisma, resolveUser);
  if (!user) return;
  const body = addressInputSchema.safeParse(request.body);
  if (!body.success) return reply.code(400).send({ error: 'Invalid address data.' });
  const address = await prisma.$transaction(async (tx) => {
    if (body.data.isDefault) await tx.address.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    return tx.address.create({
      data: {
        userId: user.id,
        label: body.data.label,
        recipient: body.data.recipient,
        line1: body.data.line1,
        ...(body.data.line2 !== undefined ? { line2: body.data.line2 } : {}),
        postalCode: body.data.postalCode,
        city: body.data.city,
        country: body.data.country,
        isDefault: body.data.isDefault,
      },
    });
  });
  return reply.code(201).send({ address });
});

app.delete('/api/customer/addresses/:id', async (request, reply) => {
  const user = await requireUser(request, reply, prisma, resolveUser);
  if (!user) return;
  const params = resourceIdParamsSchema.safeParse(request.params);
  if (!params.success) return reply.code(400).send({ error: 'Invalid address id.' });
  const result = await prisma.address.deleteMany({ where: { id: params.data.id, userId: user.id } });
  if (!result.count) return reply.code(404).send({ error: 'Address not found.' });
  return reply.code(204).send();
});
}
