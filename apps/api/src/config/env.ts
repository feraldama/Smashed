import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/**
 * Carga el .env buscando hacia arriba desde el dir actual hasta encontrar uno.
 * Esto permite correr scripts desde apps/api/ pero compartir el .env del root del monorepo.
 *
 * Orden de prioridad:
 *  1. Variables ya definidas en process.env (CI / docker / shell) — NO se sobreescriben.
 *  2. apps/api/.env (específico de la API, p.ej. DATABASE_URL para Prisma CLI)
 *  3. .env del root del monorepo (compartido)
 */
const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [
  resolve(here, '../../.env'), // apps/api/.env
  resolve(here, '../../../../.env'), // root del monorepo (apps/api/src/config/ → ../../../..)
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate, override: false });
  }
}

/**
 * Validación de variables de entorno con Zod.
 * Lee del .env del proceso (cargado por dotenv arriba).
 * Si falla la validación, abortamos el bootstrap antes que arranque Express.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Database
  DB_HOST: z.string().default('localhost'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string().default('smash'),
  DATABASE_URL: z.string().url(),

  // API
  PORT: z.coerce.number().int().positive().default(3020),
  ALLOWED_ORIGINS: z.string().default('*'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Bcrypt
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // Logger
  API_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  // Clave maestra para cifrar credenciales de facturación (AES-256-GCM).
  // 32 bytes en base64 o hex. Requerida sólo cuando se configuran credenciales.
  FACTURACION_ENC_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');

  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

/**
 * Reglas de endurecimiento que sólo aplican en producción. Se separan en una
 * función pura (sin `process.exit`) para poder testearlas; el bootstrap de
 * abajo las corre y aborta si hay errores.
 *
 * Por qué: varios defaults son cómodos para dev pero peligrosos en prod
 *  - `ALLOWED_ORIGINS='*'` hace que CORS refleje CUALQUIER origen con
 *    `credentials: true` → robo de sesión / CSRF (ver middleware/cors.ts).
 *  - un `JWT_SECRET` corto/de dev permite forjar tokens (incl. SUPER_ADMIN).
 */
export const JWT_SECRET_MIN_PROD = 44; // 32 bytes en base64 = 44 chars

export function validarConfigProduccion(e: {
  NODE_ENV: string;
  ALLOWED_ORIGINS: string;
  JWT_SECRET: string;
}): string[] {
  if (e.NODE_ENV !== 'production') return [];

  const errores: string[] = [];
  if (e.ALLOWED_ORIGINS.trim() === '*') {
    errores.push(
      'ALLOWED_ORIGINS no puede ser "*" en producción: con credentials habilitado, CORS ' +
        'reflejaría cualquier origen (robo de sesión / CSRF). Listá los orígenes explícitos, ' +
        'ej: ALLOWED_ORIGINS=https://app.tudominio.com,https://admin.tudominio.com',
    );
  }
  if (e.JWT_SECRET.trim().length < JWT_SECRET_MIN_PROD) {
    errores.push(
      `JWT_SECRET debe tener al menos ${JWT_SECRET_MIN_PROD} caracteres en producción ` +
        "(generá uno aleatorio: `node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"`). " +
        'No reuses el secreto de desarrollo.',
    );
  }
  return errores;
}

const erroresProd = validarConfigProduccion(parsed.data);
if (erroresProd.length > 0) {
  console.error('❌ Configuración insegura para producción:');
  for (const e of erroresProd) console.error(`  • ${e}`);
  process.exit(1);
}

export const env = parsed.data;

export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
export const isProd = env.NODE_ENV === 'production';

/** Lista de orígenes permitidos para CORS (parseada). `null` = wildcard reflejante. */
export const allowedOrigins: string[] | null =
  env.ALLOWED_ORIGINS.trim() === '*'
    ? null
    : env.ALLOWED_ORIGINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
