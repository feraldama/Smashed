'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useThemeStore } from '@/lib/theme-store';

/**
 * Botón solo-ícono para alternar entre tema claro y oscuro del POS.
 *
 * Hasta que el componente monte en el cliente, renderiza un estado neutro
 * (ícono de luna) para evitar mismatch de hidratación con el script anti-FOUC.
 */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const toggle = useThemeStore((s) => s.toggle);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  const esOscuro = montado && theme === 'dark';
  const Icon = esOscuro ? Sun : Moon;
  const label = esOscuro ? 'Tema claro' : 'Tema oscuro';

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center justify-center rounded-md border border-input bg-background p-1.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
