import { readFile } from 'node:fs/promises';

const sqlitePath = 'server/prisma/schema.prisma';
const postgresPath = 'server/prisma/schema.postgres.prisma';

function extractModels(schema, path) {
  const models = new Map();
  const pattern = /^model\s+([A-Za-z0-9_]+)\s*\{[\s\S]*?^\}/gm;

  for (const match of schema.matchAll(pattern)) {
    const name = match[1];
    if (name) models.set(name, match[0].trim());
  }

  if (models.size === 0) {
    throw new Error(\`No Prisma models found in \${path}\`);
  }
  return models;
}

const sqliteSchema = await readFile(sqlitePath, 'utf8');
const postgresSchema = await readFile(postgresPath, 'utf8');
const sqliteModels = extractModels(sqliteSchema, sqlitePath);
const postgresModels = extractModels(postgresSchema, postgresPath);
const modelNames = new Set([...sqliteModels.keys(), ...postgresModels.keys()]);
let hasDrift = false;

for (const name of modelNames) {
  if (sqliteModels.get(name) !== postgresModels.get(name)) {
    console.error(\`Prisma model drift detected: \${name}\`);
    hasDrift = true;
  }
}

if (hasDrift) {
  process.exitCode = 1;
} else {
  console.log(\`Prisma schema parity verified: \${sqliteModels.size} models match.\`);
}
