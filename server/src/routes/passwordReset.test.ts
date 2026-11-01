// @vitest-environment node

import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPasswordResetRoutes } from './passwordReset.js';

let app: FastifyInstance;

const user = { id: 'user-1', email: 'user@example.test' };

function setup(
  options: {
    foundUser?: typeof user | null;
    reset?: {
      id: string;
      userId: string;
      usedAt: Date | null;
      expiresAt: Date;
      user: typeof user;
    } | null;
    claimedCount?: number;
  } = {},
) {
  const userFindUnique = vi.fn(async () =>
    options.foundUser === undefined ? user : options.foundUser,
  );
  const resetCreate = vi.fn(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'reset-1',
      ...data,
    }),
  );
  const resetFindUnique = vi.fn(async () =>
    options.reset === undefined
      ? {
          id: 'reset-1',
          userId: user.id,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
          user,
        }
      : options.reset,
  );
  const resetUpdateMany = vi.fn(async () => ({ count: options.claimedCount ?? 1 }));
  const resetDeleteMany = vi.fn(async () => ({ count: 1 }));
  const userUpdate = vi.fn(async () => ({ id: user.id }));
  const sessionDeleteMany = vi.fn(async () => ({ count: 1 }));
  const tx = {
    passwordResetToken: {
      updateMany: resetUpdateMany,
      deleteMany: resetDeleteMany,
    },
    user: { update: userUpdate },
    session: { deleteMany: sessionDeleteMany },
  };
  const prisma = {
    user: { findUnique: userFindUnique, update: userUpdate },
    passwordResetToken: {
      create: resetCreate,
      findUnique: resetFindUnique,
      updateMany: resetUpdateMany,
      deleteMany: resetDeleteMany,
    },
    session: { deleteMany: sessionDeleteMany },
    $transaction: vi.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  app = Fastify({ logger: false });
  registerPasswordResetRoutes(app, prisma as unknown as PrismaClient);
  return {
    prisma,
    userFindUnique,
    resetCreate,
    resetFindUnique,
    resetUpdateMany,
    resetDeleteMany,
    userUpdate,
    sessionDeleteMany,
  };
}

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'test-session-secret-long-enough');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('APP_ORIGIN', 'http://localhost:5173');
  vi.stubEnv('PASSWORD_RESET_WEBHOOK_URL', '');
  vi.stubEnv('PASSWORD_RESET_WEBHOOK_TOKEN', '');
});

afterEach(async () => {
  if (app) await app.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('password reset routes', () => {
  it('rejects malformed reset requests without querying users', async () => {
    const { userFindUnique } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'invalid' },
    });

    expect(response.statusCode).toBe(400);
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it('does not reveal whether an email address has an account', async () => {
    const { resetCreate } = setup({ foundUser: null });
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'unknown@example.test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().message).toContain('Si cette adresse');
    expect(resetCreate).not.toHaveBeenCalled();
  });

  it(
    'creates a hashed reset token and sends a reset link through the configured webhook',
    async () => {
      vi.stubEnv('PASSWORD_RESET_WEBHOOK_URL', 'https://mailer.example.test/reset');
      vi.stubEnv('PASSWORD_RESET_WEBHOOK_TOKEN', 'test-webhook-token');
      const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
        void url;
        void init;
        return new Response('', { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      const { resetCreate } = setup();
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: { email: user.email },
      });

      expect(response.statusCode).toBe(200);
      expect(resetCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: user.id,
          tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          expiresAt: expect.any(Date),
        }),
      });
      const delivery = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body ?? '{}'));
      expect(delivery.email).toBe(user.email);
      expect(delivery.resetUrl).toMatch(
        /^http:\/\/localhost:5173\/reset-password\?token=/,
      );
      expect(fetchMock).toHaveBeenCalledWith(
        'https://mailer.example.test/reset',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            authorization: 'Bearer test-webhook-token',
          }),
        }),
      );
    },
  );

  it('handles a failed reset delivery without disclosing account details', async () => {
      vi.stubEnv('PASSWORD_RESET_WEBHOOK_URL', 'https://mailer.example.test/reset');
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('network down');
        }),
      );
      setup();
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        payload: { email: user.email },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().message).toContain('Si cette adresse');
    },
  );

  it('rejects malformed completion requests', async () => {
    const { resetFindUnique } = setup();
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/complete',
      payload: { token: '', password: 'short' },
    });

    expect(response.statusCode).toBe(400);
    expect(resetFindUnique).not.toHaveBeenCalled();
  });

  it('rejects unknown, used, and expired reset tokens', async () => {
    const cases = [
      { reset: null },
      {
        reset: {
          id: 'reset-used',
          userId: user.id,
          usedAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          user,
        },
      },
      {
        reset: {
          id: 'reset-expired',
          userId: user.id,
          usedAt: null,
          expiresAt: new Date(Date.now() - 1000),
          user,
        },
      },
    ] as const;

    for (const scenario of cases) {
      const { prisma } = setup({ reset: scenario.reset });
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/complete',
        payload: { token: 'token-value', password: 'a-very-long-new-password' },
      });

      expect(response.statusCode).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      await app.close();
    }
  });

  it('rejects a token that another concurrent request already claimed', async () => {
      const { prisma, userUpdate, sessionDeleteMany } = setup({ claimedCount: 0 });
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/complete',
        payload: { token: 'token-value', password: 'a-very-long-new-password' },
      });

      expect(response.statusCode).toBe(400);
      expect(prisma.$transaction).toHaveBeenCalledOnce();
      expect(userUpdate).not.toHaveBeenCalled();
      expect(sessionDeleteMany).not.toHaveBeenCalled();
    },
  );

  it(
    'changes the password, deletes sibling reset tokens, and invalidates all sessions',
    async () => {
      const { resetUpdateMany, resetDeleteMany, userUpdate, sessionDeleteMany } = setup();
      await app.ready();

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/complete',
        payload: { token: 'token-value', password: 'a-very-long-new-password' },
      });

      expect(response.statusCode).toBe(200);
      expect(resetUpdateMany).toHaveBeenCalledWith({
        where: {
          id: 'reset-1',
          usedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: { usedAt: expect.any(Date) },
      });
      expect(userUpdate).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { passwordHash: expect.stringMatching(/^\$argon2id\$/) },
      });
      expect(resetDeleteMany).toHaveBeenCalledWith({
        where: { userId: user.id, id: { not: 'reset-1' } },
      });
      expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: user.id } });
    },
  );
});
