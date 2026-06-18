import type { ComprobanteCode100Input } from '../code100.mapper.js';
import type { TipoDocumentoFiscal } from '@prisma/client';
import type { EstadoNormalizado } from '@smash/code100-client';

/**
 * Abstracción del proveedor de facturación electrónica.
 *
 * Permite que Smash emita a SIFEN a través de CODE100 (proveedor externo, ruta
 * por defecto en `main`) o del middleware propio (`sifen-middleware`), eligiendo
 * por configuración. El flujo de `procesarEmision` (persistencia, idempotencia,
 * eventos) es el mismo para ambos; sólo cambia el proveedor.
 */
export type ProveedorNombre = 'code100' | 'middleware';

/** Identificación de un documento para consultar su estado. */
export interface DocumentoIdent {
  establecimiento: string;
  puntoExpedicion: string;
  numero: number;
  tipoDocumento: TipoDocumentoFiscal;
  /** id del comprobante en Smash — referencia idempotente para el middleware. */
  referenciaExterna: string;
}

export interface FacturadorProvider {
  readonly nombre: ProveedorNombre;
  /**
   * Da de alta el documento. Devuelve el mensaje de error si fue RECHAZADO por
   * validación, o `null` si el alta fue aceptada. Lanza `MapeoError` si el
   * documento no se pudo construir (error permanente) y deja propagar errores
   * transitorios (red/5xx) para que el worker reintente.
   */
  darDeAlta(comp: ComprobanteCode100Input, referenciaExterna: string): Promise<string | null>;
  /** Consulta/poll del estado hasta resolución (o PENDIENTE si no se procesó). */
  consultar(ident: DocumentoIdent): Promise<EstadoNormalizado>;
}

/** Error PERMANENTE: el documento no se pudo construir → rechazo sin reintento. */
export class MapeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MapeoError';
  }
}
