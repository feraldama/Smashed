import { QRCodeSVG } from 'qrcode.react';

import type { ComprobanteDetalle } from '@/hooks/useComprobantes';

/**
 * Layout de factura A4 — formato KuDE (Representación Gráfica del DE) según SIFEN.
 *
 * Estructura típica del KuDE de DNIT:
 *  - Cabecera con datos del emisor (logo, RUC, dirección)
 *  - Bloque del comprobante (tipo, número, fecha, timbrado, CDC)
 *  - Bloque del receptor
 *  - Tabla de items con IVA discriminado
 *  - Totales con desglose por tasa
 *  - QR + leyenda de validación SIFEN
 */
export function FacturaA4({ comp }: { comp: ComprobanteDetalle }) {
  const isFiscalSifen = Boolean(comp.cdc) && comp.estadoSifen !== 'NO_ENVIADO';

  return (
    <div
      className="factura-print"
      style={{
        width: '210mm',
        minHeight: '297mm',
        margin: '0 auto',
        padding: '15mm',
        fontFamily: '"Arial", "Helvetica", sans-serif',
        fontSize: '10pt',
        color: '#000',
        background: '#fff',
        boxSizing: 'border-box',
      }}
    >
      {/* Cabecera: emisor (izq) + datos del comprobante (der) */}
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10mm',
          paddingBottom: '5mm',
          borderBottom: '2px solid #000',
        }}
      >
        <div>
          <h1 style={{ fontSize: '16pt', fontWeight: 'bold', margin: 0 }}>
            {comp.empresa.razonSocial}
          </h1>
          <p style={{ margin: '2mm 0 1mm 0', fontWeight: 'bold' }}>
            RUC {comp.empresa.ruc}-{comp.empresa.dv}
          </p>
          {comp.empresa.direccion && <p style={{ margin: 0 }}>{comp.empresa.direccion}</p>}
          <p style={{ margin: 0 }}>
            <strong>Sucursal:</strong> {comp.sucursal.nombre}
          </p>
          <p style={{ margin: 0 }}>{comp.sucursal.direccion}</p>
        </div>

        <div
          style={{
            border: '1px solid #000',
            padding: '3mm',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontSize: '10pt',
              fontWeight: 'bold',
              margin: 0,
              borderBottom: '1px solid #000',
              paddingBottom: '2mm',
              marginBottom: '2mm',
            }}
          >
            {labelTipo(comp.tipoDocumento)}
          </p>
          <p style={{ fontSize: '14pt', fontWeight: 'bold', margin: '2mm 0' }}>
            N° {comp.numeroDocumento}
          </p>
          <p style={{ margin: 0, fontSize: '9pt' }}>
            Timbrado: <strong>{comp.timbrado.numero}</strong>
          </p>
          <p style={{ margin: 0, fontSize: '9pt' }}>
            Vigente hasta: {formatFechaCorta(comp.timbrado.fechaFinVigencia)}
          </p>
          <p style={{ margin: '2mm 0 0 0', fontSize: '9pt' }}>
            <strong>Fecha emisión:</strong> {formatFecha(comp.fechaEmision)}
          </p>
          <p style={{ margin: 0, fontSize: '9pt' }}>
            Condición: {comp.condicionVenta === 'CONTADO' ? 'Contado' : 'Crédito'}
          </p>
        </div>
      </header>

      {/* Receptor */}
      <section
        style={{
          padding: '4mm 0',
          borderBottom: '1px solid #999',
        }}
      >
        <h2
          style={{
            fontSize: '9pt',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            margin: '0 0 2mm 0',
            color: '#666',
          }}
        >
          Datos del receptor
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '4mm' }}>
          <div>
            <p style={{ margin: 0, fontSize: '8pt', color: '#666' }}>Razón social</p>
            <p style={{ margin: 0, fontWeight: 'bold' }}>{comp.receptorRazonSocial}</p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '8pt', color: '#666' }}>RUC / Documento</p>
            <p style={{ margin: 0 }}>
              {comp.receptorRuc
                ? `${comp.receptorRuc}-${comp.receptorDv}`
                : (comp.receptorDocumento ?? '—')}
            </p>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: '8pt', color: '#666' }}>Email</p>
            <p style={{ margin: 0 }}>{comp.receptorEmail ?? '—'}</p>
          </div>
        </div>
      </section>

      {/* Items */}
      <section style={{ marginTop: '4mm' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
          <thead>
            <tr style={{ background: '#eee', borderBottom: '1px solid #000' }}>
              <th style={{ padding: '2mm', textAlign: 'left', fontSize: '8pt' }}>Cód.</th>
              <th style={{ padding: '2mm', textAlign: 'left', fontSize: '8pt' }}>Descripción</th>
              <th style={{ padding: '2mm', textAlign: 'right', fontSize: '8pt' }}>Cant.</th>
              <th style={{ padding: '2mm', textAlign: 'right', fontSize: '8pt' }}>P. Unit.</th>
              <th style={{ padding: '2mm', textAlign: 'center', fontSize: '8pt' }}>IVA</th>
              <th style={{ padding: '2mm', textAlign: 'right', fontSize: '8pt' }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {comp.items.map((it) => (
              <tr key={it.id} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '1.5mm 2mm' }}>{it.codigo ?? '—'}</td>
                <td style={{ padding: '1.5mm 2mm' }}>{it.descripcion}</td>
                <td style={{ padding: '1.5mm 2mm', textAlign: 'right' }}>{it.cantidad}</td>
                <td style={{ padding: '1.5mm 2mm', textAlign: 'right' }}>
                  {formatGs(BigInt(it.precioUnitario))}
                </td>
                <td style={{ padding: '1.5mm 2mm', textAlign: 'center' }}>
                  {labelIva(it.tasaIva)}
                </td>
                <td style={{ padding: '1.5mm 2mm', textAlign: 'right', fontWeight: 'bold' }}>
                  {formatGs(BigInt(it.subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totales + Pagos */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '5mm',
          marginTop: '5mm',
        }}
      >
        <div>
          <h3 style={{ fontSize: '9pt', fontWeight: 'bold', margin: '0 0 2mm 0' }}>
            Forma de pago
          </h3>
          <table style={{ width: '100%', fontSize: '9pt' }}>
            <tbody>
              {comp.pagos.map((p) => (
                <tr key={p.id}>
                  <td>{labelMetodo(p.metodo)}</td>
                  <td style={{ textAlign: 'right' }}>{formatGs(BigInt(p.monto))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          style={{
            border: '1px solid #000',
            padding: '3mm',
          }}
        >
          {BigInt(comp.subtotalExentas) > 0n && (
            <TotalRow label="Total Exentas" value={comp.subtotalExentas} />
          )}
          {BigInt(comp.subtotalIva5) > 0n && (
            <TotalRow label="Total Gravado IVA 5%" value={comp.subtotalIva5} />
          )}
          {BigInt(comp.subtotalIva10) > 0n && (
            <TotalRow label="Total Gravado IVA 10%" value={comp.subtotalIva10} />
          )}
          {BigInt(comp.totalIva5) > 0n && (
            <TotalRow label="Liquidación IVA 5%" value={comp.totalIva5} />
          )}
          {BigInt(comp.totalIva10) > 0n && (
            <TotalRow label="Liquidación IVA 10%" value={comp.totalIva10} />
          )}
          <hr style={{ margin: '2mm 0', border: 'none', borderTop: '1px solid #000' }} />
          <TotalRow
            label="TOTAL"
            value={comp.total}
            style={{ fontWeight: 'bold', fontSize: '11pt' }}
          />
        </div>
      </section>

      {/* QR SIFEN */}
      {isFiscalSifen && comp.qrUrl && comp.cdc && (
        <section
          style={{
            marginTop: '6mm',
            paddingTop: '4mm',
            borderTop: '1px solid #000',
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '5mm',
            alignItems: 'center',
          }}
        >
          <QRCodeSVG value={comp.qrUrl} size={120} level="M" includeMargin />
          <div style={{ fontSize: '9pt' }}>
            <p style={{ margin: 0, fontWeight: 'bold' }}>
              ESTE DOCUMENTO ES UNA REPRESENTACIÓN GRÁFICA DE UN DOCUMENTO ELECTRÓNICO (XML)
            </p>
            <p style={{ margin: '2mm 0' }}>
              Si su documento electrónico presenta algún error podrá solicitar la modificación
              dentro de las 72 horas siguientes de la emisión de este comprobante.
            </p>
            <p style={{ margin: '2mm 0 0 0' }}>
              <strong>Consulte la validez de este documento en:</strong>{' '}
              ekuatia.set.gov.py/consultas
            </p>
            <p
              style={{
                margin: '2mm 0 0 0',
                fontSize: '8pt',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}
            >
              <strong>CDC:</strong> {comp.cdc}
            </p>
          </div>
        </section>
      )}

      {/* Anulación */}
      {comp.estado === 'ANULADO' && (
        <section
          style={{
            marginTop: '5mm',
            padding: '4mm',
            border: '3px solid #c00',
            color: '#c00',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '14pt', fontWeight: 'bold', margin: 0 }}>*** ANULADO ***</p>
          {comp.motivoAnulacion && (
            <p style={{ margin: '2mm 0 0 0', fontSize: '10pt' }}>Motivo: {comp.motivoAnulacion}</p>
          )}
        </section>
      )}

      {/* Pie */}
      <footer
        style={{
          marginTop: '5mm',
          paddingTop: '3mm',
          borderTop: '1px solid #999',
          fontSize: '8pt',
          color: '#666',
          textAlign: 'center',
        }}
      >
        Emitido por {comp.emitidoPor.nombreCompleto} · Smash POS
      </footer>
    </div>
  );
}

function TotalRow({
  label,
  value,
  style,
}: {
  label: string;
  value: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '1mm 0',
        ...style,
      }}
    >
      <span>{label}</span>
      <span>{formatGs(BigInt(value))}</span>
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
      return 'NOTA DE CRÉDITO ELECTRÓNICA';
    case 'NOTA_DEBITO':
      return 'NOTA DE DÉBITO ELECTRÓNICA';
    case 'AUTOFACTURA':
      return 'AUTOFACTURA ELECTRÓNICA';
    case 'NOTA_REMISION':
      return 'NOTA DE REMISIÓN ELECTRÓNICA';
    default:
      return t;
  }
}

function labelIva(t: string): string {
  switch (t) {
    case 'IVA_10':
      return '10%';
    case 'IVA_5':
      return '5%';
    case 'IVA_0':
      return '0%';
    case 'EXENTO':
      return 'EX';
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

function formatGs(n: bigint): string {
  return `Gs. ${n.toLocaleString('es-PY')}`;
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
