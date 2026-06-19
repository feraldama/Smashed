/**
 * Impresión directa de comprobantes sin abrir una pestaña nueva.
 *
 * En vez de `window.open(.../imprimir, '_blank')` —que sacaba al cajero del POS
 * y mostraba de nuevo el diálogo de impresión en otra pestaña— montamos la
 * página `/imprimir` dentro de un iframe oculto. Esa página ya tiene su
 * auto-print (window.print() a los ~600ms) y el CSS térmico de 75mm, así que
 * al cargar dispara el diálogo de impresión sobre el contenido del iframe sin
 * que el usuario abandone la pantalla actual.
 *
 * El iframe se limpia solo tras `afterprint`, con un fallback temporizado por
 * si el navegador no emite el evento (algunos lo omiten si se cancela).
 */
export function imprimirComprobante(comprobanteId: string): void {
  if (typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  iframe.src = `/comprobantes/${comprobanteId}/imprimir`;

  let removido = false;
  const remover = () => {
    if (removido) return;
    removido = true;
    iframe.remove();
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      remover();
      return;
    }
    // La propia página dispara window.print(); sólo gestionamos la limpieza.
    win.addEventListener('afterprint', () => setTimeout(remover, 500), { once: true });
  };

  // Fallback duro: nunca dejar el iframe colgando aunque no llegue afterprint.
  setTimeout(remover, 60_000);

  document.body.appendChild(iframe);
}
