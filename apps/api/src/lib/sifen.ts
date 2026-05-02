import { existsSync, readFileSync } from 'node:fs';

import {
  type CertCargado,
  cargarP12,
  createSifenClient,
  type SifenClient,
} from '@smash/sifen-client';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/**
 * Singletons SIFEN: cliente HTTP y certificado X.509.
 *
 * El cliente se inicializa lazy en la primera llamada a getSifenClient().
 * Por default usa MockSifenClient hasta que se configuren las credenciales reales.
 *
 * En tests: se exporta también `setSifenClientForTests()` para inyectar mocks.
 */

let clientSingleton: SifenClient | null = null;
let certSingleton: CertCargado | null = null;

export function getSifenClient(): SifenClient {
  if (clientSingleton) return clientSingleton;
  clientSingleton = createSifenClient({
    ambiente: (env.SIFEN_AMBIENTE) ?? 'TEST',
    modo: (env.SIFEN_MODO) ?? 'mock',
    p12Bytes: env.SIFEN_CERT_PATH ? loadP12Bytes(env.SIFEN_CERT_PATH) : undefined,
    p12Password: env.SIFEN_CERT_PASSWORD,
  });
  logger.info(
    { modo: env.SIFEN_MODO ?? 'mock', ambiente: env.SIFEN_AMBIENTE ?? 'TEST' },
    'SIFEN client inicializado',
  );
  return clientSingleton;
}

export function getCert(): CertCargado {
  if (certSingleton) return certSingleton;
  if (!env.SIFEN_CERT_PATH || !env.SIFEN_CERT_PASSWORD) {
    throw new Error(
      'Certificado SIFEN no configurado. Setear SIFEN_CERT_PATH y SIFEN_CERT_PASSWORD en .env, ' +
        'o usar el cert de test (pnpm --filter @smash/sifen-client generar-cert-test).',
    );
  }
  certSingleton = cargarP12(loadP12Bytes(env.SIFEN_CERT_PATH), env.SIFEN_CERT_PASSWORD);
  logger.info({ subject: certSingleton.subjectCN }, 'SIFEN cert cargado');
  return certSingleton;
}

function loadP12Bytes(path: string): Buffer {
  if (!existsSync(path)) throw new Error(`Cert .p12 no encontrado en ${path}`);
  return readFileSync(path);
}

/** Para tests: inyecta un cliente custom (usualmente un MockSifenClient configurado). */
export function setSifenClientForTests(client: SifenClient | null) {
  clientSingleton = client;
}

/** Para tests: inyecta un cert custom. */
export function setCertForTests(cert: CertCargado | null) {
  certSingleton = cert;
}

/** CSC para generar el QR — en prod viene de DNIT. */
export function getCsc(): { id: string; valor: string } {
  return {
    id: env.SIFEN_CSC_ID ?? '0001',
    // Default es un placeholder de 32 chars — sustituir por el valor real de DNIT en prod.
    valor: env.SIFEN_CSC_VALOR ?? 'ABCDEF0123456789ABCDEF0123456789',
  };
}
