/**
 * Mapeo `Comprobante` (dominio Smash) → payload de alta de CODE100.
 *
 * Es función pura y sin dependencia de Prisma en runtime (sólo tipos/enums),
 * para poder testearla con golden files contra los ejemplos JSON del proveedor.
 *
 * Reglas fiscales clave (ver DOC-FACTURA-CAMPOS):
 *  - Moneda siempre PYG (guaraníes, enteros) → sin tipo de cambio ni dTotalGs.
 *  - IVA incluido en el precio. Liquidación por ítem con redondeo half-up:
 *      tasa 10% → iva = round(dTotOpeItem / 11);  tasa 5% → iva = round(/21)
 *    misma fórmula que `calcularTotalesComprobante` en comprobante.service.
 *  - Consumidor final → receptor innominado (iTipIDRec=5, dNumIDRec="0",
 *    dNomRec="Sin Nombre").
 */

import type {
  CondicionVenta,
  MetodoPago,
  TasaIva,
  TipoContribuyente,
  TipoDocumentoFiscal,
} from '@prisma/client';
import type {
  Code100AltaPayload,
  Code100Detalle,
  Code100DocumentoAsociado,
  Code100FormaPago,
  Code100Subtotales,
  TipoDEValor,
} from '@smash/code100-client';

// ─────────────────────────────────────────────────────────────────────────────
//  Input estructural (subset del Comprobante de Prisma)
// ─────────────────────────────────────────────────────────────────────────────

export interface ItemCode100Input {
  codigo: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitario: bigint;
  descuentoUnitario: bigint;
  tasaIva: TasaIva;
  /** Total de la línea, neto de descuento, IVA incluido. */
  subtotal: bigint;
}

export interface PagoCode100Input {
  metodo: MetodoPago;
  monto: bigint;
}

export interface ComprobanteCode100Input {
  tipoDocumento: TipoDocumentoFiscal;
  establecimiento: string;
  puntoExpedicionCodigo: string;
  numero: number;
  fechaEmision: Date;
  condicionVenta: CondicionVenta;
  // Snapshot del receptor
  receptorTipoContribuyente: TipoContribuyente;
  receptorRuc: string | null;
  receptorDv: string | null;
  receptorDocumento: string | null;
  receptorRazonSocial: string;
  receptorEmail: string | null;
  receptorDireccion: string | null;
  items: ItemCode100Input[];
  pagos: PagoCode100Input[];
  /** Descuento global a nivel pedido (Gs.). Se prorratea entre los ítems. */
  totalDescuento: bigint;
  /** Recargo de delivery (Gs.). Se agrega como línea de servicio. */
  recargoDelivery: bigint;
  /** Total que paga el cliente (= suma de pagos). El DE debe reconciliar con esto. */
  total: bigint;
  /** Para NC/ND: documento original referenciado. */
  comprobanteOriginal?: { cdc: string | null; tipoDocumento: TipoDocumentoFiscal } | null;
}

export interface MapearOpciones {
  /** Motivo de emisión para NC/ND (iMotEmi). Default "1". */
  motivoEmisionNota?: string;
  /** Indicador de presencia (iIndPres). Default "1" (presencial). */
  indicadorPresencia?: string;
  /** Tasa de IVA del recargo de delivery. Default IVA_10 (servicio gravado). */
  tasaIvaDelivery?: TasaIva;
  /** Descripción de la línea de delivery. Default "Servicio de delivery". */
  descripcionDelivery?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mapeo principal
// ─────────────────────────────────────────────────────────────────────────────

export function mapearComprobanteACode100(
  comp: ComprobanteCode100Input,
  opts: MapearOpciones = {},
): Code100AltaPayload {
  const iTiDE = mapTipoDocumento(comp.tipoDocumento);
  const receptor = mapReceptor(comp);
  const esContado = comp.condicionVenta === 'CONTADO';

  // 1. Líneas internas: ítems del pedido + (si hay) línea de delivery.
  const lineas = construirLineas(comp, opts);
  // 2. Prorratear el descuento global entre las líneas afectables.
  prorratearDescuento(lineas, comp.totalDescuento);
  // 3. Detalles + subtotales a partir de las líneas ya con descuento aplicado.
  const detalles = lineas.map(mapDetalle);
  const subtotales = construirSubtotales(lineas, comp);

  const payload: Code100AltaPayload = {
    tipOpe: '1',
    iTiDE,
    dEst: pad(comp.establecimiento, 3),
    dPunExp: pad(comp.puntoExpedicionCodigo, 3),
    dNumDoc: pad(String(comp.numero), 7),
    dFeEmiDE: formatFechaHora(comp.fechaEmision),
    iTImp: '1', // IVA
    cMoneOpe: 'PYG',
    ...receptor,
    Detalles: detalles,
    Subtotales: [subtotales],
  };

  const esNota = iTiDE === '5' || iTiDE === '6';

  if (!esNota) {
    // Campos exclusivos de Factura — la spec de NC/ND no los incluye.
    payload.iTipTra = '1'; // Venta de mercadería
    payload.iIndPres = opts.indicadorPresencia ?? '1';
    payload.iCondOpe = esContado ? '1' : '2';
    if (esContado && comp.pagos.length > 0) {
      payload.FormaPago = comp.pagos.map(mapFormaPago);
    }
  } else {
    // NC/ND: motivo de emisión + documento asociado al original.
    payload.iMotEmi = opts.motivoEmisionNota ?? '1';
    const aso = mapDocumentoAsociado(comp.comprobanteOriginal);
    if (aso) payload.DocumentosAsociados = [aso];
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Líneas internas (ítems + delivery) con prorrateo del descuento global
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Línea del DE en construcción. `descGlobal` es la porción del descuento global
 * (a nivel pedido) asignada a esta línea; se resta del bruto para el neto.
 */
interface Linea {
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: bigint;
  descParticular: bigint; // descuento particular por unidad (dDescItem)
  tasaIva: TasaIva;
  bruto: bigint; // precioUnitario * cantidad
  neto: bigint; // bruto - descParticular*cantidad - descGlobal (lo que reconcilia)
  descGlobal: bigint; // porción del descuento global asignada a la línea
  /** false para la línea sintética de delivery (no recibe descuento global). */
  afectableDescuento: boolean;
}

function construirLineas(comp: ComprobanteCode100Input, opts: MapearOpciones): Linea[] {
  const lineas: Linea[] = comp.items.map((it, idx) => ({
    codigo: it.codigo ?? `ITEM-${idx + 1}`,
    descripcion: it.descripcion,
    cantidad: it.cantidad,
    precioUnitario: it.precioUnitario,
    descParticular: it.descuentoUnitario,
    tasaIva: it.tasaIva,
    bruto: it.precioUnitario * BigInt(it.cantidad),
    neto: it.subtotal, // ya neto del descuento particular
    descGlobal: 0n,
    afectableDescuento: true,
  }));

  // Línea de servicio de delivery (no recibe descuento global).
  if (comp.recargoDelivery > 0n) {
    lineas.push({
      codigo: 'DELIVERY',
      descripcion: opts.descripcionDelivery ?? 'Servicio de delivery',
      cantidad: 1,
      precioUnitario: comp.recargoDelivery,
      descParticular: 0n,
      tasaIva: opts.tasaIvaDelivery ?? 'IVA_10',
      bruto: comp.recargoDelivery,
      neto: comp.recargoDelivery,
      descGlobal: 0n,
      afectableDescuento: false,
    });
  }

  return lineas;
}

/**
 * Reparte el descuento global (a nivel pedido) entre las líneas afectables,
 * proporcional al neto de cada línea, en guaraníes enteros. El remanente por
 * redondeo se asigna a la línea de mayor neto para que la suma cuadre exacto.
 */
function prorratearDescuento(lineas: Linea[], totalDescuento: bigint): void {
  if (totalDescuento <= 0n) return;
  const afectables = lineas.filter((l) => l.afectableDescuento);
  const baseTotal = afectables.reduce((acc, l) => acc + l.neto, 0n);
  if (baseTotal <= 0n) return;

  let asignado = 0n;
  let mayor: Linea | null = null;
  for (const l of afectables) {
    const porcion = (totalDescuento * l.neto) / baseTotal; // floor (BigInt)
    l.descGlobal = porcion;
    l.neto -= porcion;
    asignado += porcion;
    if (!mayor || l.neto > mayor.neto) mayor = l;
  }
  // Remanente por redondeo → a la línea de mayor neto.
  const resto = totalDescuento - asignado;
  if (resto !== 0n && mayor) {
    mayor.descGlobal += resto;
    mayor.neto -= resto;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Detalles + IVA por línea
// ─────────────────────────────────────────────────────────────────────────────

interface IvaItem {
  iAfecIVA: string;
  dTasaIVA: string;
  dPropIVA: string;
  base: bigint;
  iva: bigint;
  exenta: bigint;
}

/** Liquidación de IVA de una línea (neta, IVA incluido). Igual que comprobante.service. */
function liquidarIva(tasaIva: TasaIva, totalLinea: bigint): IvaItem {
  if (tasaIva === 'IVA_10') {
    const iva = roundDiv(totalLinea, 11n);
    return {
      iAfecIVA: '1',
      dTasaIVA: '10',
      dPropIVA: '100',
      base: totalLinea - iva,
      iva,
      exenta: 0n,
    };
  }
  if (tasaIva === 'IVA_5') {
    const iva = roundDiv(totalLinea, 21n);
    return {
      iAfecIVA: '1',
      dTasaIVA: '5',
      dPropIVA: '100',
      base: totalLinea - iva,
      iva,
      exenta: 0n,
    };
  }
  // IVA_0 / EXENTO → exento (iAfecIVA=3).
  return { iAfecIVA: '3', dTasaIVA: '0', dPropIVA: '0', base: 0n, iva: 0n, exenta: totalLinea };
}

function mapDetalle(linea: Linea): Code100Detalle {
  const liq = liquidarIva(linea.tasaIva, linea.neto);

  const detalle: Code100Detalle = {
    dCodInt: linea.codigo,
    dDesProSer: linea.descripcion,
    cUniMed: '77', // Unidad
    dCantProSer: String(linea.cantidad),
    dPUniProSer: linea.precioUnitario.toString(),
    dTotBruOpeItem: linea.bruto.toString(),
    dTotOpeItem: linea.neto.toString(),
    iAfecIVA: liq.iAfecIVA,
    dPropIVA: liq.dPropIVA,
    dTasaIVA: liq.dTasaIVA,
    dBasGravIVA: liq.base.toString(),
    dLiqIVAItem: liq.iva.toString(),
    dBasExe: liq.exenta.toString(),
  };

  // Descuento particular por ítem (por unidad). Sólo si > 0.
  if (linea.descParticular > 0n) {
    detalle.dDescItem = linea.descParticular.toString();
    detalle.dPorcDesIt = porcentajeDescuento(linea.descParticular, linea.precioUnitario);
  }
  // Descuento global por ítem (prorrateado, por unidad).
  if (linea.descGlobal > 0n) {
    detalle.dDescGloItem = perUnit(linea.descGlobal, linea.cantidad);
  }

  return detalle;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Subtotales (agregados) + reconciliación
// ─────────────────────────────────────────────────────────────────────────────

function construirSubtotales(lineas: Linea[], comp: ComprobanteCode100Input): Code100Subtotales {
  let subExe = 0n; // exentas
  let sub5 = 0n;
  let sub10 = 0n;
  let baseGrav5 = 0n;
  let baseGrav10 = 0n;
  let iva5 = 0n;
  let iva10 = 0n;
  let totalDescParticular = 0n;
  let totalDescGlobal = 0n;

  for (const linea of lineas) {
    const liq = liquidarIva(linea.tasaIva, linea.neto);
    totalDescParticular += linea.descParticular * BigInt(linea.cantidad);
    totalDescGlobal += linea.descGlobal;
    if (linea.tasaIva === 'IVA_10') {
      sub10 += linea.neto;
      baseGrav10 += liq.base;
      iva10 += liq.iva;
    } else if (linea.tasaIva === 'IVA_5') {
      sub5 += linea.neto;
      baseGrav5 += liq.base;
      iva5 += liq.iva;
    } else {
      subExe += linea.neto;
    }
  }

  const totOpe = subExe + sub5 + sub10;
  const totIva = iva5 + iva10;
  const descTotal = totalDescParticular + totalDescGlobal;

  // dRedon absorbe el residual entre la suma de líneas y el total que paga el
  // cliente (redondeo del POS + remanentes de prorrateo). dTotGralOpe = total.
  const redon = totOpe - comp.total;

  // Self-check: el residual debe ser chico (redondeo). Si es grande, hay un bug
  // de modelado (ítems que no suman el total) — fallar acá con contexto claro.
  const tolerancia = BigInt(lineas.length + 2);
  if (redon < -tolerancia || redon > tolerancia) {
    throw new Error(
      `DE no reconcilia: suma de ítems (${totOpe}) vs total (${comp.total}), ` +
        `diferencia ${redon} Gs supera la tolerancia de redondeo`,
    );
  }

  return {
    dSubExe: subExe.toString(),
    dSubExo: '0',
    dSub5: sub5.toString(),
    dSub10: sub10.toString(),
    dTotOpe: totOpe.toString(),
    dTotDesc: totalDescParticular.toString(),
    dTotDescGlotem: totalDescGlobal.toString(),
    dTotAntItem: '0',
    dTotAnt: '0',
    dPorcDescTotal: '0',
    dDescTotal: descTotal.toString(),
    dAnticipo: '0',
    dRedon: redon.toString(),
    dTotGralOpe: comp.total.toString(), // = dTotOpe - dRedon
    dIVA5: iva5.toString(),
    dIVA10: iva10.toString(),
    dLiqTotIVA5: '0',
    dLiqTotIVA10: '0',
    dTotIVA: totIva.toString(),
    dBaseGrav5: baseGrav5.toString(),
    dBaseGrav10: baseGrav10.toString(),
    dTBasGraIVA: (baseGrav5 + baseGrav10).toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Receptor
// ─────────────────────────────────────────────────────────────────────────────

type ReceptorPayload = Pick<
  Code100AltaPayload,
  | 'iNatRec'
  | 'iTiOpe'
  | 'cPaisRec'
  | 'iTiContRec'
  | 'dRucRec'
  | 'dDVRec'
  | 'iTipIDRec'
  | 'dNumIDRec'
  | 'dNomRec'
  | 'dDirRec'
  | 'dEmailRec'
>;

function mapReceptor(comp: ComprobanteCode100Input): ReceptorPayload {
  const base: Partial<ReceptorPayload> = { cPaisRec: 'PRY' };
  if (comp.receptorEmail) base.dEmailRec = comp.receptorEmail;
  if (comp.receptorDireccion) base.dDirRec = comp.receptorDireccion;

  // Contribuyente con RUC → B2B.
  if (comp.receptorRuc && comp.receptorTipoContribuyente !== 'CONSUMIDOR_FINAL') {
    return {
      ...base,
      iNatRec: '1',
      iTiOpe: '1',
      iTiContRec: comp.receptorTipoContribuyente === 'PERSONA_JURIDICA' ? '2' : '1',
      dRucRec: comp.receptorRuc,
      dDVRec: comp.receptorDv ?? '0',
      dNomRec: comp.receptorRazonSocial,
    } as ReceptorPayload;
  }

  // No contribuyente con documento (CI / extranjero) → B2C nominado.
  if (comp.receptorDocumento && comp.receptorTipoContribuyente !== 'CONSUMIDOR_FINAL') {
    return {
      ...base,
      iNatRec: '2',
      iTiOpe: '2',
      iTipIDRec: comp.receptorTipoContribuyente === 'EXTRANJERO' ? '3' : '1', // 3=Cédula extranjera, 1=CI
      dNumIDRec: comp.receptorDocumento,
      dNomRec: comp.receptorRazonSocial,
    } as ReceptorPayload;
  }

  // Consumidor final / innominado.
  return {
    ...base,
    iNatRec: '2',
    iTiOpe: '2',
    iTipIDRec: '5',
    dNumIDRec: '0',
    dNomRec: 'Sin Nombre',
  } as ReceptorPayload;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Forma de pago / documento asociado
// ─────────────────────────────────────────────────────────────────────────────

function mapFormaPago(pago: PagoCode100Input): Code100FormaPago {
  return {
    iTiPago: mapMetodoPago(pago.metodo),
    dMonTiPag: pago.monto.toString(),
    cMoneTiPag: 'PYG',
  };
}

/** MetodoPago (Smash) → iTiPago (CODE100). */
function mapMetodoPago(metodo: MetodoPago): string {
  switch (metodo) {
    case 'EFECTIVO':
      return '1';
    case 'CHEQUE':
      return '2';
    case 'TRANSFERENCIA':
      return '5';
    case 'BANCARD':
    case 'DINELCO':
      // Procesadoras electrónicas. Usamos "Pago Electrónico" (21) para no tener
      // que informar los campos obligatorios de tarjeta (iDenTarj, etc.).
      return '21';
    default:
      return '99';
  }
}

function mapDocumentoAsociado(
  original: ComprobanteCode100Input['comprobanteOriginal'],
): Code100DocumentoAsociado | null {
  if (!original?.cdc) return null;
  return { iTipDocAso: '1', dCdCDERef: original.cdc };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mapTipoDocumento(t: TipoDocumentoFiscal): TipoDEValor {
  switch (t) {
    case 'FACTURA':
      return '1';
    case 'NOTA_CREDITO':
      return '5';
    case 'NOTA_DEBITO':
      return '6';
    // Autofactura (iTiDE=4) y Nota de Remisión (iTiDE=7) usan estructuras de
    // payload distintas (vendedor/transporte) que este mapper no arma todavía.
    // Se rechazan explícitamente para no enviar un documento mal formado.
    case 'AUTOFACTURA':
      throw new Error('Autofactura aún no soportada por la integración CODE100');
    case 'NOTA_REMISION':
      throw new Error('Nota de remisión aún no soportada por la integración CODE100');
    case 'TICKET':
    default:
      throw new Error(`tipoDocumento ${t} no es un documento electrónico SIFEN`);
  }
}

/** División entera con redondeo half-up — idéntica a comprobante.service. */
function roundDiv(num: bigint, denom: bigint): bigint {
  const q = num / denom;
  const r = num % denom;
  if (r * 2n >= denom) return q + 1n;
  return q;
}

/** Monto de una línea expresado por unidad, con hasta 8 decimales (sin floats). */
function perUnit(montoLinea: bigint, cantidad: number): string {
  if (cantidad <= 1) return montoLinea.toString();
  const escala = 100_000_000n;
  const valor = (montoLinea * escala) / BigInt(cantidad);
  const entero = valor / escala;
  const frac = (valor % escala).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${entero}.${frac}` : entero.toString();
}

/** Porcentaje de descuento sobre el precio unitario, con hasta 8 decimales. */
function porcentajeDescuento(descuento: bigint, precio: bigint): string {
  if (precio === 0n) return '0';
  // (descuento / precio) * 100 con precisión de 8 decimales, sin floats.
  const escala = 100_000_000n;
  const valor = (descuento * 100n * escala) / precio;
  const entero = valor / escala;
  const frac = (valor % escala).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${entero}.${frac}` : entero.toString();
}

function pad(valor: string, largo: number): string {
  return valor.padStart(largo, '0');
}

/**
 * Fecha de emisión en formato AAAA-MM-DDThh:mm:ss, en hora de Paraguay.
 * Usa Intl con timeZone fija para ser determinista sin importar el TZ del
 * proceso. El locale 'sv-SE' produce "AAAA-MM-DD hh:mm:ss".
 */
const FORMATO_FECHA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Asuncion',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function formatFechaHora(fecha: Date): string {
  return FORMATO_FECHA.format(fecha).replace(' ', 'T');
}
