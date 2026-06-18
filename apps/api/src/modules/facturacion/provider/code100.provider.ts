import {
  type Code100Client,
  type Code100ConsultaPayload,
  type Code100Credentials,
  type EstadoNormalizado,
  tipoDocAbrev,
} from '@smash/code100-client';

import { type ComprobanteCode100Input, mapearComprobanteACode100 } from '../code100.mapper.js';
import { intentarAlta, mapTipoDE, pollEstado } from '../emision.core.js';

import { type DocumentoIdent, type FacturadorProvider, MapeoError } from './types.js';

/**
 * Proveedor CODE100 (FUTURA100). Envuelve el mapper + el cliente HTTP existente.
 * Es la ruta por defecto y la que vive en `main`.
 */
export class Code100Provider implements FacturadorProvider {
  readonly nombre = 'code100' as const;

  constructor(
    private readonly client: Code100Client,
    private readonly creds: Code100Credentials,
  ) {}

  async darDeAlta(comp: ComprobanteCode100Input): Promise<string | null> {
    let payload;
    try {
      payload = mapearComprobanteACode100(comp);
    } catch (err) {
      throw new MapeoError(err instanceof Error ? err.message : String(err));
    }
    // Errores transitorios (red) de intentarAlta propagan → reintento del worker.
    return intentarAlta(this.client, this.creds, payload);
  }

  async consultar(ident: DocumentoIdent): Promise<EstadoNormalizado> {
    const consulta: Code100ConsultaPayload = {
      dEst: ident.establecimiento,
      dPunExp: ident.puntoExpedicion,
      dNumDoc: String(ident.numero).padStart(7, '0'),
      tipoDoc: tipoDocAbrev(mapTipoDE(ident.tipoDocumento)),
    };
    return pollEstado({ client: this.client, creds: this.creds, consulta });
  }
}
