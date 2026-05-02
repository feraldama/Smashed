/**
 * Tipos del Documento Electrónico (DE) para SIFEN/DNIT Paraguay.
 *
 * Cubre los campos obligatorios del Manual Técnico DNIT.
 * Los campos opcionales adicionales (transporte, autofactura, autoriz. judicial, etc.)
 * se agregan por extensión cuando hagan falta.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Enums
// ═══════════════════════════════════════════════════════════════════════════

export type AmbienteSifen = 'TEST' | 'PROD';

export type TipoDocumentoSifen =
  | 1 // Factura electrónica
  | 4 // Autofactura electrónica
  | 5 // Nota de crédito electrónica
  | 6 // Nota de débito electrónica
  | 7; // Nota de remisión electrónica

export type TipoEmisionSifen = 1 | 2; // 1 = Normal, 2 = Contingencia

export type TipoTransaccionSifen =
  | 1 // Venta de mercadería
  | 2 // Prestación de servicios
  | 3 // Mixto
  | 4 // Venta de activo fijo
  | 5 // Venta de divisas
  | 6 // Compra de divisas
  | 7 // Promoción o entrega de muestras
  | 8 // Donación
  | 9 // Anticipo
  | 10 // Compensación
  | 11 // Diferimiento
  | 12 // Pago anticipado
  | 13; // Reembolso

export type CondicionVentaSifen = 1 | 2; // 1 = Contado, 2 = Crédito

export type TipoContribuyente =
  | 1 // Persona física
  | 2; // Persona jurídica

export type TipoOperacion =
  | 1 // B2B (contribuyente con RUC)
  | 2 // B2C (consumidor final con CI)
  | 3 // B2G (gobierno)
  | 4; // B2F (extranjero)

export type CodigoPais = string; // ISO 3166-1 alpha-2 con prefijo: 'PRY', etc.

export type TasaIvaSifen = 0 | 5 | 10;

export type IndicadorPresencia =
  | 1 // Presencial
  | 2 // No presencial
  | 3 // Telemarketing
  | 4 // Domicilio
  | 5 // Telecomunicaciones
  | 6 // Distribución automática
  | 9; // Otro

// ═══════════════════════════════════════════════════════════════════════════
//  Estructuras
// ═══════════════════════════════════════════════════════════════════════════

export interface EmisorSifen {
  ruc: string; // sin DV
  dv: string; // 1 dígito
  razonSocial: string;
  nombreFantasia?: string;
  direccion: string;
  numeroCasa?: string;
  ciudad: string; // descripción ciudad
  ciudadCodigo?: string; // código DGEEC
  distrito?: string;
  departamento?: string;
  telefono?: string;
  email?: string;
  tipoContribuyente: TipoContribuyente;
  tipoRegimen?: number; // 1 = General
  // Datos del establecimiento (puede haber múltiples; usamos el del comprobante)
  establecimiento: string; // 3 chars
  puntoExpedicion: string; // 3 chars
  actividadEconomica?: { codigo: string; descripcion: string };
}

export interface ReceptorSifen {
  /** B2B con RUC, B2C con CI, B2F con doc extranjero */
  tipoOperacion: TipoOperacion;
  /** Sólo si tipoOperacion=1 (B2B) */
  ruc?: string;
  dv?: string;
  /** Tipo de contribuyente — 1 PF, 2 PJ */
  tipoContribuyente?: TipoContribuyente;
  /** Para consumidor final / extranjero */
  documento?: string;
  tipoDocumento?: number; // 1=CI, 2=Pasaporte, 3=Cédula extranjera, ...
  razonSocial: string;
  nombreFantasia?: string;
  direccion?: string;
  ciudad?: string;
  pais?: CodigoPais; // 'PRY' por default
  email?: string;
  telefono?: string;
}

export interface ItemDE {
  codigo: string;
  descripcion: string;
  /** Código de unidad SIFEN (77 = Unidad, etc.) */
  unidadMedida: number;
  cantidad: number;
  precioUnitario: bigint; // guaraníes
  /** Si hay descuento por item */
  descuento?: bigint;
  /** Tasa IVA aplicable */
  tasaIva: TasaIvaSifen;
  /** Si la operación es exenta o gravada parcialmente */
  proporcionGravada?: number; // 0-100, default 100
}

export interface CondicionPago {
  metodo: number; // 1=Efectivo, 2=Cheque, 3=Tarjeta crédito, 4=Tarjeta débito, etc.
  monto: bigint;
  moneda?: string; // PYG default
  /** Para tarjetas: nombre titular, últimos 4, autorización */
  detalleTarjeta?: {
    tipo?: string;
    autorizacion?: string;
    titular?: string;
    rucProcesador?: string;
    nombreProcesador?: string;
  };
}

export interface ComprobanteAsociadoSifen {
  /** Para notas de crédito/débito que referencian a otra factura */
  cdc?: string; // CDC del original
  formato?: 1 | 2 | 3; // 1=Electrónico, 2=Impreso, 3=Constancia electrónica
  // Si es impreso:
  numeroTimbrado?: string;
  numeroDocumento?: string;
  fechaEmisionOriginal?: Date;
}

export interface DocumentoElectronicoInput {
  // Identificación
  tipoDocumento: TipoDocumentoSifen;
  numeroDocumento: number; // correlativo (sin formato 001-001-)
  fechaEmision: Date;
  tipoEmision: TipoEmisionSifen;
  /** Código de seguridad de 9 dígitos (random) */
  codigoSeguridad: string;

  // Operación
  tipoTransaccion: TipoTransaccionSifen;
  condicionVenta: CondicionVentaSifen;
  tipoOperacion: TipoOperacion;
  indicadorPresencia: IndicadorPresencia;
  moneda?: string; // PYG default

  // Partes
  emisor: EmisorSifen;
  receptor: ReceptorSifen;

  // Items y montos
  items: ItemDE[];
  condicionPago?: CondicionPago[];

  // Para notas de crédito/débito
  motivoEmision?: number; // código DNIT
  comprobanteAsociado?: ComprobanteAsociadoSifen;

  // Otros
  observaciones?: string;
}

/** Resultado de generación: XML + CDC + QR URL listos para firmar y enviar. */
export interface DocumentoElectronicoResult {
  cdc: string;
  xml: string;
  qrUrl: string;
}
