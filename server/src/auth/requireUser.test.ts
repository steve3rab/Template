import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { requireUser } from './requireUser.js';

const request = {} as FastifyRequest;
const prisma = {} as PrismaClient;
const customer = { id: 'user-1', role: 'CUSTOMER' } as User;

function createReply() {
  const reply = { code: vi.fn(), send: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

async function runGuard(user: User | null, roles?: readonly string[]) {
  const reply = createReply();
  const resolveUser = vi.fn().mockResolvedValue(user);
  const result = await requireUser(
    request,
    reply as unknown as FastifyReply,
    prisma,
    resolveUser,
    roles,
  );
  return { reply, resolveUser, result };
}

describe('requireUser', () => {
  it('returns the authenticated user', async () => {
    const { reply, resolveUser, result } = await runGuard(customer);

    expect(result).toBe(customer);
    expect(resolveUser).toHaveBeenCalledWith(request, prisma);
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('responds with 401 when no session exists', async () => {
    const { reply, result } = await runGuard(null);

    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Not authenticated.',
    });
  });

  it('responds with 403 when the user role is not allowed', async () => {
    const { reply, result } = await runGuard(customer, ['SELLER', 'ADMIN']);

    expect(result).toBeNull();
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Insufficient permissions.',
    });
  });

  it('accepts any explicitly allowed role', async () => {
    const seller = { ...customer, role: 'SELLER' } as User;
    const { reply, result } = await runGuard(seller, ['SELLER', 'ADMIN']);

    expect(result).toBe(seller);
    expect(reply.code).not.toHaveBeenCalled();
  });
});
