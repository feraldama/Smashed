'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

import { useKeyboardContext } from '@/components/Keyboard/KeyboardProvider';

interface UseNumpadInputOptions {
  value: string;
  onChange: (next: string) => void;
  label: string;
  formatPreview?: (raw: string) => string;
  maxLength?: number;
  allowDecimal?: boolean;
  /** Si es false, no se abre al hacer foco (útil para deshabilitarlo condicionalmente) */
  enabled?: boolean;
}

/**
 * Conecta un input (o cualquier elemento focusable) al teclado numérico global.
 *
 *   const { inputProps } = useNumpadInput({ value, onChange, label: 'Monto' });
 *   <input type="text" {...inputProps} value={value} ... />
 *
 * Para elementos no-input (ej: botón con cantidad), usar el `open` que se devuelve.
 */
export function useNumpadInput<T extends HTMLElement = HTMLInputElement>({
  value,
  onChange,
  label,
  formatPreview,
  maxLength,
  allowDecimal,
  enabled = true,
}: UseNumpadInputOptions) {
  const id = useId();
  const ref = useRef<T>(null);
  const { activeId, open, close, update } = useKeyboardContext();
  const isActive = activeId === id;

  useEffect(() => {
    if (!isActive) return;
    update(id, {
      value,
      onChange,
      label,
      formatPreview,
      maxLength,
      allowDecimal,
    });
  }, [isActive, id, value, onChange, label, formatPreview, maxLength, allowDecimal, update]);

  const triggerOpen = useCallback(() => {
    if (!enabled) return;
    open({
      id,
      layout: 'numeric',
      label,
      value,
      onChange,
      inputRef: ref,
      formatPreview,
      maxLength,
      allowDecimal,
    });
  }, [enabled, id, label, value, onChange, formatPreview, maxLength, allowDecimal, open]);

  return {
    inputProps: {
      ref: ref as React.Ref<T>,
      onFocus: triggerOpen,
      inputMode: 'none' as const,
    },
    open: triggerOpen,
    close: useCallback(() => {
      if (isActive) close();
    }, [isActive, close]),
    isOpen: isActive,
  };
}
