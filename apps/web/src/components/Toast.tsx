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
  // Toast no debe tocar `<html>` ni marcar `inert`/`aria-hidden` en el resto
  // de la app — si no, los inputs detrás dejan de recibir clicks/teclas cuando
  // el toast queda "huérfano" tras una navegación.
  heightAuto: false,
  backdrop: false,
  didOpen: (el) => {
    el.addEventListener('mouseenter', Swal.stopTimer);
    el.addEventListener('mouseleave', Swal.resumeTimer);
  },
  didDestroy: () => limpiarRestosSwal(),
});

/**
 * Limpieza preventiva: SweetAlert2 a veces deja `inert` o `aria-hidden`
 * pegados en hijos del `<body>` cuando un swal queda huérfano por navegación
 * o re-render. Eso bloquea clicks/teclado en toda la app sin signos visibles.
 * Este helper se llama en cada toast y modal — inocuo si no hay nada pegado.
 */
function limpiarRestosSwal() {
  if (typeof document === 'undefined') return;
  // Si NO hay un swal-container en el DOM, sacar cualquier inert/aria-hidden
  // que pueda haber quedado de un swal que ya cerró.
  const swalAbierto = document.querySelector('.swal2-container');
  if (swalAbierto) return;
  document.querySelectorAll('[inert], [aria-hidden="true"]').forEach((el) => {
    // Sólo limpiamos los que SweetAlert pone en hijos directos del body.
    if (el.parentElement === document.body) {
      el.removeAttribute('inert');
      el.removeAttribute('aria-hidden');
    }
  });
  // Estilos que swal le pone al <html> con heightAuto: true
  if (document.documentElement.style.overflow === 'hidden') {
    document.documentElement.style.removeProperty('overflow');
  }
  if (document.documentElement.style.paddingRight) {
    document.documentElement.style.removeProperty('padding-right');
  }
  document.body.classList.remove('swal2-shown', 'swal2-height-auto');
  document.documentElement.classList.remove('swal2-shown', 'swal2-height-auto');
}

function fireToast(icon: SweetAlertIcon, message: string) {
  limpiarRestosSwal();
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
  limpiarRestosSwal();
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
    // Importante: NO tocar los estilos del <html> (padding-right + overflow:hidden)
    // que SweetAlert agrega por default para evitar scroll-shift. En ciertos
    // timings (modal sobre modal, doble click) esos estilos quedan pegados y
    // bloquean la interacción con inputs detrás.
    heightAuto: false,
    didDestroy: () => limpiarRestosSwal(),
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
  limpiarRestosSwal();
  await Swal.fire({
    title: opts.titulo,
    text: opts.html ? undefined : opts.mensaje,
    html: opts.html,
    icon: opts.icon ?? 'info',
    confirmButtonText: opts.textoOk ?? 'OK',
    confirmButtonColor: '#0891b2',
    heightAuto: false,
    didDestroy: () => limpiarRestosSwal(),
  });
}
