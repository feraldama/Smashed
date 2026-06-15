import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../config/env.js';

import { desencriptar, encriptar, resetCryptoKeyCache } from './crypto.js';

// Clave de test: 32 bytes en hex (64 chars).
const TEST_KEY = 'a'.repeat(64);

describe('crypto AES-256-GCM', () => {
  let keyPrevia: string | undefined;

  beforeAll(() => {
    keyPrevia = env.FACTURACION_ENC_KEY;
    env.FACTURACION_ENC_KEY = TEST_KEY;
    resetCryptoKeyCache();
  });

  afterAll(() => {
    env.FACTURACION_ENC_KEY = keyPrevia;
    resetCryptoKeyCache();
  });

  it('round-trip: desencriptar(encriptar(x)) === x', () => {
    const secreto = 'ABC#12345678';
    expect(desencriptar(encriptar(secreto))).toBe(secreto);
  });

  it('maneja unicode y strings largos', () => {
    const secreto = 'ñañdú €$ password con espacios — '.repeat(20);
    expect(desencriptar(encriptar(secreto))).toBe(secreto);
  });

  it('produce ciphertext distinto en cada cifrado (IV aleatorio)', () => {
    const a = encriptar('mismo');
    const b = encriptar('mismo');
    expect(a).not.toBe(b);
    expect(desencriptar(a)).toBe(desencriptar(b));
  });

  it('formato iv:authTag:ciphertext (3 partes base64)', () => {
    const partes = encriptar('x').split(':');
    expect(partes).toHaveLength(3);
    for (const p of partes) expect(p.length).toBeGreaterThan(0);
  });

  it('falla al descifrar datos alterados (autenticidad GCM)', () => {
    const cifrado = encriptar('secreto');
    const [iv, tag, ct] = cifrado.split(':');
    // Corromper el ciphertext.
    const ctCorrupto = Buffer.from(ct!, 'base64');
    ctCorrupto[0] = ctCorrupto[0]! ^ 0xff;
    const alterado = `${iv}:${tag}:${ctCorrupto.toString('base64')}`;
    expect(() => desencriptar(alterado)).toThrow();
  });

  it('falla con formato inválido', () => {
    expect(() => desencriptar('no-tiene-tres-partes')).toThrow(/Formato/);
  });

  it('rechaza claves de longitud incorrecta', () => {
    env.FACTURACION_ENC_KEY = 'clave-corta';
    resetCryptoKeyCache();
    expect(() => encriptar('x')).toThrow(/32 bytes/);
    env.FACTURACION_ENC_KEY = TEST_KEY;
    resetCryptoKeyCache();
  });
});
