/**
 * Tipos compartidos entre apps (DTOs, enums no-Prisma, contratos de Socket.io, etc.).
 * Los tipos generados por Prisma se importan directo desde @prisma/client en la API.
 * Acá viven los tipos que el frontend necesita sin tener que depender de Prisma.
 */

export type Money = number; // guaraníes enteros

export type SucursalId = string; // UUID
export type EmpresaId = string;
export type UserId = string;

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
