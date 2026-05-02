import './lib/bigint.js';

import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import { logger } from './config/logger.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import routes from './routes.js';

/**
 * Factory que crea una instancia de Express. Se exporta así para que los tests
 * puedan crear instancias aisladas sin levantar el server HTTP.
 */
export function createApp() {
  const app = express();

  // Trust proxy (Render/Heroku/Nginx) — para que req.ip y rate-limit funcionen detrás de proxy.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as express.Request).id,
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      serializers: {
        req: (req) => ({ method: req.method, url: req.url, id: req.id }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Rutas
  app.use(routes);

  // 404 catch-all
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
  });

  // Error handler — siempre el último
  app.use(errorHandler);

  return app;
}
