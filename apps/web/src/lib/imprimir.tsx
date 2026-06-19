import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { TicketTermico } from '@/components/imprimir/TicketTermico';
import { type ComprobanteDetalle } from '@/hooks/useComprobantes';

/**
 * Impresión directa de un comprobante, sin abrir otra pestaña ni recargar nada.
 *
 * El cobro (`POST /comprobantes`) ya devuelve el `ComprobanteDetalle` completo,
 * así que evitamos el overhead del enfoque viejo (montar la ruta /imprimir en
 * un iframe → cargar toda la página Next + re-pedir el comprobante + 600ms).
 *
 * Cómo:
 *  1. Renderizamos el `TicketTermico` de forma síncrona (`flushSync`) en un
 *     contenedor fuera de pantalla y tomamos su HTML ya pintado (estilos inline
 *     + QR como SVG inline).
 *  2. Armamos un documento HTML completo con ese markup y lo cargamos en un
 *     iframe oculto vía Blob URL (`src`). Es una carga REAL de documento, que
 *     pinta confiablemente para imprimir — a diferencia de `document.write` o
 *     de renderizar React directo dentro del iframe, que salían en blanco.
 *  3. Imprimimos en `onload` y limpiamos tras `afterprint`.
 */
export function imprimirComprobante(comp: ComprobanteDetalle): void {
  if (typeof document === 'undefined') return;

  // 1) Snapshot del ticket ya renderizado en el documento principal.
  const holder = document.createElement('div');
  holder.setAttribute('aria-hidden', 'true');
  holder.style.position = 'fixed';
  holder.style.left = '-99999px';
  holder.style.top = '0';
  document.body.appendChild(holder);

  const root = createRoot(holder);
  flushSync(() => root.render(<TicketTermico comp={comp} />));
  const ticketHtml = holder.innerHTML;
  root.unmount();
  holder.remove();

  // 2) Iframe oculto.
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';

  const tieneTicket = Boolean(ticketHtml.trim());
  let blobUrl: string | null = null;
  let limpiado = false;
  const limpiar = () => {
    if (limpiado) return;
    limpiado = true;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    iframe.remove();
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      limpiar();
      return;
    }
    win.addEventListener('afterprint', () => setTimeout(limpiar, 300), { once: true });
    // Con el Blob disparamos nosotros el print; en el fallback por ruta la
    // propia página /imprimir se auto-imprime, así no lo llamamos dos veces.
    if (tieneTicket) {
      win.focus();
      win.print();
    }
  };

  if (tieneTicket) {
    const docHtml =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<style>' +
      '@page { size: 75mm auto; margin: 0; }' +
      'html, body { margin: 0; padding: 0; background: #fff; }' +
      '</style></head><body>' +
      ticketHtml +
      '</body></html>';
    blobUrl = URL.createObjectURL(new Blob([docHtml], { type: 'text/html' }));
    iframe.src = blobUrl;
  } else {
    // Fallback defensivo: si por algún motivo el snapshot salió vacío, caemos a
    // la ruta /imprimir (más lenta pero probada). No debería pasar.
    iframe.src = `/comprobantes/${comp.id}/imprimir`;
  }

  document.body.appendChild(iframe);

  // Fallback duro: nunca dejar el iframe colgando si no llega `afterprint`.
  setTimeout(limpiar, 60_000);
}
