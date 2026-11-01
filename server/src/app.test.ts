// @vitest-environment node
import type { OutgoingHttpHeaders } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { createApp } from './app.js';

// Inject deterministic password operations into API tests instead of mocking a native module.
const argon2TestDouble = {
  argon2id: 2,
  hash: async (password: string) => `test-hash:${password}`,
  verify: async (hash: string, password: string) => hash === `test-hash:${password}`,
};

type FakeUser = {
  id: string;
  email: string;
  passwordHash: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};
type FakeSession = {
  id: string;
  tokenHash: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
};

function makePrisma() {
  const users = new Map<string, FakeUser>();
  const sessions = new Map<string, FakeSession>();
  let nextId = 0;

  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { email: string } }) =>
          [...users.values()].find((user) => user.email === where.email) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: { email: string; passwordHash: string } }) => {
        if ([...users.values()].some((user) => user.email === data.email)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        const now = new Date();
        const user: FakeUser = {
          id: `user-${++nextId}`,
          email: data.email,
          passwordHash: data.passwordHash,
          role: 'CUSTOMER',
          createdAt: now,
          updatedAt: now,
        };
        users.set(user.id, user);
        return user;
      }),
    },
    session: {
      create: vi.fn(async ({ data }: { data: Omit<FakeSession, 'id' | 'createdAt'> }) => {
        const session: FakeSession = {
          ...data,
          id: `session-${++nextId}`,
          createdAt: new Date(),
        };
        sessions.set(session.tokenHash, session);
        return session;
      }),
      findUnique: vi.fn(
        async ({
          where,
          include,
        }: {
          where: { tokenHash: string };
          include?: { user?: boolean };
        }) => {
          const session = sessions.get(where.tokenHash);
          if (!session) return null;
          if (include?.user) {
            const user = users.get(session.userId);
            return user ? { ...session, user } : null;
          }
          return session;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        for (const [key, session] of sessions.entries()) {
          if (session.id === where.id) sessions.delete(key);
        }
        return { id: where.id };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { tokenHash?: string; id?: string } }) => {
        let count = 0;
        for (const [key, session] of sessions.entries()) {
          if (
            (where.tokenHash && key === where.tokenHash) ||
            (where.id && session.id === where.id)
          ) {
            sessions.delete(key);
            count += 1;
          }
        }
        return { count };
      }),
    },
    $disconnect: vi.fn(async () => undefined),
  };

  return { prisma: prisma as unknown as PrismaClient, users, sessions };
}

const allowedOrigin = 'http://localhost:5173';
const validHeaders = { origin: allowedOrigin, 'content-type': 'application/json' };
let app: FastifyInstance;
let store: ReturnType<typeof makePrisma>;

async function startApp() {
  store = makePrisma();
  app = await createApp(store.prisma, argon2TestDouble as never);
  await app.ready();
}

async function register(email = 'test@example.com', password = 'correct-horse-battery') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: validHeaders,
    payload: { email, password },
  });
}

function sessionCookie(response: { headers: OutgoingHttpHeaders }) {
  const value = response.headers['set-cookie'];
  const cookie = Array.isArray(value) ? value[0] : value;
  const match = typeof cookie === 'string' ? cookie.match(/template_session=([^;]+)/) : null;
  if (!match?.[1]) throw new Error('Expected a session cookie');
  return `template_session=${match[1]}`;
}

beforeEach(async () => {
  process.env.APP_ORIGIN = allowedOrigin;
  process.env.NODE_ENV = 'test';
  await startApp();
});

afterEach(async () => {
  await app.close();
});

describe('authentication API', () => {
  it('exposes a health endpoint without leaking cacheable responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('rejects malformed registration input without creating a user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: validHeaders,
      payload: { email: 'not-an-email', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(store.users.size).toBe(0);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('registers, establishes a server-side session, returns a safe user and logs out', async () => {
    const response = await register();
    expect(response.statusCode).toBe(201);
    expect(response.json().user).toMatchObject({ email: 'test@example.com' });
    expect(response.json().user.passwordHash).toBeUndefined();
    expect(response.json().user.id).toBeTruthy();
    expect(String(response.headers['set-cookie'])).toContain('Path=/;');
    expect(store.users.size).toBe(1);
    expect(store.sessions.size).toBe(1);
    expect([...store.users.values()][0]?.passwordHash).not.toBe('correct-horse-battery');

    const cookie = sessionCookie(response);
    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().user.email).toBe('test@example.com');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: allowedOrigin, cookie },
    });
    expect(logout.statusCode).toBe(204);
    expect(store.sessions.size).toBe(0);

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('denies seller API access to unauthenticated users and customers', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/seller/me' });
    expect(anonymous.statusCode).toBe(401);

    const response = await register();
    const cookie = sessionCookie(response);
    const customer = await app.inject({
      method: 'GET',
      url: '/api/seller/me',
      headers: { cookie },
    });
    expect(customer.statusCode).toBe(403);
    expect(customer.json().error).toBe('Seller access required.');
  });

  it('allows the seller role to access the seller API', async () => {
    const response = await register();
    const cookie = sessionCookie(response);
    const user = [...store.users.values()][0];
    if (!user) throw new Error('Expected a registered user');
    user.role = 'SELLER';

    const seller = await app.inject({
      method: 'GET',
      url: '/api/seller/me',
      headers: { cookie },
    });
    expect(seller.statusCode).toBe(200);
    expect(seller.json().seller).toMatchObject({
      email: 'test@example.com',
      role: 'SELLER',
    });
  });

  it('protects seller product management and customer cart endpoints', async () => {
    const anonymousCart = await app.inject({ method: 'GET', url: '/api/customer/cart' });
    expect(anonymousCart.statusCode).toBe(401);

    const registered = await register();
    const cookie = sessionCookie(registered);
    const deniedProducts = await app.inject({
      method: 'GET',
      url: '/api/seller/products',
      headers: { cookie },
    });
    expect(deniedProducts.statusCode).toBe(403);

    const deniedOrders = await app.inject({
      method: 'GET',
      url: '/api/seller/orders',
      headers: { cookie },
    });
    expect(deniedOrders.statusCode).toBe(403);
  });

  it('expires old sessions and removes them from storage', async () => {
    const response = await register();
    const cookie = sessionCookie(response);
    const session = [...store.sessions.values()][0];
    expect(session).toBeDefined();
    if (!session) throw new Error('Expected a stored session');
    session.expiresAt = new Date(Date.now() - 1);

    const current = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(current.statusCode).toBe(401);
    expect(store.sessions.size).toBe(0);
  });

  it('normalizes email addresses and avoids disclosing duplicate registrations', async () => {
    const first = await register(' Test@Example.com ');
    expect(first.statusCode).toBe(201);

    const duplicate = await register('test@example.com');
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json().error).toBe('Unable to create account with these details.');
    expect(store.users.size).toBe(1);
  });

  it('authenticates valid credentials and rejects invalid credentials consistently', async () => {
    await register();
    const valid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: { email: 'TEST@example.com', password: 'correct-horse-battery' },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.headers['set-cookie']).toBeTruthy();

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: { email: 'test@example.com', password: 'wrong-password-123' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error).toBe('Invalid email or password.');
  });

  it('accepts a legacy account password shorter than the registration minimum', async () => {
    const registered = await register();
    expect(registered.statusCode).toBe(201);

    const user = [...store.users.values()][0];
    if (!user) throw new Error('Expected a registered user');
    user.passwordHash = 'test-hash:legacy123';

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: { email: 'test@example.com', password: 'legacy123' },
    });

    expect(login.statusCode).toBe(200);
    expect(login.headers['set-cookie']).toBeTruthy();
    expect(login.json().user.email).toBe('test@example.com');
  });

  it('rejects state-changing requests without the configured origin', async () => {
    const missingOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
    });
    expect(missingOrigin.statusCode).toBe(403);

    const foreignOrigin = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'https://attacker.example' },
    });
    expect(foreignOrigin.statusCode).toBe(403);
  });

  it('rate limits repeated registration attempts', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/auth/register',
          headers: validHeaders,
          payload: { email: 'invalid', password: 'too-short' },
        }),
      ),
    );
    expect(responses[5]?.statusCode).toBe(429);
  });

  it('does not reveal internal exception details to API clients', async () => {
    store.prisma.user.findUnique = vi.fn(async () => {
      throw new Error('database-secret-detail');
    }) as never;
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: { email: 'test@example.com', password: 'correct-horse-battery' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('database-secret-detail');
  });
});
