/**
 * Sistema centralizado de errores con códigos consistentes.
 * El error handler (middleware) los mapea a respuestas JSON uniformes.
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_REVOKED'
  | 'TENANT_MISMATCH'
  | 'SUCURSAL_NO_AUTORIZADA'
  | 'EMPRESA_INACTIVA'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  TOKEN_REVOKED: 401,
  TENANT_MISMATCH: 403,
  SUCURSAL_NO_AUTORIZADA: 403,
  EMPRESA_INACTIVA: 403,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export const Errors = {
  unauthorized: (msg = 'No autorizado') => new AppError('UNAUTHORIZED', msg),
  forbidden: (msg = 'Acceso denegado') => new AppError('FORBIDDEN', msg),
  notFound: (msg = 'Recurso no encontrado') => new AppError('NOT_FOUND', msg),
  conflict: (msg = 'Conflicto') => new AppError('CONFLICT', msg),
  invalidCredentials: () => new AppError('INVALID_CREDENTIALS', 'Email o contraseña incorrectos'),
  tokenExpired: () => new AppError('TOKEN_EXPIRED', 'Token expirado'),
  tokenInvalid: () => new AppError('TOKEN_INVALID', 'Token inválido'),
  tokenRevoked: () => new AppError('TOKEN_REVOKED', 'Token revocado'),
  tenantMismatch: () =>
    new AppError('TENANT_MISMATCH', 'No se puede acceder a recursos de otra empresa'),
  sucursalNoAutorizada: () =>
    new AppError('SUCURSAL_NO_AUTORIZADA', 'Usuario sin acceso a esa sucursal'),
  empresaInactiva: (motivo?: string | null) =>
    new AppError(
      'EMPRESA_INACTIVA',
      'La empresa se encuentra inactiva. Contactá con el administrador del sistema.',
      motivo ? { motivo } : undefined,
    ),
  validation: (details: Record<string, unknown>) =>
    new AppError('VALIDATION_ERROR', 'Datos inválidos', details),
};
