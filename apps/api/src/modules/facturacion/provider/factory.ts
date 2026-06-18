import { createCode100Client } from '../../../lib/code100.js';

import { Code100Provider } from './code100.provider.js';
import { MiddlewareProvider } from './middleware.provider.js';

import type { FacturadorProvider } from './types.js';
import type { Code100Client, Code100Credentials } from '@smash/code100-client';

/**
 * Devuelve el proveedor de facturación según `FACTURADOR_PROVIDER`:
 *   - `code100` (default) → CODE100/FUTURA100 (ruta de `main`).
 *   - `middleware`        → `sifen-middleware` propio (sólo rama Sifen).
 *
 * `clientFactory` permite inyectar el cliente CODE100 en tests (se ignora para
 * el middleware).
 */
export function getFacturadorProvider(
  creds: Code100Credentials,
  clientFactory?: (creds: Code100Credentials) => Code100Client,
): FacturadorProvider {
  const nombre = (process.env.FACTURADOR_PROVIDER ?? 'code100').toLowerCase();

  if (nombre === 'middleware') {
    const baseUrl = process.env.FE_MIDDLEWARE_URL;
    const apiKey = process.env.FE_MIDDLEWARE_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new Error(
        'FACTURADOR_PROVIDER=middleware requiere FE_MIDDLEWARE_URL y FE_MIDDLEWARE_API_KEY',
      );
    }
    return new MiddlewareProvider(baseUrl, apiKey);
  }

  const client = clientFactory ? clientFactory(creds) : createCode100Client();
  return new Code100Provider(client, creds);
}
