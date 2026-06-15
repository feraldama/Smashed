/**
 * Normalización de la respuesta de consulta de estado (tipOpe=2) a un estado
 * canónico que el worker/servicio usa para decidir el flujo de polling.
 */

import { TipoDE } from './types.js';

import type {
  Code100AltaResponse,
  Code100ConsultaResponse,
  TipoDEValor,
  TipoDocAbrev,
} from './types.js';

export type EstadoCanonico = 'APROBADO' | 'RECHAZADO' | 'CANCELADO' | 'PENDIENTE' | 'NO_ENCONTRADO';

export interface EstadoNormalizado {
  estado: EstadoCanonico;
  cdc?: string;
  enlaceQr?: string;
  protocolo?: string;
  codRespuesta?: string;
  mensaje?: string;
  /** true si SIFEN ya procesó el documento (aprobado o rechazado). */
  procesado: boolean;
}

/** Interpreta la respuesta cruda de consultarEstado en un estado canónico. */
export function normalizarEstado(res: Code100ConsultaResponse): EstadoNormalizado {
  if (res.status === 'error') {
    return { estado: 'NO_ENCONTRADO', procesado: false, mensaje: res.message };
  }

  const de = res.response?.DE;
  const retorno = de?.Retorno;
  const estadoTexto = (res.response?.Estado ?? '').toLowerCase();
  const base = {
    cdc: de?.CDC,
    enlaceQr: de?.EnlaceQR,
    protocolo: retorno?.Protocolo,
    codRespuesta: retorno?.CodRespuesta,
    mensaje: retorno?.Mensaje ?? res.message,
  };

  // Si hay un evento de cancelación aprobado, el documento quedó cancelado.
  const cancelado = de?.Evento?.some(
    (e) => (e.tipo ?? '').toUpperCase() === 'ECAN' && (e.estado ?? '').toLowerCase() === 'aprobado',
  );
  if (cancelado) return { ...base, estado: 'CANCELADO', procesado: true };

  if (estadoTexto.includes('aprobado')) return { ...base, estado: 'APROBADO', procesado: true };
  if (estadoTexto.includes('rechazado')) return { ...base, estado: 'RECHAZADO', procesado: true };

  // "XML firmado" u otros estados intermedios → todavía no procesado por SIFEN.
  return { ...base, estado: 'PENDIENTE', procesado: false };
}

/** Normaliza la respuesta de alta/eventos a un mensaje de error legible (o null si OK). */
export function errorDeAlta(res: Code100AltaResponse): string | null {
  if (res.status === 'success') return null;
  if (typeof res.message === 'string') return res.message;
  // Rechazo de validación: objeto {campo: msg} o {campo: [msg]} (puede venir en message o en la raíz).
  const fuente =
    res.message && typeof res.message === 'object' ? res.message : (res as Record<string, unknown>);
  const partes: string[] = [];
  for (const [campo, valor] of Object.entries(fuente)) {
    if (campo === 'status' || campo === 'message') continue;
    const txt = Array.isArray(valor) ? valor.join(', ') : String(valor);
    partes.push(`${campo}: ${txt}`);
  }
  return partes.length ? partes.join(' | ') : 'Error desconocido del proveedor';
}

/** Mapea el tipo de DE numérico (iTiDE) a la abreviatura usada en consultas/eventos. */
export function tipoDocAbrev(iTiDE: TipoDEValor): TipoDocAbrev {
  switch (iTiDE) {
    case TipoDE.FACTURA:
      return 'FE';
    case TipoDE.NOTA_CREDITO:
      return 'NCR';
    case TipoDE.NOTA_DEBITO:
      return 'NDE';
    case TipoDE.NOTA_REMISION:
      return 'REM';
    case TipoDE.AUTOFACTURA:
      return 'AUT';
    default:
      return 'FE';
  }
}
