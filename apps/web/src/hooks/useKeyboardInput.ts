'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

import { useKeyboardContext } from '@/components/Keyboard/KeyboardProvider';

interface UseKeyboardInputOptions {
  value: string;
  onChange: (next: string) => void;
  label: string;
  maxLength?: number;
  enabled?: boolean;
  /** Si true, oculta el valor en el header del teclado (para passwords) */
  secret?: boolean;
}

/**
 * Conecta un input/textarea al teclado QWERTY virtual global.
 * Solo dispara cuando el rol del usuario es CAJERO (gate en el provider).
 * Para otros roles, los inputProps NO incluyen `onFocus` ni `inputMode='none'`,
 * por lo que el input se comporta normal.
 */
export function useKeyboardInput<
  T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement,
>({ value, onChange, label, maxLength, enabled = true, secret }: UseKeyboardInputOptions) {
  const id = useId();
  const ref = useRef<T>(null);
  const { enabled: kbEnabled, activeId, open, close, update } = useKeyboardContext();
  const isActive = activeId === id;
  const canOpen = enabled && kbEnabled;

  // `onChange` suele venir inline desde el consumidor (nueva identidad por
  // render). Lo guardamos en un ref y exponemos un wrapper estable para evitar
  // un loop de re-render entre el efecto `update` y `setSession` que clava la
  // CPU mientras el teclado está abierto. Ver nota en useNumpadInput.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const stableOnChange = useCallback((next: string) => onChangeRef.current(next), []);

  // Solo sincronizamos primitivos que cambian; el callback ya es estable y se
  // fija en `open()`, así que NO va como dep del efecto.
  useEffect(() => {
    if (!isActive) return;
    update(id, { value, label, maxLength, secret });
  }, [isActive, id, value, label, maxLength, secret, update]);

  const triggerOpen = useCallback(() => {
    if (!canOpen) return;
    open({
      id,
      layout: 'qwerty',
      label,
      value,
      onChange: stableOnChange,
      inputRef: ref,
      maxLength,
      secret,
    });
  }, [canOpen, id, label, value, stableOnChange, maxLength, secret, open]);

  const inputProps: {
    ref: React.RefObject<T>;
    onFocus?: () => void;
    inputMode?: 'none';
  } = canOpen ? { ref, onFocus: triggerOpen, inputMode: 'none' } : { ref };

  return {
    inputProps,
    open: triggerOpen,
    close: useCallback(() => {
      if (isActive) close();
    }, [isActive, close]),
    isOpen: isActive,
  };
}
