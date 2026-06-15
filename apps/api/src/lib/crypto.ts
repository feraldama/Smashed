import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';

/**
 * Cifrado simétrico AES-256-GCM para secretos at-rest (credenciales de
 * facturación electrónica, etc.).
 *
 * Formato del texto cifrado: `iv:authTag:ciphertext`, cada parte en base64.
 * GCM provee autenticidad: si el dato fue alterado, el descifrado lanza.
 *
 * La clave maestra viene de `FACTURACION_ENC_KEY` (32 bytes en base64 o hex).
 * Rotar la clave invalida los secretos previos — re-encriptar tras rotación.
 */

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recomendado para GCM
const KEY_BYTES = 32;

let cachedKey: Buffer | null = null;

/** Resuelve y cachea la clave maestra. Acepta base64 o hex. */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.FACTURACION_ENC_KEY;
  if (!raw) {
    throw new Error(
      'FACTURACION_ENC_KEY no configurada. Generá una con: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = decodeKey(raw);
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `FACTURACION_ENC_KEY debe ser de ${KEY_BYTES} bytes (recibidos ${key.length}).`,
    );
  }
  cachedKey = key;
  return key;
}

function decodeKey(raw: string): Buffer {
  // Hex puro de 64 chars, o base64 en cualquier otro caso.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return Buffer.from(raw, 'base64');
}

/** Cifra un texto plano. Devuelve `iv:authTag:ciphertext` en base64. */
export function encriptar(plano: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plano, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Descifra un texto en formato `iv:authTag:ciphertext`. Lanza si fue alterado. */
export function desencriptar(cifrado: string): string {
  const partes = cifrado.split(':');
  if (partes.length !== 3) {
    throw new Error('Formato de texto cifrado inválido (se esperaba iv:authTag:ciphertext).');
  }
  const [ivB64, tagB64, ctB64] = partes as [string, string, string];
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** Para tests: resetea el cache de la clave (tras cambiar el env). */
export function resetCryptoKeyCache(): void {
  cachedKey = null;
}
