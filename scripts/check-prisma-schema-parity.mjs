import { readFile } from 'node:fs/promises';

const schemaPaths = [
  'server/prisma/schema.prisma',
  'server/prisma/schema.postgres.prisma',
];

function extractModels(schema, path) {
  const models = [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{[\s\S]*?^\}/gm)];
  if (models.length === 0) throw new Error(`No Prisma models found in ${path}`);
  return new Map(
    models.map((match) => [match[1], match[0].replace(/\r\n/g, '\n').trim()]),
  );
}

const [sqliteSchema, postgresSchema] = await Promise.all(
  schemaPaths.map((path) => readFile(path, 'utf8')),
);
const sqliteModels = extractModels(sqliteSchema, schemaPaths[0]);
const postgresModels = extractModels(postgresSchema, schemaPaths[1]);
const names = [...new Set([...sqliteModels.keys(), ...postgresModels.keys()])].sort();
const differences = names.filter((name) => sqliteModels.get(name) !== postgresModels.get(name));

if (differences.length > 0) {
  console.error('Prisma model drift detected between SQLite and PostgreSQL:');
  for (const name of differences) {
    console.error(`- ${name}: SQLite=${sqliteModels.has(name)}, PostgreSQL=${postgresModels.has(name)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Prisma schema parity verified: ${sqliteModels.size} models match across both providers.`);
}
