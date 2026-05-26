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
 *
 *   const { inputProps } = useKeyboardInput({
 *     value: busqueda,
 *     onChange: setBusqueda,
 *     label: 'Buscar producto',
 *   });
 *   <input {...inputProps} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
 *
 * El onChange del input HTML es opcional — toda la edición pasa por el teclado virtual,
 * pero conviene mantenerlo por si conectan un teclado físico.
 */
export function useKeyboardInput<
  T extends HTMLInputElement | HTMLTextAreaElement = HTMLInputElement,
>({ value, onChange, label, maxLength, enabled = true, secret }: UseKeyboardInputOptions) {
  const id = useId();
  const ref = useRef<T>(null);
  const { activeId, open, close, update } = useKeyboardContext();
  const isActive = activeId === id;

  useEffect(() => {
    if (!isActive) return;
    update(id, { value, onChange, label, maxLength, secret });
  }, [isActive, id, value, onChange, label, maxLength, secret, update]);

  const triggerOpen = useCallback(() => {
    if (!enabled) return;
    open({
      id,
      layout: 'qwerty',
      label,
      value,
      onChange,
      inputRef: ref,
      maxLength,
      secret,
    });
  }, [enabled, id, label, value, onChange, maxLength, secret, open]);

  return {
    inputProps: {
      ref: ref as React.Ref<T>,
      onFocus: triggerOpen,
      // En mobile, evita que el teclado del SO aparezca encima del nuestro.
      inputMode: 'none' as const,
    },
    open: triggerOpen,
    close: useCallback(() => {
      if (isActive) close();
    }, [isActive, close]),
    isOpen: isActive,
  };
}
