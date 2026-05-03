/**
 * Genera `apps/api/prisma/snapshot.sql` con un dump de SOLO datos de la BD
 * actual. Lo usás cuando querés capturar tu estado de dev como nuevo seed.
 *
 * Uso:
 *   pnpm db:snapshot
 *
 * Configuración:
 *   - Lee DATABASE_URL del .env raíz (igual que el resto de los scripts).
 *   - Asume que `pg_dump` está en PATH; si no, exportá `PG_DUMP_PATH=...`
 *     apuntando al ejecutable (ej. en Windows con instalador de Postgres:
 *     `D:\Archivos de programa\PostgreSQL\18\bin\pg_dump.exe`).
 *
 * Flags usados:
 *   --data-only           sólo datos (el schema viene de las migraciones)
 *   --column-inserts      INSERTs explícitos por columna (más legibles + portables)
 *   --disable-triggers    permite restaurar con FKs circulares (ej. comprobante↔pedido)
 *   --no-owner            no graba dueño de tablas
 *   --no-privileges       no graba GRANTs
 *   --exclude-table=_prisma_migrations  no toca el control de migraciones
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OUT_PATH = resolve(import.meta.dirname, 'snapshot.sql');
const PG_DUMP = process.env.PG_DUMP_PATH || 'pg_dump';

interface ParsedUrl {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

function parseDatabaseUrl(url: string): ParsedUrl {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  };
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no está definido. Verificá tu .env raíz.');
  }
  const { host, port, user, password, database } = parseDatabaseUrl(databaseUrl);

  if (!existsSync(dirname(OUT_PATH))) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
  }

  console.log(`📸 Dump-eando ${database}@${host}:${port} → ${OUT_PATH}`);

  const result = spawnSync(
    PG_DUMP,
    [
      '--data-only',
      '--column-inserts',
      '--disable-triggers',
      '--no-owner',
      '--no-privileges',
      '--exclude-table=_prisma_migrations',
      '-h',
      host,
      '-p',
      port,
      '-U',
      user,
      '-d',
      database,
      '-f',
      OUT_PATH,
    ],
    {
      env: { ...process.env, PGPASSWORD: password },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );

  if (result.error) {
    if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `No se encontró pg_dump. Instalá Postgres client tools o exportá PG_DUMP_PATH apuntando al ejecutable.`,
      );
    }
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`pg_dump terminó con código ${result.status}`);
  }

  const size = statSync(OUT_PATH).size;
  console.log(`✅ Snapshot generado — ${(size / 1024).toFixed(1)} KB`);
}

main();
