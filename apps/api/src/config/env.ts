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
  PORT: z.coerce.number().int().positive().default(3001),
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

  // SIFEN / DNIT (facturación electrónica Paraguay) — todos opcionales hasta que haya cert real.
  SIFEN_AMBIENTE: z.enum(['TEST', 'PROD']).default('TEST'),
  SIFEN_MODO: z.enum(['mock', 'real']).default('mock'),
  SIFEN_CERT_PATH: z.string().optional(),
  SIFEN_CERT_PASSWORD: z.string().optional(),
  SIFEN_CSC_ID: z.string().optional(),
  SIFEN_CSC_VALOR: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
   
  console.error('❌ Variables de entorno inválidas:');
   
  console.error(parsed.error.flatten().fieldErrors);
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
