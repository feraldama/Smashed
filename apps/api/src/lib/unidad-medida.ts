import { AppError } from './errors.js';

import type { UnidadMedida } from '@prisma/client';

/**
 * Conversión de cantidades entre `UnidadMedida` compatibles.
 *
 * Razón de existir: `ItemReceta.cantidad` se carga en `ItemReceta.unidadMedida`,
 * que puede no coincidir con la `unidadMedida` del `ProductoInventario` al
 * que apunta. Sin conversión, multiplicar 300 (GRAMO) × costo por KILOGRAMO
 * infla el costo 1000×. Lo mismo aplica a sub-recetas (rinde en LITRO,
 * item en MILILITRO).
 *
 * Conversiones soportadas:
 *  - Masa:     GRAMO ↔ KILOGRAMO  (factor 1000)
 *  - Volumen:  MILILITRO ↔ LITRO  (factor 1000)
 *  - Conteo:   DOCENA ↔ UNIDAD    (factor 12)
 *  - Misma unidad: siempre OK (factor 1).
 *
 * `PORCION` es ambigua (porción de qué) → sólo compatible consigo misma.
 * Cualquier otro par tira `AppError('VALIDATION_ERROR', ...)` con detalle
 * útil para que el usuario corrija la receta o el insumo.
 */

type Familia = 'MASA' | 'VOLUMEN' | 'CONTEO' | 'PORCION';

const FAMILIA: Record<UnidadMedida, Familia> = {
  GRAMO: 'MASA',
  KILOGRAMO: 'MASA',
  MILILITRO: 'VOLUMEN',
  LITRO: 'VOLUMEN',
  UNIDAD: 'CONTEO',
  DOCENA: 'CONTEO',
  PORCION: 'PORCION',
};

/** Factor para convertir 1 unidad de la clave a la unidad "base" de su familia. */
const A_BASE: Record<UnidadMedida, number> = {
  // base MASA = GRAMO
  GRAMO: 1,
  KILOGRAMO: 1000,
  // base VOLUMEN = MILILITRO
  MILILITRO: 1,
  LITRO: 1000,
  // base CONTEO = UNIDAD
  UNIDAD: 1,
  DOCENA: 12,
  // base PORCION = PORCION (no convertible a otra cosa)
  PORCION: 1,
};

export function convertirCantidad(
  cantidad: number,
  desde: UnidadMedida,
  hacia: UnidadMedida,
): number {
  if (desde === hacia) return cantidad;

  const fDesde = FAMILIA[desde];
  const fHacia = FAMILIA[hacia];
  if (fDesde !== fHacia) {
    throw new AppError(
      'VALIDATION_ERROR',
      `No se puede convertir ${desde} a ${hacia} — son unidades de tipos distintos ` +
        `(${fDesde.toLowerCase()} vs. ${fHacia.toLowerCase()}). ` +
        `Revisá la receta o la unidad del insumo.`,
      { desde, hacia },
    );
  }

  return (cantidad * A_BASE[desde]) / A_BASE[hacia];
}
