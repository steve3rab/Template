import { config } from 'dotenv';
config({ path: 'server/.env' });
config({ path: '.env' });
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const deploymentEnvironment = [
  process.env.NODE_ENV,
  process.env.APP_ENV,
  process.env.DEPLOYMENT_ENV,
  process.env.ENVIRONMENT,
  process.env.VERCEL_ENV,
  process.env.RAILWAY_ENVIRONMENT,
]
  .filter((value): value is string => typeof value === 'string')
  .map((value) => value.trim().toLowerCase());

const forbiddenEnvironment = deploymentEnvironment.find((value) =>
  /^(production|prod|preproduction|pre-production|preprod|staging|stage)$/.test(value),
);

if (forbiddenEnvironment) {
  throw new Error(`Test users cannot be seeded in the "${forbiddenEnvironment}" environment.`);
}

const appOrigin = process.env.APP_ORIGIN;
if (!appOrigin) {
  throw new Error('APP_ORIGIN must be set to a local URL before seeding test users.');
}

let appHost: string;
try {
  appHost = new URL(appOrigin).hostname.toLowerCase();
} catch {
  throw new Error('APP_ORIGIN must be a valid URL before seeding test users.');
}
if (!['localhost', '127.0.0.1', '::1'].includes(appHost)) {
  throw new Error('Test users can only be seeded when APP_ORIGIN points to localhost.');
}

// Fixed credentials are deliberately restricted to local/test environments by the guard above.
// Never use these accounts or this password outside a local development environment.
const password = 'Local-Test-Password-2026!';

const testUsers = [
  { email: 'test.customer@example.com', role: 'CUSTOMER' },
  { email: 'test.seller@example.com', role: 'SELLER' },
  { email: 'test.admin@example.com', role: 'ADMIN' },
] as const;

const prisma = new PrismaClient();

try {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  for (const user of testUsers) {
    const savedUser = await prisma.user.upsert({
      where: { email: user.email },
      create: {
        ...user,
        publicId: `USR-${randomBytes(6).toString('hex').toUpperCase()}`,
        passwordHash,
      },
      update: { role: user.role, passwordHash },
      select: { id: true, email: true, role: true },
    });
    await prisma.session.deleteMany({ where: { userId: savedUser.id } });
    console.info(`Ready: ${savedUser.email} (${savedUser.role})`);
  }
  console.info('Test users created/updated. Existing sessions were revoked.');
} finally {
  await prisma.$disconnect();
}
