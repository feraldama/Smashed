import { pino } from 'pino';

import { env, isDev, isTest } from './env.js';

/**
 * Logger principal — Pino. En dev usamos pino-pretty para output legible.
 * En prod (y test) JSON estructurado.
 */

export const logger = pino({
  level: isTest ? 'silent' : env.API_LOG_LEVEL,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:HH:MM:ss.l',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: { service: 'smash-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.passwordHash',
      '*.tokenHash',
    ],
    censor: '[REDACTED]',
  },
});
