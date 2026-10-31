import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';

export type ResolveUser = (request: FastifyRequest, prisma: PrismaClient) => Promise<User | null>;

export async function requireUser(
  request: FastifyRequest,
  reply: FastifyReply,
  prisma: PrismaClient,
  resolveUser: ResolveUser,
  allowedRoles?: readonly string[],
): Promise<User | null> {
  const user = await resolveUser(request, prisma);
  if (!user) {
    await reply.code(401).send({ error: 'Not authenticated.' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    await reply.code(403).send({ error: 'Insufficient permissions.' });
    return null;
  }
  return user;
}
