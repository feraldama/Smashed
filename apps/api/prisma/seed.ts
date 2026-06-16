/* eslint-disable no-console */
/**
 * Seed de Smash — carga un dump SQL en la BD actual.
 *
 * Dos datasets, elegidos con la env `SEED_FILE`:
 *   - `snapshot.sql` (default): datos reales para bootstrapear producción.
 *   - `fixture.sql`: dataset estable de PRUEBAS (sucursal CEN, usuarios
 *     cajero1/2, etc.) contra el que están escritos los tests. Lo usan
 *     `test:db:setup` y el CI — NO depende de los datos reales del snapshot.
 *
 * Flujo del loader:
 *   1. Trunca todas las tablas de `public` excepto `_prisma_migrations`.
 *   2. Aplica el contenido del archivo (los `INSERT` + `setval` de pg_dump).
 *
 * El dump preserva los IDs originales (cuids) y secuencias — idempotente.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

// `SEED_FILE` permite elegir el dataset (default: snapshot.sql de producción).
const SEED_FILE = process.env.SEED_FILE ?? 'snapshot.sql';
const SNAPSHOT_PATH = resolve(import.meta.dirname, SEED_FILE);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definido. Verificá tu .env raíz.');
  }

  // ⚠️ GUARD anti-borrado: este seed TRUNCA todas las tablas. Sólo se permite
  // contra bases de tests (nombre terminado en `_test`). Para sembrar cualquier
  // otra base (ej. producción) hay que pasar SEED_CONFIRM=1 a propósito.
  const dbName = new URL(databaseUrl).pathname.replace(/^\//, '').split('?')[0] ?? '';
  const esBaseDeTest = dbName.endsWith('_test');
  if (!esBaseDeTest && process.env.SEED_CONFIRM !== '1') {
    console.error(
      `❌ Seed BLOQUEADO contra "${dbName}": este script TRUNCA todas las tablas y\n` +
        '   recarga el dump (se perderían los datos actuales).\n' +
        '   - Si de verdad querés re-sembrar esta base, corré con SEED_CONFIRM=1.\n' +
        '   - En producción NUNCA uses `migrate dev` ni `db:seed`: usá `prisma:migrate:deploy`.',
    );
    process.exit(1);
  }

  const sqlRaw = readFileSync(SNAPSHOT_PATH, 'utf8');
  // Saneamos artefactos del pg_dump local (PG17/18) que un Postgres más viejo
  // (p.ej. el del CI) no entiende:
  //  - directivas psql `\restrict` / `\unrestrict` (pg_dump 18).
  //  - `SET transaction_timeout` (GUC nuevo en PostgreSQL 17). En servidores
  //    anteriores lanza «unrecognized configuration parameter». Quitarlo es
  //    inocuo (equivale a sin límite, que es el valor dumpeado).
  const sql = sqlRaw
    .replace(/^\\restrict\s+\S+\s*$/gm, '')
    .replace(/^\\unrestrict\s+\S+\s*$/gm, '')
    .replace(/^SET\s+transaction_timeout\s*=.*$/gim, '');

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('🗑  Truncando tablas de public (excepto _prisma_migrations)...');
    await client.query(`
      DO $$
      DECLARE
        nombres text;
      BEGIN
        SELECT string_agg(format('public.%I', tablename), ', ') INTO nombres
        FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';
        IF nombres IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || nombres || ' RESTART IDENTITY CASCADE';
        END IF;
      END $$;
    `);

    console.log(`📥 Aplicando ${SEED_FILE}...`);
    await client.query(sql);

    console.log('✅ Seed aplicado correctamente.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error aplicando seed:', err);
  process.exit(1);
});
