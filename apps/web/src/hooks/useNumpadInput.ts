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

  // `onChange`/`formatPreview` suelen venir inline desde el consumidor, así que
  // cambian de identidad en cada render. Si los metiéramos como deps del efecto
  // `update` (o los empujáramos al session en cada cambio), tendríamos un loop
  // de re-render: update → setSession → re-render → nuevo onChange → update...
  // que clava la CPU mientras el teclado está abierto. Los guardamos en refs y
  // exponemos wrappers de identidad estable que leen siempre el último valor.
  const onChangeRef = useRef(onChange);
  const formatPreviewRef = useRef(formatPreview);
  useEffect(() => {
    onChangeRef.current = onChange;
    formatPreviewRef.current = formatPreview;
  });
  const hasFormatPreview = formatPreview != null;

  const stableOnChange = useCallback((next: string) => onChangeRef.current(next), []);
  const stableFormatPreview = useCallback(
    (raw: string) => (formatPreviewRef.current ? formatPreviewRef.current(raw) : raw),
    [],
  );

  // Solo sincronizamos al session los campos que de verdad cambian y que el
  // overlay lee directo (primitivos). Los callbacks ya son estables y se fijan
  // en `open()`, así que NO van como deps acá.
  useEffect(() => {
    if (!isActive) return;
    update(id, { value, label, maxLength, allowDecimal });
  }, [isActive, id, value, label, maxLength, allowDecimal, update]);

  const triggerOpen = useCallback(() => {
    if (!canOpen) return;
    open({
      id,
      layout: 'numeric',
      label,
      value,
      onChange: stableOnChange,
      inputRef: ref,
      formatPreview: hasFormatPreview ? stableFormatPreview : undefined,
      maxLength,
      allowDecimal,
    });
  }, [
    canOpen,
    id,
    label,
    value,
    stableOnChange,
    hasFormatPreview,
    stableFormatPreview,
    maxLength,
    allowDecimal,
    open,
  ]);

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
