import { config } from 'dotenv';
config({ path: 'server/.env' });
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Test users cannot be seeded when NODE_ENV=production.');
}
if (process.env.ALLOW_TEST_USER_SEED !== 'true') {
  throw new Error('Set ALLOW_TEST_USER_SEED=true to explicitly enable test-user creation.');
}

const password = process.env.TEST_USERS_PASSWORD;
if (!password || password.length < 12 || password.length > 128) {
  throw new Error('Set TEST_USERS_PASSWORD to a password between 12 and 128 characters.');
}

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
      create: { ...user, passwordHash },
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
