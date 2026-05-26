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
  /** Si es false, no se abre al hacer foco. */
  enabled?: boolean;
}

/**
 * Conecta un input/elemento focusable al teclado numérico global.
 * Solo dispara cuando el rol del usuario es CAJERO (gate en el provider).
 * Para otros roles, los inputProps NO incluyen `onFocus` ni `inputMode='none'`,
 * por lo que el input se comporta normal (teclado físico o del SO).
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
  const { enabled: kbEnabled, activeId, open, close, update } = useKeyboardContext();
  const isActive = activeId === id;
  const canOpen = enabled && kbEnabled;

  useEffect(() => {
    if (!isActive) return;
    update(id, { value, onChange, label, formatPreview, maxLength, allowDecimal });
  }, [isActive, id, value, onChange, label, formatPreview, maxLength, allowDecimal, update]);

  const triggerOpen = useCallback(() => {
    if (!canOpen) return;
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
  }, [canOpen, id, label, value, onChange, formatPreview, maxLength, allowDecimal, open]);

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
