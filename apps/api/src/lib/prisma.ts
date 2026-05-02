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
