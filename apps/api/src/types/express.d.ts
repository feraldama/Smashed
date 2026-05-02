/**
 * Augmentations globales del namespace Express.
 * Centralizado acá porque las augmentations inline de `declare module 'express-serve-static-core'`
 * no resuelven bien con `module: "NodeNext"`.
 */
import type { Rol } from '@prisma/client';

export interface RequestContext {
  userId: string;
  empresaId: string | null;
  rol: Rol;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      context?: RequestContext;
    }
  }
}

export {};
