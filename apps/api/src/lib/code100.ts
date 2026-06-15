import { Code100Auth, Code100Client } from '@smash/code100-client';

/**
 * Singleton del cliente CODE100 para todo el proceso.
 *
 * El cliente es stateless respecto a las credenciales (se pasan por llamada),
 * pero comparte una instancia de `Code100Auth` para cachear el token de cada
 * RUC (2h TTL) entre múltiples emisiones y empresas.
 */

let clientSingleton: Code100Client | null = null;

export function createCode100Client(): Code100Client {
  if (clientSingleton) return clientSingleton;
  clientSingleton = new Code100Client({ auth: new Code100Auth() });
  return clientSingleton;
}
