# Padrón de cédulas (`padron_ci`)

Tabla de **referencia global** (no multi-tenant) que mapea `CI → nombre/apellido`.
Sirve para autocompletar el nombre cuando el cajero tipea una cédula al cargar un
cliente. **No es la lista de clientes**: el `cliente` real se crea recién cuando la
persona compra.

## Origen de los datos

Base externa `analisisclinicos` (MySQL/XAMPP), tabla `paciente` (~6,9M filas).
Sólo se traen `CI`, `nombre` y `apellido` (el resto — teléfono/correo — viene vacío
en el origen).

### Particularidades resueltas en la carga

- **Encoding legacy**: la data está en codepage DOS (CP850). La `Ñ` se guarda como
  byte `0xA5` y los acentos en CP850. Sin transcodificar, Postgres rechaza por
  UTF-8 inválido. El script hace `iconv -f CP850 -t UTF-8`.
- **CRLF**: `mysql.exe` en Windows emite fin de línea CRLF; se normaliza a LF.
- **Duplicados**: ~7k CI repetidas. Se deduplica quedándose con el registro más
  reciente por CI (`MAX(PacienteId)`).
- **Basura**: se filtran CI `<= 0` y nombres vacíos.

## Cómo cargar / recargar

```bash
bash apps/api/scripts/padron-ci/cargar-padron.sh
```

Es **idempotente**: hace `TRUNCATE` + `COPY`, se puede correr cuantas veces haga
falta. La tabla la crea la migración Prisma `20260619130000_padron_ci` (correr
`prisma migrate deploy` antes de la primera carga).

Variables sobreescribibles por entorno (defaults pensados para este equipo):
`MYSQL_BIN`, `MYSQL_USER`, `MYSQL_DB`, `PSQL_BIN`, `PGHOST`, `PGPORT`, `PGUSER`,
`PGPASSWORD`, `PGDATABASE`, `TMPDIR`.

## Consumo

- API: `GET /api/clientes/padron/:ci` → `{ padron: { ci, nombre, apellido } }` o 404.
- Web: autocompletado en `ClienteFormModal` (al tipear la CI) y sugerencia en el
  buscador del POS (`ClienteSelector`) cuando se busca una CI que aún no es cliente.
