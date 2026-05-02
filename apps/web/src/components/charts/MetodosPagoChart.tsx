'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { type MetodoPagoTotal } from '@/hooks/useReportes';
import { formatGs } from '@/lib/utils';

const COLORS = [
  '#E63946', // rojo Smash
  '#F77F00',
  '#FCBF49',
  '#06D6A0',
  '#118AB2',
  '#073B4C',
  '#7209B7',
  '#3A0CA3',
  '#4361EE',
  '#A8DADC',
];

const LABELS: Record<string, string> = {
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

interface MetodosPagoChartProps {
  metodos: MetodoPagoTotal[];
}

export function MetodosPagoChart({ metodos }: MetodosPagoChartProps) {
  const data = metodos.map((m) => ({
    name: LABELS[m.metodo] ?? m.metodo,
    value: Number(m.total),
    cantidad: Number(m.cantidad),
  }));

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        Sin pagos en el período
      </div>
    );
  }

  const totalGeneral = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr,auto]">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '0.375rem',
              fontSize: '0.75rem',
            }}
            formatter={(v: number) => [formatGs(v), 'Total']}
          />
        </PieChart>
      </ResponsiveContainer>

      <ul className="self-center space-y-1 text-xs">
        {data.map((d, i) => {
          const pct = totalGeneral > 0 ? (d.value / totalGeneral) * 100 : 0;
          return (
            <li key={d.name} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: COLORS[i % COLORS.length] }}
              />
              <span className="font-medium">{d.name}</span>
              <span className="font-mono text-muted-foreground">{formatGs(d.value)}</span>
              <span className="text-[10px] text-muted-foreground">({pct.toFixed(1)}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
