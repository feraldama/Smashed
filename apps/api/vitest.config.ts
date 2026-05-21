import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Cargamos el .env (root del monorepo y/o apps/api/.env) ANTES de definir la
// config — para poder leer DATABASE_URL_TEST y aplicarlo al process.env que
// hereda el worker de vitest. Sin esto, los tests caen contra DATABASE_URL
// (la BD de desarrollo) y destruyen los datos del dev cada vez que corren.
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, '.env'), resolve(here, '../../.env')]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false });
  }
}

const testDbUrl = process.env.DATABASE_URL_TEST;
if (!testDbUrl) {
  throw new Error(
    'DATABASE_URL_TEST no está definido. Agregalo al .env y creá la BD con:\n' +
      '  pnpm --filter @smash/api test:db:setup',
  );
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['src/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } }, // serializa para no pisar la BD
    // El worker hereda este env. Sustituimos DATABASE_URL por la de test, así
    // env.ts y prisma.ts (que NO saben de "test") apuntan a smash_test sin
    // necesidad de tocar código de producción.
    env: {
      DATABASE_URL: testDbUrl,
      NODE_ENV: 'test',
    },
  },
});
