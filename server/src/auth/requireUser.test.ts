import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { requireUser } from './requireUser.js';

function createReply() {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
  };
  reply.code.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const request = {} as FastifyRequest;
const prisma = {} as PrismaClient;
const user = { id: 'user-1', role: 'CUSTOMER' } as User;

describe('requireUser', () => {
  it('returns the resolved user when authentication is valid', async () => {
    const reply = createReply();
    const resolveUser = vi.fn().mockResolvedValue(user);

    await expect(
      requireUser(
        request,
        reply as unknown as FastifyReply,
        prisma,
        resolveUser,
      ),
    ).resolves.toBe(user);

    expect(resolveUser).toHaveBeenCalledWith(request, prisma);
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('sends 401 and returns null when no session exists', async () => {
    const reply = createReply();
    const resolveUser = vi.fn().mockResolvedValue(null);

    await expect(
      requireUser(
        request,
        reply as unknown as FastifyReply,
        prisma,
        resolveUser,
      ),
    ).resolves.toBeNull();

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({ error: 'Not authenticated.' });
  });

  it('sends 403 when the authenticated user has no allowed role', async () => {
    const reply = createReply();
    const resolveUser = vi.fn().mockResolvedValue(user);

    await expect(
      requireUser(
        request,
        reply as unknown as FastifyReply,
        prisma,
        resolveUser,
        ['SELLER', 'ADMIN'],
      ),
    ).resolves.toBeNull();

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Insufficient permissions.',
    });
  });

  it('accepts any one of the explicitly allowed roles', async () => {
    const reply = createReply();
    const seller = { ...user, role: 'SELLER' } as User;

    await expect(
      requireUser(
        request,
        reply as unknown as FastifyReply,
        prisma,
        vi.fn().mockResolvedValue(seller),
        ['SELLER', 'ADMIN'],
      ),
    ).resolves.toBe(seller);

    expect(reply.code).not.toHaveBeenCalled();
  });
});
