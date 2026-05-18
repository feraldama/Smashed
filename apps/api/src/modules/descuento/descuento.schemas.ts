import { Rol, TipoDescuento } from '@prisma/client';
import { z } from 'zod';

// ───── Input: aplicar descuento a un pedido ─────

/** Credenciales del supervisor cuando el cajero escala un descuento. */
const supervisorAuthSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

/**
 * Input para aplicar descuento.
 *
 *  - tipo: PORCENTAJE | MONTO | CORTESIA
 *  - valor:
 *      - PORCENTAJE → centésimos del 1% (1500 = 15%). Rango [1, 10000].
 *      - MONTO → guaraníes (entero positivo).
 *      - CORTESIA → ignorado (se interpreta 100%). Aceptamos 0 por conveniencia.
 *  - motivoDescuentoId: obligatorio (auditoría/reporte).
 *  - observacion: texto libre, opcional.
 *  - autorización: una de (supervisorAuth | codigoAutorizacion) si excede el
 *    límite del cajero, o ninguna si está dentro del tope.
 */
export const aplicarDescuentoInput = z
  .object({
    tipo: z.nativeEnum(TipoDescuento),
    valor: z.number().int().min(0).max(10_000_000),
    motivoDescuentoId: z.string().cuid(),
    observacion: z.string().trim().max(500).optional(),
    supervisorAuth: supervisorAuthSchema.optional(),
    codigoAutorizacion: z.string().trim().min(4).max(32).optional(),
  })
  .refine((d) => !(d.supervisorAuth && d.codigoAutorizacion), {
    message: 'No mandes supervisorAuth Y codigoAutorizacion juntos — elegí uno',
    path: ['codigoAutorizacion'],
  })
  .refine(
    (d) => {
      if (d.tipo === 'PORCENTAJE') return d.valor >= 1 && d.valor <= 10000;
      if (d.tipo === 'MONTO') return d.valor >= 1;
      // CORTESIA: valor irrelevante.
      return true;
    },
    {
      message: 'Valor inválido: PORCENTAJE en centésimos del 1% (1-10000), MONTO en Gs. (>= 1)',
      path: ['valor'],
    },
  );

// ───── Input: verificar credenciales de supervisor (endpoint auxiliar) ─────

export const verificarSupervisorInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// ───── Motivos ─────

export const crearMotivoInput = z.object({
  nombre: z.string().trim().min(1).max(100),
  requiereAutorizacion: z.boolean().default(false),
  activo: z.boolean().default(true),
  ordenMenu: z.number().int().min(0).max(9999).default(0),
});

export const actualizarMotivoInput = crearMotivoInput.partial();

export const motivoIdParam = z.object({ id: z.string().cuid() });

// ───── Límites por rol ─────

/** Un solo PATCH puede actualizar varios roles a la vez. */
export const actualizarLimitesInput = z.object({
  limites: z
    .array(
      z.object({
        rol: z.nativeEnum(Rol),
        maxPorcentaje: z.number().int().min(0).max(100),
        puedeAutorizarOtros: z.boolean(),
        puedeUsarCortesia: z.boolean(),
      }),
    )
    .min(1)
    .max(20),
});

// ───── Códigos de autorización ─────

export const crearCodigoInput = z.object({
  maxPorcentaje: z.number().int().min(1).max(100),
  // Duración en horas desde ahora. Default 24h.
  expiraEnHoras: z.number().int().min(1).max(168).default(24),
});

export const codigoIdParam = z.object({ id: z.string().cuid() });

export const listarCodigosQuery = z.object({
  // 'ACTIVOS' (no usados y no expirados), 'USADOS', 'EXPIRADOS', 'TODOS'
  filtro: z.enum(['ACTIVOS', 'USADOS', 'EXPIRADOS', 'TODOS']).default('ACTIVOS'),
});

export type AplicarDescuentoInput = z.infer<typeof aplicarDescuentoInput>;
export type VerificarSupervisorInput = z.infer<typeof verificarSupervisorInput>;
export type CrearMotivoInput = z.infer<typeof crearMotivoInput>;
export type ActualizarMotivoInput = z.infer<typeof actualizarMotivoInput>;
export type ActualizarLimitesInput = z.infer<typeof actualizarLimitesInput>;
export type CrearCodigoInput = z.infer<typeof crearCodigoInput>;
export type ListarCodigosQuery = z.infer<typeof listarCodigosQuery>;
