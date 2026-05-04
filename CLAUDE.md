# Smash POS — instrucciones para asistentes IA

## Mensajes de commit

El proyecto usa **commitlint** con preset `@commitlint/config-conventional` +
reglas custom (ver `commitlint.config.cjs`). Para que el commit pase los hooks
de Husky, hay que respetar esto:

### Reglas duras (las hace cumplir commitlint)

- **Header (primera línea)**: máximo **100 caracteres**, formato
  `type(scope): subject`. Si no entra, acortar el `subject` o sacar el `scope`.
- **Body**: cada línea **debe** ser ≤ **100 caracteres**. Wrappear bullets
  largos en varias líneas. Esta es la regla que típicamente rompe commits
  generados por IA — siempre verificar antes de proponer.
- **Type permitidos**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore`, `revert`. Cualquier otro es rechazado.
- **Línea en blanco** obligatoria entre header y body, y entre body y footer.

### Recomendaciones de estilo

- **Subject** en presente, imperativo, sin punto final, en minúscula
  (ej: `feat: agregar selector de cliente en cobro`).
- **Scope** opcional, en minúscula, una sola palabra o ruta corta
  (`feat(pos): ...`, `fix(caja/cierre): ...`).
- Idioma: **español rioplatense** (mismo idioma del código y comentarios).
- Si el cambio toca varias áreas, preferir un commit por área antes que un
  mega-commit. Si va junto, listar en bullets en el body.
- Para cambios técnicos no obvios, explicar el **por qué** en el body
  (no el qué — eso ya está en el diff).

### Plantilla recomendada

```
type(scope): subject corto y claro (≤ 100 chars)

- bullet con detalle relevante (cada línea ≤ 100 chars,
  wrappear si hace falta).
- otra línea con contexto técnico, motivación, edge case.

Co-Authored-By: ... <noreply@anthropic.com>
```

### Ejemplo bien formateado

```
feat(caja): ticket Z post-cierre + ocultar totales al cajero

- Endpoint nuevo GET /api/cajas/cierres/:id para imprimir el ticket Z.
- CerrarCajaModal acepta `modoCajero`: oculta total ventas, esperado
  y diferencia. El cajero cuenta a ciegas y la verdad sale en el ticket.
- Pantalla /caja/cierres/[id]/imprimir con auto-print térmico 80mm.
```

### Antes de proponer un commit

1. Listá las líneas del mensaje y confirmá que ninguna pasa los 100 chars.
2. Si una línea pasa, wrappeala — no la cortes a la mitad de una palabra.
3. Si hay duda sobre el scope o el type, preguntá; mejor que rebote husky.

## Zona horaria y formato

- Idioma: español rioplatense paraguayo (no gallego ni neutro).
- Moneda: guaraníes (Gs.), enteros, sin decimales.
- Fechas: formato `DD/MM/YYYY` o ISO si es para BD/API.

## Comandos útiles

- `pnpm --filter @smash/api typecheck` / `lint` / `test`
- `pnpm --filter @smash/web typecheck` / `lint`
- `pnpm --filter @smash/api prisma:migrate -- --name <nombre>`
- `pnpm --filter @smash/api prisma:generate`
