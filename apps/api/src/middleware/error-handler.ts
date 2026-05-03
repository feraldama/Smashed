import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

import { logger } from '../config/logger.js';
import { AppError } from '../lib/errors.js';

import type { ErrorRequestHandler } from 'express';

/**
 * Error handler centralizado. Mapea distintos tipos de error a respuestas
 * JSON con shape uniforme `{ error: { code, message, details? } }`.
 *
 * Para errores 5xx loggeamos stack; para 4xx solo info breve.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Zod validation
  if (err instanceof ZodError) {
    const flat = err.flatten();
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Datos inválidos',
        details: { fieldErrors: flat.fieldErrors, formErrors: flat.formErrors },
      },
    });
    return;
  }

  // Multer — errores de upload (tamaño, formato, etc.)
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Archivo demasiado grande (máx 5 MB)'
        : `Error en el upload: ${err.message}`;
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message, details: { field: err.field } },
    });
    return;
  }

  // App errors (lanzados por servicios)
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, reqId: req.id }, err.message);
    }
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Prisma — known constraint errors → 409
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: 'Ya existe un registro con ese valor único',
          details: { target: err.meta?.target },
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
      });
      return;
    }
    // Otros códigos Prisma → 500
    logger.error({ err, reqId: req.id }, 'Prisma error no mapeado');
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Error de base de datos' } });
    return;
  }

  // Cualquier otro → 500 genérico (no leakeamos stack en respuesta)
  logger.error({ err, reqId: req.id }, 'Error no manejado');
  res
    .status(500)
    .json({ error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' } });
};
