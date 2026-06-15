import { desencriptar, encriptar } from '../../lib/crypto.js';
import { Errors } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';

import type { AmbienteFacturacion, ProveedorFacturacion } from '@prisma/client';
import type { Code100Credentials } from '@smash/code100-client';

/**
 * Acceso a la configuración de facturación electrónica por empresa.
 *
 * Guarda los dos ambientes (TEST/PROD) y `ambienteActivo` decide cuál se usa.
 * Encapsula el cifrado del password: hacia afuera nunca se expone en claro
 * salvo en `cargarCredenciales` (uso interno del worker/servicio de emisión).
 */

export interface CredencialesFacturacion {
  proveedor: ProveedorFacturacion;
  ambiente: AmbienteFacturacion;
  credentials: Code100Credentials;
  emisorTipoContribuyente: number;
  activo: boolean;
}

/**
 * Carga las credenciales del ambiente ACTIVO de una empresa para emitir.
 * Lanza si no hay config o si el ambiente activo no tiene credenciales completas.
 */
export async function cargarCredenciales(empresaId: string): Promise<CredencialesFacturacion> {
  const cfg = await prisma.configuracionFacturacion.findUnique({ where: { empresaId } });
  if (!cfg) throw Errors.notFound('La empresa no tiene facturación electrónica configurada');

  const esTest = cfg.ambienteActivo === 'TEST';
  const dominio = esTest ? cfg.testDominio : cfg.prodDominio;
  const ruc = esTest ? cfg.testRuc : cfg.prodRuc;
  const password = esTest ? cfg.testPassword : cfg.prodPassword;

  if (!dominio || !ruc || !password) {
    throw Errors.conflict(
      `El ambiente activo (${cfg.ambienteActivo}) no tiene credenciales completas cargadas`,
    );
  }

  return {
    proveedor: cfg.proveedor,
    ambiente: cfg.ambienteActivo,
    emisorTipoContribuyente: cfg.emisorTipoContribuyente,
    activo: cfg.activo,
    credentials: { ruc, password: desencriptar(password), dominio },
  };
}

/** Credenciales de un ambiente — el password es opcional en update (se conserva). */
export interface CredencialesAmbienteInput {
  dominio: string;
  ruc: string;
  password?: string;
}

export interface GuardarConfigInput {
  proveedor?: ProveedorFacturacion;
  ambienteActivo?: AmbienteFacturacion;
  emisorTipoContribuyente?: number;
  activo?: boolean;
  test?: CredencialesAmbienteInput;
  prod?: CredencialesAmbienteInput;
}

/**
 * Crea o actualiza la configuración. Para cada ambiente provisto setea
 * dominio/ruc y, si vino password, lo encripta; si no, conserva el existente.
 */
export async function guardarConfiguracion(empresaId: string, input: GuardarConfigInput) {
  const existente = await prisma.configuracionFacturacion.findUnique({ where: { empresaId } });

  // Resuelve el password a persistir para un ambiente: nuevo (cifrado) o el existente.
  const passwordAmbiente = (
    nuevo: string | undefined,
    actual: string | null | undefined,
  ): string | null | undefined => (nuevo ? encriptar(nuevo) : actual);

  if (!existente) {
    // Al crear, el ambiente activo debe tener credenciales completas (incl. password).
    const activo = input.ambienteActivo ?? 'TEST';
    const credActivo = activo === 'TEST' ? input.test : input.prod;
    if (!credActivo?.dominio || !credActivo?.ruc || !credActivo?.password) {
      throw Errors.validation({
        [activo === 'TEST' ? 'test' : 'prod']:
          `Cargá dominio, RUC y password del ambiente activo (${activo}) en la primera configuración`,
      });
    }
    const creado = await prisma.configuracionFacturacion.create({
      data: {
        empresaId,
        proveedor: input.proveedor ?? 'CODE100',
        ambienteActivo: activo,
        emisorTipoContribuyente: input.emisorTipoContribuyente ?? 2,
        activo: input.activo ?? false,
        testDominio: input.test?.dominio ?? null,
        testRuc: input.test?.ruc ?? null,
        testPassword: input.test?.password ? encriptar(input.test.password) : null,
        prodDominio: input.prod?.dominio ?? null,
        prodRuc: input.prod?.ruc ?? null,
        prodPassword: input.prod?.password ? encriptar(input.prod.password) : null,
      },
    });
    return sinPasswords(creado);
  }

  const actualizado = await prisma.configuracionFacturacion.update({
    where: { empresaId },
    data: {
      proveedor: input.proveedor ?? existente.proveedor,
      ambienteActivo: input.ambienteActivo ?? existente.ambienteActivo,
      emisorTipoContribuyente: input.emisorTipoContribuyente ?? existente.emisorTipoContribuyente,
      activo: input.activo ?? existente.activo,
      ...(input.test
        ? {
            testDominio: input.test.dominio,
            testRuc: input.test.ruc,
            testPassword: passwordAmbiente(input.test.password, existente.testPassword),
          }
        : {}),
      ...(input.prod
        ? {
            prodDominio: input.prod.dominio,
            prodRuc: input.prod.ruc,
            prodPassword: passwordAmbiente(input.prod.password, existente.prodPassword),
          }
        : {}),
    },
  });
  return sinPasswords(actualizado);
}

/** Quita los passwords (cifrados) antes de devolver la config hacia afuera. */
function sinPasswords<T extends { testPassword: string | null; prodPassword: string | null }>(
  cfg: T,
): Omit<T, 'testPassword' | 'prodPassword'> {
  const { testPassword: _t, prodPassword: _p, ...resto } = cfg;
  return resto;
}
