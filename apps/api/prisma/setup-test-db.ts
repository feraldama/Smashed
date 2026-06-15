/* eslint-disable no-console */
/**
 * Inicializa la base de datos de tests (`smash_test`).
 *
 * Qué hace:
 *  1. Verifica que `DATABASE_URL_TEST` exista en el entorno.
 *  2. Crea la BD si no existe.
 *  3. Corre todas las migraciones de Prisma con `prisma migrate deploy`.
 *  4. Corre el seed (los tests asumen datos del seed: usuarios, productos, etc.).
 *
 * Cuándo correrlo:
 *  - La primera vez (después de clonar el repo o agregar la var).
 *  - Cuando se agregan nuevas migraciones que necesitás aplicar a la BD de test.
 *  - Cuando los tests rompen y querés volver a un estado limpio: pasá --reset
 *    para dropear y recrear la BD completa.
 *
 * Uso:
 *   pnpm --filter @smash/api test:db:setup        # migra + seed (incremental)
 *   pnpm --filter @smash/api test:db:reset        # drop + create + migrate + seed
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import pg from 'pg';

// Carga el .env del monorepo (mismo orden que apps/api/src/config/env.ts).
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  resolve(here, '../.env'), // apps/api/.env (poco usado)
  resolve(here, '../../../.env'), // root del monorepo
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false });
  }
}

const reset = process.argv.includes('--reset');

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('❌ DATABASE_URL_TEST no definido. Agregalo al .env raíz.');
  process.exit(1);
}

const u = new URL(testUrl);
const dbName = u.pathname.replace(/^\//, '').split('?')[0];
if (!dbName) {
  console.error('❌ DATABASE_URL_TEST no incluye nombre de BD');
  process.exit(1);
}

// Guard: si por error apunta a la misma BD que DATABASE_URL, abortamos.
const devUrl = process.env.DATABASE_URL;
if (devUrl) {
  const devName = new URL(devUrl).pathname.replace(/^\//, '').split('?')[0];
  if (devName === dbName) {
    console.error(
      `❌ DATABASE_URL_TEST apunta a la misma BD que DATABASE_URL (${dbName}).` +
        ' Cambiá el nombre — la BD de tests destruye datos.',
    );
    process.exit(1);
  }
}

async function ensureDatabase() {
  // Nos conectamos a la base `postgres` administrativa para hacer DDL.
  const admin = new pg.Client({
    host: u.hostname,
    port: Number(u.port || '5432'),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: 'postgres',
  });
  await admin.connect();
  try {
    if (reset) {
      // Cortamos conexiones activas a la BD antes de DROP.
      await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity ` +
          `WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [dbName],
      );
      await admin.query(`DROP DATABASE IF EXISTS "${dbName}"`);
      console.log(`🗑  DROP ${dbName}`);
    }
    const res = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ CREATE DATABASE ${dbName}`);
    } else {
      console.log(`✓ BD ${dbName} ya existe`);
    }
  } finally {
    await admin.end();
  }
}

function run(cmd: string, extraEnv: Record<string, string> = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl, ...extraEnv },
  });
}

async function main() {
  console.log(`→ Setup de BD de tests: ${dbName}`);
  await ensureDatabase();

  // Migraciones: deploy (no dev — no abre prompts interactivos).
  run('pnpm exec prisma migrate deploy');

  // Seed: dataset de PRUEBAS (fixture.sql), contra el que están escritos los
  // tests — independiente del snapshot.sql de producción.
  run('pnpm exec tsx prisma/seed.ts', { SEED_FILE: 'fixture.sql' });

  console.log(`\n✓ ${dbName} lista para correr tests`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
