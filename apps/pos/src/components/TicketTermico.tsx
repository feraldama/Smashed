'use client';

import { type ComprobanteDetalle } from '@/hooks/useComprobante';
import { formatGs } from '@/lib/utils';

/**
 * Render del ticket térmico — diseñado para papel 80mm.
 * Las clases `print:*` aseguran que el render impreso sea limpio.
 *
 * Imprimir con `window.print()` después de aplicar `@page { size: 80mm auto }`
 * en el CSS de la página contenedora.
 */
const METODO_LABELS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TARJETA_DEBITO: 'T. Débito',
  TARJETA_CREDITO: 'T. Crédito',
  TRANSFERENCIA: 'Transferencia',
  CHEQUE: 'Cheque',
  BANCARD: 'Bancard',
  INFONET: 'Infonet',
  ZIMPLE: 'Zimple',
  TIGO_MONEY: 'Tigo Money',
  PERSONAL_PAY: 'Personal Pay',
};

const TIPO_LABELS: Record<string, string> = {
  TICKET: 'TICKET',
  FACTURA: 'FACTURA',
  NOTA_CREDITO: 'NOTA DE CRÉDITO',
  NOTA_DEBITO: 'NOTA DE DÉBITO',
};

interface TicketTermicoProps {
  comprobante: ComprobanteDetalle;
}

export function TicketTermico({ comprobante: c }: TicketTermicoProps) {
  const fecha = new Date(c.fechaEmision);
  const fechaFmt = fecha.toLocaleString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ruc = c.receptorRuc && c.receptorDv ? `${c.receptorRuc}-${c.receptorDv}` : null;

  return (
    <article className="ticket mx-auto w-[80mm] max-w-full bg-white p-3 font-mono text-[11px] leading-tight text-black print:p-2">
      {/* Cabecera empresa */}
      <header className="text-center">
        <h1 className="text-sm font-bold uppercase">{c.empresa.razonSocial}</h1>
        <p className="text-[10px]">
          RUC {c.empresa.ruc}-{c.empresa.dv}
        </p>
        {c.empresa.direccion && <p className="text-[10px]">{c.empresa.direccion}</p>}
        <p className="text-[10px]">
          {c.sucursal.nombre} · {c.sucursal.direccion}
        </p>
      </header>

      <Sep />

      {/* Tipo + nro */}
      <div className="text-center">
        <p className="text-sm font-bold tracking-wider">
          {TIPO_LABELS[c.tipoDocumento] ?? c.tipoDocumento}
        </p>
        <p className="font-bold text-[13px]">{c.numeroDocumento}</p>
        <p className="text-[10px]">Timbrado N° {c.timbrado.numero}</p>
        <p className="text-[10px]">
          Vto {new Date(c.timbrado.fechaFinVigencia).toLocaleDateString('es-PY')}
        </p>
        <p className="text-[10px]">Fecha: {fechaFmt}</p>
        <p className="text-[10px]">{c.condicionVenta === 'CONTADO' ? 'Contado' : 'Crédito'}</p>
      </div>

      <Sep />

      {/* Receptor */}
      <div>
        <p className="text-[10px]">
          <span className="font-semibold">Cliente:</span> {c.receptorRazonSocial}
        </p>
        {ruc && <p className="text-[10px]">RUC: {ruc}</p>}
        {c.receptorDocumento && !ruc && <p className="text-[10px]">Doc: {c.receptorDocumento}</p>}
      </div>

      <Sep />

      {/* Items */}
      <table className="w-full">
        <thead>
          <tr className="text-[10px]">
            <th className="text-left">Cant</th>
            <th className="text-left">Descripción</th>
            <th className="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {c.items.map((it) => (
            <tr key={it.id} className="align-top">
              <td className="pr-1 text-[10px] font-bold">{it.cantidad}×</td>
              <td className="pr-1">
                <span className="break-words">{it.descripcion}</span>
                {it.tasaIva === 'IVA_5' && <sup className="ml-0.5 text-[8px]">5</sup>}
                {it.tasaIva === 'EXENTO' && <sup className="ml-0.5 text-[8px]">EX</sup>}
              </td>
              <td className="whitespace-nowrap text-right font-mono">
                {formatGs(it.subtotal, false)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Sep />

      {/* Totales */}
      <div className="space-y-0.5">
        {Number(c.subtotalExentas) > 0 && (
          <Linea label="Exentas" value={formatGs(c.subtotalExentas, false)} />
        )}
        {Number(c.subtotalIva5) > 0 && (
          <>
            <Linea label="Subtotal IVA 5%" value={formatGs(c.subtotalIva5, false)} />
            <Linea label="IVA 5%" value={formatGs(c.totalIva5, false)} />
          </>
        )}
        {Number(c.subtotalIva10) > 0 && (
          <>
            <Linea label="Subtotal IVA 10%" value={formatGs(c.subtotalIva10, false)} />
            <Linea label="IVA 10%" value={formatGs(c.totalIva10, false)} />
          </>
        )}
        <Sep />
        <Linea label="TOTAL" value={formatGs(c.total, false)} bold size="big" />
      </div>

      <Sep />

      {/* Pagos */}
      <div className="space-y-0.5">
        {c.pagos.map((p) => (
          <Linea
            key={p.id}
            label={METODO_LABELS[p.metodo] ?? p.metodo}
            value={formatGs(p.monto, false)}
          />
        ))}
        {c.pagos.length > 1 || Number(c.pagos[0]?.monto ?? 0) > Number(c.total) ? (
          <Linea
            label="Vuelto"
            value={formatGs(
              c.pagos.reduce((acc, p) => acc + Number(p.monto), 0) - Number(c.total),
              false,
            )}
            bold
          />
        ) : null}
      </div>

      <Sep />

      {/* Footer */}
      <footer className="mt-1 text-center text-[10px]">
        <p>Cajero: {c.emitidoPor.nombreCompleto}</p>
        {c.pedido && <p>Pedido N° {c.pedido.numero}</p>}

        {/* QR / CDC SIFEN — se completa en Fase 4 */}
        {c.cdc ? (
          <div className="mt-2">
            <p className="text-[8px]">CDC: {c.cdc}</p>
          </div>
        ) : (
          <p className="mt-1 text-[9px] italic">
            — Documento interno · No es factura electrónica —
          </p>
        )}

        {c.estado === 'ANULADO' && (
          <p className="mt-2 rotate-[-2deg] border-2 border-red-600 px-3 py-0.5 text-base font-bold uppercase text-red-600 inline-block">
            ANULADO
          </p>
        )}

        <p className="mt-2 font-semibold">¡Gracias por su compra!</p>
      </footer>
    </article>
  );
}

function Sep() {
  return <div className="my-1 border-t border-dashed border-black/60" />;
}

function Linea({
  label,
  value,
  bold,
  size,
}: {
  label: string;
  value: string;
  bold?: boolean;
  size?: 'big';
}) {
  return (
    <div
      className={
        'flex justify-between gap-2 ' +
        (bold ? 'font-bold ' : '') +
        (size === 'big' ? 'text-[13px]' : '')
      }
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
