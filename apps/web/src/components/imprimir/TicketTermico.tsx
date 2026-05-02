import { QRCodeSVG } from 'qrcode.react';

import type { ComprobanteDetalle } from '@/hooks/useComprobantes';

/**
 * Layout de ticket térmico 80mm.
 *
 * El CSS @page se setea en el layout de la página /imprimir para que la
 * impresión salga en formato 80mm × auto (ancho fijo, alto dinámico).
 *
 * Decisiones tipográficas:
 *  - Font monospace para alinear precios columnados
 *  - Tamaño 11px base — suficiente para impresoras térmicas 203 dpi
 *  - Líneas separadoras con caracteres ASCII (─) que renderizan bien en térmicas
 */
export function TicketTermico({ comp }: { comp: ComprobanteDetalle }) {
  const isFiscalSifen = Boolean(comp.cdc) && comp.estadoSifen !== 'NO_ENVIADO';

  return (
    <div
      className="ticket-print"
      style={{
        width: '76mm', // 80mm - 4mm de márgenes laterales
        margin: '0 auto',
        padding: '2mm',
        fontFamily: '"Courier New", "Courier", monospace',
        fontSize: '11px',
        lineHeight: 1.3,
        color: '#000',
        background: '#fff',
      }}
    >
      {/* Cabecera */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '13px', margin: 0 }}>
          {comp.empresa.razonSocial}
        </p>
        <p style={{ margin: 0 }}>
          RUC {comp.empresa.ruc}-{comp.empresa.dv}
        </p>
        {comp.empresa.direccion && <p style={{ margin: 0 }}>{comp.empresa.direccion}</p>}
        <p style={{ margin: 0 }}>Suc. {comp.sucursal.nombre}</p>
      </div>

      <Divider />

      {/* Datos del comprobante */}
      <div style={{ textAlign: 'center', marginBottom: '4px' }}>
        <p style={{ fontWeight: 'bold', fontSize: '12px', margin: 0 }}>
          {labelTipo(comp.tipoDocumento)}
        </p>
        <p style={{ fontSize: '13px', fontWeight: 'bold', margin: 0 }}>{comp.numeroDocumento}</p>
        <p style={{ fontSize: '10px', margin: 0 }}>Timbrado: {comp.timbrado.numero}</p>
        <p style={{ fontSize: '10px', margin: 0 }}>
          Vto. timbrado: {formatFechaCorta(comp.timbrado.fechaFinVigencia)}
        </p>
        <p style={{ margin: '2px 0' }}>Fecha: {formatFecha(comp.fechaEmision)}</p>
      </div>

      <Divider />

      {/* Receptor */}
      <div style={{ marginBottom: '4px' }}>
        <p style={{ margin: 0 }}>
          <strong>Cliente:</strong> {comp.receptorRazonSocial}
        </p>
        {comp.receptorRuc && (
          <p style={{ margin: 0 }}>
            RUC {comp.receptorRuc}-{comp.receptorDv}
          </p>
        )}
        {comp.receptorDocumento && <p style={{ margin: 0 }}>CI: {comp.receptorDocumento}</p>}
        <p style={{ margin: 0 }}>
          Cond. venta: {comp.condicionVenta === 'CONTADO' ? 'Contado' : 'Crédito'}
        </p>
      </div>

      <Divider />

      {/* Items */}
      <div style={{ marginBottom: '4px' }}>
        {comp.items.map((it) => (
          <div key={it.id} style={{ marginBottom: '3px' }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>{it.descripcion}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {it.cantidad} × {formatGsCorto(BigInt(it.precioUnitario))}
              </span>
              <span style={{ fontWeight: 'bold' }}>{formatGsCorto(BigInt(it.subtotal))}</span>
            </div>
          </div>
        ))}
      </div>

      <Divider />

      {/* Totales */}
      <div>
        {BigInt(comp.subtotalExentas) > 0n && (
          <Row label="Exento" value={formatGsCorto(BigInt(comp.subtotalExentas))} />
        )}
        {BigInt(comp.totalIva5) > 0n && (
          <>
            <Row label="Base IVA 5%" value={formatGsCorto(BigInt(comp.subtotalIva5))} />
            <Row label="IVA 5%" value={formatGsCorto(BigInt(comp.totalIva5))} />
          </>
        )}
        {BigInt(comp.totalIva10) > 0n && (
          <>
            <Row label="Base IVA 10%" value={formatGsCorto(BigInt(comp.subtotalIva10))} />
            <Row label="IVA 10%" value={formatGsCorto(BigInt(comp.totalIva10))} />
          </>
        )}
        <Row
          label="TOTAL"
          value={formatGsCorto(BigInt(comp.total))}
          style={{ fontWeight: 'bold', fontSize: '13px' }}
        />
      </div>

      <Divider />

      {/* Pagos */}
      <div style={{ marginBottom: '4px' }}>
        <p style={{ margin: 0, fontWeight: 'bold' }}>Pagos:</p>
        {comp.pagos.map((p) => (
          <Row key={p.id} label={labelMetodo(p.metodo)} value={formatGsCorto(BigInt(p.monto))} />
        ))}
      </div>

      {/* QR + CDC si es fiscal */}
      {isFiscalSifen && comp.qrUrl && comp.cdc && (
        <>
          <Divider />
          <div style={{ textAlign: 'center', marginTop: '6px' }}>
            <p style={{ fontSize: '9px', margin: '0 0 4px 0' }}>
              Consulte la validez de este documento en <strong>ekuatia.set.gov.py</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <QRCodeSVG value={comp.qrUrl} size={128} level="M" includeMargin />
            </div>
            <p style={{ fontSize: '8px', margin: '4px 0 0 0', wordBreak: 'break-all' }}>
              CDC: {comp.cdc}
            </p>
          </div>
        </>
      )}

      {/* Anulación */}
      {comp.estado === 'ANULADO' && (
        <>
          <Divider />
          <div
            style={{
              textAlign: 'center',
              border: '2px solid #000',
              padding: '4px',
              margin: '6px 0',
              fontWeight: 'bold',
            }}
          >
            *** ANULADO ***
            {comp.motivoAnulacion && (
              <p style={{ fontWeight: 'normal', fontSize: '10px', margin: '2px 0 0 0' }}>
                {comp.motivoAnulacion}
              </p>
            )}
          </div>
        </>
      )}

      <Divider />
      <p style={{ textAlign: 'center', fontSize: '10px', margin: '4px 0 0 0' }}>
        ¡Gracias por su compra!
      </p>
      <p style={{ textAlign: 'center', fontSize: '9px', margin: 0, color: '#555' }}>
        Atendido por: {comp.emitidoPor.nombreCompleto}
      </p>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        borderTop: '1px dashed #000',
        margin: '4px 0',
      }}
    />
  );
}

function Row({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', ...style }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function labelTipo(t: string): string {
  switch (t) {
    case 'TICKET':
      return 'TICKET';
    case 'FACTURA':
      return 'FACTURA ELECTRÓNICA';
    case 'NOTA_CREDITO':
      return 'NOTA DE CRÉDITO ELECTR.';
    case 'NOTA_DEBITO':
      return 'NOTA DE DÉBITO ELECTR.';
    case 'AUTOFACTURA':
      return 'AUTOFACTURA ELECTRÓNICA';
    case 'NOTA_REMISION':
      return 'NOTA DE REMISIÓN ELECTR.';
    default:
      return t;
  }
}

function labelMetodo(m: string): string {
  return m
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatGsCorto(n: bigint): string {
  return n.toLocaleString('es-PY');
}

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatFechaCorta(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
