/**
 * Cliente SIFEN — interface + implementación mock.
 *
 * Para producción, una implementación real haría llamadas SOAP/HTTP a:
 *   - test:  https://sifen-test.set.gov.py/de/ws/sync/
 *   - prod:  https://sifen.set.gov.py/de/ws/sync/
 *
 * Endpoints SOAP de DNIT:
 *   - siRecepDE          → envío individual síncrono
 *   - siRecepLoteDE      → envío en lote (asíncrono)
 *   - siResultRecepLoteDE → consulta resultado de lote
 *   - siRecepEvento      → eventos (cancelación, inutilización, conformidad)
 *   - siConsDE           → consulta DE por CDC
 *
 * Esta interface está pensada para ser reemplazable: el `MockSifenClient`
 * sirve para tests y desarrollo sin red. La implementación real
 * (RealSifenClient) se enchufa cuando hay cert real + autorización DNIT.
 */

import type { AmbienteSifen } from './types.js';

export type EstadoSifenRespuesta =
  | 'APROBADO'
  | 'APROBADO_CON_OBS'
  | 'RECHAZADO'
  | 'PENDIENTE'
  | 'CANCELADO'
  | 'INUTILIZADO';

export interface SifenError {
  codigo: string;
  mensaje: string;
}

export interface SifenResponse {
  /** true si la operación fue procesada por DNIT (independiente de aprobación). */
  procesado: boolean;
  estado: EstadoSifenRespuesta;
  /** Código de protocolo asignado por DNIT */
  protocolo?: string;
  fechaProceso: Date;
  cdc?: string;
  /** Mensaje principal de DNIT */
  mensaje: string;
  errores?: SifenError[];
  /** Raw XML de respuesta — se persiste en EventoSifen.xml_respuesta */
  xmlRespuesta: string;
}

export interface EnviarDeArgs {
  xmlFirmado: string;
  cdc: string;
}

export interface CancelarDeArgs {
  cdc: string;
  motivo: string;
  /** XML del evento ya firmado */
  xmlEvento: string;
}

export interface ConsultarDeArgs {
  cdc: string;
}

/**
 * Interface que toda implementación de cliente SIFEN debe cumplir.
 */
export interface SifenClient {
  /** Envío individual síncrono — siRecepDE */
  enviarDe(args: EnviarDeArgs): Promise<SifenResponse>;
  /** Consulta de estado por CDC — siConsDE */
  consultarDe(args: ConsultarDeArgs): Promise<SifenResponse>;
  /** Evento de cancelación — siRecepEvento */
  cancelarDe(args: CancelarDeArgs): Promise<SifenResponse>;
  /** Identificador del ambiente (TEST/PROD) — para logging y auditoría. */
  ambiente: AmbienteSifen;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MOCK CLIENT
// ═══════════════════════════════════════════════════════════════════════════

interface MockClientOptions {
  /** Forzar respuesta de rechazo en `enviarDe`. */
  forzarRechazo?: boolean;
  /** Forzar timeout (throw) en `enviarDe`. */
  forzarTimeout?: boolean;
  /** Latencia simulada en ms — útil para testear cargas. */
  latenciaMs?: number;
  /** Estado a devolver en consultas (default APROBADO si fue enviado, NO_ENVIADO si no). */
  estadoEnConsulta?: EstadoSifenRespuesta;
  ambiente?: AmbienteSifen;
}

/**
 * Mock con estado interno: recuerda qué CDCs fueron enviados y devuelve
 * respuestas coherentes en consultas posteriores.
 */
export class MockSifenClient implements SifenClient {
  ambiente: AmbienteSifen;
  private cdcsEnviados = new Map<string, SifenResponse>();
  private cdcsCancelados = new Set<string>();
  constructor(private readonly opts: MockClientOptions = {}) {
    this.ambiente = opts.ambiente ?? 'TEST';
  }

  async enviarDe(args: EnviarDeArgs): Promise<SifenResponse> {
    if (this.opts.latenciaMs) await sleep(this.opts.latenciaMs);
    if (this.opts.forzarTimeout) throw new Error('Timeout simulado');

    const ahora = new Date();
    const protocolo = `MOCK-${Date.now()}-${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, '0')}`;

    if (this.opts.forzarRechazo) {
      const respuesta: SifenResponse = {
        procesado: true,
        estado: 'RECHAZADO',
        protocolo,
        fechaProceso: ahora,
        cdc: args.cdc,
        mensaje: 'Rechazado por validación (mock)',
        errores: [{ codigo: '0500', mensaje: 'CDC inválido o duplicado' }],
        xmlRespuesta: buildXmlRespuestaMock({
          procesado: true,
          estado: 'RECHAZADO',
          protocolo,
          fechaProceso: ahora,
          cdc: args.cdc,
        }),
      };
      this.cdcsEnviados.set(args.cdc, respuesta);
      return respuesta;
    }

    const respuesta: SifenResponse = {
      procesado: true,
      estado: 'APROBADO',
      protocolo,
      fechaProceso: ahora,
      cdc: args.cdc,
      mensaje: 'Autorizado (mock)',
      xmlRespuesta: buildXmlRespuestaMock({
        procesado: true,
        estado: 'APROBADO',
        protocolo,
        fechaProceso: ahora,
        cdc: args.cdc,
      }),
    };
    this.cdcsEnviados.set(args.cdc, respuesta);
    return respuesta;
  }

  async consultarDe(args: ConsultarDeArgs): Promise<SifenResponse> {
    if (this.opts.latenciaMs) await sleep(this.opts.latenciaMs);

    if (this.cdcsCancelados.has(args.cdc)) {
      return {
        procesado: true,
        estado: 'CANCELADO',
        cdc: args.cdc,
        fechaProceso: new Date(),
        mensaje: 'Documento cancelado (mock)',
        xmlRespuesta: '',
      };
    }

    const previa = this.cdcsEnviados.get(args.cdc);
    if (previa) return previa;

    return {
      procesado: false,
      estado: 'PENDIENTE',
      cdc: args.cdc,
      fechaProceso: new Date(),
      mensaje: 'Documento no encontrado en SIFEN (mock)',
      xmlRespuesta: '',
    };
  }

  async cancelarDe(args: CancelarDeArgs): Promise<SifenResponse> {
    if (this.opts.latenciaMs) await sleep(this.opts.latenciaMs);

    const enviado = this.cdcsEnviados.get(args.cdc);
    if (!enviado || enviado.estado !== 'APROBADO') {
      return {
        procesado: true,
        estado: 'RECHAZADO',
        cdc: args.cdc,
        fechaProceso: new Date(),
        mensaje: 'No se puede cancelar — DE no aprobado (mock)',
        errores: [{ codigo: '4001', mensaje: 'Documento no fue aprobado previamente' }],
        xmlRespuesta: '',
      };
    }

    this.cdcsCancelados.add(args.cdc);
    const ahora = new Date();
    const protocolo = `MOCK-CANC-${Date.now()}`;

    return {
      procesado: true,
      estado: 'CANCELADO',
      protocolo,
      fechaProceso: ahora,
      cdc: args.cdc,
      mensaje: 'Cancelación registrada (mock)',
      xmlRespuesta: buildXmlRespuestaMock({
        procesado: true,
        estado: 'CANCELADO',
        protocolo,
        fechaProceso: ahora,
        cdc: args.cdc,
      }),
    };
  }

  /** Helper de tests: limpiar estado interno del mock. */
  reset() {
    this.cdcsEnviados.clear();
    this.cdcsCancelados.clear();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  REAL CLIENT (placeholder — requiere cert + credenciales DNIT)
// ═══════════════════════════════════════════════════════════════════════════

interface RealClientOptions {
  ambiente: AmbienteSifen;
  /** Buffer del cert .p12 para mTLS contra DNIT */
  p12Bytes: Buffer;
  p12Password: string;
  /** Timeout en ms para llamadas SOAP — default 30s */
  timeoutMs?: number;
}

/**
 * Implementación real para producción.
 *
 * NO IMPLEMENTADO en este checkpoint — la integración real con SIFEN requiere:
 *   1. Certificado X.509 emitido por una CA paraguaya reconocida
 *   2. Habilitación del RUC en SIFEN (test y prod son separados)
 *   3. mTLS contra los endpoints DNIT (axios + https.Agent con .p12)
 *   4. Construcción del envelope SOAP correcto (xml-soap o construcción manual)
 *
 * Estructura preparada para que enchufar la implementación real sea trivial:
 *   - Cambiar `factory` para que devuelva `RealSifenClient` cuando ambiente y cert estén listos
 *   - Implementar los métodos abajo replicando la interface
 */
export class RealSifenClient implements SifenClient {
  ambiente: AmbienteSifen;
   
  constructor(_opts: RealClientOptions) {
    this.ambiente = _opts.ambiente;
    throw new Error(
      'RealSifenClient no implementado en Fase 4.3. Usar MockSifenClient hasta tener cert real DNIT.',
    );
  }
  enviarDe(): Promise<SifenResponse> {
    throw new Error('NOT_IMPLEMENTED');
  }
  consultarDe(): Promise<SifenResponse> {
    throw new Error('NOT_IMPLEMENTED');
  }
  cancelarDe(): Promise<SifenResponse> {
    throw new Error('NOT_IMPLEMENTED');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FACTORY
// ═══════════════════════════════════════════════════════════════════════════

export function createSifenClient(opts: {
  ambiente: AmbienteSifen;
  modo?: 'mock' | 'real';
  p12Bytes?: Buffer;
  p12Password?: string;
}): SifenClient {
  const modo = opts.modo ?? 'mock';
  if (modo === 'real') {
    if (!opts.p12Bytes || !opts.p12Password) {
      throw new Error('Real SIFEN client requiere p12Bytes y p12Password');
    }
    return new RealSifenClient({
      ambiente: opts.ambiente,
      p12Bytes: opts.p12Bytes,
      p12Password: opts.p12Password,
    });
  }
  return new MockSifenClient({ ambiente: opts.ambiente });
}

// ═══════════════════════════════════════════════════════════════════════════
//  helpers
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function buildXmlRespuestaMock(args: {
  procesado: boolean;
  estado: EstadoSifenRespuesta;
  protocolo?: string;
  fechaProceso: Date;
  cdc: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rResEnviDe xmlns="http://ekuatia.set.gov.py/sifen/xsd">
  <dFecProc>${args.fechaProceso.toISOString()}</dFecProc>
  <dCodRes>${args.estado === 'APROBADO' ? '0260' : args.estado === 'CANCELADO' ? '0420' : '0500'}</dCodRes>
  <dMsgRes>${args.estado}</dMsgRes>
  ${args.protocolo ? `<dProtAut>${args.protocolo}</dProtAut>` : ''}
  <dCdC>${args.cdc}</dCdC>
</rResEnviDe>`;
}
