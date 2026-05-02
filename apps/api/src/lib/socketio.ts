
import { Server as SocketServer, type Socket } from 'socket.io';

import { allowedOrigins, isDev } from '../config/env.js';
import { logger } from '../config/logger.js';

import { verifyAccessToken } from './jwt.js';

import type { Server as HttpServer } from 'node:http';

/**
 * Singleton de Socket.io.
 * - Auth via JWT en `socket.handshake.auth.token` (mismo access token que el API HTTP)
 * - Cada socket queda joineado a la room `sucursal:<id>` de su sucursal activa
 *   (o `empresa:<id>` si es admin sin sucursal activa)
 * - Los services llaman `getIo().to('sucursal:X').emit(...)` para enviar eventos
 *   sólo a las terminales de esa sucursal.
 */

interface SocketData {
  userId: string;
  empresaId: string | null;
  rol: string;
  sucursalActivaId: string | null;
  isSuperAdmin: boolean;
}

let ioInstance: SocketServer | null = null;

export function initSocketIo(httpServer: HttpServer): SocketServer {
  const io = new SocketServer(httpServer, {
    path: '/socket.io',
    cors: {
      origin: allowedOrigins ?? true, // true = reflejar Origin
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token ?? '') as string;
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = verifyAccessToken(token);
      const data: SocketData = {
        userId: payload.sub,
        empresaId: payload.empresaId,
        rol: payload.rol,
        sucursalActivaId: payload.sucursalActivaId,
        isSuperAdmin: payload.rol === 'SUPER_ADMIN',
      };
      socket.data = data;
      next();
    } catch (err) {
      logger.debug({ err }, 'Socket auth failed');
      next(new Error('TOKEN_INVALID'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SocketData;

    if (data.sucursalActivaId) {
      void socket.join(`sucursal:${data.sucursalActivaId}`);
    }
    if (data.empresaId) {
      void socket.join(`empresa:${data.empresaId}`);
    }

    if (isDev) {
      logger.debug(
        { userId: data.userId, sucursal: data.sucursalActivaId },
        '[ws] cliente conectado',
      );
    }

    socket.on('disconnect', () => {
      if (isDev) logger.debug({ userId: data.userId }, '[ws] cliente desconectado');
    });
  });

  ioInstance = io;
  return io;
}

export function getIo(): SocketServer {
  if (!ioInstance) {
    throw new Error('Socket.io no inicializado — llamá initSocketIo() en el bootstrap');
  }
  return ioInstance;
}

/** Helper para emitir eventos de pedido a la room de la sucursal correspondiente. */
export function emitPedido(
  evento: 'pedido.confirmado' | 'pedido.actualizado' | 'pedido.cancelado' | 'pedido.item.estado',
  sucursalId: string,
  payload: unknown,
) {
  if (!ioInstance) return; // En tests sin server HTTP, ignoramos
  ioInstance.to(`sucursal:${sucursalId}`).emit(evento, payload);
}
