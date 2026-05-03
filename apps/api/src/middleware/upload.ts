import multer from 'multer';

import { Errors } from '../lib/errors.js';

const MIMES_PERMITIDOS = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * Multer en memoria — los bytes terminan en bytea de Postgres, no tocan disco.
 * Límite 5 MB por imagen (suficiente para fotos de producto razonables).
 */
export const uploadImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!MIMES_PERMITIDOS.has(file.mimetype)) {
      cb(Errors.validation({ archivo: `Tipo no permitido: ${file.mimetype}` }));
      return;
    }
    cb(null, true);
  },
}).single('archivo');
