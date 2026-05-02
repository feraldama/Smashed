'use client';

import { Bike, ShoppingBag, Store, Users } from 'lucide-react';

import { type TipoPedido } from '@/lib/cart-store';
import { cn } from '@/lib/utils';

interface TipoPedidoSelectorProps {
  value: TipoPedido;
  onChange: (tipo: TipoPedido) => void;
  className?: string;
}

const TIPOS = [
  {
    value: 'MOSTRADOR' as const,
    label: 'Mostrador',
    icon: ShoppingBag,
    descripcion: 'Venta directa en local',
  },
  { value: 'MESA' as const, label: 'Mesa', icon: Users, descripcion: 'Servicio en mesa' },
  {
    value: 'DELIVERY_PROPIO' as const,
    label: 'Delivery',
    icon: Bike,
    descripcion: 'Reparto propio',
  },
  { value: 'RETIRO_LOCAL' as const, label: 'Retiro', icon: Store, descripcion: 'Cliente retira' },
];

export function TipoPedidoSelector({ value, onChange, className }: TipoPedidoSelectorProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}>
      {TIPOS.map((t) => {
        const Icon = t.icon;
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-all',
              active
                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
                : 'border-input hover:bg-accent',
            )}
          >
            <Icon className={cn('h-5 w-5', active && 'text-primary')} />
            <span className="text-sm font-semibold">{t.label}</span>
            <span className="text-[10px] text-muted-foreground">{t.descripcion}</span>
          </button>
        );
      })}
    </div>
  );
}
