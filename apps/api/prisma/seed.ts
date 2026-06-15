/* eslint-disable no-console */
/**
 * Seed de Smash — carga `snapshot.sql` en la BD actual.
 *
 * Reemplaza al viejo seed hand-coded de 1800+ líneas. Ahora el flujo es:
 *
 *   1. El dev (o quien capture el estado) corre `pnpm db:snapshot` para
 *      pg_dump-ear los datos actuales a `prisma/snapshot.sql`.
 *   2. Cualquier otro entorno (otros devs, CI, BD de test) hace `pnpm db:seed`
 *      y queda con los mismos datos.
 *
 * Flujo del loader:
 *   1. Trunca todas las tablas de `public` excepto `_prisma_migrations`.
 *   2. Aplica el contenido de `snapshot.sql` (los `INSERT` + `setval` de pg_dump).
 *
 * El snapshot preserva los IDs originales (cuids) y secuencias — el ciclo
 * `pnpm db:snapshot` → `pnpm db:seed` es idempotente.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import pg from 'pg';

const SNAPSHOT_PATH = resolve(import.meta.dirname, 'snapshot.sql');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definido. Verificá tu .env raíz.');
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

    console.log('📥 Aplicando snapshot.sql...');
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
