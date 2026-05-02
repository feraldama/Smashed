import { describe, expect, it } from 'vitest';

import { MockSifenClient, createSifenClient } from './client.js';

const SAMPLE_XML = `<?xml version="1.0"?><rDE><DE Id="x">algo</DE></rDE>`;
const SAMPLE_CDC = '0'.repeat(44);

describe('MockSifenClient.enviarDe', () => {
  it('aprobado por default', async () => {
    const c = new MockSifenClient();
    const r = await c.enviarDe({ xmlFirmado: SAMPLE_XML, cdc: SAMPLE_CDC });
    expect(r.estado).toBe('APROBADO');
    expect(r.protocolo).toMatch(/^MOCK-/);
    expect(r.cdc).toBe(SAMPLE_CDC);
    expect(r.xmlRespuesta).toContain('<dCdC>' + SAMPLE_CDC);
  });

  it('rechazo cuando forzarRechazo=true', async () => {
    const c = new MockSifenClient({ forzarRechazo: true });
    const r = await c.enviarDe({ xmlFirmado: SAMPLE_XML, cdc: SAMPLE_CDC });
    expect(r.estado).toBe('RECHAZADO');
    expect(r.errores?.[0]).toBeDefined();
  });

  it('throw cuando forzarTimeout=true', async () => {
    const c = new MockSifenClient({ forzarTimeout: true });
    await expect(c.enviarDe({ xmlFirmado: SAMPLE_XML, cdc: SAMPLE_CDC })).rejects.toThrow(
      /Timeout/,
    );
  });
});

describe('MockSifenClient.consultarDe', () => {
  it('PENDIENTE para CDC nunca enviado', async () => {
    const c = new MockSifenClient();
    const r = await c.consultarDe({ cdc: SAMPLE_CDC });
    expect(r.estado).toBe('PENDIENTE');
    expect(r.procesado).toBe(false);
  });

  it('APROBADO para CDC enviado previamente', async () => {
    const c = new MockSifenClient();
    await c.enviarDe({ xmlFirmado: SAMPLE_XML, cdc: SAMPLE_CDC });
    const r = await c.consultarDe({ cdc: SAMPLE_CDC });
    expect(r.estado).toBe('APROBADO');
  });
});

describe('MockSifenClient.cancelarDe', () => {
  it('cancela un CDC aprobado', async () => {
    const c = new MockSifenClient();
    await c.enviarDe({ xmlFirmado: SAMPLE_XML, cdc: SAMPLE_CDC });
    const r = await c.cancelarDe({ cdc: SAMPLE_CDC, motivo: 'Test', xmlEvento: '<rEv/>' });
    expect(r.estado).toBe('CANCELADO');
    expect(r.protocolo).toBeDefined();

    // Consulta posterior debe reportar CANCELADO
    const cons = await c.consultarDe({ cdc: SAMPLE_CDC });
    expect(cons.estado).toBe('CANCELADO');
  });

  it('rechaza cancelación de CDC no aprobado', async () => {
    const c = new MockSifenClient();
    const r = await c.cancelarDe({ cdc: SAMPLE_CDC, motivo: 'Test', xmlEvento: '<rEv/>' });
    expect(r.estado).toBe('RECHAZADO');
  });
});

describe('createSifenClient factory', () => {
  it('modo mock por default', () => {
    const c = createSifenClient({ ambiente: 'TEST' });
    expect(c).toBeInstanceOf(MockSifenClient);
    expect(c.ambiente).toBe('TEST');
  });

  it('modo real lanza si faltan credenciales', () => {
    expect(() => createSifenClient({ ambiente: 'PROD', modo: 'real' })).toThrow();
  });
});
