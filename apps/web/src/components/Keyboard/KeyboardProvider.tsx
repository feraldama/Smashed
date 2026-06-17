'use client';

import { Delete, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Keyboard from 'react-simple-keyboard';

import { useAuthStore } from '@/lib/auth-store';
import { cn } from '@/lib/utils';

type KeyboardHandle = {
  getInput: () => string;
  setInput: (value: string) => void;
};

/**
 * Teclado virtual global para pantallas táctiles.
 *
 * Está activo SOLO cuando el usuario logueado tiene rol `CAJERO`, porque
 * `apps/web` también lo usan admins/gerentes en desktop con teclado físico.
 *
 * Soporta dos layouts:
 *  - `numeric` — pad 3x4.
 *  - `qwerty`  — teclado completo (vía react-simple-keyboard) con shift y capa numérica/símbolos.
 *
 * Uso desde un input:
 *   const { inputProps } = useNumpadInput({...})   // numérico
 *   const { inputProps } = useKeyboardInput({...}) // alfanumérico
 *   <input {...inputProps} value={value} onChange={(e) => setValue(e.target.value)} />
 */

export type KeyboardLayout = 'numeric' | 'qwerty';

export interface KeyboardSession {
  id: string;
  layout: KeyboardLayout;
  label: string;
  value: string;
  onChange: (next: string) => void;
  inputRef: React.RefObject<HTMLElement | null>;
  /** Numeric only — render del valor en el header */
  formatPreview?: (raw: string) => string;
  maxLength?: number;
  /** Numeric only — permitir punto decimal */
  allowDecimal?: boolean;
  /** Si true, oculta el valor en el header (passwords) */
  secret?: boolean;
}

interface KeyboardContextValue {
  /** false cuando el rol del usuario no necesita teclado táctil (admins, etc.) */
  enabled: boolean;
  /** Override manual del usuario — útil para /login donde aún no hay rol. */
  touchMode: boolean;
  setTouchMode: (v: boolean) => void;
  activeId: string | null;
  open: (session: KeyboardSession) => void;
  close: () => void;
  update: (id: string, patch: Partial<KeyboardSession>) => void;
}

const KeyboardCtx = createContext<KeyboardContextValue | null>(null);

export function useKeyboardContext() {
  const ctx = useContext(KeyboardCtx);
  if (!ctx) {
    throw new Error('useKeyboardContext debe usarse dentro de <KeyboardProvider>');
  }
  return ctx;
}

const TOUCH_MODE_KEY = 'smash-touch-mode';

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const rol = useAuthStore((s) => s.user?.rol ?? null);
  const [touchMode, setTouchModeState] = useState(false);

  // Rehidratar el toggle manual desde sessionStorage al montar.
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(TOUCH_MODE_KEY) === '1') {
      setTouchModeState(true);
    }
  }, []);

  const setTouchMode = useCallback((v: boolean) => {
    setTouchModeState(v);
    if (typeof window !== 'undefined') {
      if (v) sessionStorage.setItem(TOUCH_MODE_KEY, '1');
      else sessionStorage.removeItem(TOUCH_MODE_KEY);
    }
  }, []);

  const enabled = rol === 'CAJERO' || touchMode;

  const [session, setSession] = useState<KeyboardSession | null>(null);

  // Espejo del session para leer el input activo desde callbacks sin meterlo
  // como dependencia (evita recrear `close`).
  const sessionRef = useRef<KeyboardSession | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const open = useCallback(
    (s: KeyboardSession) => {
      if (!enabled) return;
      setSession(s);
    },
    [enabled],
  );

  const close = useCallback(() => {
    // Soltar el foco del input al cerrar. Sin esto el input queda enfocado
    // (por el preventBlur del overlay) e inerte con inputMode='none'.
    sessionRef.current?.inputRef.current?.blur();
    setSession(null);
  }, []);

  const update = useCallback((id: string, patch: Partial<KeyboardSession>) => {
    setSession((prev) => (prev && prev.id === id ? { ...prev, ...patch } : prev));
  }, []);

  // Si el rol cambia (ej: logout) cerrar cualquier sesión abierta.
  useEffect(() => {
    if (!enabled && session) setSession(null);
  }, [enabled, session]);

  useEffect(() => {
    if (!session) return;
    // Listener en fase de CAPTURA: el handler corre antes que cualquier handler
    // de React/react-simple-keyboard. Crítico porque al apretar shift/123,
    // react-simple-keyboard re-renderiza el layout entero y los nodos viejos
    // dejan de estar en el árbol — si esperáramos al bubble, `contains()` sobre
    // el target original devolvería false y cerraríamos por error.
    function handler(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      const kbRoot = document.getElementById('virtual-keyboard-root');
      if (kbRoot?.contains(target)) return;
      const input = session?.inputRef.current;
      if (input && input.contains(target)) return;
      setSession(null);
    }
    document.addEventListener('pointerdown', handler, true);
    return () => document.removeEventListener('pointerdown', handler, true);
  }, [session]);

  // Scroll del input activo para que no quede tapado por el teclado.
  const sessionId = session?.id ?? null;
  useEffect(() => {
    if (!sessionId) return;
    const input = session?.inputRef.current;
    if (!input) return;

    let prevScrollMargin = '';
    const raf = requestAnimationFrame(() => {
      const kbEl = document.getElementById('virtual-keyboard-root');
      const kbHeight = kbEl?.getBoundingClientRect().height ?? 320;
      const inputRect = input.getBoundingClientRect();
      const kbTop = window.innerHeight - kbHeight;
      if (inputRect.bottom <= kbTop - 8) return;

      prevScrollMargin = input.style.scrollMarginBottom;
      input.style.scrollMarginBottom = `${kbHeight + 16}px`;
      input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });

    return () => {
      cancelAnimationFrame(raf);
      if (input && prevScrollMargin !== undefined) {
        input.style.scrollMarginBottom = prevScrollMargin;
      }
    };
  }, [sessionId, session?.inputRef]);

  // Memoizado y deliberadamente con dep `session?.id` (no `session`): cuando el
  // usuario tipea, `session` cambia de objeto pero el `id` activo no, así los
  // consumidores del contexto NO se re-renderizan por cada tecla. Solo los
  // overlays de abajo (que reciben `session` directo) reaccionan al valor.
  const ctxValue = useMemo<KeyboardContextValue>(
    () => ({
      enabled,
      touchMode,
      setTouchMode,
      activeId: session?.id ?? null,
      open,
      close,
      update,
    }),
    [enabled, touchMode, setTouchMode, session?.id, open, close, update],
  );

  return (
    <KeyboardCtx.Provider value={ctxValue}>
      {children}
      {session?.layout === 'numeric' && <NumericOverlay session={session} onClose={close} />}
      {session?.layout === 'qwerty' && <QwertyOverlay session={session} onClose={close} />}
    </KeyboardCtx.Provider>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  OVERLAY: NUMÉRICO (pad 3x4)
// ───────────────────────────────────────────────────────────────────────────

function NumericOverlay({ session, onClose }: { session: KeyboardSession; onClose: () => void }) {
  const { value, onChange, label, formatPreview, maxLength, allowDecimal } = session;

  const append = useCallback(
    (key: string) => {
      const next = value + key;
      if (maxLength && next.length > maxLength) return;
      onChange(next);
    },
    [value, onChange, maxLength],
  );

  const backspace = useCallback(() => {
    if (!value) return;
    onChange(value.slice(0, -1));
  }, [value, onChange]);

  const clear = useCallback(() => {
    if (!value) return;
    onChange('');
  }, [value, onChange]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= '0' && e.key <= '9') {
        append(e.key);
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        backspace();
        e.preventDefault();
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        onClose();
        e.preventDefault();
      } else if (e.key === '.' && allowDecimal) {
        if (!value.includes('.')) append('.');
        e.preventDefault();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [append, backspace, onClose, allowDecimal, value]);

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const display = formatPreview ? formatPreview(value) : value || '0';

  return (
    <div
      id="virtual-keyboard-root"
      onMouseDown={preventBlur}
      className={cn(
        'fixed bottom-0 left-1/2 z-50 w-[min(420px,100vw)] -translate-x-1/2',
        'rounded-t-2xl border-t border-x bg-card shadow-2xl',
        'animate-in slide-in-from-bottom-4 duration-150',
      )}
      role="dialog"
      aria-label={`Teclado numérico — ${label}`}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate font-mono text-xl font-bold tabular-nums">{display}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
          aria-label="Cerrar teclado"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((k) => (
          <NumKey key={k} onClick={() => append(k)}>
            {k}
          </NumKey>
        ))}
        {allowDecimal ? (
          <NumKey onClick={() => !value.includes('.') && append('.')}>.</NumKey>
        ) : (
          <NumKey onClick={() => append('000')} className="text-base">
            000
          </NumKey>
        )}
        <NumKey onClick={() => append('0')}>0</NumKey>
        <NumKey onClick={backspace} aria-label="Borrar" variant="muted">
          <Delete className="h-6 w-6" />
        </NumKey>
      </div>

      <div className="flex gap-2 border-t p-2">
        <button
          type="button"
          onClick={clear}
          className="flex-1 rounded-md border py-2 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Limpiar
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md bg-primary py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Listo
        </button>
      </div>
    </div>
  );
}

function NumKey({
  children,
  onClick,
  className,
  variant = 'default',
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
  className?: string;
  variant?: 'default' | 'muted';
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'className'>) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-14 items-center justify-center rounded-md border text-2xl font-semibold transition-colors',
        'active:scale-[0.97] active:bg-muted',
        variant === 'default' ? 'bg-background hover:bg-accent' : 'bg-muted/40 hover:bg-muted',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

// ───────────────────────────────────────────────────────────────────────────
//  OVERLAY: QWERTY (react-simple-keyboard)
// ───────────────────────────────────────────────────────────────────────────

type QwertyLayoutName = 'default' | 'shift' | 'numbers';

const QWERTY_LAYOUT: Record<QwertyLayoutName, string[]> = {
  default: [
    'q w e r t y u i o p {bksp}',
    'a s d f g h j k l ñ',
    '{shift} z x c v b n m , . {shift}',
    '{numbers} {space} {enter}',
  ],
  shift: [
    'Q W E R T Y U I O P {bksp}',
    'A S D F G H J K L Ñ',
    '{shiftactive} Z X C V B N M ; : {shiftactive}',
    '{numbers} {space} {enter}',
  ],
  numbers: [
    '1 2 3 4 5 6 7 8 9 0 {bksp}',
    '@ # $ _ & - + ( ) /',
    '* " \' : ; ! ? ¡ ¿',
    '{abc} {space} {enter}',
  ],
};

const QWERTY_DISPLAY: Record<string, string> = {
  '{bksp}': '⌫',
  '{enter}': 'Listo',
  '{space}': 'Espacio',
  '{shift}': '⇧',
  '{shiftactive}': '⇧',
  '{numbers}': '123',
  '{abc}': 'ABC',
};

function QwertyOverlay({ session, onClose }: { session: KeyboardSession; onClose: () => void }) {
  const { value, onChange, label, maxLength, secret } = session;
  const [layoutName, setLayoutName] = useState<QwertyLayoutName>('default');
  const keyboardRef = useRef<KeyboardHandle | null>(null);

  useEffect(() => {
    const kb = keyboardRef.current;
    if (!kb) return;
    if (kb.getInput() !== value) {
      kb.setInput(value);
    }
  }, [value]);

  const handleChange = useCallback(
    (input: string) => {
      if (maxLength && input.length > maxLength) {
        keyboardRef.current?.setInput(value);
        return;
      }
      onChange(input);
    },
    [onChange, maxLength, value],
  );

  const handleKeyPress = useCallback(
    (button: string) => {
      if (button === '{shift}' || button === '{shiftactive}') {
        setLayoutName((prev) => (prev === 'shift' ? 'default' : 'shift'));
      } else if (button === '{numbers}') {
        setLayoutName('numbers');
      } else if (button === '{abc}') {
        setLayoutName('default');
      } else if (button === '{enter}') {
        onClose();
      } else if (layoutName === 'shift') {
        setLayoutName('default');
      }
    },
    [layoutName, onClose],
  );

  const preventBlur = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <div
      id="virtual-keyboard-root"
      onMouseDown={preventBlur}
      className={cn(
        'fixed bottom-0 left-1/2 z-50 w-[min(720px,100vw)] -translate-x-1/2',
        'rounded-t-2xl border-t border-x bg-card shadow-2xl',
        'animate-in slide-in-from-bottom-4 duration-150',
      )}
      role="dialog"
      aria-label={`Teclado — ${label}`}
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="truncate text-base font-medium">
            {value ? (
              secret ? (
                '•'.repeat(value.length)
              ) : (
                value
              )
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted"
          aria-label="Cerrar teclado"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="smash-keyboard p-2">
        <Keyboard
          keyboardRef={(r) => {
            keyboardRef.current = r;
          }}
          layoutName={layoutName}
          layout={QWERTY_LAYOUT}
          display={QWERTY_DISPLAY}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          mergeDisplay
          buttonTheme={[
            {
              class: 'smash-key-action',
              buttons: '{bksp} {shift} {shiftactive} {numbers} {abc}',
            },
            {
              class: 'smash-key-active',
              buttons: '{shiftactive}',
            },
            {
              class: 'smash-key-space',
              buttons: '{space}',
            },
            {
              class: 'smash-key-primary',
              buttons: '{enter}',
            },
          ]}
        />
      </div>
    </div>
  );
}
