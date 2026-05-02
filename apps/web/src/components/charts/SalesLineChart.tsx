'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { type PuntoSerie } from '@/hooks/useReportes';
import { formatGs } from '@/lib/utils';

interface SalesLineChartProps {
  series: PuntoSerie[];
  height?: number;
}

export function SalesLineChart({ series, height = 280 }: SalesLineChartProps) {
  const data = series.map((p) => ({
    fecha: new Date(p.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' }),
    total: Number(p.total),
    cantidad: Number(p.cantidad),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
        Sin datos en el período
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="hsl(var(--muted-foreground))"
          tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '0.375rem',
            fontSize: '0.75rem',
          }}
          formatter={(v: number, name: string) => [
            name === 'total' ? formatGs(v) : `${v} venta${v !== 1 ? 's' : ''}`,
            name === 'total' ? 'Total' : 'Cantidad',
          ]}
          labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#totalGrad)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
