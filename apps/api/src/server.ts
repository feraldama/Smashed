import http from 'node:http';

import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { disconnectPrisma } from './lib/prisma.js';
import { initSocketIo } from './lib/socketio.js';
import {
  detenerReconciliacionPeriodica,
  iniciarReconciliacionPeriodica,
} from './modules/facturacion/facturacion-runner.js';

const app = createApp();
const httpServer = http.createServer(app);

// Inicializar Socket.io sobre el mismo server HTTP — comparte puerto con Express.
initSocketIo(httpServer);

const server = httpServer.listen(env.PORT, () => {
  logger.info(`🚀 Smash API + WS escuchando en http://localhost:${env.PORT}`);
});

// Facturación electrónica: procesamiento in-process (sin Redis). El barrido
// periódico recupera comprobantes varados (NO_ENVIADO/PENDIENTE).
iniciarReconciliacionPeriodica();

async function shutdown(signal: string) {
  logger.info(`Recibido ${signal}, cerrando...`);
  detenerReconciliacionPeriodica();
  server.close(() => {
    logger.info('HTTP server cerrado');
  });
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => {
  logger.fatal({ err }, 'Unhandled rejection');
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});
