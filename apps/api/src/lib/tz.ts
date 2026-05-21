/**
 * Helpers para resolver "ahora" en zona horaria de la empresa/sucursal.
 * Centralizado para que promociones, reportes y cualquier feature time-based
 * usen exactamente el mismo cálculo.
 */

/**
 * Devuelve "ahora" como `{ diaSemana 0-6, horaHHmm }` en la zona horaria dada.
 * - 0 = domingo, 6 = sábado.
 * - `horaHHmm` formato `HH:mm` (24h), comparable como string lexicográficamente.
 *
 * Usa `Intl.DateTimeFormat` (no requiere date-fns-tz). Maneja el edge case de
 * algunos runtimes que devuelven `"24"` en lugar de `"00"` para medianoche.
 */
export function ahoraEnTz(now: Date, timeZone: string): { diaSemana: number; horaHHmm: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const partes = fmt.formatToParts(now);
  const weekday = partes.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hour = partes.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = partes.find((p) => p.type === 'minute')?.value ?? '00';
  if (hour === '24') hour = '00';
  const mapaDow: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    diaSemana: mapaDow[weekday] ?? 0,
    horaHHmm: `${hour}:${minute}`,
  };
}
