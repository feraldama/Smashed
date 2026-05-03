/**
 * Loader del snapshot SQL — restaura la BD a un estado dump-eado previamente
 * con `pnpm db:snapshot` (que invoca pg_dump --data-only).
 *
 * Flujo:
 *  1. Trunca todas las tablas de `public` excepto `_prisma_migrations`.
 *  2. Aplica el contenido de `snapshot.sql` (los `INSERT` + `setval` de pg_dump).
 *
 * Nota: el snapshot trae los IDs originales (cuids). Esto es deseable para
 * tener un seed reproducible — un `pnpm db:reset && pnpm db:seed:snapshot`
 * deja la BD idéntica al estado del dump.
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
  // pg_dump 18 emite directivas psql `\restrict` / `\unrestrict` que el
  // protocolo de Postgres no entiende — las eliminamos antes de ejecutar.
  const sql = sqlRaw
    .replace(/^\\restrict\s+\S+\s*$/gm, '')
    .replace(/^\\unrestrict\s+\S+\s*$/gm, '');

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    console.log('🗑  Truncando tablas de public (excepto _prisma_migrations)...');
    await client.query(`
      DO $$
      DECLARE
        r RECORD;
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

    console.log('✅ Snapshot restaurado correctamente.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('❌ Error restaurando snapshot:', err);
  process.exit(1);
});
