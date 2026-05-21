import { TipoPromocion } from '@prisma/client';
import { z } from 'zod';

// "HH:mm" 24h, valida que sea hora real (00:00 — 23:59).
const horaHHmm = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato de hora inválido — usar HH:mm');

const productoEnPromo = z.object({
  productoVentaId: z.string().cuid(),
  // Para PRECIO_FIJO/PORCENTAJE/NXM se ignora (cantidadMin=1). Para COMBO define
  // cuántas unidades de este producto entran en el combo (ej. combo familiar:
  // 2 hamburguesas, 1 papas, 2 choops).
  cantidadMin: z.number().int().min(1).max(99).default(1),
});

const baseCrearPromocion = z.object({
  nombre: z.string().trim().min(1).max(100),
  descripcion: z.string().trim().max(500).optional().nullable(),
  tipo: z.nativeEnum(TipoPromocion),
  // Campos condicionales por tipo — el refine() valida coherencia.
  precioFijo: z.number().int().min(0).max(999_999_999).optional().nullable(),
  porcentaje: z.number().int().min(1).max(10_000).optional().nullable(),
  nxmLleva: z.number().int().min(2).max(99).optional().nullable(),
  nxmPaga: z.number().int().min(1).max(99).optional().nullable(),
  // Fechas en ISO. Null permitido = sin tope.
  vigenciaDesde: z.string().datetime().optional().nullable(),
  vigenciaHasta: z.string().datetime().optional().nullable(),
  // Días de semana: array de enteros 0-6, sin duplicados. Vacío = todos los días.
  diasSemana: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  horaInicio: horaHHmm.optional().nullable(),
  horaFin: horaHHmm.optional().nullable(),
  activo: z.boolean().default(true),
  iconoEmoji: z.string().trim().max(8).optional().nullable(),
  ordenMenu: z.number().int().min(0).max(9999).default(0),
  productos: z.array(productoEnPromo).min(1).max(50),
  // IDs de sucursales donde aplica. Vacío = todas las sucursales de la empresa.
  sucursalIds: z.array(z.string().cuid()).max(50).default([]),
});

function validarCoherencia(
  d: z.infer<typeof baseCrearPromocion>,
): { ok: true } | { ok: false; path: string[]; message: string } {
  // Campos requeridos según tipo.
  if (d.tipo === 'PRECIO_FIJO' || d.tipo === 'COMBO') {
    if (d.precioFijo == null || d.precioFijo <= 0) {
      return {
        ok: false,
        path: ['precioFijo'],
        message: 'precioFijo > 0 requerido para PRECIO_FIJO/COMBO',
      };
    }
  }
  if (d.tipo === 'PORCENTAJE') {
    if (d.porcentaje == null) {
      return {
        ok: false,
        path: ['porcentaje'],
        message: 'porcentaje requerido (centésimos del 1%, 1-10000)',
      };
    }
  }
  if (d.tipo === 'NXM') {
    if (d.nxmLleva == null || d.nxmPaga == null) {
      return { ok: false, path: ['nxmLleva'], message: 'nxmLleva y nxmPaga requeridos para NXM' };
    }
    if (d.nxmPaga >= d.nxmLleva) {
      return { ok: false, path: ['nxmPaga'], message: 'nxmPaga debe ser menor que nxmLleva' };
    }
  }
  // Diás de semana sin duplicados.
  if (d.diasSemana && new Set(d.diasSemana).size !== d.diasSemana.length) {
    return { ok: false, path: ['diasSemana'], message: 'Días de semana duplicados' };
  }
  // Hora inicio < fin (si ambas vienen).
  if (d.horaInicio && d.horaFin && d.horaInicio >= d.horaFin) {
    return { ok: false, path: ['horaFin'], message: 'horaFin debe ser posterior a horaInicio' };
  }
  // Vigencia coherente.
  if (d.vigenciaDesde && d.vigenciaHasta && d.vigenciaDesde >= d.vigenciaHasta) {
    return {
      ok: false,
      path: ['vigenciaHasta'],
      message: 'vigenciaHasta debe ser posterior a vigenciaDesde',
    };
  }
  // Productos sin duplicados.
  const ids = d.productos.map((p) => p.productoVentaId);
  if (new Set(ids).size !== ids.length) {
    return { ok: false, path: ['productos'], message: 'Productos duplicados en la promoción' };
  }
  // Sucursales sin duplicados.
  if (new Set(d.sucursalIds).size !== d.sucursalIds.length) {
    return { ok: false, path: ['sucursalIds'], message: 'Sucursales duplicadas' };
  }
  // COMBO requiere al menos 2 líneas de producto (sino no es combo).
  if (d.tipo === 'COMBO' && d.productos.length < 2) {
    return { ok: false, path: ['productos'], message: 'Un COMBO necesita al menos 2 productos' };
  }
  return { ok: true };
}

export const crearPromocionInput = baseCrearPromocion.superRefine((d, ctx) => {
  const r = validarCoherencia(d);
  if (!r.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: r.path, message: r.message });
});

// PATCH: todos los campos opcionales, pero si cambian campos relevantes, igual
// validamos coherencia con los valores nuevos mergeados con los viejos. Eso lo
// hace el service — acá solo aceptamos un subconjunto.
export const actualizarPromocionInput = baseCrearPromocion.partial();

export const promocionIdParam = z.object({ id: z.string().cuid() });

export const listarPromocionesQuery = z.object({
  // 'TODAS' | 'ACTIVAS' (activo=true y no soft-deleted) | 'INACTIVAS'
  filtro: z.enum(['TODAS', 'ACTIVAS', 'INACTIVAS']).default('TODAS'),
  q: z.string().trim().max(100).optional(),
});

export const vigentesQuery = z.object({
  sucursalId: z.string().cuid(),
  // Para tests/preview: forzar un instante distinto a "ahora".
  now: z.string().datetime().optional(),
});

export type CrearPromocionInput = z.infer<typeof crearPromocionInput>;
export type ActualizarPromocionInput = z.infer<typeof actualizarPromocionInput>;
export type ListarPromocionesQuery = z.infer<typeof listarPromocionesQuery>;
export type VigentesQuery = z.infer<typeof vigentesQuery>;
