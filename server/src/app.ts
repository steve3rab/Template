import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';
import { z } from 'zod';

const SESSION_COOKIE = 'template_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const localSessionSecret = 'local-development-only-change-this-secret';

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
});

type Credentials = z.infer<typeof credentialsSchema>;

function tokenHash(token: string): string {
  const secret = process.env.SESSION_SECRET ?? localSessionSecret;
  return createHmac('sha256', secret).update(token).digest('hex');
}

function publicUser(user: Pick<User, 'id' | 'email' | 'createdAt'>) {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/auth',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

function parseCredentials(body: unknown): Credentials | null {
  const result = credentialsSchema.safeParse(body);
  return result.success ? result.data : null;
}

async function setSession(reply: FastifyReply, prisma: PrismaClient, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: tokenHash(token), expiresAt },
  });
  return reply.setCookie(SESSION_COOKIE, token, cookieOptions());
}

async function currentUser(request: FastifyRequest, prisma: PrismaClient) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export async function createApp(prisma = new PrismaClient()): Promise<FastifyInstance> {
  if (process.env.NODE_ENV === 'production' && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters in production.');
  }

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    trustProxy: process.env.TRUST_PROXY === 'true',
    bodyLimit: 16 * 1024,
  });

  const allowedOrigin = process.env.APP_ORIGIN ?? 'http://localhost:5173';

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        objectSrc: ["'none'"],
      },
    },
  });
  await app.register(cookie);
  await app.register(cors, { origin: allowedOrigin, credentials: true });
  await app.register(rateLimit, { global: true, max: 120, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      return reply.code(403).send({ error: 'Forbidden origin' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
    if (statusCode === 500) request.log.error(error);
    return reply.code(statusCode).send({
      error: statusCode < 500 ? 'Invalid request.' : 'Internal server error.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post('/api/auth/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const credentials = parseCredentials(request.body);
    if (!credentials) {
      return reply.code(400).send({
        error: 'Invalid input',
        details: 'Provide a valid email and a password between 12 and 128 characters.',
      });
    }

    const passwordHash = await argon2.hash(credentials.password, { type: argon2.argon2id });
    try {
      const user = await prisma.user.create({
        data: { email: credentials.email, passwordHash },
      });
      await setSession(reply, prisma, user.id);
      return reply.code(201).send({ user: publicUser(user) });
    } catch (error) {
      // A concurrent registration may win the unique-email race.
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return reply.code(400).send({ error: 'Unable to create account with these details.' });
      }
      throw error;
    }
  });

  app.post('/api/auth/login', {
    config: { rateLimit: { max: 8, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body;
    const credentials = credentialsSchema.safeParse(body);
    if (!credentials.success) {
      return reply.code(400).send({ error: 'Invalid email or password.' });
    }

    const user = await prisma.user.findUnique({ where: { email: credentials.data.email } });
    const validPassword = user
      ? await argon2.verify(user.passwordHash, credentials.data.password).catch(() => false)
      : false;

    if (!user || !validPassword) {
      return reply.code(401).send({ error: 'Invalid email or password.' });
    }

    await setSession(reply, prisma, user.id);
    return reply.send({ user: publicUser(user) });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = await currentUser(request, prisma);
    if (!user) return reply.code(401).send({ error: 'Not authenticated.' });
    return reply.send({ user: publicUser(user) });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
    return reply.clearCookie(SESSION_COOKIE, { path: '/api/auth', httpOnly: true, sameSite: 'lax' })
      .code(204).send();
  });

  app.addHook('onClose', async () => prisma.$disconnect());
  return app;
}