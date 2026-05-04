'use client';

import Swal, { type SweetAlertIcon } from 'sweetalert2';

/**
 * Capa única de mensajes de la app — todo va por SweetAlert2.
 *
 * - `toast.success/error/info/warn(msg)` — toast pequeño arriba a la derecha,
 *   no bloqueante, autocierra a los 3.5 s.
 * - `confirmar({ titulo, mensaje, ... })` — modal confirmación destructiva,
 *   devuelve Promise<boolean>.
 * - `mensaje({ titulo, mensaje, icon })` — modal informativo con un solo
 *   botón OK, devuelve Promise<void>.
 *
 * El componente <ToastContainer/> ya no es necesario — Swal monta su propio
 * portal en <body>.
 */

// ───── Toasts ─────

const ToastSwal = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3500,
  timerProgressBar: true,
  showCloseButton: true,
  didOpen: (el) => {
    el.addEventListener('mouseenter', Swal.stopTimer);
    el.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

function fireToast(icon: SweetAlertIcon, message: string) {
  void ToastSwal.fire({ icon, title: message });
}

export const toast = {
  success: (message: string) => fireToast('success', message),
  error: (message: string) => fireToast('error', message),
  info: (message: string) => fireToast('info', message),
  warn: (message: string) => fireToast('warning', message),
};

// ───── Modales: confirmación + aviso ─────

export interface ConfirmarOptions {
  titulo: string;
  /** Texto principal. Acepta plain string. Para HTML usá `html` en su lugar. */
  mensaje?: string;
  html?: string;
  /** "warning" (default), "question", "info", "error", "success" */
  icon?: SweetAlertIcon;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Si true, el botón confirmar se pinta rojo (acción destructiva). */
  destructivo?: boolean;
}

export async function confirmar(opts: ConfirmarOptions): Promise<boolean> {
  const result = await Swal.fire({
    title: opts.titulo,
    text: opts.html ? undefined : opts.mensaje,
    html: opts.html,
    icon: opts.icon ?? 'warning',
    showCancelButton: true,
    confirmButtonText: opts.textoConfirmar ?? 'Confirmar',
    cancelButtonText: opts.textoCancelar ?? 'Cancelar',
    confirmButtonColor: opts.destructivo ? '#dc2626' /* red-600 */ : '#0891b2' /* cyan-600 */,
    cancelButtonColor: '#6b7280' /* gray-500 */,
    reverseButtons: true,
    focusCancel: opts.destructivo,
  });
  return result.isConfirmed;
}

export interface MensajeOptions {
  titulo: string;
  mensaje?: string;
  html?: string;
  icon?: SweetAlertIcon;
  textoOk?: string;
}

export async function mensaje(opts: MensajeOptions): Promise<void> {
  await Swal.fire({
    title: opts.titulo,
    text: opts.html ? undefined : opts.mensaje,
    html: opts.html,
    icon: opts.icon ?? 'info',
    confirmButtonText: opts.textoOk ?? 'OK',
    confirmButtonColor: '#0891b2',
  });
}
