import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma 7 — reemplaza el bloque `prisma {}` del package.json
 * y la directiva `url` del datasource del schema.
 *
 * - `schema`: ruta al archivo .prisma
 * - `migrations.seed`: comando para `prisma db seed`
 * - `datasource.url`: URL usada SÓLO por los comandos de migrate/introspect.
 *   En runtime, el cliente recibe `datasourceUrl` desde `lib/prisma.ts`.
 */
export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
