import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * Configuración de Prisma 7 — reemplaza el bloque `prisma {}` del package.json
 * y la directiva `url` del datasource del schema.
 *
 * - `schema`: ruta al archivo .prisma
 * - `datasource.url`: URL usada SÓLO por los comandos de migrate/introspect.
 *   En runtime, el cliente recibe `datasourceUrl` desde `lib/prisma.ts`.
 *
 * ⚠️ A propósito NO declaramos `migrations.seed`. Si se declara, `prisma migrate
 * dev` y `migrate reset` corren el seed automáticamente — y nuestro seed TRUNCA
 * todas las tablas para recargar el dump. Eso borró datos reales una vez. El seed
 * se ejecuta SIEMPRE de forma explícita (`pnpm db:seed` / `test:db:setup`), nunca
 * disparado por migrate. En producción se usa `prisma:migrate:deploy` (no seedea).
 */
export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
