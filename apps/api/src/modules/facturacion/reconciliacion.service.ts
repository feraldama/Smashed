import { EstadoComprobante, EstadoSifen, TipoDocumentoFiscal } from '@prisma/client';

import { logger } from '../../config/logger.js';
import { prisma } from '../../lib/prisma.js';

import { type ProcesarEmisionResultado, procesarEmision } from './emision.service.js';

/**
 * Barrido de reconciliación: reintenta documentos que quedaron sin resolver.
 *
 * Cubre dos huecos del flujo normal:
 *  - NO_ENVIADO: el encolado falló (Redis caído al emitir) y nunca se procesó.
 *  - PENDIENTE: el alta entró pero SIFEN aún no había aprobado/rechazado cuando
 *    se agotaron los reintentos del job; hay que volver a consultar.
 *
 * Procesa cada comprobante con `procesarEmision` (idempotente: PENDIENTE sólo
 * consulta, no re-da de alta), aislando errores por documento.
 */

export interface ReconciliacionOpts {
  /** Máximo de comprobantes por corrida. Default 50. */
  limite?: number;
  /** Antigüedad mínima (minutos) para considerarlo "varado". Default 10. */
  antiguedadMinutos?: number;
  /**
   * Procesador a usar por comprobante. Default `procesarEmision`. El runner
   * inyecta una versión con guard de concurrencia. Devuelve null si se omitió.
   */
  procesar?: (comprobanteId: string) => Promise<ProcesarEmisionResultado | null>;
}

export interface ReconciliacionResultado {
  revisados: number;
  aprobados: number;
  rechazados: number;
  pendientes: number;
  errores: number;
}

export async function reconciliarPendientes(
  opts: ReconciliacionOpts = {},
): Promise<ReconciliacionResultado> {
  const limite = opts.limite ?? 50;
  const antiguedadMs = (opts.antiguedadMinutos ?? 10) * 60 * 1000;
  const corte = new Date(Date.now() - antiguedadMs);
  const procesar = opts.procesar ?? procesarEmision;

  const candidatos = await prisma.comprobante.findMany({
    where: {
      deletedAt: null,
      estado: { not: EstadoComprobante.ANULADO },
      tipoDocumento: { not: TipoDocumentoFiscal.TICKET },
      estadoSifen: { in: [EstadoSifen.NO_ENVIADO, EstadoSifen.PENDIENTE] },
      createdAt: { lt: corte },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: limite,
  });

  const res: ReconciliacionResultado = {
    revisados: candidatos.length,
    aprobados: 0,
    rechazados: 0,
    pendientes: 0,
    errores: 0,
  };
  if (candidatos.length === 0) return res;

  logger.info({ candidatos: candidatos.length }, 'Reconciliación SIFEN: comprobantes varados');

  for (const { id } of candidatos) {
    try {
      const r = await procesar(id);
      if (!r)
        res.errores += 1; // omitido (en vuelo) o falló — se reintenta luego
      else if (r.estadoSifen === EstadoSifen.APROBADO) res.aprobados += 1;
      else if (r.estadoSifen === EstadoSifen.RECHAZADO) res.rechazados += 1;
      else res.pendientes += 1;
    } catch (err) {
      // EmisionPendienteError u otros: sigue varado, se reintenta en la próxima corrida.
      res.errores += 1;
      logger.warn(
        { comprobanteId: id, err: err instanceof Error ? err.message : String(err) },
        'Reconciliación: comprobante sigue sin resolverse',
      );
    }
  }

  logger.info({ ...res }, 'Reconciliación SIFEN completada');
  return res;
}
