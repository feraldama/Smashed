# Smash

Sistema de Gestión de Pedidos y Facturación multi-sucursal para cadena de comida rápida en Paraguay.

> **Estado:** Fase 1 — Fundación (en curso). El schema Prisma, seed, auth y middleware tenant llegan en los próximos checkpoints.

---

## Stack

| Capa          | Tecnología                                                             |
| ------------- | ---------------------------------------------------------------------- |
| Monorepo      | pnpm workspaces + Turborepo 2                                          |
| Frontend      | Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui            |
| State / data  | Zustand + TanStack Query + React Hook Form + Zod                       |
| Realtime      | Socket.io (server) + socket.io-client                                  |
| Backend       | Node 20 + Express + TypeScript + Prisma 5 + Zod                        |
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
│   ├── api/         # Express + Prisma + Socket.io (puerto 3001)
│   ├── web/         # Next.js — panel administrativo (puerto 3000)
│   ├── pos/         # Next.js — POS optimizado (puerto 3002)
│   ├── kitchen/     # Next.js — Kitchen Display System (puerto 3003)
│   └── worker/      # BullMQ workers (PedidosYa, reportes, SIFEN)
├── packages/
│   ├── shared-types/     # tipos TS compartidos
│   ├── shared-utils/     # utilidades puras (RUC, money, etc.) + tests
│   ├── sifen-client/     # placeholder — Fase 4
│   ├── pedidosya-client/ # placeholder — Fase 3
│   └── printer/          # placeholder — Fase 2
├── docker/
│   ├── postgres/init/    # extensiones e init scripts
│   └── pgadmin/          # config de pgAdmin para dev
├── docker-compose.yml
├── turbo.json
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

---

## Setup

### Prerrequisitos

- Node.js **20+** (usar `.nvmrc` con `nvm use`)
- pnpm **9+** (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Docker Desktop con Docker Compose v2

### Primer arranque

Asumimos **Postgres nativo** corriendo en `localhost:5432` con la BD `smash` ya creada.
Si no tenés Postgres local, mirá la sección [Postgres en Docker](#postgres-en-docker-opcional).

```bash
# 1. Instalar dependencias
pnpm install

# 2. Variables de entorno
cp .env.example .env
# (editar .env: ajustar credenciales DB_* y poner JWT_SECRET — ver instrucciones dentro)

# 3. Levantar Redis (BullMQ + cache)
pnpm services:up

# 4. (próximo checkpoint) Aplicar schema Prisma + seed
# pnpm db:migrate
# pnpm db:seed

# 5. (próximo checkpoint) Levantar todo en dev
# pnpm dev
```

### Postgres en Docker (opcional)

Si preferís contenedor en vez de Postgres nativo:

```bash
pnpm services:up:db
# Levanta Postgres 16 + Redis. Las credenciales vienen del .env (DB_USER/DB_PASSWORD/DB_NAME).
```

### pgAdmin (opcional)

```bash
pnpm services:up:tools
# Abre http://localhost:5050 → user/pass del .env (PGADMIN_EMAIL/PGADMIN_PASSWORD)
```

---

## Scripts

| Script                   | Descripción                                       |
| ------------------------ | ------------------------------------------------- |
| `pnpm dev`               | Levanta todas las apps en modo desarrollo         |
| `pnpm build`             | Build de toda la monorepo                         |
| `pnpm lint`              | Lint en todas las apps/packages                   |
| `pnpm typecheck`         | Type-check sin emitir                             |
| `pnpm test`              | Corre tests con Vitest                            |
| `pnpm format`            | Formatea código con Prettier                      |
| `pnpm services:up`       | Levanta Redis (default — Postgres se asume local) |
| `pnpm services:up:db`    | Levanta también Postgres en docker                |
| `pnpm services:up:tools` | + pgAdmin                                         |
| `pnpm services:down`     | Detiene contenedores                              |
| `pnpm services:reset`    | Borra volúmenes y detiene                         |
| `pnpm db:migrate`        | Aplica migraciones Prisma                         |
| `pnpm db:seed`           | Carga seed de datos                               |
| `pnpm db:studio`         | Abre Prisma Studio                                |
| `pnpm db:reset`          | Resetea la BD y reaplica migraciones + seed       |

---

## Decisiones arquitectónicas (Fase 1)

| Tema              | Decisión                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Multi-tenant      | Shared DB + `empresa_id` + middleware Prisma. No schema-per-tenant.                                          |
| RUC               | Columnas separadas `ruc` + `dv`. Validación con módulo 11 SET.                                               |
| Stock             | Negativo permitido (no bloquea ventas).                                                                      |
| Recetas           | Anidadas (sub-preparaciones soportadas).                                                                     |
| Combos            | Grupos de elección con opciones — no lista fija.                                                             |
| Cajas             | Múltiples por sucursal, una abierta por usuario.                                                             |
| Soft delete       | En entidades históricas/fiscales (productos, clientes, pedidos, comprobantes, recetas).                      |
| Auditoría         | `created_by`/`updated_by` global + tabla `audit_log` para acciones críticas.                                 |
| IVA               | Por producto (10/5/0/exento), default 10.                                                                    |
| Numeración fiscal | `establecimiento-puntoExp-correlativo`. Múltiples puntos de expedición por sucursal.                         |
| Timbrado          | Tabla con vigencia, asociada a punto de expedición. Múltiples timbrados a lo largo del tiempo.               |
| Consumidor final  | Cliente "SIN NOMBRE" único por empresa.                                                                      |
| Métodos de pago   | EFECTIVO, TARJETA_DEBITO/CREDITO, TRANSFERENCIA, CHEQUE, BANCARD, INFONET, ZIMPLE, TIGO_MONEY, PERSONAL_PAY. |
| Moneda            | Guaraní entero (BigInt en BD, `number` en TS). Sin decimales. Formato `₲ 1.234.567`.                         |
| Zona horaria      | `America/Asuncion` por empresa, override por sucursal.                                                       |

---

## Roadmap

- [x] **1.1** Skeleton monorepo + tooling + docker-compose
- [ ] **1.2** Schema Prisma completo + diagrama ER
- [ ] **1.3** Seed con datos paraguayos realistas
- [ ] **1.4** Auth + middleware multi-tenant + tests
- [ ] **Fase 2** CRUD productos/recetas/clientes/inventario, POS, KDS, facturación interna, impresión, caja
- [ ] **Fase 3** PedidosYa, lector barras, reportes
- [ ] **Fase 4** SIFEN/DNIT facturación electrónica

---

## Convenciones

- **Commits:** Conventional Commits (validado por commitlint en `commit-msg`)
- **Pre-commit:** lint-staged corre Prettier + ESLint en archivos modificados
- **Imports:** ordenados por ESLint (`import/order` con grupos y alfabético)
- **TS:** strict + `noUncheckedIndexedAccess` + `noImplicitOverride`
