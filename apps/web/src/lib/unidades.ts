/**
 * Unidades de medida en el front. La clasificación por familia y las etiquetas
 * viven en `@smash/shared-types` (fuente única compartida con la API). Acá solo
 * se re-exportan con los nombres que usan los componentes y se agrega el helper
 * `unidadesPermitidasParaInsumo`, específico del front.
 */
import { familiaDe, UNIDADES_MEDIDA } from '@smash/shared-types';

import type { UnidadAlternativa, UnidadMedida } from '@/hooks/useInventario';

export {
  UNIDADES_MEDIDA as TODAS_UNIDADES,
  FAMILIA_UNIDAD,
  familiaDe as familiaUnidad,
  etiquetaFamilia,
  etiquetaUnidad,
  type FamiliaUnidad,
} from '@smash/shared-types';

/**
 * Unidades que una receta puede usar para un insumo: las de la familia de su
 * unidad de stock + las familias de sus equivalencias cargadas. Es exactamente
 * lo que el backend acepta sin tirar error de conversión.
 */
export function unidadesPermitidasParaInsumo(insumo: {
  unidadMedida: UnidadMedida;
  unidadesAlternativas?: UnidadAlternativa[];
}): UnidadMedida[] {
  const familias = new Set([familiaDe(insumo.unidadMedida)]);
  for (const u of insumo.unidadesAlternativas ?? []) familias.add(familiaDe(u.unidad));
  return UNIDADES_MEDIDA.filter((u) => familias.has(familiaDe(u)));
}
