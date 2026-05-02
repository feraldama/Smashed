import { type NextFunction, type Request, type Response, Router } from 'express';
import rateLimit from 'express-rate-limit';

import { isTest } from '../../config/env.js';
import { authRequired } from '../../middleware/auth.js';

import * as ctrl from './auth.controller.js';

const router = Router();

const noopLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

// Rate limit estricto en login para prevenir brute force. Off en tests.
const loginLimiter = isTest
  ? noopLimiter
  : rateLimit({
      windowMs: 5 * 60 * 1000,
      max: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        error: { code: 'RATE_LIMITED', message: 'Demasiados intentos, esperá unos minutos' },
      },
    });

const refreshLimiter = isTest
  ? noopLimiter
  : rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/login', loginLimiter, asyncH(ctrl.login));
router.post('/refresh', refreshLimiter, asyncH(ctrl.refresh));
router.post('/logout', asyncH(ctrl.logout));
router.get('/me', authRequired, asyncH(ctrl.me));
router.post('/seleccionar-sucursal', authRequired, asyncH(ctrl.seleccionarSucursal));

export default router;

/** Wrapper para handlers async — pasa errores al error handler de Express. */
function asyncH<
  T extends (req: import('express').Request, res: import('express').Response) => Promise<unknown>,
>(fn: T) {
  return (
    req: import('express').Request,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    fn(req, res).catch(next);
  };
}
