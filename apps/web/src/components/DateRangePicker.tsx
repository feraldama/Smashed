'use client';

import { Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';

export interface DateRange {
  desde: Date;
  hasta: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: '7d', label: 'Últimos 7 días' },
  { id: '30d', label: 'Últimos 30 días' },
  { id: 'mes', label: 'Este mes' },
  { id: 'mesAnterior', label: 'Mes anterior' },
] as const;

type PresetId = (typeof PRESETS)[number]['id'];

function rangoPreset(id: PresetId): DateRange {
  const ahora = new Date();
  const hoyInicio = new Date(ahora);
  hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(ahora);

  switch (id) {
    case 'hoy':
      return { desde: hoyInicio, hasta: hoyFin };
    case 'ayer': {
      const ayer = new Date(hoyInicio);
      ayer.setDate(ayer.getDate() - 1);
      const finAyer = new Date(hoyInicio);
      finAyer.setSeconds(finAyer.getSeconds() - 1);
      return { desde: ayer, hasta: finAyer };
    }
    case '7d': {
      const desde = new Date(hoyInicio);
      desde.setDate(desde.getDate() - 6);
      return { desde, hasta: hoyFin };
    }
    case '30d': {
      const desde = new Date(hoyInicio);
      desde.setDate(desde.getDate() - 29);
      return { desde, hasta: hoyFin };
    }
    case 'mes': {
      const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      return { desde, hasta: hoyFin };
    }
    case 'mesAnterior': {
      const desde = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
      const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), 0, 23, 59, 59);
      return { desde, hasta };
    }
  }
}

function fmtInputDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [activoPreset, setActivoPreset] = useState<PresetId | null>('30d');

  const labelRango = useMemo(() => {
    return `${value.desde.toLocaleDateString('es-PY')} – ${value.hasta.toLocaleDateString('es-PY')}`;
  }, [value]);

  function applyPreset(id: PresetId) {
    setActivoPreset(id);
    onChange(rangoPreset(id));
  }

  function applyManual(field: 'desde' | 'hasta', dateStr: string) {
    setActivoPreset(null);
    const d = new Date(dateStr + 'T00:00:00');
    if (Number.isNaN(d.getTime())) return;
    if (field === 'hasta') d.setHours(23, 59, 59, 999);
    onChange({ ...value, [field]: d });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{labelRango}</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className={cn(
              'rounded-md border px-2 py-1 text-[11px] transition-colors',
              activoPreset === p.id
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background hover:bg-accent',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <input
          type="date"
          value={fmtInputDate(value.desde)}
          onChange={(e) => applyManual('desde', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
        />
        <span className="text-xs text-muted-foreground">→</span>
        <input
          type="date"
          value={fmtInputDate(value.hasta)}
          onChange={(e) => applyManual('hasta', e.target.value)}
          className="rounded-md border border-input bg-background px-2 py-1 text-[11px]"
        />
      </div>
    </div>
  );
}
