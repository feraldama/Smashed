# Smash

Sistema de Gestión de Pedidos y Facturación multi-sucursal para cadena de comida rápida en Paraguay.

---

## Stack

| Capa          | Tecnología                                                             |
| ------------- | ---------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo 2                                          |
| Frontend      | Next.js 15 (App Router) + TypeScript + Tailwind                        |
| State / data  | Zustand + TanStack Query + React Hook Form + Zod                       |
| Realtime      | Socket.io (server) + socket.io-client                                  |
| Backend       | Node 24 + Express + TypeScript + Prisma 7 + Zod                        |
| Base de datos | PostgreSQL 16 (extensiones: uuid-ossp, pgcrypto, pg_trgm, unaccent)    |
| Cache / colas | Redis 7 + BullMQ                                                       |
| Auth          | JWT propio (access 15m + refresh rotativo httpOnly cookie) + bcrypt    |
| Logs          | Pino + pino-http                                                       |
| Tests         | Vitest                                                                 |
| Linting       | ESLint 9 (flat config) + Prettier 3 + Husky + lint-staged + commitlint |
| DevOps        | Docker Compose (Postgres + Redis + pgAdmin)                            |

---

## Estructura del monorepo

```
smash/
├── apps/
│   ├── api/         # Express + Prisma + Socket.io (puerto 3020)
│   ├── web/         # Next.js — admin + POS + KDS + entregas (puerto 3019)
│   ├── pos/         # Next.js — POS optimizado standalone (puerto 3021)
│   ├── kitchen/     # Next.js — Kitchen Display System standalone (puerto 3022)
│   └── worker/      # BullMQ workers (PedidosYa, reportes, SIFEN)
├── packages/
│   ├── shared-types/     # tipos TS compartidos (incluye MENU_DEFINICIONES)
│   ├── shared-utils/     # utilidades puras (RUC, money, etc.) + tests
│   ├── sifen-client/     # cliente SIFEN/DNIT
│   ├── pedidosya-client/ # placeholder — Fase 3
│   └── printer/          # placeholder
├── docker/
│   ├── postgres/init/    # extensiones e init scripts
│   └── pgadmin/          # config de pgAdmin para dev
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Setup en máquina nueva

### Prerrequisitos

| Tool           | Versión         | Notas                                      |
| -------------- | --------------- | ------------------------------------------ |
| Node.js        | **>= 24.0** LTS | requerido por `package.json` engines       |
| pnpm           | **>= 9.0**      | gestor del monorepo                        |
| Docker Desktop | última          | para Postgres + Redis (+ pgAdmin opcional) |
| Git            | cualquiera      |                                            |

Instalación de pnpm vía corepack (recomendado):

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
```

### Pasos

```bash
# 1. Clonar
git clone <url-del-repo> Smash
cd Smash

# 2. Variables de entorno
cp .env.example .env
# Editar .env:
#   - JWT_SECRET: generar con
#     node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
#   - DB_PASSWORD: dejar 12345 si vas a usar Postgres en Docker (opción A);
#     poner el real si tenés Postgres nativo (opción B).
#   - DATABASE_URL: tiene que coincidir con DB_*.

# 3. Instalar dependencias
pnpm install

# 4. Levantar Postgres + Redis
#    Opción A — todo en Docker (recomendado):
pnpm services:up:db
#    Opción B — Postgres nativo + Redis en Docker:
#      psql -U postgres -c "CREATE DATABASE smash;"
#      pnpm services:up

# 5. Aplicar migraciones + seed
pnpm db:migrate
pnpm db:seed
#  ↳ Carga apps/api/prisma/snapshot.sql — el dump versionado de la BD
#    actual de dev (preserva IDs/cuids/secuencias).
#    Para actualizarlo cuando modificás la BD local: pnpm db:snapshot.

# 6. Levantar todo en dev
pnpm dev
```

### Apps y puertos

| App                                | URL                   |
| ---------------------------------- | --------------------- |
| API + Socket.io                    | http://localhost:3020 |
| Web (admin + POS + KDS + entregas) | http://localhost:3019 |
| POS standalone                     | http://localhost:3021 |
| Kitchen standalone                 | http://localhost:3022 |
| Worker (BullMQ)                    | sin puerto            |

### Usuarios del seed (password `Smash123!`)

Los usuarios disponibles dependen del estado capturado en `snapshot.sql`.
Por convención están al menos:

| Email                  | Rol           |
| ---------------------- | ------------- |
| `admin@smash.com.py`   | ADMIN_EMPRESA |
| `cajero1@smash.com.py` | CAJERO        |

### pgAdmin (opcional)

```bash
pnpm services:up:tools
# http://localhost:5050  →  admin@smash.local / admin (configurable en .env)
```

---

## Scripts

| Script                   | Descripción                                       |
| ------------------------ | ------------------------------------------------- |
| `pnpm dev`               | Levanta todas las apps en modo desarrollo         |
| `pnpm build`             | Build de toda la monorepo                         |
| `pnpm start`             | Build + levanta todas las apps en modo producción |
| `pnpm lint`              | Lint en todas las apps/packages                   |
| `pnpm typecheck`         | Type-check sin emitir                             |
| `pnpm test`              | Corre tests con Vitest                            |
| `pnpm format`            | Formatea código con Prettier                      |
| `pnpm services:up`       | Levanta Redis (default — Postgres se asume local) |
| `pnpm services:up:db`    | Levanta Postgres + Redis en Docker                |
| `pnpm services:up:tools` | + pgAdmin                                         |
| `pnpm services:down`     | Detiene contenedores (mantiene volúmenes)         |
| `pnpm services:reset`    | Detiene + borra volúmenes (BD desde cero)         |
| `pnpm db:migrate`        | Aplica migraciones Prisma                         |
| `pnpm db:seed`           | Trunca y carga `prisma/snapshot.sql` en la BD     |
| `pnpm db:snapshot`       | Regenera `prisma/snapshot.sql` desde la BD actual |
| `pnpm db:studio`         | Abre Prisma Studio                                |
| `pnpm db:reset`          | Resetea la BD y reaplica migraciones + seed       |

### Snapshot: clonar la BD de dev entre máquinas

El seed del proyecto **es** un dump pg_dump versionado. Cualquier dev puede
clonar el estado actual de la BD de dev con:

```bash
pnpm db:migrate   # asegurate de tener el schema al día
pnpm db:seed      # trunca y carga apps/api/prisma/snapshot.sql
```

**Generar un nuevo snapshot** (cuando modificaste la BD y querés versionar el estado):

```bash
pnpm db:snapshot
# Sobrescribe apps/api/prisma/snapshot.sql con un dump --data-only de la BD actual.
# Requiere `pg_dump` en PATH; si no, exportá PG_DUMP_PATH apuntando al ejecutable
# (ej. en Windows: D:\Archivos de programa\PostgreSQL\18\bin\pg_dump.exe).
```

**Notas**:

- El snapshot preserva los IDs (cuids) y secuencias originales — el ciclo `db:snapshot` → `db:seed` es idempotente.
- `db:seed` trunca todas las tablas de `public` (excepto `_prisma_migrations`) antes de cargar.
- Las migraciones tienen que estar al día (`pnpm db:migrate`) antes de seedear, o los `INSERT` van a fallar contra columnas inexistentes.

---

## Despliegue al servidor

Guía para llevar cambios al servidor de producción **conservando el catálogo
maestro** (productos, insumos, recetas, subrecetas, combos, clientes,
proveedores, configuración, usuarios). Movimientos transaccionales (ventas,
compras, cajas, stock) se pueden perder si hace falta.

### Qué tablas son qué

| Categoría                          | Tablas (no perder)                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catálogo / maestros (críticas)** | `empresa`, `sucursal`, `usuario`, `usuario_sucursal`, `permiso`, `usuario_permiso`, `menu_rol`, `configuracion_empresa`, `motivo_descuento`, `limite_descuento_rol`, `codigo_autorizacion_descuento`, `punto_expedicion`, `timbrado`                                                                     |
| **Catálogo de productos**          | `categoria_producto_empresa`, `producto_inventario` (insumos), `producto_venta` (productos), `producto_imagen`, `precio_por_sucursal`, `receta`, `item_receta` (subrecetas), `combo`, `combo_grupo`, `combo_grupo_opcion`, `modificador_grupo`, `modificador_opcion`, `producto_venta_modificador_grupo` |
| **Clientes / proveedores / mesas** | `cliente`, `direccion_cliente`, `proveedor`, `zona_mesa`, `mesa`, `pedidos_ya_producto_mapping`                                                                                                                                                                                                          |

| Categoría                     | Tablas (descartables — ventas/compras/auditoría)                                                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ventas**                    | `pedido`, `item_pedido`, `item_pedido_modificador`, `item_pedido_combo_opcion`, `comprobante`, `item_comprobante`, `pago_comprobante`, `evento_sifen` |
| **Caja**                      | `caja`, `apertura_caja`, `cierre_caja`, `movimiento_caja`                                                                                             |
| **Compras / stock**           | `compra`, `item_compra`, `movimiento_stock`, `transferencia_stock`, `item_transferencia`, `stock_sucursal` _(perder esta obliga a reinventariar)_     |
| **Integraciones / auditoría** | `pedidos_ya_pedido`, `pedidos_ya_log`, `audit_log`                                                                                                    |

### Plan A — migración limpia (recomendado, no pierde nada)

La migración nueva (`20260518170000_metodos_pago_simplificados`) **remapea
los datos existentes** con `ALTER COLUMN ... USING CASE`:

- `TARJETA_DEBITO`, `TARJETA_CREDITO` → `BANCARD`
- `ZIMPLE`, `TIGO_MONEY`, `PERSONAL_PAY` → `EFECTIVO`
- `INFONET` → `DINELCO`

Pasos en el servidor:

```bash
# 1. Backup completo (obligatorio).
pg_dump -U postgres -F c -f backup_$(date +%Y%m%d_%H%M).dump smash

# 2. Apagar las apps (web, api, pos, kitchen, worker) — la migración
#    toma ACCESS EXCLUSIVE sobre pago_comprobante y movimiento_caja
#    durante el ALTER COLUMN, y no querés escrituras concurrentes.
pm2 stop all              # o systemctl stop smash-*, según cómo lo corras

# 3. Pull + dependencias.
cd /ruta/al/repo
git pull origin main
pnpm install --frozen-lockfile

# 4. Aplicar migraciones (transaccional — si algo falla, rollback).
pnpm --filter @smash/api prisma:generate
pnpm --filter @smash/api exec prisma migrate deploy

# 5. Build.
pnpm build

# 6. Levantar.
pm2 start all
```

Verificar después:

```sql
-- Debe devolver sólo {EFECTIVO, BANCARD, DINELCO, TRANSFERENCIA, CHEQUE}.
SELECT unnest(enum_range(NULL::"MetodoPago"));

-- No debe haber valores fuera del set.
SELECT DISTINCT metodo FROM pago_comprobante;
SELECT DISTINCT metodo_pago FROM movimiento_caja WHERE metodo_pago IS NOT NULL;
```

### Plan B — si la migración falla o querés reset de ventas/compras

Si el `migrate deploy` rompe, o si querés directamente arrancar de cero las
ventas/compras manteniendo el catálogo, hacemos un dump filtrado de las
tablas críticas y restauramos sobre una BD limpia.

```bash
# 1. Backup completo (siempre primero).
pg_dump -U postgres -F c -f backup_full_$(date +%Y%m%d_%H%M).dump smash

# 2. Dump de SOLO las tablas críticas (data-only, para reimportar sobre
#    el schema nuevo). Ajustar la lista si agregaste maestros.
pg_dump -U postgres --data-only --disable-triggers \
  -t public.empresa \
  -t public.sucursal \
  -t public.usuario \
  -t public.usuario_sucursal \
  -t public.permiso \
  -t public.usuario_permiso \
  -t public.menu_rol \
  -t public.configuracion_empresa \
  -t public.motivo_descuento \
  -t public.limite_descuento_rol \
  -t public.codigo_autorizacion_descuento \
  -t public.punto_expedicion \
  -t public.timbrado \
  -t public.categoria_producto_empresa \
  -t public.producto_inventario \
  -t public.producto_venta \
  -t public.producto_imagen \
  -t public.precio_por_sucursal \
  -t public.receta \
  -t public.item_receta \
  -t public.combo \
  -t public.combo_grupo \
  -t public.combo_grupo_opcion \
  -t public.modificador_grupo \
  -t public.modificador_opcion \
  -t public.producto_venta_modificador_grupo \
  -t public.cliente \
  -t public.direccion_cliente \
  -t public.proveedor \
  -t public.zona_mesa \
  -t public.mesa \
  -t public.pedidos_ya_producto_mapping \
  -f maestros_$(date +%Y%m%d_%H%M).sql \
  smash

# 3. Recrear la BD desde cero con el schema nuevo (5 métodos).
psql -U postgres -c "DROP DATABASE smash;"
psql -U postgres -c "CREATE DATABASE smash;"
pnpm --filter @smash/api prisma:generate
pnpm --filter @smash/api exec prisma migrate deploy

# 4. Restaurar SOLO los maestros (las transaccionales quedan vacías).
psql -U postgres -d smash -f maestros_*.sql

# 5. Levantar apps y, si corresponde, hacer inventario inicial para
#    poblar stock_sucursal (quedó en 0).
pm2 start all
```

### Rollback

Si después de migrar algo anda mal y querés volver atrás:

```bash
pm2 stop all
psql -U postgres -c "DROP DATABASE smash;"
psql -U postgres -c "CREATE DATABASE smash;"
pg_restore -U postgres -d smash backup_<timestamp>.dump
# Volver al commit anterior del repo y reiniciar apps.
git checkout <commit-anterior>
pnpm install --frozen-lockfile
pnpm build
pm2 start all
```

> **Importante**: una vez aplicada la migración de métodos de pago, el código
> viejo (que todavía conoce `TARJETA_DEBITO`/`TARJETA_CREDITO`/`ZIMPLE`/...) ya
> no compila contra el enum nuevo, así que el rollback de código **requiere**
> restaurar también la BD desde backup.

---

## Flujos de negocio

### Modos de venta

| Modo      | Flujo                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| MOSTRADOR | Fast-food: cobrar primero → recién al emitir comprobante el pedido va a cocina (descuenta stock). Pager opcional para llamar al cliente. |
| MESA      | Confirmar pedido → KDS → entrega → cobrar al final.                                                                                      |
| DELIVERY  | Confirmar pedido → KDS → repartidor sale → cobra contra entrega → vuelve y cierra comprobante.                                           |

### Estado del pedido

```
PENDIENTE → CONFIRMADO → EN_PREPARACION → LISTO → ENTREGADO → FACTURADO
                                              ↓
                                          EN_CAMINO (delivery)
```

- En MOSTRADOR fast-food, el pedido pasa de PENDIENTE directo a CONFIRMADO al emitir el comprobante (la confirmación se hace inline en la misma transacción).
- "Entregar al cliente" en KDS-mostrador cierra el ciclo: si ya tiene comprobante → FACTURADO; si no → ENTREGADO (espera cobro post-servicio).
- Anular comprobante de un pedido aún no entregado → cancela pedido + revierte stock.

---

## Decisiones arquitectónicas (Fase 1)

| Tema              | Decisión                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Multi-tenant      | Shared DB + `empresa_id` + middleware Prisma. No schema-per-tenant.                                                 |
| RUC               | Columnas separadas `ruc` + `dv`. Validación con módulo 11 SET.                                                      |
| Stock             | Negativo permitido (no bloquea ventas). Descuento al confirmar.                                                     |
| Recetas           | Anidadas (sub-preparaciones soportadas).                                                                            |
| Combos            | Grupos de elección con opciones — no lista fija.                                                                    |
| Cajas             | Múltiples por sucursal, una abierta por usuario.                                                                    |
| Soft delete       | En entidades históricas/fiscales (productos, clientes, pedidos, comprobantes, recetas).                             |
| Auditoría         | `created_by`/`updated_by` global + tabla `audit_log` para acciones críticas.                                        |
| IVA               | Por producto (10/5/0/exento), default 10.                                                                           |
| Numeración fiscal | `establecimiento-puntoExp-correlativo`. Múltiples puntos de expedición por sucursal.                                |
| Timbrado          | Tabla con vigencia, asociada a punto de expedición. Múltiples timbrados a lo largo del tiempo.                      |
| Consumidor final  | Cliente "SIN NOMBRE" único por empresa.                                                                             |
| Métodos de pago   | EFECTIVO, BANCARD, DINELCO, TRANSFERENCIA, CHEQUE.                                                                  |
| Moneda            | Guaraní entero (BigInt en BD, `number` en TS). Sin decimales. Formato `Gs. 1.234.567`.                              |
| Zona horaria      | `America/Asuncion` por empresa, override por sucursal.                                                              |
| Permisos          | Matriz `MenuRol` por empresa; SUPER_ADMIN ve todo. Rutas tipo `/comprobantes/[id]/imprimir` con override por roles. |

---

## Roadmap

- [x] **Fase 1** Schema Prisma + auth multi-tenant + seed + tooling base
- [x] **Fase 2** CRUD productos / recetas / clientes / inventario, POS, KDS, caja, facturación interna, impresión (ticket 80mm + factura A4), permisos
- [ ] **Fase 3** PedidosYa, lector de barras, reportes avanzados
- [ ] **Fase 4** SIFEN/DNIT facturación electrónica (cliente SIFEN ya stubbed)

---

## Troubleshooting

| Problema                                           | Solución                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `prisma migrate` falla con "schema does not exist" | Crear la BD: `psql -U postgres -c "CREATE DATABASE smash;"` o usar `services:up:db`. |
| POS muestra "Necesitás caja abierta"               | Logueate como cajero, andá a `/caja` y abrí turno con el monto inicial.              |
| Cambios en `schema.prisma` no se reflejan en TS    | Correr `pnpm --filter @smash/api prisma generate`.                                   |
| Tests fallan con "FATAL: database does not exist"  | `pnpm db:reset` para reaplicar migraciones desde cero.                               |
| Worker / port collision al hacer `pnpm dev`        | Verificá que nada use 3019/3020/3021/3022/6379/5432 antes de levantar.               |

---

## Convenciones

- **Commits:** Conventional Commits (validado por commitlint en `commit-msg`)
- **Pre-commit:** lint-staged corre Prettier + ESLint en archivos modificados
- **Imports:** ordenados por ESLint (`import/order` con grupos y alfabético)
- **TS:** strict + `noUncheckedIndexedAccess` + `noImplicitOverride`
- **UI:** componentes de form usan siempre `Input/Select/Field/Switch` de `@/components/ui` (sin inputs raw ni toggles custom)
