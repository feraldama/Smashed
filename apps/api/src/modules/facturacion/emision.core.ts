import { TipoDocumentoFiscal } from '@prisma/client';
import {
  type Code100Client,
  type Code100ConsultaPayload,
  type Code100Credentials,
  type EstadoNormalizado,
  errorDeAlta,
  normalizarEstado,
} from '@smash/code100-client';

/**
 * Núcleo puro de la emisión (alta + poll), independiente de Prisma y del
 * proveedor concreto. Extraído de `emision.service` para que los providers
 * (CODE100, middleware) puedan reutilizarlo sin import circular.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Polling de estado (testeable con mock client)
// ─────────────────────────────────────────────────────────────────────────────

export interface PollDeps {
  client: Pick<Code100Client, 'consultarEstado'>;
  creds: Code100Credentials;
  consulta: Code100ConsultaPayload;
  /** Máximo de consultas antes de rendirse y dejar PENDIENTE. Default 8. */
  maxIntentos?: number;
  /** Delay entre consultas según el intento (0-based). Default backoff escalonado. */
  delayMs?: (intento: number) => number;
  /** Inyectable para tests. */
  sleep?: (ms: number) => Promise<void>;
}

const DELAY_ESCALONADO = [1_000, 2_000, 3_000, 5_000, 8_000, 10_000, 15_000, 15_000];

function delayPorDefecto(intento: number): number {
  return DELAY_ESCALONADO[Math.min(intento, DELAY_ESCALONADO.length - 1)] ?? 15_000;
}

function sleepReal(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Consulta el estado del documento hasta que SIFEN lo procese (aprobado/
 * rechazado/cancelado) o se agoten los intentos (queda PENDIENTE).
 */
export async function pollEstado(deps: PollDeps): Promise<EstadoNormalizado> {
  const maxIntentos = deps.maxIntentos ?? 8;
  const delayMs = deps.delayMs ?? delayPorDefecto;
  const sleep = deps.sleep ?? sleepReal;

  let ultimo: EstadoNormalizado = { estado: 'PENDIENTE', procesado: false };
  for (let intento = 0; intento < maxIntentos; intento++) {
    const res = await deps.client.consultarEstado(deps.creds, deps.consulta);
    ultimo = normalizarEstado(res);
    if (ultimo.procesado || ultimo.estado === 'CANCELADO') return ultimo;
    if (intento < maxIntentos - 1) await sleep(delayMs(intento));
  }
  return ultimo;
}

/** Intenta el alta. Devuelve el mensaje de error si fue rechazada, o null si OK. */
export async function intentarAlta(
  client: Pick<Code100Client, 'altaDocumento'>,
  creds: Code100Credentials,
  payload: Parameters<Code100Client['altaDocumento']>[1],
): Promise<string | null> {
  const res = await client.altaDocumento(creds, payload);
  return errorDeAlta(res);
}

/** Mapea el tipo de documento fiscal de Smash al código `iTiDE` de SIFEN. */
export function mapTipoDE(t: TipoDocumentoFiscal) {
  switch (t) {
    case TipoDocumentoFiscal.FACTURA:
      return '1' as const;
    case TipoDocumentoFiscal.AUTOFACTURA:
      return '4' as const;
    case TipoDocumentoFiscal.NOTA_CREDITO:
      return '5' as const;
    case TipoDocumentoFiscal.NOTA_DEBITO:
      return '6' as const;
    case TipoDocumentoFiscal.NOTA_REMISION:
      return '7' as const;
    default:
      return '1' as const;
  }
}
