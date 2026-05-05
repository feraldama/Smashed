'use client';

import { ChefHat, LogOut, Volume2, VolumeX } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { PedidoKdsCard } from '@/components/PedidoKdsCard';
import { useKdsPedidos, useKdsSocket, type Sector } from '@/hooks/useKds';
import { api } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function Home() {
  return (
    <AuthGate>
      <KdsScreen />
    </AuthGate>
  );
}

const SECTORES: Array<{ codigo: Sector; label: string; emoji: string }> = [
  { codigo: 'COCINA_CALIENTE', label: 'Cocina caliente', emoji: '🔥' },
  { codigo: 'COCINA_FRIA', label: 'Cocina fría', emoji: '🥗' },
  { codigo: 'PARRILLA', label: 'Parrilla', emoji: '🥩' },
  { codigo: 'BAR', label: 'Bar', emoji: '🍺' },
  { codigo: 'CAFETERIA', label: 'Cafetería', emoji: '☕' },
  { codigo: 'POSTRES', label: 'Postres', emoji: '🍦' },
];

function KdsScreen() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);

  const [filtroSector, setFiltroSector] = useState<Sector | null>('COCINA_CALIENTE');
  const [sonidoOn, setSonidoOn] = useState(true);

  const { data: pedidos = [], isLoading, isError } = useKdsPedidos(filtroSector);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Beep generado en runtime via WebAudio (sin asset externo)
  const playBeep = () => {
    if (!sonidoOn) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.15, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch {
      /* silencio si falla */
    }
  };

  useKdsSocket(playBeep);

  const sucursalActual = user?.sucursales.find((s) => s.id === user.sucursalActivaId);

  // Conteos por sector. Nota: con el filtrado server-side por sector activo,
  // los contadores de OTRAS tabs son aproximados (solo cuentan items de
  // pedidos que ya pasaron el filtro del sector activo). Al cambiar de tab,
  // el contador de la nueva tab se vuelve exacto.
  const conteosPorSector = useMemo(() => {
    const map = new Map<Sector | 'TODOS', number>();
    map.set('TODOS', 0);
    for (const p of pedidos) {
      for (const it of p.items) {
        const s = it.sectorComanda ?? it.productoVenta.sectorComanda;
        if (s) {
          map.set(s, (map.get(s) ?? 0) + 1);
        }
        map.set('TODOS', (map.get('TODOS') ?? 0) + 1);
      }
    }
    return map;
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    if (!filtroSector) return pedidos;
    return pedidos
      .map((p) => ({
        ...p,
        items: p.items.filter(
          (it) =>
            it.sectorComanda === filtroSector || it.productoVenta.sectorComanda === filtroSector,
        ),
      }))
      .filter((p) => p.items.length > 0);
  }, [pedidos, filtroSector]);

  async function logout() {
    await api('/auth/logout', { method: 'POST', skipAuth: true }).catch(() => {});
    clear();
    window.location.href = '/login';
  }

  return (
    <main className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <ChefHat className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">
                Smash <span className="text-primary">KDS</span>
              </h1>
              {sucursalActual && (
                <p className="text-xs text-muted-foreground">
                  {sucursalActual.nombre} · {pedidos.length} pedidos en cocina
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSonidoOn((s) => !s)}
              className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
              title={sonidoOn ? 'Silenciar' : 'Activar sonido'}
            >
              {sonidoOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              {sonidoOn ? 'Sonido on' : 'Sonido off'}
            </button>
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {user?.nombreCompleto}
            </span>
            <button
              type="button"
              onClick={() => {
                void logout();
              }}
              className="flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <LogOut className="h-3.5 w-3.5" /> Salir
            </button>
          </div>
        </div>

        {/* Tabs de sector */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:thin]">
          <SectorPill
            label="Todos"
            count={conteosPorSector.get('TODOS') ?? 0}
            active={filtroSector === null}
            onClick={() => setFiltroSector(null)}
          />
          {SECTORES.map((s) => (
            <SectorPill
              key={s.codigo}
              label={`${s.emoji} ${s.label}`}
              count={conteosPorSector.get(s.codigo) ?? 0}
              active={filtroSector === s.codigo}
              onClick={() => setFiltroSector(s.codigo)}
            />
          ))}
        </div>
      </header>

      <section className="flex-1 p-4">
        {isLoading && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            Cargando pedidos...
          </div>
        )}
        {isError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            Error cargando pedidos del KDS.
          </div>
        )}
        {!isLoading && pedidosFiltrados.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ChefHat className="h-12 w-12 opacity-30" />
            <p className="text-sm">No hay pedidos para preparar</p>
            <p className="text-xs">Cuando lleguen, vas a verlos acá en tiempo real</p>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pedidosFiltrados.map((p) => (
            <PedidoKdsCard key={p.id} pedido={p} filtroSector={filtroSector} />
          ))}
        </div>
      </section>

      {/* Audio elemento (no usado actualmente — el beep va por WebAudio) */}
      <audio ref={audioRef} />
    </main>
  );
}

function SectorPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-input bg-background hover:bg-accent',
      )}
    >
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 text-[10px] font-bold',
          active ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}
