import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
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
import {
  loginCredentialsSchema,
  registrationCredentialsSchema,
  type RegistrationCredentials,
} from './schemas/auth.js';
import { registerCommerceRoutes } from './commerce.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { hashToken } from './auth/tokenHash.js';
import { isPrismaUniqueConstraintError } from './utils/prismaErrors.js';
import { UpstashRateLimitStore } from './security/upstashRateLimitStore.js';

const SESSION_COOKIE = 'template_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createPublicUserId(): string {
  return `USR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

function publicUser(user: Pick<User, 'id' | 'publicId' | 'email' | 'createdAt' | 'role'>) {
  return {
    id: user.id,
    publicId: user.publicId,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV === 'production' ||
      process.env.APP_ORIGIN?.startsWith('https://') === true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

function parseCredentials(body: unknown): RegistrationCredentials | null {
  const result = registrationCredentialsSchema.safeParse(body);
  return result.success ? result.data : null;
}

async function setSession(reply: FastifyReply, prisma: PrismaClient, userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  reply.setCookie(SESSION_COOKIE, token, cookieOptions());
}

async function currentUser(request: FastifyRequest, prisma: PrismaClient) {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  return session.user;
}

type PasswordCrypto = Pick<typeof argon2, 'hash' | 'verify' | 'argon2id'>;

export async function createApp(
  prisma = new PrismaClient(),
  passwordCrypto: PasswordCrypto = argon2,
): Promise<FastifyInstance> {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
  ) {
    throw new Error('SESSION_SECRET must be configured with at least 32 characters in production.');
  }
  if (process.env.NODE_ENV === 'production') {
    const rateLimitUrl = process.env.RATE_LIMIT_REDIS_REST_URL;
    const rateLimitToken = process.env.RATE_LIMIT_REDIS_REST_TOKEN;
    if (!rateLimitUrl || !rateLimitToken) {
      throw new Error(
        'RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN are required in production.',
      );
    }
    let parsedRateLimitUrl: URL;
    try {
      parsedRateLimitUrl = new URL(rateLimitUrl);
    } catch {
      throw new Error('RATE_LIMIT_REDIS_REST_URL must be an absolute HTTPS URL.');
    }
    if (parsedRateLimitUrl.protocol !== 'https:') {
      throw new Error('RATE_LIMIT_REDIS_REST_URL must use HTTPS.');
    }
  }
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PASSWORD_RESET_WEBHOOK_URL || !process.env.PASSWORD_RESET_WEBHOOK_TOKEN) {
      throw new Error(
        'PASSWORD_RESET_WEBHOOK_URL and PASSWORD_RESET_WEBHOOK_TOKEN must be configured in production.',
      );
    }
    if (
      !process.env.EMAIL_VERIFICATION_WEBHOOK_URL ||
      !process.env.EMAIL_VERIFICATION_WEBHOOK_TOKEN
    ) {
      throw new Error(
        'EMAIL_VERIFICATION_WEBHOOK_URL and EMAIL_VERIFICATION_WEBHOOK_TOKEN must be configured in production.',
      );
    }
    let verificationWebhook: URL;
    try {
      verificationWebhook = new URL(process.env.EMAIL_VERIFICATION_WEBHOOK_URL);
    } catch {
      throw new Error('EMAIL_VERIFICATION_WEBHOOK_URL must be an absolute HTTPS URL.');
    }
    if (verificationWebhook.protocol !== 'https:') {
      throw new Error('EMAIL_VERIFICATION_WEBHOOK_URL must use HTTPS.');
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
    // Do not write client IP addresses or network metadata to automatic request logs.
    disableRequestLogging: true,
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
    } catch {
      done(
        Object.assign(new Error('Invalid JSON body'), {
          statusCode: 400,
          code: 'FST_ERR_CTP_INVALID_JSON_BODY',
        }),
      );
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
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
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
  const e2eRateLimitOverride = process.env.NODE_ENV === 'test' && process.env.E2E_TEST === 'true';
  const useSharedRateLimitStore =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RATE_LIMIT_REDIS_REST_URL && process.env.RATE_LIMIT_REDIS_REST_TOKEN);
  await app.register(rateLimit, {
    global: true,
    max: e2eRateLimitOverride ? 1000 : 120,
    timeWindow: '1 minute',
    // Route-level limits are disabled only for the isolated multi-project E2E server.
    // Unit tests and all non-test environments keep the configured per-route limits.
    allowList: e2eRateLimitOverride ? () => true : undefined,
    ...(useSharedRateLimitStore
      ? {
          store: UpstashRateLimitStore,
          keyGenerator: (request) =>
            createHmac('sha256', process.env.SESSION_SECRET ?? 'local-rate-limit-key')
              .update(request.ip)
              .digest('hex'),
        }
      : {}),
    // Fail closed if the shared store is unavailable; silently falling back to per-instance
    // memory would make production limits inconsistent and bypassable across replicas.
    skipOnError: false,
  });

  app.addHook('onRequest', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('Referrer-Policy', 'no-referrer');
    // Browser-level denial: the application must never request device or sensor location.
    reply.header(
      'Permissions-Policy',
      'geolocation=(), camera=(), microphone=(), accelerometer=(), gyroscope=(), magnetometer=()',
    );
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
    if (statusCode === 500) {
      // Avoid request.log here: its default serializers can include client network addresses.
      app.log.error(
        { err: error, method: request.method, route: request.routeOptions.url },
        'Request failed',
      );
    }
    return reply.code(statusCode).send({
      error: statusCode < 500 ? 'Invalid request.' : 'Internal server error.',
    });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.post(
    '/api/auth/register',
    {
      config: {
        rateLimit: {
          max: e2eRateLimitOverride ? 100 : 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const credentials = parseCredentials(request.body);
      if (!credentials) {
        return reply.code(400).send({
          error: 'Invalid input',
          details:
            'Use a valid email and a 12–128 character password with uppercase, lowercase, number and special character.',
        });
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: credentials.email },
        select: { id: true },
      });
      if (existingUser) {
        return reply.code(409).send({ error: 'An account already exists for this email address.' });
      }

      const passwordHash = await passwordCrypto.hash(credentials.password, {
        type: passwordCrypto.argon2id,
      });
      const code = randomInt(0, 10_000_000_000).toString().padStart(10, '0');
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.registrationVerification.deleteMany({ where: { email: credentials.email } });
      await prisma.registrationVerification.create({
        data: {
          email: credentials.email,
          passwordHash,
          codeHash: hashToken(code),
          expiresAt,
          attempts: 0,
        },
      });

      const webhookUrl = process.env.EMAIL_VERIFICATION_WEBHOOK_URL;
      const webhookToken = process.env.EMAIL_VERIFICATION_WEBHOOK_TOKEN;
      if (webhookUrl && webhookToken) {
        try {
          const response = await fetch(webhookUrl, {
            method: 'POST',
            signal: AbortSignal.timeout(10_000),
            headers: {
              Authorization: `Bearer ${webhookToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'email_verification',
              to: credentials.email,
              subject: 'Vérifiez votre adresse e-mail',
              code,
              expiresAt: expiresAt.toISOString(),
              expiresInMinutes: 10,
            }),
          });
          if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
        } catch (error) {
          await prisma.registrationVerification.deleteMany({ where: { email: credentials.email } });
          request.log.error({ err: error }, 'Email verification delivery failed');
          return reply
            .code(503)
            .send({ error: 'Unable to send the verification email. Please retry.' });
        }
        return reply.code(202).send({ verificationRequired: true });
      }

      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        await prisma.registrationVerification.deleteMany({ where: { email: credentials.email } });
        return reply.code(503).send({ error: 'Email verification is not configured.' });
      }

      // Local-only convenience for development and automated tests. Never expose codes in deployments.
      request.log.info('A local email verification code was generated for %s.', credentials.email);
      return reply.code(202).send({ verificationRequired: true, developmentCode: code });
    },
  );

  app.post(
    '/api/auth/register/verify',
    {
      config: {
        rateLimit: {
          max: e2eRateLimitOverride ? 100 : 10,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const body =
        typeof request.body === 'object' && request.body !== null
          ? (request.body as { email?: unknown; code?: unknown })
          : {};
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const code = typeof body.code === 'string' ? body.code : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{10}$/.test(code)) {
        return reply.code(400).send({ error: 'Enter a valid email and the 10-digit code.' });
      }

      const pending = await prisma.registrationVerification.findUnique({ where: { email } });
      if (!pending) return reply.code(400).send({ error: 'The code is invalid or has expired.' });
      if (pending.expiresAt.getTime() <= Date.now()) {
        await prisma.registrationVerification.deleteMany({ where: { email } });
        return reply.code(400).send({ error: 'The code has expired. Please register again.' });
      }
      if (pending.attempts >= 5) {
        await prisma.registrationVerification.deleteMany({ where: { email } });
        return reply.code(429).send({ error: 'Too many attempts. Please register again.' });
      }
      const actualHash = Buffer.from(hashToken(code), 'hex');
      const expectedHash = Buffer.from(pending.codeHash, 'hex');
      const validCode =
        actualHash.length === expectedHash.length && timingSafeEqual(actualHash, expectedHash);
      if (!validCode) {
        const attempts = pending.attempts + 1;
        if (attempts >= 5) {
          await prisma.registrationVerification.deleteMany({ where: { email } });
          return reply.code(429).send({ error: 'Too many attempts. Please register again.' });
        }
        await prisma.registrationVerification.update({
          where: { email },
          data: { attempts },
        });
        return reply.code(400).send({ error: 'The verification code is incorrect.' });
      }

      try {
        const user = await prisma.user.create({
          data: {
            email,
            passwordHash: pending.passwordHash,
            publicId: createPublicUserId(),
          },
        });
        await prisma.registrationVerification.deleteMany({ where: { email } });
        await setSession(reply, prisma, user.id);
        return reply.code(201).send({ user: publicUser(user) });
      } catch (error) {
        if (isPrismaUniqueConstraintError(error)) {
          await prisma.registrationVerification.deleteMany({ where: { email } });
          return reply
            .code(409)
            .send({ error: 'An account already exists for this email address.' });
        }
        throw error;
      }
    },
  );

  app.post(
    '/api/auth/login',
    {
      config: {
        rateLimit: {
          max: e2eRateLimitOverride ? 100 : 5,
          timeWindow: '15 minutes',
        },
      },
    },
    async (request, reply) => {
      const body = request.body;
      const credentials = loginCredentialsSchema.safeParse(body);
      if (!credentials.success) {
        return reply.code(400).send({ error: 'Invalid email or password.' });
      }

      const user = await prisma.user.findUnique({ where: { email: credentials.data.email } });
      const validPassword = user
        ? await passwordCrypto
            .verify(user.passwordHash, credentials.data.password)
            .catch(() => false)
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
      await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
    reply.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: 0 });
    return reply.code(204).send();
  });

  registerCommerceRoutes(app, prisma, currentUser);
  registerPaymentRoutes(app, prisma, currentUser);

  app.addHook('onClose', async () => prisma.$disconnect());
  return app;
}
