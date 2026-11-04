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
  publicId: string;
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
type FakeRegistrationVerification = {
  id: string;
  email: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
};

function makePrisma() {
  const users = new Map<string, FakeUser>();
  const sessions = new Map<string, FakeSession>();
  const registrations = new Map<string, FakeRegistrationVerification>();
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
          publicId: `USR-${String(nextId).padStart(12, '0')}`,
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
    registrationVerification: {
      deleteMany: vi.fn(async ({ where }: { where: { email: string } }) => ({
        count: registrations.delete(where.email) ? 1 : 0,
      })),
      create: vi.fn(
        async ({ data }: { data: Omit<FakeRegistrationVerification, 'id' | 'createdAt'> }) => {
          const pending: FakeRegistrationVerification = {
            ...data,
            id: `registration-${++nextId}`,
            createdAt: new Date(),
          };
          registrations.set(data.email, pending);
          return pending;
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        registrations.get(where.email) ?? null,
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { email: string };
          data: { attempts: number };
        }) => {
          const pending = registrations.get(where.email);
          if (!pending) throw new Error('Pending registration not found');
          const updated = { ...pending, ...data };
          registrations.set(where.email, updated);
          return updated;
        },
      ),
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

  return { prisma: prisma as unknown as PrismaClient, users, sessions, registrations };
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

async function register(email = 'test@example.com', password = 'Correct-horse-battery1!') {
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
  process.env.E2E_TEST = 'false';
  await startApp();
});

afterEach(async () => {
  await app.close();
  vi.unstubAllEnvs();
});

describe('application security configuration', () => {
  it.each(['', 'short'])('rejects a missing or weak production session secret: %s', async (secret) => {
    process.env.NODE_ENV = 'production';
    if (secret) process.env.SESSION_SECRET = secret;
    else delete process.env.SESSION_SECRET;

    await expect(createApp(store.prisma, argon2TestDouble as never)).rejects.toThrow(
      /SESSION_SECRET must be configured with at least 32 characters/,
    );
    process.env.NODE_ENV = 'test';
  });
});

describe('authentication API', () => {
  it('never returns a development verification code in staging-like environments', async () => {
    process.env.NODE_ENV = 'staging';
    const response = await register('staging@example.com');
    expect(response.statusCode).toBe(503);
    expect(response.json().developmentCode).toBeUndefined();
    expect(store.registrations.has('staging@example.com')).toBe(false);
    process.env.NODE_ENV = 'test';
  });

  it('rejects an incorrect verification code and counts failed attempts', async () => {
    const registration = await register('wrong-code@example.com');
    expect(registration.statusCode).toBe(202);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: validHeaders,
      payload: { email: 'wrong-code@example.com', code: '0000000000' },
    });

    expect(response.statusCode).toBe(400);
    expect(store.users.size).toBe(0);
    expect(store.registrations.get('wrong-code@example.com')?.attempts).toBe(1);
  });

  it('expires and removes pending registrations after ten minutes', async () => {
    const registration = await register('expired-code@example.com');
    expect(registration.statusCode).toBe(202);
    const pending = store.registrations.get('expired-code@example.com');
    if (pending) pending.expiresAt = new Date(Date.now() - 1);

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: validHeaders,
      payload: { email: 'expired-code@example.com', code: registration.json().developmentCode },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/expired/i);
    expect(store.users.size).toBe(0);
    expect(store.registrations.has('expired-code@example.com')).toBe(false);
  });

  it('marks session cookies Secure on HTTPS staging origins and clears them consistently', async () => {
    await app.close();
    const httpsOrigin = 'https://shop.example.test';
    process.env.APP_ORIGIN = httpsOrigin;
    process.env.NODE_ENV = 'staging';
    await startApp();

    const now = new Date();
    store.users.set('secure-user', {
      id: 'secure-user',
      publicId: 'USR-SECURE0001',
      email: 'secure@example.com',
      passwordHash: 'test-hash:Correct-horse-battery1!',
      role: 'CUSTOMER',
      createdAt: now,
      updatedAt: now,
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...validHeaders, origin: httpsOrigin },
      payload: { email: 'secure@example.com', password: 'Correct-horse-battery1!' },
    });
    expect(login.statusCode).toBe(200);
    const loginCookie = String(login.headers['set-cookie']);
    expect(loginCookie).toContain('Secure;');
    expect(loginCookie).toContain('HttpOnly;');
    expect(loginCookie).toContain('SameSite=Lax');
    expect(loginCookie).toContain('Path=/;');

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: httpsOrigin, cookie: sessionCookie(login) },
    });
    expect(logout.statusCode).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('Secure;');
    expect(String(logout.headers['set-cookie'])).toContain('HttpOnly;');
    expect(String(logout.headers['set-cookie'])).toContain('SameSite=Lax');
    expect(String(logout.headers['set-cookie'])).toContain('Max-Age=0');
  });

  it('exposes a health endpoint without leaking cacheable responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("img-src 'self' data: https:");
  });

  it('rejects malformed JSON with a sanitized client error', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'Invalid request.' });
    expect(response.body).not.toContain('Unexpected end of JSON');
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

  it('creates no account until the email verification code is confirmed', async () => {
    const response = await register();
    expect(response.statusCode).toBe(202);
    expect(response.json().verificationRequired).toBe(true);
    expect(response.json().developmentCode).toMatch(/^\d{10}$/);
    expect(store.users.size).toBe(0);
    expect(store.sessions.size).toBe(0);
    expect(store.registrations.size).toBe(1);

    const code = response.json().developmentCode as string;
    const verified = await app.inject({
      method: 'POST',
      url: '/api/auth/register/verify',
      headers: validHeaders,
      payload: { email: 'test@example.com', code },
    });
    expect(verified.statusCode).toBe(201);
    expect(verified.json().user).toMatchObject({ email: 'test@example.com' });
    expect(verified.json().user.passwordHash).toBeUndefined();
    expect(verified.json().user.publicId).toMatch(/^USR-[A-F0-9]{12}$/);
    expect(String(verified.headers['set-cookie'])).toContain('Path=/;');
    expect(store.users.size).toBe(1);
    expect(store.sessions.size).toBe(1);
    expect(store.registrations.size).toBe(0);
    expect([...store.users.values()][0]?.passwordHash).not.toBe('Correct-horse-battery1!');

    const cookie = sessionCookie(verified);
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

    const afterLogout = await app.inject({ method: 'GET', url: '/api/auth/me' });
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

  it('does not enable E2E rate-limit overrides in staging environments', async () => {
    process.env.NODE_ENV = 'staging';
    process.env.E2E_TEST = 'true';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: validHeaders,
        payload: { email: 'invalid', password: 'short' },
      });
      expect(response.statusCode).toBe(400);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: validHeaders,
      payload: { email: 'invalid', password: 'short' },
    });
    expect(limited.statusCode).toBe(429);
  });

  it('rate-limits repeated registration attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: validHeaders,
        payload: { email: 'invalid', password: 'short' },
      });
      expect(response.statusCode).toBe(400);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: validHeaders,
      payload: { email: 'invalid', password: 'short' },
    });
    expect(limited.statusCode).toBe(429);
  });

  it('rate-limits repeated password-reset requests', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/request',
        headers: validHeaders,
        payload: { email: 'invalid' },
      });
      expect(response.statusCode).toBe(400);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      headers: validHeaders,
      payload: { email: 'invalid' },
    });
    expect(limited.statusCode).toBe(429);
  });

  it('rate-limits repeated failed login attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: validHeaders,
        payload: { email: 'missing@example.com', password: 'wrong-password' },
      });
      expect(response.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: validHeaders,
      payload: { email: 'missing@example.com', password: 'wrong-password' },
    });
    expect(limited.statusCode).toBe(429);
  });

  it('rate-limits repeated password-reset completion attempts before database access', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password-reset/complete',
        headers: validHeaders,
        payload: { token: '', password: 'short' },
      });
      expect(response.statusCode).toBe(400);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/complete',
      headers: validHeaders,
      payload: { token: '', password: 'short' },
    });
    expect(limited.statusCode).toBe(429);
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
      payload: { email: 'TEST@example.com', password: 'Correct-horse-battery1!' },
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
      payload: { email: 'test@example.com', password: 'Correct-horse-battery1!' },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('database-secret-detail');
  });
});
