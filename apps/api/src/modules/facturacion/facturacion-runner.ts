import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

import { type ProcesarEmisionResultado, procesarEmision } from './emision.service.js';
import { reconciliarPendientes } from './reconciliacion.service.js';

/**
 * Runner in-process de facturación electrónica (sin Redis/BullMQ).
 *
 * - `dispararEmision`: procesa un comprobante en segundo plano al emitirse,
 *   sin bloquear la respuesta HTTP.
 * - `iniciarReconciliacionPeriodica`: barrido cada N minutos que recupera los
 *   comprobantes varados (NO_ENVIADO/PENDIENTE) — cubre caídas a mitad de envío.
 *
 * Un `Set` de IDs en vuelo evita procesar el mismo comprobante dos veces en
 * paralelo (p.ej. disparo de emisión + barrido tocando el mismo documento).
 * La durabilidad la da Postgres: si el proceso muere, el barrido reanuda al
 * volver a arrancar. Para una instancia única de POS es suficiente.
 */

const enVuelo = new Set<string>();

/**
 * Procesa un comprobante con guard de concurrencia. Devuelve el resultado, o
 * null si ya estaba en proceso o si falló (el error queda logueado; el barrido
 * lo reintenta más tarde).
 */
export async function procesarConLock(
  comprobanteId: string,
): Promise<ProcesarEmisionResultado | null> {
  if (enVuelo.has(comprobanteId)) return null;
  enVuelo.add(comprobanteId);
  try {
    return await procesarEmision(comprobanteId);
  } catch (err) {
    logger.warn(
      { comprobanteId, err: err instanceof Error ? err.message : String(err) },
      'Emisión SIFEN no resuelta — se reintenta en el próximo barrido',
    );
    return null;
  } finally {
    enVuelo.delete(comprobanteId);
  }
}

/**
 * Dispara el envío de un comprobante en segundo plano (fire-and-forget).
 * No bloquea ni lanza: los errores se manejan dentro de `procesarConLock`.
 */
export function dispararEmision(comprobanteId: string): void {
  if (env.NODE_ENV === 'test') return; // los tests llaman a procesarEmision directo
  void procesarConLock(comprobanteId);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Barrido periódico de reconciliación
// ─────────────────────────────────────────────────────────────────────────────

const RECONCILIACION_INTERVAL_MS = 10 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let corriendo = false;

export function iniciarReconciliacionPeriodica(intervalMs = RECONCILIACION_INTERVAL_MS): void {
  if (env.NODE_ENV === 'test' || timer) return;
  timer = setInterval(() => {
    if (corriendo) return; // no solapar barridos
    corriendo = true;
    void reconciliarPendientes({ procesar: procesarConLock })
      .catch((err) =>
        logger.error(
          { err: err instanceof Error ? err.message : String(err) },
          'Barrido de reconciliación falló',
        ),
      )
      .finally(() => {
        corriendo = false;
      });
  }, intervalMs);
  // No mantener vivo el proceso sólo por este timer.
  timer.unref?.();
  logger.info({ intervalMinutos: intervalMs / 60_000 }, 'Reconciliación SIFEN periódica activa');
}

export function detenerReconciliacionPeriodica(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
