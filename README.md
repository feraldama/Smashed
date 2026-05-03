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
#  ↳ Alternativa: pnpm db:seed:snapshot
#    Restaura el dump versionado en apps/api/prisma/snapshot.sql — útil
#    cuando querés arrancar con el estado de dev capturado más reciente
#    en vez del seed minimalista.

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

| Email                      | Rol                  |
| -------------------------- | -------------------- |
| `admin@smash.com.py`       | ADMIN_EMPRESA        |
| `gerente1@smash.com.py`    | GERENTE_SUCURSAL     |
| `cajero1@smash.com.py`     | CAJERO (Centro)      |
| `cajero2@smash.com.py`     | CAJERO (San Lorenzo) |
| `mesero1@smash.com.py`     | MESERO               |
| `cocina1@smash.com.py`     | COCINA               |
| `repartidor1@smash.com.py` | REPARTIDOR           |

### pgAdmin (opcional)

```bash
pnpm services:up:tools
# http://localhost:5050  →  admin@smash.local / admin (configurable en .env)
```

---

## Scripts

| Script                   | Descripción                                        |
| ------------------------ | -------------------------------------------------- |
| `pnpm dev`               | Levanta todas las apps en modo desarrollo          |
| `pnpm build`             | Build de toda la monorepo                          |
| `pnpm lint`              | Lint en todas las apps/packages                    |
| `pnpm typecheck`         | Type-check sin emitir                              |
| `pnpm test`              | Corre tests con Vitest                             |
| `pnpm format`            | Formatea código con Prettier                       |
| `pnpm services:up`       | Levanta Redis (default — Postgres se asume local)  |
| `pnpm services:up:db`    | Levanta Postgres + Redis en Docker                 |
| `pnpm services:up:tools` | + pgAdmin                                          |
| `pnpm services:down`     | Detiene contenedores (mantiene volúmenes)          |
| `pnpm services:reset`    | Detiene + borra volúmenes (BD desde cero)          |
| `pnpm db:migrate`        | Aplica migraciones Prisma                          |
| `pnpm db:seed`           | Carga seed minimalista (catálogo + usuarios demo)  |
| `pnpm db:seed:snapshot`  | Trunca y carga `prisma/snapshot.sql` (restore 1:1) |
| `pnpm db:snapshot`       | Regenera `prisma/snapshot.sql` desde la BD actual  |
| `pnpm db:studio`         | Abre Prisma Studio                                 |
| `pnpm db:reset`          | Resetea la BD y reaplica migraciones + seed        |

### Snapshot: clonar la BD de dev entre máquinas

Hay dos formas de poblar la BD:

| Comando                 | Cuándo usar                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm db:seed`          | Empezás de cero — cataloga + usuarios + un combo. Útil para devs nuevos o tests.                            |
| `pnpm db:seed:snapshot` | Querés el estado actual de dev (productos modificados, pedidos de prueba, etc.) tal cual lo dejó el equipo. |

**Generar un nuevo snapshot** (sólo cuando querés actualizar el archivo versionado):

```bash
pnpm db:snapshot
# Sobrescribe apps/api/prisma/snapshot.sql con un dump --data-only de la BD actual.
# Requiere `pg_dump` en PATH; si no, exportá PG_DUMP_PATH apuntando al ejecutable
# (ej. en Windows: D:\Archivos de programa\PostgreSQL\18\bin\pg_dump.exe).
```

**Notas**:

- El snapshot preserva los IDs (cuids) y secuencias originales — el ciclo `db:snapshot` → `db:seed:snapshot` es idempotente.
- `db:seed:snapshot` trunca todas las tablas de `public` (excepto `_prisma_migrations`) antes de cargar.
- Las migraciones tienen que estar al día (`pnpm db:migrate`) antes de cargar un snapshot, o los `INSERT` van a fallar contra columnas inexistentes.

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
| Métodos de pago   | EFECTIVO, TARJETA_DEBITO/CREDITO, TRANSFERENCIA, CHEQUE, BANCARD, INFONET, ZIMPLE, TIGO_MONEY, PERSONAL_PAY.        |
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
