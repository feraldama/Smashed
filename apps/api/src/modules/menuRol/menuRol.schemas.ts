import { z } from 'zod';

/**
 * Body de PUT /menu-rol:
 * {
 *   asignaciones: {
 *     ADMIN_EMPRESA: ['/productos', '/combos', ...],
 *     CAJERO: ['/pos', '/caja', ...],
 *     ...
 *   }
 * }
 *
 * Cada rol mapea a la lista completa de paths que tiene permitidos.
 * Lo que no está en la lista, se quita.
 *
 * El servicio valida que las keys sean roles configurables (sin SUPER_ADMIN)
 * y que los paths existan en el catálogo MENU_DEFINICIONES.
 */
export const actualizarMatrizInput = z.object({
  asignaciones: z.record(z.string(), z.array(z.string().trim().min(1).max(150))),
});

export type ActualizarMatrizInput = z.infer<typeof actualizarMatrizInput>;
