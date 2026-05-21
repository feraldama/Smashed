import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { env, isDev } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Singleton del cliente Prisma.
 *
 * Multi-tenant: el filtrado por empresa/sucursal lo hacen los SERVICIOS
 * usando explícitamente los IDs del `req.context`. No hay middleware
 * "mágico" que inyecte where automáticamente — preferimos ser explícitos
 * para que un grep en el código muestre todas las queries y los tests
 * puedan verificar que no haya leaks cross-tenant.
 *
 * Si en el futuro queremos auto-filtering, lo añadimos como `$extends`
 * con la lista de modelos+campos a filtrar.
 */

// `as const` permite que TS infiera los `level` como literales
// para que `$on('warn', ...)` quede tipado correctamente.
const logConfig = [
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
] as const;

function createPrismaClient() {
  // Guard defensivo: en modo test, la URL DEBE apuntar a una BD distinta de la
  // que indica DATABASE_URL_TEST. Si la config de vitest está rota o alguien
  // ejecuta tests con NODE_ENV=test directamente, abortamos antes de destruir
  // datos de desarrollo. Los tests hacen deleteMany() — no son reversibles.
  if (env.NODE_ENV === 'test') {
    const testUrl = process.env.DATABASE_URL_TEST;
    if (!testUrl) {
      throw new Error(
        'NODE_ENV=test pero DATABASE_URL_TEST no está definido. ' +
          'Agregalo al .env y creá la BD con: pnpm --filter @smash/api test:db:setup',
      );
    }
    if (env.DATABASE_URL !== testUrl) {
      throw new Error(
        'NODE_ENV=test pero DATABASE_URL no apunta a DATABASE_URL_TEST. ' +
          'Los tests destruyen datos — usá pnpm test, no node/tsx directos.',
      );
    }
  }
  // Prisma 7 ya no acepta `url` en el datasource del schema; el cliente recibe
  // la conexión vía driver adapter (pg para PostgreSQL).
  const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
  return new PrismaClient({ adapter, log: [...logConfig] });
}

type AppPrismaClient = ReturnType<typeof createPrismaClient>;

declare global {
  var __prisma: AppPrismaClient | undefined;
}

export const prisma: AppPrismaClient = global.__prisma ?? createPrismaClient();

if (isDev) {
  global.__prisma = prisma;
}

prisma.$on('warn', (e) => logger.warn({ prisma: e }, 'Prisma warn'));
prisma.$on('error', (e) => logger.error({ prisma: e }, 'Prisma error'));

export async function disconnectPrisma() {
  await prisma.$disconnect();
}
