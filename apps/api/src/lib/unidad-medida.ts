import { FAMILIA_UNIDAD } from '@smash/shared-types';

import { AppError } from './errors.js';

import type { UnidadMedida } from '@prisma/client';

// Familia de una unidad + etiquetas: fuente única en @smash/shared-types
// (compartida con el front). Se re-exportan acá para los consumidores del
// backend que ya las importaban desde este módulo.
export {
  etiquetaFamilia,
  etiquetaUnidad,
  familiaDe,
  type FamiliaUnidad,
} from '@smash/shared-types';

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

  const fDesde = FAMILIA_UNIDAD[desde];
  const fHacia = FAMILIA_UNIDAD[hacia];
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

/**
 * Equivalencia de una unidad alternativa de un insumo respecto a su unidad de
 * stock (la "base"). Espejo de `UnidadInsumo` en la BD:
 *   `cantidadUnidad` [unidad]  =  `cantidadBase` [unidad base del insumo]
 */
export interface UnidadInsumoSlim {
  unidad: UnidadMedida;
  cantidadUnidad: number;
  cantidadBase: number;
}

/**
 * Convierte una cantidad expresada en `desde` a la unidad de stock (`base`) de
 * un insumo, atravesando familias distintas vía las equivalencias declaradas
 * del insumo (`unidades`).
 *
 * Estrategia en tres niveles:
 *  1. `desde === base`         → sin conversión.
 *  2. misma familia            → conversión universal (g↔kg, ml↔l, etc.).
 *  3. familia distinta         → busca una equivalencia del insumo cuya unidad
 *     comparta familia con `desde`, lleva `desde` hasta esa unidad-puente
 *     (universal, misma familia) y cruza la familia con el ratio del insumo.
 *
 * Si ninguna equivalencia cubre la familia de `desde`, tira
 * `AppError('VALIDATION_ERROR')` con un mensaje que sugiere cargarla — es el
 * síntoma de "stockeo el insumo en X pero la receta lo pide en Y sin definir
 * cuánto pesa/rinde".
 */
export function convertirAUnidadBase(
  cantidad: number,
  desde: UnidadMedida,
  base: UnidadMedida,
  unidades: UnidadInsumoSlim[] = [],
): number {
  if (desde === base) return cantidad;
  if (FAMILIA_UNIDAD[desde] === FAMILIA_UNIDAD[base]) {
    return (cantidad * A_BASE[desde]) / A_BASE[base];
  }

  const puente = unidades.find((u) => FAMILIA_UNIDAD[u.unidad] === FAMILIA_UNIDAD[desde]);
  if (puente && puente.cantidadUnidad > 0 && puente.cantidadBase > 0) {
    // 1) llevar `desde` hasta la unidad del puente (misma familia → universal)
    const enPuente = (cantidad * A_BASE[desde]) / A_BASE[puente.unidad];
    // 2) cruzar la familia: cantidadUnidad [puente] = cantidadBase [base]
    return (enPuente * puente.cantidadBase) / puente.cantidadUnidad;
  }

  throw new AppError(
    'VALIDATION_ERROR',
    `No se puede convertir ${desde} a ${base} — son de tipos distintos ` +
      `(${FAMILIA_UNIDAD[desde].toLowerCase()} vs. ${FAMILIA_UNIDAD[base].toLowerCase()}) y el ` +
      `insumo no tiene una equivalencia cargada para ${FAMILIA_UNIDAD[desde].toLowerCase()}. ` +
      `Definí la equivalencia en el insumo (ej: "1 ${base.toLowerCase()} = N ${desde.toLowerCase()}").`,
    { desde, base },
  );
}

/**
 * Predicado puro (no tira) para validar al guardar una receta que la unidad de
 * un item se puede convertir a la unidad de stock del insumo. Misma lógica de
 * niveles que `convertirAUnidadBase`, sin hacer la cuenta.
 */
export function puedeConvertirAUnidadBase(
  desde: UnidadMedida,
  base: UnidadMedida,
  unidades: UnidadInsumoSlim[] = [],
): boolean {
  if (desde === base) return true;
  if (FAMILIA_UNIDAD[desde] === FAMILIA_UNIDAD[base]) return true;
  return unidades.some(
    (u) =>
      FAMILIA_UNIDAD[u.unidad] === FAMILIA_UNIDAD[desde] &&
      u.cantidadUnidad > 0 &&
      u.cantidadBase > 0,
  );
}
