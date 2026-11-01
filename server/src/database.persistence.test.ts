// @vitest-environment node

import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';

const databaseConfigured = Boolean(process.env.DATABASE_URL);
const describeWithDatabase = databaseConfigured ? describe : describe.skip;

let clients: PrismaClient[] = [];

function newClient() {
  const client = new PrismaClient();
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
  clients = [];
});

describeWithDatabase('SQLite persistence', () => {
  it('persists a user and related session across independent Prisma clients', async () => {
    const email = `persistence-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const firstClient = newClient();

    const user = await firstClient.user.create({
      data: {
        email,
        passwordHash: 'test-password-hash',
        sessions: {
          create: {
            tokenHash: `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
      include: { sessions: true },
    });

    expect(user.id).toBeTruthy();
    expect(user.sessions).toHaveLength(1);
    await firstClient.$disconnect();

    const secondClient = newClient();
    const persistedUser = await secondClient.user.findUnique({
      where: { email },
      include: { sessions: true },
    });

    expect(persistedUser).not.toBeNull();
    expect(persistedUser?.id).toBe(user.id);
    expect(persistedUser?.passwordHash).toBe('test-password-hash');
    expect(persistedUser?.sessions).toHaveLength(1);
    expect(persistedUser?.sessions[0]?.userId).toBe(user.id);

    await secondClient.user.delete({ where: { id: user.id } });
    expect(await secondClient.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('enforces unique email addresses in the actual database', async () => {
    const email = `unique-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
    const client = newClient();

    const user = await client.user.create({
      data: { email, passwordHash: 'test-password-hash' },
    });

    try {
      await expect(
        client.user.create({
          data: { email, passwordHash: 'another-test-hash' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    } finally {
      await client.user.delete({ where: { id: user.id } });
    }
  });
});
