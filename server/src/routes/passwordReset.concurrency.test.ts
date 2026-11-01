// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPasswordResetRoutes } from './passwordReset.js';

let app: FastifyInstance;

afterEach(async () => {
  if (app) await app.close();
  vi.unstubAllEnvs();
});

describe('password reset concurrency protection', () => {
  it('allows only one concurrent request to claim and consume the same token', async () => {
    vi.stubEnv('SESSION_SECRET', 'test-session-secret-long-enough');
    vi.stubEnv('NODE_ENV', 'test');

    const user = { id: 'user-1', email: 'customer@example.test' };
    const reset = {
      id: 'reset-1',
      userId: user.id,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };
    let claims = 0;
    const claimToken = vi.fn(async () => {
      claims += 1;
      return { count: claims === 1 ? 1 : 0 };
    });
    const updateUser = vi.fn(async () => ({ id: user.id }));
    const deleteOtherTokens = vi.fn(async () => ({ count: 0 }));
    const invalidateSessions = vi.fn(async () => ({ count: 1 }));
    const transactionClient = {
      passwordResetToken: { updateMany: claimToken, deleteMany: deleteOtherTokens },
      user: { update: updateUser },
      session: { deleteMany: invalidateSessions },
    };
    const prisma = {
      user: { findUnique: vi.fn(async () => user) },
      passwordResetToken: {
        findUnique: vi.fn(async () => reset),
        updateMany: claimToken,
        deleteMany: deleteOtherTokens,
      },
      session: { deleteMany: invalidateSessions },
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
      ),
    };

    app = Fastify({ logger: false });
    registerPasswordResetRoutes(app, prisma as unknown as PrismaClient);
    await app.ready();

    const payload = {
      token: 'same-reset-token-that-is-at-least-32-chars',
      password: 'new-password-that-is-long',
    };
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', payload }),
      app.inject({ method: 'POST', url: '/api/auth/password-reset/complete', payload }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 400]);
    expect(claimToken).toHaveBeenCalledTimes(2);
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(deleteOtherTokens).toHaveBeenCalledTimes(1);
    expect(invalidateSessions).toHaveBeenCalledTimes(1);
  });
});
