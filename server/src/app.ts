import { createHmac, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import { PrismaClient } from '@prisma/client';
import type { User } from '@prisma/client';
import { z } from 'zod';
import { registerCommerceRoutes } from './commerce.js';
import { registerPaymentRoutes } from './routes/payments.js';

const SESSION_COOKIE = 'template_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const localSessionSecret = 'local-development-only-change-this-secret';

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(128),
});

const loginSchema = z.object({
  email: emailSchema,
  // Existing accounts may have passwords created before the 12-character
  // registration policy was introduced. Login must not enforce that policy.
  password: z.string().min(1).max(128),
});

type Credentials = z.infer<typeof registrationSchema>;

function tokenHash(token: string): string {
  const secret = process.env.SESSION_SECRET ?? localSessionSecret;
  return createHmac('sha256', secret).update(token).digest('hex');
}

function publicUser(user: Pick<User, 'id' | 'email' | 'createdAt' | 'role'>) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

function parseCredentials(body: unknown): Credentials | null {
  const result = registrationSchema.safeParse(body);
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
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

export async function createApp(prisma = new PrismaClient()): Promise<FastifyInstance> {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  ) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters in production.');
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PASSWORD_RESET_WEBHOOK_URL || !process.env.PASSWORD_RESET_WEBHOOK_TOKEN) {
      throw new Error(
        'PASSWORD_RESET_WEBHOOK_URL and PASSWORD_RESET_WEBHOOK_TOKEN must be configured in production.',
      );
    }
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error(
        'STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET must be configured in production.',
      );
    }
    let resetWebhook: URL;
    try {
      resetWebhook = new URL(process.env.PASSWORD_RESET_WEBHOOK_URL);
    } catch {
      throw new Error('PASSWORD_RESET_WEBHOOK_URL must be an absolute HTTPS URL.');
    }
    if (resetWebhook.protocol !== 'https:')
      throw new Error('PASSWORD_RESET_WEBHOOK_URL must use HTTPS.');
  }

  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    trustProxy: process.env.TRUST_PROXY === 'true',
    bodyLimit: 16 * 1024,
  });

  // Keep the exact JSON bytes for Stripe's webhook signature verification.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(body);
    request.rawBody = rawBody;
    try {
      done(null, JSON.parse(rawBody.toString('utf8')));
    } catch (error) {
      done(error instanceof Error ? error : new Error('Invalid JSON body'));
    }
  });

  const allowedOrigin =
    process.env.APP_ORIGIN ??
    (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(allowedOrigin);
  } catch {
    throw new Error('APP_ORIGIN must be configured as an absolute origin URL.');
  }
  if (
    !allowedOrigin ||
    parsedOrigin.origin !== allowedOrigin ||
    parsedOrigin.username ||
    parsedOrigin.password
  ) {
    throw new Error(
      'APP_ORIGIN must contain only the frontend origin, without a path or credentials.',
    );
  }
  if (process.env.NODE_ENV === 'production' && parsedOrigin.protocol !== 'https:') {
    throw new Error('APP_ORIGIN must use HTTPS in production.');
  }

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
  // The E2E suite shares one API process and IP across all browser projects and retries.
  // Keep production throttling intact, but prevent unrelated test requests from exhausting
  // the global bucket before registration/checkout flows are exercised.
  await app.register(rateLimit, {
    global: true,
    max: process.env.E2E_TEST === 'true' ? 1000 : 120,
    timeWindow: '1 minute',
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    // Stripe authenticates webhooks using its signed raw body, not browser Origin.
    if (request.url.split('?')[0] === '/api/webhooks/stripe') return;
    const origin = request.headers.origin;
    if (origin !== allowedOrigin) {
      return reply.code(403).send({ error: 'Forbidden origin' });
    }
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 500
        ? error.statusCode
        : 500;
    if (statusCode === 500) request.log.error(error);
    return reply.code(statusCode).send({
      error: statusCode < 500 ? 'Invalid request.' : 'Internal server error.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: { max: process.env.E2E_TEST === 'true' ? 100 : 5, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const credentials = parseCredentials(request.body);
      if (!credentials) {
        return reply.code(400).send({
          error: 'Invalid input',
          details: 'Provide a valid email and a password between 12 and 128 characters.',
        });
      }

      const passwordHash = await argon2.hash(
        credentials.password,
        process.env.NODE_ENV === 'test'
          ? { type: argon2.argon2id, memoryCost: 4096, timeCost: 1, parallelism: 1 }
          : { type: argon2.argon2id },
      );
      try {
        const user = await prisma.user.create({
          data: { email: credentials.email, passwordHash },
        });
        await setSession(reply, prisma, user.id);
        return reply.code(201).send({ user: publicUser(user) });
      } catch (error) {
        // A concurrent registration may win the unique-email race.
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: unknown }).code === 'P2002'
        ) {
          return reply.code(400).send({ error: 'Unable to create account with these details.' });
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: { max: process.env.E2E_TEST === 'true' ? 100 : 8, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const credentials = loginSchema.safeParse(body);
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
    },
  );

  app.get('/api/auth/me', async (request, reply) => {
    const user = await currentUser(request, prisma);
    if (!user) return reply.code(401).send({ error: 'Not authenticated.' });
    return reply.send({ user: publicUser(user) });
  });

  app.get('/api/seller/me', async (request, reply) => {
    const user = await currentUser(request, prisma);
    if (!user) return reply.code(401).send({ error: 'Not authenticated.' });
    if (user.role !== 'SELLER') {
      return reply.code(403).send({ error: 'Seller access required.' });
    }
    return reply.send({ seller: { id: user.id, email: user.email, role: user.role } });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
    }
    return reply
      .clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax' })
      .code(204)
      .send();
  });

  registerCommerceRoutes(app, prisma, currentUser);
  registerPaymentRoutes(app, prisma, currentUser);

  app.addHook('onClose', async () => prisma.$disconnect());
  return app;
}
