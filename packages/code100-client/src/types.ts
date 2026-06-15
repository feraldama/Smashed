/**
 * Tipos del middleware FUTURA100 de CODE100 para facturación electrónica (SIFEN Paraguay).
 *
 * Referencia: DOC-WEBSERVICE-FUTURA100-MIDDLEWARE-V.1.2 + DOC-*-CAMPOS.
 *
 * Convención de la API: TODOS los valores del payload viajan como `string`
 * (incluso numéricos y montos). Por eso los campos se tipan como `string`.
 * Los montos se envían como string decimal; en guaraníes (PYG) son enteros.
 */

export type Code100Ambiente = 'TEST' | 'PROD';

/** Credenciales por empresa — CODE100 autentica por RUC (multi-tenant). */
export interface Code100Credentials {
  /** RUC sin dígito verificador (hasta 8 chars). */
  ruc: string;
  password: string;
  /** Dominio base del middleware, ej. `https://webservice.futura100.com.py`. */
  dominio: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Operaciones (campo `tipOpe`)
// ─────────────────────────────────────────────────────────────────────────────

export const TipoOperacionApi = {
  ALTA: '1',
  CONSULTA_ESTADO: '2',
  OBTENER_XML: '3',
  OBTENER_KUDE: '4',
  EVENTO_CANCELACION: '5',
  EVENTO_INUTILIZACION: '6',
  EVENTO_NOMINACION: '7',
} as const;

/** Tipo de documento electrónico (campo `iTiDE`). */
export const TipoDE = {
  FACTURA: '1',
  AUTOFACTURA: '4',
  NOTA_CREDITO: '5',
  NOTA_DEBITO: '6',
  NOTA_REMISION: '7',
} as const;
export type TipoDEValor = (typeof TipoDE)[keyof typeof TipoDE];

/** Tipo de documento electrónico abreviado para consultas/eventos (`tipoDoc`). */
export type TipoDocAbrev = 'FE' | 'NCR' | 'NDE' | 'REM' | 'AUT';

// ─────────────────────────────────────────────────────────────────────────────
//  Sub-estructuras del documento (Detalles / FormaPago / Cuotas / Subtotales)
// ─────────────────────────────────────────────────────────────────────────────

/** Forma de pago (array `FormaPago`). */
export interface Code100FormaPago {
  /** 1=Efectivo 2=Cheque 3=Tarjeta créd. 4=Tarjeta déb. 5=Transf. 7=Billetera 21=Pago electrónico 99=Otro */
  iTiPago: string;
  /** Descripción — obligatorio sólo si iTiPago=99. */
  dDesTiPag?: string;
  dMonTiPag: string;
  cMoneTiPag: string;
  /** Obligatorio si la moneda es distinta a PYG. */
  dTiCamTiPag?: string;
  // Tarjeta (iTiPago 3 o 4)
  iDenTarj?: string;
  dRSProTar?: string;
  dRUCProtar?: string;
  dDVProtar?: string;
  iForProPa?: string;
  dCodAuOpe?: string;
  dNomTit?: string;
  dNumTarj?: string;
  // Cheque (iTiPago 2)
  dNumCheq?: string;
  dBcoEmi?: string;
}

/** Cuota (array `Cuotas`) — sólo crédito a cuotas. */
export interface Code100Cuota {
  cMoneCuo: string;
  dMonCuota: string;
  dVencCuo?: string;
}

/** Ítem del detalle (array `Detalles`). */
export interface Code100Detalle {
  /** Código interno del producto/servicio. */
  dCodInt: string;
  dDesProSer: string;
  /** Unidad de medida (77 = Unidad). */
  cUniMed: string;
  dCantProSer: string;
  /** Precio unitario con impuestos incluidos. */
  dPUniProSer: string;
  /** dPUniProSer * dCantProSer. */
  dTotBruOpeItem: string;
  /** Total operación por ítem (tras descuentos/anticipos). */
  dTotOpeItem: string;
  // Descuentos
  dDescItem?: string;
  dPorcDesIt?: string;
  dDescGloItem?: string;
  // IVA — obligatorio cuando iTImp != 2 (ISC)
  /** 1=Gravado 2=Exonerado 3=Exento 4=Gravado parcial. */
  iAfecIVA?: string;
  /** Proporción gravada (100, 50, ...). */
  dPropIVA?: string;
  /** 0 / 5 / 10. */
  dTasaIVA?: string;
  /** Base gravada del IVA por ítem. */
  dBasGravIVA?: string;
  /** Liquidación del IVA por ítem. */
  dLiqIVAItem?: string;
  /** Base exenta por ítem. */
  dBasExe?: string;
  // Opcionales varios
  dGtin?: string;
  dInfItem?: string;
  cPaisOrig?: string;
}

/** Subtotales y totales (array `Subtotales`, único elemento). */
export interface Code100Subtotales {
  dSubExe: string;
  dSubExo: string;
  dSub5: string;
  dSub10: string;
  dTotOpe: string;
  dTotDesc: string;
  dTotDescGlotem: string;
  dTotAntItem: string;
  dTotAnt: string;
  dPorcDescTotal: string;
  dDescTotal: string;
  dAnticipo: string;
  dRedon: string;
  dComi?: string;
  dTotGralOpe: string;
  dIVA5: string;
  dIVA10: string;
  dLiqTotIVA5: string;
  dLiqTotIVA10: string;
  dIVAComi?: string;
  dTotIVA: string;
  dBaseGrav5: string;
  dBaseGrav10: string;
  dTBasGraIVA: string;
  /** Total de la operación en guaraníes — obligatorio si la moneda != PYG. */
  dTotalGs?: string;
}

/** Documento asociado (array `DocumentosAsociados`) — para NC/ND. */
export interface Code100DocumentoAsociado {
  /** 1=Electrónico 2=Impreso. */
  iTipDocAso: string;
  /** CDC del documento referenciado (obligatorio si iTipDocAso=1). */
  dCdCDERef?: string;
  // Documento impreso (iTipDocAso=2)
  dNTimDI?: string;
  dEstDocAso?: string;
  dPExpDocAso?: string;
  dNumDocAso?: string;
  /** 1=Factura 2=NC 3=ND 4=Nota de remisión. */
  iTipoDocAso?: string;
  dFecEmiDI?: string;
  dNumComRet?: string;
  dNumResCF?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Payload de Alta (tipOpe=1) — Factura / NC / ND / Autofactura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Payload de alta para documentos basados en `Detalles` (FE/NC/ND/AUT).
 * La Nota de Remisión (iTiDE=7) usa otra estructura (`gCamItem`) — no cubierta acá.
 */
export interface Code100AltaPayload {
  tipOpe: string;
  iTiDE: TipoDEValor;
  dInfoEmi?: string | null;
  dInfoFisc?: string | null;
  dEst: string;
  dPunExp: string;
  dNumDoc: string;
  dSerieNum?: string | null;
  dFeEmiDE: string;
  /** Tipo de transacción (1=Venta de mercadería). */
  iTipTra?: string;
  /** Tipo de impuesto (1=IVA). */
  iTImp: string;
  /** Moneda ISO 4217 (PYG). */
  cMoneOpe: string;
  /** Condición del tipo de cambio (1=Global) — sólo si moneda != PYG. */
  dCondTiCam?: string;
  /** Tipo de cambio — sólo si moneda != PYG. */
  dTiCam?: string;
  // Receptor
  /** 1=Contribuyente 2=No contribuyente. */
  iNatRec: string;
  /** 1=B2B 2=B2C 3=B2G 4=B2F. */
  iTiOpe: string;
  cPaisRec: string;
  /** 1=Persona física 2=Persona jurídica — sólo si iNatRec=1. */
  iTiContRec?: string;
  dRucRec?: string;
  dDVRec?: string;
  /** Tipo de doc. del receptor (1=CI 5=Innominado ...) — sólo si iNatRec=2. */
  iTipIDRec?: string;
  dNumIDRec?: string;
  dNomRec: string;
  dNomFanRec?: string | null;
  dDirRec?: string;
  dNumCasRec?: string;
  cDepRec?: string;
  cDisRec?: string;
  cCiuRec?: string;
  dTelRec?: string;
  dCelRec?: string;
  dEmailRec?: string;
  dCodCliente?: string;
  /** 1=Presencial 2=Electrónica ... Sólo Factura (no aplica a NC/ND). */
  iIndPres?: string;
  /** Condición de operación 1=Contado 2=Crédito. Sólo Factura. */
  iCondOpe?: string;
  /** Crédito: 1=Plazo 2=Cuotas. */
  iCondCred?: string;
  dPlazoCre?: string | null;
  dInfAdic?: string | null;
  /** Motivo de emisión NC/ND (iMotEmi). */
  iMotEmi?: string;
  FormaPago?: Code100FormaPago[];
  Cuotas?: Code100Cuota[];
  Detalles: Code100Detalle[];
  Subtotales: Code100Subtotales[];
  DocumentosAsociados?: Code100DocumentoAsociado[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Payloads de consulta / obtención / eventos
// ─────────────────────────────────────────────────────────────────────────────

export interface Code100ConsultaPayload {
  dEst: string;
  dPunExp: string;
  dNumDoc: string;
  dSerieNum?: string;
  tipoDoc: TipoDocAbrev;
}

export interface Code100KudePayload extends Code100ConsultaPayload {
  /** true = formato ticket/cinta de papel. */
  ticket?: boolean;
}

export interface Code100CancelacionPayload {
  dEst: string;
  dPunExp: string;
  dNumDoc: string;
  mOtEve: string;
  tipoDoc: TipoDocAbrev;
}

export interface Code100InutilizacionPayload {
  dEst: string;
  dPunExp: string;
  dNumIn: string;
  dNumFin: string;
  mOtEve: string;
  tipoDoc: TipoDocAbrev;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Respuestas
// ─────────────────────────────────────────────────────────────────────────────

export interface Code100AuthResponse {
  token?: string;
  error?: string;
}

/** Respuesta de alta / eventos (tipOpe 1, 5, 6, 7). */
export interface Code100AltaResponse {
  status: 'success' | 'error';
  /**
   * En éxito es un string. En rechazo de validación puede venir como objeto
   * `{campo: mensaje}` o `{campo: [mensaje]}` (en `message` o en la raíz).
   */
  message?: string | Record<string, unknown>;
  [campo: string]: unknown;
}

/** Información del retorno de SIFEN dentro de la consulta de estado. */
export interface Code100Retorno {
  FechaRetorno?: string;
  CodRespuesta?: string;
  Protocolo?: string;
  Mensaje?: string;
}

export interface Code100EstadoDE {
  CDC?: string;
  FechaFirma?: string;
  FechaEnvio?: string;
  EnlaceQR?: string;
  Retorno?: Code100Retorno;
  Evento?: Code100EventoAplicado[];
}

export interface Code100EventoAplicado {
  tipo?: string;
  estado?: string;
  motivo?: string;
  detalle?: string;
  fecha_creacion?: string;
}

/** Respuesta de consulta de estado (tipOpe=2). */
export interface Code100ConsultaResponse {
  status: 'success' | 'error';
  message?: string;
  response?: {
    /** "Aprobado" | "Rechazado" | "XML firmado" | ... */
    Estado?: string;
    FechaRegistro?: string;
    DE?: Code100EstadoDE;
  };
}

/** Respuesta de obtener XML (tipOpe=3). */
export interface Code100XmlResponse {
  status: 'success' | 'error';
  message?: string;
  CDC?: string;
  /** XML firmado en base64. */
  xml?: string;
}

/** Respuesta de obtener KUDE (tipOpe=4). */
export interface Code100KudeResponse {
  status: 'success' | 'error';
  message?: string;
  CDC?: string;
  /** Representación gráfica (PDF) en base64. */
  kude?: string;
}
