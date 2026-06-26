/**
 * Unidades de medida — fuente ÚNICA compartida entre la API y el front.
 *
 * Debe coincidir EXACTAMENTE con el enum `UnidadMedida` de Prisma
 * (apps/api/prisma/schema.prisma). El front no puede importar `@prisma/client`,
 * así que el tipo-unión y la clasificación por familia viven acá (mismo patrón
 * que `RolCode`). La matemática de conversión (factores, equivalencias por
 * insumo) vive en el backend (apps/api/src/lib/unidad-medida.ts).
 */

export const UNIDADES_MEDIDA = [
  'UNIDAD',
  'KILOGRAMO',
  'GRAMO',
  'LITRO',
  'MILILITRO',
  'PORCION',
  'DOCENA',
] as const;

export type UnidadMedida = (typeof UNIDADES_MEDIDA)[number];

/** Tipo de magnitud. Las conversiones DENTRO de una familia son universales;
 *  cruzar familias requiere una equivalencia cargada por insumo. */
export type FamiliaUnidad = 'MASA' | 'VOLUMEN' | 'CONTEO' | 'PORCION';

export const FAMILIA_UNIDAD: Record<UnidadMedida, FamiliaUnidad> = {
  GRAMO: 'MASA',
  KILOGRAMO: 'MASA',
  MILILITRO: 'VOLUMEN',
  LITRO: 'VOLUMEN',
  UNIDAD: 'CONTEO',
  DOCENA: 'CONTEO',
  PORCION: 'PORCION',
};

export function familiaDe(unidad: UnidadMedida): FamiliaUnidad {
  return FAMILIA_UNIDAD[unidad];
}

const ETIQUETA_FAMILIA: Record<FamiliaUnidad, string> = {
  MASA: 'peso',
  VOLUMEN: 'volumen',
  CONTEO: 'conteo',
  PORCION: 'porción',
};

export function etiquetaFamilia(f: FamiliaUnidad): string {
  return ETIQUETA_FAMILIA[f];
}

/** "GRAMO" → "Gramo" (para selects/labels). */
export function etiquetaUnidad(u: UnidadMedida): string {
  return u.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
