'use client';

import { type CeldaHora } from '@/hooks/useReportes';
import { formatGs } from '@/lib/utils';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

interface HeatmapHoraProps {
  celdas: CeldaHora[];
}

export function HeatmapHora({ celdas }: HeatmapHoraProps) {
  // Mapa { "0_8": cantidad, "0_9": ... }
  const map = new Map<string, { cantidad: number; total: number }>();
  let maxCant = 0;
  for (const c of celdas) {
    const key = `${c.dia_semana}_${c.hora}`;
    const cant = Number(c.cantidad);
    map.set(key, { cantidad: cant, total: Number(c.total) });
    if (cant > maxCant) maxCant = cant;
  }

  function colorFor(cant: number): string {
    if (cant === 0) return 'hsl(var(--muted))';
    const intensidad = Math.min(1, cant / Math.max(1, maxCant));
    // hsl primario con opacidad variable
    return `hsla(354, 80%, 56%, ${0.15 + intensidad * 0.85})`;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <thead>
          <tr>
            <th className="w-10"></th>
            {HORAS.map((h) => (
              <th key={h} className="font-mono text-[9px] font-normal text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DIAS.map((dia, idx) => (
            <tr key={dia}>
              <td className="pr-1 text-right text-[10px] font-medium text-muted-foreground">
                {dia}
              </td>
              {HORAS.map((h) => {
                const cell = map.get(`${idx}_${h}`);
                const cant = cell?.cantidad ?? 0;
                return (
                  <td
                    key={h}
                    className="aspect-square min-w-[20px] rounded-sm transition-transform hover:scale-110 hover:ring-2 hover:ring-primary/30"
                    style={{ backgroundColor: colorFor(cant) }}
                    title={
                      cant > 0 && cell
                        ? `${dia} ${h}:00 — ${cant} venta${cant !== 1 ? 's' : ''} · ${formatGs(cell.total)}`
                        : `${dia} ${h}:00 — sin ventas`
                    }
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
        <span>Menos</span>
        {[0.15, 0.4, 0.65, 0.85, 1].map((i) => (
          <div
            key={i}
            className="h-3 w-3 rounded-sm"
            style={{ backgroundColor: `hsla(354, 80%, 56%, ${i})` }}
          />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
