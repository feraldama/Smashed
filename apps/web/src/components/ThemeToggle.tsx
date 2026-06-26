'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useThemeStore } from '@/lib/theme-store';
import { cn } from '@/lib/utils';

/**
 * Botón para alternar entre tema claro y oscuro del panel.
 *
 * - `variant="full"`: botón ancho con texto, pensado para el footer del sidebar.
 * - `variant="icon"`: botón cuadrado solo-ícono, para el header mobile.
 *
 * Hasta que el componente monte en el cliente, renderiza un estado neutro
 * (ícono de luna) para evitar mismatch de hidratación con el script anti-FOUC.
 */
export function ThemeToggle({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  const esOscuro = montado && theme === 'dark';
  const Icon = esOscuro ? Sun : Moon;
  const label = esOscuro ? 'Tema claro' : 'Tema oscuro';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggle}
        className="rounded-md border border-input p-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={label}
        title={label}
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'flex w-full items-center gap-1.5 rounded-md border border-input px-2 py-1 text-xs',
        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
