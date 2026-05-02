import cors, { type CorsOptions } from 'cors';

import { allowedOrigins, isDev } from '../config/env.js';

/**
 * CORS dinámico:
 *  - Si ALLOWED_ORIGINS es lista explícita → solo esos orígenes.
 *  - Si ALLOWED_ORIGINS=`*` → reflejamos el Origin de la request (necesario para
 *    cookies httpOnly + credentials, los browsers no aceptan wildcard ahí).
 */
const corsOptions: CorsOptions = {
  origin(origin, cb) {
    // Sin Origin → curl, server-to-server, o request directa: permitir.
    if (!origin) return cb(null, true);

    if (allowedOrigins === null) {
      // Wildcard reflejante (sólo dev recomendado).
      return cb(null, true);
    }

    if (allowedOrigins.includes(origin)) return cb(null, true);

    if (isDev) {
      // En dev permitimos pero loggeamos el rechazo, para detectar puerto faltante.
       
      console.warn(`[CORS] Origen no listado: ${origin}`);
      return cb(null, true);
    }

    return cb(new Error('CORS: origen no permitido'), false);
  },
  credentials: true,
  exposedHeaders: ['x-request-id'],
  maxAge: 600,
};

export const corsMiddleware = cors(corsOptions);
