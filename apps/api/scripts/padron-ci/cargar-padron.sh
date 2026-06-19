#!/usr/bin/env bash
#
# Carga (one-time / re-ejecutable) del padrón de cédulas desde la base externa
# `analisisclinicos` (MySQL/XAMPP) hacia la tabla `padron_ci` de Smash (Postgres).
#
# Pipeline:
#   1. Export deduplicado y limpio desde MySQL → TSV.
#   2. Transcodificación CP850/DOS → UTF-8 (la data legacy guarda Ñ como 0xA5,
#      acentos en codepage DOS; sin esto Postgres rechaza por UTF-8 inválido).
#   3. Limpieza de CRLF → LF (mysql.exe en Windows emite CRLF).
#   4. TRUNCATE + COPY a `padron_ci` (transaccional: o entra todo o nada).
#
# Dedupe: se queda con el registro MÁS RECIENTE por CI (MAX(PacienteId)).
# Filtra CI <= 0 y nombres vacíos.
#
# Requisitos: mysql.exe, psql, iconv, tr en el PATH (o ajustar las vars).
# Idempotente: hace TRUNCATE antes del COPY, se puede correr las veces que haga falta.
#
# Uso:
#   bash cargar-padron.sh
# Variables sobreescribibles por entorno (con defaults de este entorno):
#   MYSQL_BIN, MYSQL_USER, MYSQL_DB, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, TMPDIR
set -euo pipefail

MYSQL_BIN="${MYSQL_BIN:-/c/xampp/mysql/bin/mysql.exe}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_DB="${MYSQL_DB:-analisisclinicos}"

PSQL_BIN="${PSQL_BIN:-/c/Program Files/PostgreSQL/18/bin/psql.exe}"
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-12345}"
export PGDATABASE="${PGDATABASE:-smash}"

TMPDIR="${TMPDIR:-/tmp}"
RAW="$TMPDIR/padron_raw.tsv"
UTF8="$TMPDIR/padron_utf8.csv"

echo "==> 1/4  Exportando padrón deduplicado desde MySQL ($MYSQL_DB.paciente)…"
"$MYSQL_BIN" -u "$MYSQL_USER" -N --batch "$MYSQL_DB" -e "
  SELECT p.PacienteCI, TRIM(p.PacienteNombre), TRIM(p.PacienteApellido)
  FROM paciente p
  JOIN (
    SELECT MAX(PacienteId) AS mid
    FROM paciente
    WHERE PacienteCI > 0 AND TRIM(PacienteNombre) <> ''
    GROUP BY PacienteCI
  ) m ON p.PacienteId = m.mid;
" > "$RAW"
echo "    filas exportadas: $(wc -l < "$RAW")"

echo "==> 2/4  Transcodificando CP850 → UTF-8 y normalizando CRLF → LF…"
# tr -d '\r' saca el CR del CRLF de Windows; iconv arregla el encoding legacy.
tr -d '\r' < "$RAW" | iconv -f CP850 -t UTF-8 > "$UTF8"

echo "==> 3/4  Truncando padron_ci…"
"$PSQL_BIN" -c "TRUNCATE TABLE padron_ci;"

echo "==> 4/4  Cargando con COPY…"
"$PSQL_BIN" -c "\copy padron_ci (ci, nombre, apellido) FROM '$UTF8' WITH (FORMAT text, DELIMITER E'\t')"

echo "==> Listo. Total en padron_ci: $("$PSQL_BIN" -tAc 'SELECT COUNT(*) FROM padron_ci;')"
rm -f "$RAW" "$UTF8"
