'use client';

import {
  CheckCircle2,
  ChefHat,
  ChevronLeft,
  Filter,
  Loader2,
  RefreshCcw,
  Store,
  Volume2,
  VolumeX,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { PedidoCard } from '@/components/kds/PedidoCard';
import { PedidoEntregadoCard } from '@/components/kds/PedidoEntregadoCard';
import { LogoutButton } from '@/components/ui/LogoutButton';
import { type SectorComanda, type VistaKds, useKds } from '@/hooks/useKds';
import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

export default function KdsPage() {
  return (
    <AuthGate>
      <KdsScreen />
    </AuthGate>
  );
}

const ROLES_ADMIN_FE = new Set(['ADMIN_EMPRESA', 'GERENTE_SUCURSAL', 'SUPER_ADMIN']);

// Sectores con label legible. El primer "tab" es Mostrador (sin filtro = vista
// completa para verificar y entregar al cliente).
const SECTORES: { value: SectorComanda; label: string }[] = [
  { value: 'COCINA_CALIENTE', label: 'Cocina caliente' },
  { value: 'COCINA_FRIA', label: 'Cocina fría' },
  { value: 'PARRILLA', label: 'Parrilla' },
  { value: 'BAR', label: 'Bar' },
  { value: 'CAFETERIA', label: 'Cafetería' },
  { value: 'POSTRES', label: 'Postres' },
];

function KdsScreen() {
  const user = useAuthStore((s) => s.user);
  const esAdmin = user ? ROLES_ADMIN_FE.has(user.rol) : false;
  const [vista, setVista] = useState<VistaKds>('mostrador');
  const [sonidoOn, setSonidoOn] = useState(true);
  // El navegador bloquea el audio hasta el primer gesto del usuario (autoplay
  // policy). Mientras no haya gesto, mostramos un aviso para activarlo.
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const { data: pedidos = [], isLoading, isFetching, refetch } = useKds(vista);

  const esEntregados = vista === 'entregados';
  // El sector concreto (cocina, bar...) o null para Mostrador/Entregados.
  const sectorActual: SectorComanda | null =
    vista === 'mostrador' || vista === 'entregados' ? null : vista;

  const totalActivos = pedidos.length;
  const enPrep = pedidos.filter((p) => p.estado === 'EN_PREPARACION').length;

  // Reutilizamos un único AudioContext via ref — crear uno nuevo por beep agota
  // el límite del navegador (~6 contextos) y termina fallando en silencio.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current ??= new Ctx();
    return audioCtxRef.current;
  }, []);

  // Beep generado en runtime con WebAudio (sin asset externo).
  const playBeep = useCallback(() => {
    if (!sonidoOn) return;
    const ctx = getCtx();
    if (!ctx) return;
    // Si el contexto sigue suspendido es porque todavía no hubo un gesto del
    // usuario: el sonido no puede sonar. Avisamos y salimos sin programar nada.
    if (ctx.state === 'suspended') {
      void ctx.resume();
      setAudioBloqueado(true);
      return;
    }
    setAudioBloqueado(false);
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      o.frequency.setValueAtTime(1320, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.18, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.4);
    } catch {
      /* silencio si el navegador bloquea el audio */
    }
  }, [sonidoOn, getCtx]);

  // Desbloqueo del audio: el AudioContext sólo se puede arrancar dentro de un
  // gesto del usuario. Enganchamos el primer click/tecla/touch de la página
  // para crearlo y resumirlo; a partir de ahí los beeps suenan solos.
  useEffect(() => {
    const unlock = () => {
      const ctx = getCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().then(() => setAudioBloqueado(false));
      } else {
        setAudioBloqueado(false);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [getCtx]);

  // Detección de pedidos nuevos: el KDS hace polling, así que comparamos los
  // IDs de cada refetch contra los ya vistos. Si aparece uno nuevo, suena.
  // El baseline se resetea al cambiar de sector para no sonar por los pedidos
  // que ya existían en la tab a la que recién entramos.
  const idsVistosRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    idsVistosRef.current = null;
  }, [vista]);
  useEffect(() => {
    const ids = new Set(pedidos.map((p) => p.id));
    if (idsVistosRef.current === null) {
      idsVistosRef.current = ids;
      return;
    }
    let hayNuevo = false;
    for (const id of ids) {
      if (!idsVistosRef.current.has(id)) {
        hayNuevo = true;
        break;
      }
    }
    idsVistosRef.current = ids;
    // En "entregados" no suena: un pedido que aparece ahí no es trabajo nuevo
    // para cocina, ya se entregó.
    if (hayNuevo && !esEntregados) playBeep();
  }, [pedidos, playBeep, esEntregados]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Mini header */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-4">
        {esAdmin && (
          <>
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" /> Admin
            </Link>
            <div className="h-6 w-px bg-border" />
          </>
        )}
        <h1 className="flex items-center gap-1.5 text-sm font-bold">
          <ChefHat className="h-4 w-4" /> Cocina · KDS
        </h1>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {esEntregados ? (
            <span>
              <strong className="text-foreground">{totalActivos}</strong> entregados hoy
            </span>
          ) : (
            <>
              <span>
                <strong className="text-foreground">{totalActivos}</strong> activos
              </span>
              <span>
                <strong className="text-amber-600 dark:text-amber-400">{enPrep}</strong> en prep.
              </span>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              if (audioBloqueado || !sonidoOn) {
                // Activar: desbloquea el audio (este click es el gesto) y suena
                // un beep de confirmación para que el operador lo verifique.
                setSonidoOn(true);
                const ctx = getCtx();
                if (ctx?.state === 'suspended') {
                  void ctx.resume().then(() => {
                    setAudioBloqueado(false);
                    playBeep();
                  });
                } else {
                  setAudioBloqueado(false);
                  playBeep();
                }
              } else {
                setSonidoOn(false);
              }
            }}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1',
              audioBloqueado
                ? 'animate-pulse border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                : 'border-input hover:bg-accent',
            )}
            aria-label={sonidoOn ? 'Silenciar' : 'Activar sonido'}
            title={
              audioBloqueado
                ? 'El navegador bloqueó el sonido — tocá para activarlo'
                : sonidoOn
                  ? 'Silenciar avisos de pedidos nuevos'
                  : 'Activar avisos de pedidos nuevos'
            }
          >
            {sonidoOn && !audioBloqueado ? (
              <Volume2 className="h-3 w-3" />
            ) : (
              <VolumeX className="h-3 w-3" />
            )}
            <span className="hidden sm:inline">
              {audioBloqueado ? 'Activar sonido' : sonidoOn ? 'Sonido' : 'Silencio'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              void refetch();
            }}
            disabled={isFetching}
            className="flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-accent disabled:opacity-50"
            aria-label="Refrescar"
          >
            <RefreshCcw className={cn('h-3 w-3', isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">Refrescar</span>
          </button>
          <span className="hidden text-[11px] sm:inline">{user?.nombreCompleto}</span>
          <LogoutButton compact />
        </div>
      </header>

      {/* Filtro de sectores: Mostrador (sin filtro) + cada sector */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-background px-4 py-2">
        <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <button
          type="button"
          onClick={() => setVista('mostrador')}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
            vista === 'mostrador'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <Store className="h-3 w-3" /> Mostrador
        </button>
        {SECTORES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setVista(s.value)}
            className={cn(
              'shrink-0 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
              vista === s.value
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent',
            )}
          >
            {s.label}
          </button>
        ))}
        {/* Separador + recall de entregados (al final, no es flujo operativo) */}
        <div className="mx-1 h-5 w-px shrink-0 bg-border" />
        <button
          type="button"
          onClick={() => setVista('entregados')}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium uppercase tracking-wide',
            esEntregados
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
        >
          <CheckCircle2 className="h-3 w-3" /> Entregados
        </button>
      </div>

      {/* Tablero */}
      <main className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            {esEntregados ? (
              <CheckCircle2 className="h-16 w-16 opacity-20" />
            ) : (
              <ChefHat className="h-16 w-16 opacity-20" />
            )}
            <div>
              <p className="text-lg font-semibold">
                {esEntregados
                  ? 'Todavía no entregaste pedidos hoy'
                  : sectorActual
                    ? 'No hay pedidos en este sector'
                    : 'Sin pedidos pendientes'}
              </p>
              <p className="text-xs">
                {esEntregados
                  ? 'Acá aparecen los pedidos que entregaste al cliente durante el día.'
                  : 'Los pedidos confirmados aparecen acá automáticamente.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {pedidos.map((p) =>
              esEntregados ? (
                <PedidoEntregadoCard key={p.id} pedido={p} />
              ) : (
                <PedidoCard key={p.id} pedido={p} sector={sectorActual} />
              ),
            )}
          </div>
        )}
      </main>
    </div>
  );
}
