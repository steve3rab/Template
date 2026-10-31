import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const [emailArg, roleArg] = process.argv.slice(2);
const email = emailArg?.trim().toLowerCase();
const role = roleArg?.trim().toUpperCase();

if (!email || !['CUSTOMER', 'SELLER', 'ADMIN'].includes(role ?? '')) {
  console.error('Usage: npx tsx server/scripts/set-user-role.ts <email> <CUSTOMER|SELLER|ADMIN>');
  process.exit(2);
}

const prisma = new PrismaClient();
try {
  const user = await prisma.user.update({
    where: { email },
    data: { role },
    select: { id: true, email: true, role: true },
  });
  // Role changes revoke existing sessions so the new permissions take effect on next login.
  await prisma.session.deleteMany({ where: { userId: user.id } });
  console.info(`Updated ${user.email} to role ${user.role}; existing sessions revoked.`);
} catch {
  console.error('Could not update role. Verify that the account exists and the database is migrated.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
