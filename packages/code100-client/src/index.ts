/**
 * @smash/code100-client — Cliente del middleware FUTURA100 de CODE100 para
 * facturación electrónica (SIFEN Paraguay).
 *
 * El middleware abstrae la generación de XML, firma XAdES, CDC, QR y la
 * comunicación con SIFEN. Este paquete es transporte puro:
 *   - `Code100Auth`   → login + cache de token por RUC (2h TTL).
 *   - `Code100Client` → operaciones sobre /api/operation (alta, consulta,
 *                       XML, KUDE, cancelación, inutilización).
 *   - `normalizarEstado` / `errorDeAlta` → helpers para el flujo de polling.
 *
 * El mapeo `Comprobante (Prisma) → payload CODE100` vive en apps/api.
 */

export * from './auth.js';
export * from './client.js';
export * from './estado.js';
export * from './types.js';
