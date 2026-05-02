/* eslint-disable no-console */
/**
 * Seed para Smash — datos paraguayos realistas para desarrollo.
 *
 * Crea:
 *  - 1 empresa (Smash Burgers SA) con RUC válido
 *  - 2 sucursales reales (Asunción Centro, San Lorenzo)
 *  - 2 puntos de expedición + timbrados activos por sucursal
 *  - Cajas, zonas, mesas
 *  - Permisos del sistema
 *  - Usuarios de todos los roles (password: "Smash123!")
 *  - Cliente "SIN NOMBRE" + 5 clientes reales con RUC/CI válido
 *  - 4 proveedores
 *  - ~35 insumos con stock por sucursal
 *  - Categorías de productos
 *  - ~22 productos de venta + 3 sub-preparaciones
 *  - Recetas (incluye una con sub-receta para demostrar BOM recursivo)
 *  - 1 combo configurable con 3 grupos de elección
 *  - Modificadores: punto de cocción, sin..., extras
 *
 * En dev borra todo antes de re-sembrar (idempotente).
 */

import {
  PrismaClient,
  Rol,
  TipoContribuyente,
  UnidadMedida,
  TasaIva,
  CategoriaProducto,
  SectorComanda,
  TipoModificadorGrupo,
  EstadoMesa,
  TipoDocumentoFiscal,
  EstadoCaja,
} from '@prisma/client';
import { calcularDvRuc } from '@smash/shared-utils';
import bcrypt from 'bcrypt';


const prisma = new PrismaClient();

const SEED_PASSWORD = 'Smash123!';
const BCRYPT_ROUNDS = 10; // menor que prod (12) para que el seed sea rápido

// ───── helpers ─────
const G = (n: number) => BigInt(n); // shorthand para BigInt en guaraníes

async function hash(pw: string) {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

function rucWithDv(ruc: string): { ruc: string; dv: string } {
  return { ruc, dv: String(calcularDvRuc(ruc)) };
}

// ═══════════════════════════════════════════════════════════════════════════
//  LIMPIEZA — orden inverso a las dependencias
// ═══════════════════════════════════════════════════════════════════════════

async function limpiar() {
  console.log('🧹 Limpiando BD...');

  // Orden importante: hijos antes que padres.
  await prisma.auditLog.deleteMany();
  await prisma.eventoSifen.deleteMany();
  await prisma.pagoComprobante.deleteMany();
  await prisma.itemComprobante.deleteMany();
  await prisma.movimientoCaja.deleteMany();
  await prisma.cierreCaja.deleteMany();
  await prisma.aperturaCaja.deleteMany();
  await prisma.comprobante.deleteMany();
  await prisma.itemPedidoComboOpcion.deleteMany();
  await prisma.itemPedidoModificador.deleteMany();
  await prisma.itemPedido.deleteMany();
  await prisma.pedidosYaLog.deleteMany();
  await prisma.pedidosYaProductoMapping.deleteMany();
  await prisma.pedidosYaPedido.deleteMany();
  await prisma.pedido.deleteMany();
  await prisma.itemCompra.deleteMany();
  await prisma.compra.deleteMany();
  await prisma.itemTransferencia.deleteMany();
  await prisma.transferenciaStock.deleteMany();
  await prisma.movimientoStock.deleteMany();
  await prisma.stockSucursal.deleteMany();
  await prisma.itemReceta.deleteMany();
  await prisma.receta.deleteMany();
  await prisma.comboGrupoOpcion.deleteMany();
  await prisma.comboGrupo.deleteMany();
  await prisma.combo.deleteMany();
  await prisma.productoVentaModificadorGrupo.deleteMany();
  await prisma.modificadorOpcion.deleteMany();
  await prisma.modificadorGrupo.deleteMany();
  await prisma.precioPorSucursal.deleteMany();
  await prisma.productoVenta.deleteMany();
  await prisma.productoInventario.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.categoriaProductoEmpresa.deleteMany();
  await prisma.direccionCliente.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.mesa.deleteMany();
  await prisma.zonaMesa.deleteMany();
  await prisma.caja.deleteMany();
  await prisma.timbrado.deleteMany();
  await prisma.puntoExpedicion.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.usuarioPermiso.deleteMany();
  await prisma.permiso.deleteMany();
  await prisma.usuarioSucursal.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.configuracionEmpresa.deleteMany();
  await prisma.sucursal.deleteMany();
  await prisma.empresa.deleteMany();
}

// ═══════════════════════════════════════════════════════════════════════════
//  PERMISOS
// ═══════════════════════════════════════════════════════════════════════════

async function crearPermisos() {
  console.log('🔐 Creando permisos...');
  const permisos = [
    { codigo: 'productos.ver', descripcion: 'Ver catálogo de productos' },
    { codigo: 'productos.editar', descripcion: 'Crear/editar productos' },
    { codigo: 'productos.eliminar', descripcion: 'Eliminar productos' },
    { codigo: 'inventario.ver', descripcion: 'Ver stock' },
    { codigo: 'inventario.ajustar', descripcion: 'Ajustar stock manualmente' },
    { codigo: 'inventario.transferir', descripcion: 'Transferir stock entre sucursales' },
    { codigo: 'inventario.aprobar_transferencia', descripcion: 'Aprobar transferencias' },
    { codigo: 'pedidos.tomar', descripcion: 'Tomar pedidos' },
    { codigo: 'pedidos.cancelar', descripcion: 'Cancelar pedidos' },
    { codigo: 'comprobantes.emitir', descripcion: 'Emitir comprobantes' },
    { codigo: 'comprobantes.anular', descripcion: 'Anular comprobantes' },
    { codigo: 'caja.abrir', descripcion: 'Abrir caja' },
    { codigo: 'caja.cerrar', descripcion: 'Cerrar caja (Z)' },
    { codigo: 'caja.movimientos', descripcion: 'Ingresos/egresos de caja' },
    { codigo: 'reportes.ver', descripcion: 'Ver reportes' },
    {
      codigo: 'reportes.consolidado',
      descripcion: 'Ver reportes consolidados (todas las sucursales)',
    },
    { codigo: 'usuarios.gestionar', descripcion: 'CRUD de usuarios' },
    { codigo: 'cocina.ver_kds', descripcion: 'Ver Kitchen Display' },
    { codigo: 'cocina.marcar_listo', descripcion: 'Marcar items como listos' },
    { codigo: 'configuracion.editar', descripcion: 'Editar configuración de empresa/sucursal' },
  ];
  await prisma.permiso.createMany({ data: permisos });
  return prisma.permiso.findMany();
}

// ═══════════════════════════════════════════════════════════════════════════
//  EMPRESA + SUCURSALES + PUNTOS DE EXPEDICIÓN + TIMBRADOS
// ═══════════════════════════════════════════════════════════════════════════

async function crearEmpresaYSucursales() {
  console.log('🏢 Creando empresa y sucursales...');

  const { ruc, dv } = rucWithDv('80012345');

  const empresa = await prisma.empresa.create({
    data: {
      nombreFantasia: 'Smash Burgers',
      razonSocial: 'SMASH BURGERS PARAGUAY S.A.',
      ruc,
      dv,
      direccion: 'Av. España 1234, Asunción',
      telefono: '+595 21 123 456',
      email: 'contacto@smash.com.py',
      colorPrimario: '#E63946',
      colorSecundario: '#1D3557',
      zonaHoraria: 'America/Asuncion',
      configuracion: {
        create: {
          permitirStockNegativo: true,
          ivaIncluidoEnPrecio: true,
          emitirTicketPorDefecto: true,
        },
      },
    },
  });

  const sucursalCentro = await prisma.sucursal.create({
    data: {
      empresaId: empresa.id,
      nombre: 'Asunción Centro',
      codigo: 'CEN',
      establecimiento: '001',
      direccion: 'Palma 525 c/ 14 de Mayo',
      ciudad: 'Asunción',
      departamento: 'Central',
      telefono: '+595 21 491 234',
      email: 'centro@smash.com.py',
      horarios: {
        lunes: { abre: '11:00', cierra: '23:00' },
        martes: { abre: '11:00', cierra: '23:00' },
        miercoles: { abre: '11:00', cierra: '23:00' },
        jueves: { abre: '11:00', cierra: '23:00' },
        viernes: { abre: '11:00', cierra: '00:00' },
        sabado: { abre: '11:00', cierra: '00:00' },
        domingo: { abre: '12:00', cierra: '22:00' },
      },
    },
  });

  const sucursalSanLorenzo = await prisma.sucursal.create({
    data: {
      empresaId: empresa.id,
      nombre: 'San Lorenzo',
      codigo: 'SLO',
      establecimiento: '002',
      direccion: 'Mariscal López c/ Cnel. Romero',
      ciudad: 'San Lorenzo',
      departamento: 'Central',
      telefono: '+595 21 575 890',
      email: 'sanlorenzo@smash.com.py',
      horarios: {
        lunes: { abre: '11:30', cierra: '23:00' },
        martes: { abre: '11:30', cierra: '23:00' },
        miercoles: { abre: '11:30', cierra: '23:00' },
        jueves: { abre: '11:30', cierra: '23:00' },
        viernes: { abre: '11:30', cierra: '00:00' },
        sabado: { abre: '11:30', cierra: '00:00' },
        domingo: { abre: '12:00', cierra: '22:00' },
      },
    },
  });

  // Puntos de expedición + timbrados (Centro: 2 puntos, San Lorenzo: 1)
  const ptoCentro1 = await prisma.puntoExpedicion.create({
    data: { sucursalId: sucursalCentro.id, codigo: '001', descripcion: 'Caja principal' },
  });
  const ptoCentro2 = await prisma.puntoExpedicion.create({
    data: { sucursalId: sucursalCentro.id, codigo: '002', descripcion: 'Caja express' },
  });
  const ptoSanLorenzo1 = await prisma.puntoExpedicion.create({
    data: { sucursalId: sucursalSanLorenzo.id, codigo: '001', descripcion: 'Caja principal' },
  });

  // Timbrado vigente — número y vigencia ficticios pero plausibles
  const timbradoBase = {
    numero: '12345678',
    fechaInicioVigencia: new Date('2026-01-01'),
    fechaFinVigencia: new Date('2026-12-31'),
    rangoDesde: 1,
    rangoHasta: 9999999,
    ultimoNumeroUsado: 0,
    activo: true,
  };

  await prisma.timbrado.createMany({
    data: [
      {
        puntoExpedicionId: ptoCentro1.id,
        tipoDocumento: TipoDocumentoFiscal.TICKET,
        ...timbradoBase,
      },
      {
        puntoExpedicionId: ptoCentro1.id,
        tipoDocumento: TipoDocumentoFiscal.FACTURA,
        ...timbradoBase,
        numero: '12345679',
      },
      {
        puntoExpedicionId: ptoCentro2.id,
        tipoDocumento: TipoDocumentoFiscal.TICKET,
        ...timbradoBase,
        numero: '12345680',
      },
      {
        puntoExpedicionId: ptoSanLorenzo1.id,
        tipoDocumento: TipoDocumentoFiscal.TICKET,
        ...timbradoBase,
        numero: '12345681',
      },
      {
        puntoExpedicionId: ptoSanLorenzo1.id,
        tipoDocumento: TipoDocumentoFiscal.FACTURA,
        ...timbradoBase,
        numero: '12345682',
      },
    ],
  });

  return { empresa, sucursalCentro, sucursalSanLorenzo, ptoCentro1, ptoCentro2, ptoSanLorenzo1 };
}

// ═══════════════════════════════════════════════════════════════════════════
//  CAJAS + ZONAS + MESAS
// ═══════════════════════════════════════════════════════════════════════════

async function crearCajasYMesas(
  sucursalCentroId: string,
  sucursalSanLorenzoId: string,
  ptoCentro1Id: string,
  ptoCentro2Id: string,
  ptoSanLorenzo1Id: string,
) {
  console.log('💰 Creando cajas, zonas y mesas...');

  await prisma.caja.createMany({
    data: [
      {
        sucursalId: sucursalCentroId,
        puntoExpedicionId: ptoCentro1Id,
        nombre: 'Caja 1',
        estado: EstadoCaja.CERRADA,
      },
      {
        sucursalId: sucursalCentroId,
        puntoExpedicionId: ptoCentro2Id,
        nombre: 'Caja Express',
        estado: EstadoCaja.CERRADA,
      },
      {
        sucursalId: sucursalSanLorenzoId,
        puntoExpedicionId: ptoSanLorenzo1Id,
        nombre: 'Caja 1',
        estado: EstadoCaja.CERRADA,
      },
    ],
  });

  // Centro: 2 zonas, San Lorenzo: 2 zonas
  const zonaCentroSalon = await prisma.zonaMesa.create({
    data: { sucursalId: sucursalCentroId, nombre: 'Salón Principal', orden: 1 },
  });
  const zonaCentroTerraza = await prisma.zonaMesa.create({
    data: { sucursalId: sucursalCentroId, nombre: 'Terraza', orden: 2 },
  });
  const zonaSloSalon = await prisma.zonaMesa.create({
    data: { sucursalId: sucursalSanLorenzoId, nombre: 'Salón', orden: 1 },
  });
  const zonaSloPatio = await prisma.zonaMesa.create({
    data: { sucursalId: sucursalSanLorenzoId, nombre: 'Patio', orden: 2 },
  });

  // Mesas: Centro Salón 1-10 (4 personas), Terraza 11-14 (6 personas)
  const mesasCentroSalon = Array.from({ length: 10 }, (_, i) => ({
    zonaMesaId: zonaCentroSalon.id,
    numero: i + 1,
    capacidad: 4,
    estado: EstadoMesa.LIBRE,
  }));
  const mesasCentroTerraza = Array.from({ length: 4 }, (_, i) => ({
    zonaMesaId: zonaCentroTerraza.id,
    numero: i + 11,
    capacidad: 6,
    estado: EstadoMesa.LIBRE,
  }));
  const mesasSloSalon = Array.from({ length: 8 }, (_, i) => ({
    zonaMesaId: zonaSloSalon.id,
    numero: i + 1,
    capacidad: 4,
    estado: EstadoMesa.LIBRE,
  }));
  const mesasSloPatio = Array.from({ length: 4 }, (_, i) => ({
    zonaMesaId: zonaSloPatio.id,
    numero: i + 9,
    capacidad: 6,
    estado: EstadoMesa.LIBRE,
  }));

  await prisma.mesa.createMany({
    data: [...mesasCentroSalon, ...mesasCentroTerraza, ...mesasSloSalon, ...mesasSloPatio],
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  USUARIOS
// ═══════════════════════════════════════════════════════════════════════════

async function crearUsuarios(
  empresaId: string,
  sucursalCentroId: string,
  sucursalSanLorenzoId: string,
  permisos: { id: string; codigo: string }[],
) {
  console.log('👥 Creando usuarios...');

  const passwordHash = await hash(SEED_PASSWORD);

  // Helper para crear usuario y vincular sucursales
  async function crearUsuario(args: {
    email: string;
    nombreCompleto: string;
    rol: Rol;
    sucursales: { id: string; principal?: boolean }[];
    empresa?: boolean;
    documento?: string;
    telefono?: string;
  }) {
    return prisma.usuario.create({
      data: {
        empresaId: args.empresa === false ? null : empresaId,
        email: args.email,
        passwordHash,
        nombreCompleto: args.nombreCompleto,
        rol: args.rol,
        documento: args.documento,
        telefono: args.telefono,
        sucursales: {
          create: args.sucursales.map((s) => ({
            sucursalId: s.id,
            esPrincipal: s.principal ?? false,
          })),
        },
      },
    });
  }

  // SUPER_ADMIN — sin empresa
  await crearUsuario({
    email: 'superadmin@smash.local',
    nombreCompleto: 'Super Admin',
    rol: Rol.SUPER_ADMIN,
    sucursales: [],
    empresa: false,
  });

  // ADMIN_EMPRESA — acceso a ambas sucursales
  const admin = await crearUsuario({
    email: 'admin@smash.com.py',
    nombreCompleto: 'Roberto Giménez',
    rol: Rol.ADMIN_EMPRESA,
    documento: '3456789',
    telefono: '+595 981 100 200',
    sucursales: [{ id: sucursalCentroId, principal: true }, { id: sucursalSanLorenzoId }],
  });

  // GERENTE_SUCURSAL — uno por sucursal
  await crearUsuario({
    email: 'gerente.centro@smash.com.py',
    nombreCompleto: 'María Benítez',
    rol: Rol.GERENTE_SUCURSAL,
    documento: '4123456',
    telefono: '+595 982 200 300',
    sucursales: [{ id: sucursalCentroId, principal: true }],
  });
  await crearUsuario({
    email: 'gerente.sanlorenzo@smash.com.py',
    nombreCompleto: 'Carlos Ramírez',
    rol: Rol.GERENTE_SUCURSAL,
    documento: '4234567',
    telefono: '+595 983 300 400',
    sucursales: [{ id: sucursalSanLorenzoId, principal: true }],
  });

  // CAJEROS
  await crearUsuario({
    email: 'cajero1@smash.com.py',
    nombreCompleto: 'Lucía Acosta',
    rol: Rol.CAJERO,
    documento: '5123456',
    sucursales: [{ id: sucursalCentroId, principal: true }],
  });
  await crearUsuario({
    email: 'cajero2@smash.com.py',
    nombreCompleto: 'Diego Vera',
    rol: Rol.CAJERO,
    documento: '5234567',
    sucursales: [{ id: sucursalSanLorenzoId, principal: true }],
  });

  // COCINA
  await crearUsuario({
    email: 'cocina1@smash.com.py',
    nombreCompleto: 'José Fernández',
    rol: Rol.COCINA,
    documento: '5345678',
    sucursales: [{ id: sucursalCentroId, principal: true }],
  });
  await crearUsuario({
    email: 'cocina2@smash.com.py',
    nombreCompleto: 'Ana López',
    rol: Rol.COCINA,
    documento: '5456789',
    sucursales: [{ id: sucursalSanLorenzoId, principal: true }],
  });

  // MESERO
  await crearUsuario({
    email: 'mesero1@smash.com.py',
    nombreCompleto: 'Pedro Sosa',
    rol: Rol.MESERO,
    documento: '5567890',
    sucursales: [{ id: sucursalCentroId, principal: true }],
  });

  // REPARTIDOR
  await crearUsuario({
    email: 'repartidor1@smash.com.py',
    nombreCompleto: 'Miguel Rojas',
    rol: Rol.REPARTIDOR,
    documento: '5678901',
    telefono: '+595 985 500 600',
    sucursales: [{ id: sucursalCentroId, principal: true }],
  });

  // Permisos: el ADMIN_EMPRESA recibe TODOS los permisos.
  await prisma.usuarioPermiso.createMany({
    data: permisos.map((p) => ({
      usuarioId: admin.id,
      permisoId: p.id,
      concedido: true,
    })),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLIENTES
// ═══════════════════════════════════════════════════════════════════════════

async function crearClientes(empresaId: string) {
  console.log('🧑 Creando clientes...');

  // Cliente "SIN NOMBRE" — consumidor final único por empresa
  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.CONSUMIDOR_FINAL,
      razonSocial: 'SIN NOMBRE',
      esConsumidorFinal: true,
    },
  });

  // Personas físicas
  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.PERSONA_FISICA,
      documento: '1234567',
      razonSocial: 'Andrea Martínez',
      email: 'andrea.martinez@gmail.com',
      telefono: '+595 981 234 567',
      direcciones: {
        create: {
          alias: 'Casa',
          direccion: 'Av. Mariscal López 2050',
          ciudad: 'Asunción',
          departamento: 'Central',
          referencias: 'Edificio Torres del Sol, piso 5',
          esPrincipal: true,
        },
      },
    },
  });

  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.PERSONA_FISICA,
      documento: '2345678',
      razonSocial: 'Juan Cabrera',
      email: 'juan.cabrera@hotmail.com',
      telefono: '+595 982 345 678',
    },
  });

  // Personas jurídicas con RUC válido
  const rucEmpresaCliente = rucWithDv('80056789');
  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.PERSONA_JURIDICA,
      ruc: rucEmpresaCliente.ruc,
      dv: rucEmpresaCliente.dv,
      razonSocial: 'CONSULTORA DEL ESTE S.A.',
      nombreFantasia: 'Consultora del Este',
      email: 'contacto@consultoradeleste.com.py',
      telefono: '+595 21 660 110',
    },
  });

  const rucEmpresaCliente2 = rucWithDv('80098765');
  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.PERSONA_JURIDICA,
      ruc: rucEmpresaCliente2.ruc,
      dv: rucEmpresaCliente2.dv,
      razonSocial: 'TECH SOLUTIONS PY S.R.L.',
      nombreFantasia: 'Tech Solutions',
      email: 'admin@techsolutions.com.py',
      telefono: '+595 21 444 555',
    },
  });

  await prisma.cliente.create({
    data: {
      empresaId,
      tipoContribuyente: TipoContribuyente.PERSONA_FISICA,
      documento: '3456789',
      razonSocial: 'Sandra Báez',
      telefono: '+595 983 456 789',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATEGORÍAS DE PRODUCTOS
// ═══════════════════════════════════════════════════════════════════════════

async function crearCategorias(empresaId: string) {
  console.log('📁 Creando categorías...');

  const categorias = [
    { nombre: 'Hamburguesas', categoriaBase: CategoriaProducto.HAMBURGUESA, ordenMenu: 1 },
    { nombre: 'Lomitos', categoriaBase: CategoriaProducto.LOMITO, ordenMenu: 2 },
    { nombre: 'Pizzas', categoriaBase: CategoriaProducto.PIZZA, ordenMenu: 3 },
    { nombre: 'Empanadas', categoriaBase: CategoriaProducto.EMPANADA, ordenMenu: 4 },
    { nombre: 'Milanesas', categoriaBase: CategoriaProducto.MILANESA, ordenMenu: 5 },
    { nombre: 'Chipa y panificados', categoriaBase: CategoriaProducto.CHIPA, ordenMenu: 6 },
    { nombre: 'Acompañamientos', categoriaBase: CategoriaProducto.ACOMPANAMIENTO, ordenMenu: 7 },
    { nombre: 'Bebidas frías', categoriaBase: CategoriaProducto.BEBIDA_FRIA, ordenMenu: 8 },
    { nombre: 'Cerveza', categoriaBase: CategoriaProducto.CERVEZA, ordenMenu: 9 },
    { nombre: 'Postres', categoriaBase: CategoriaProducto.POSTRE, ordenMenu: 10 },
    { nombre: 'Combos', categoriaBase: CategoriaProducto.COMBO, ordenMenu: 11 },
  ];

  await prisma.categoriaProductoEmpresa.createMany({
    data: categorias.map((c) => ({ ...c, empresaId })),
  });

  return prisma.categoriaProductoEmpresa.findMany({ where: { empresaId } });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROVEEDORES
// ═══════════════════════════════════════════════════════════════════════════

async function crearProveedores(empresaId: string) {
  console.log('🚚 Creando proveedores...');

  const provs = [
    {
      nombre: 'CARNES DEL CHACO S.A.',
      ruc: '80034567',
      contacto: 'Lic. Mario Duarte',
      telefono: '+595 21 770 800',
      email: 'ventas@carneschaco.com.py',
    },
    {
      nombre: 'LACTEOS LA HOLANDA',
      ruc: '80045678',
      contacto: 'Sra. Patricia Rivas',
      telefono: '+595 21 660 100',
    },
    {
      nombre: 'DISTRIBUIDORA COCA-COLA PARAGUAY',
      ruc: '80067890',
      contacto: 'Cuenta corporativa',
      telefono: '+595 21 333 444',
    },
    {
      nombre: 'PANADERIA DEL CENTRO S.R.L.',
      ruc: '80078901',
      contacto: 'Don Aníbal',
      telefono: '+595 981 678 901',
    },
  ];

  for (const p of provs) {
    const { ruc, dv } = rucWithDv(p.ruc);
    await prisma.proveedor.create({
      data: {
        empresaId,
        razonSocial: p.nombre,
        ruc,
        dv,
        contacto: p.contacto,
        telefono: p.telefono,
        email: p.email,
      },
    });
  }

  return prisma.proveedor.findMany({ where: { empresaId } });
}

// ═══════════════════════════════════════════════════════════════════════════
//  INSUMOS (productos de inventario)
// ═══════════════════════════════════════════════════════════════════════════

interface InsumoSeed {
  codigo: string;
  nombre: string;
  unidad: UnidadMedida;
  costo: number;
  categoria: string;
  proveedor?: string;
  codigoBarras?: string;
}

async function crearInsumos(empresaId: string, proveedores: { id: string; razonSocial: string }[]) {
  console.log('📦 Creando insumos...');

  const provByName = new Map(proveedores.map((p) => [p.razonSocial, p.id]));

  const insumos: InsumoSeed[] = [
    // Carnes
    {
      codigo: 'CAR-001',
      nombre: 'Medallón de carne 130g',
      unidad: UnidadMedida.UNIDAD,
      costo: 8000,
      categoria: 'Carnes',
      proveedor: 'CARNES DEL CHACO S.A.',
    },
    {
      codigo: 'CAR-002',
      nombre: 'Lomito de res (kg)',
      unidad: UnidadMedida.GRAMO,
      costo: 75,
      categoria: 'Carnes',
      proveedor: 'CARNES DEL CHACO S.A.',
    },
    {
      codigo: 'CAR-003',
      nombre: 'Pechuga de pollo (kg)',
      unidad: UnidadMedida.GRAMO,
      costo: 35,
      categoria: 'Carnes',
      proveedor: 'CARNES DEL CHACO S.A.',
    },
    {
      codigo: 'CAR-004',
      nombre: 'Panceta ahumada',
      unidad: UnidadMedida.GRAMO,
      costo: 60,
      categoria: 'Carnes',
      proveedor: 'CARNES DEL CHACO S.A.',
    },
    {
      codigo: 'CAR-005',
      nombre: 'Jamón cocido',
      unidad: UnidadMedida.GRAMO,
      costo: 45,
      categoria: 'Carnes',
    },

    // Lácteos
    {
      codigo: 'LAC-001',
      nombre: 'Queso cheddar (feta)',
      unidad: UnidadMedida.UNIDAD,
      costo: 1200,
      categoria: 'Lácteos',
      proveedor: 'LACTEOS LA HOLANDA',
    },
    {
      codigo: 'LAC-002',
      nombre: 'Queso muzzarella',
      unidad: UnidadMedida.GRAMO,
      costo: 50,
      categoria: 'Lácteos',
      proveedor: 'LACTEOS LA HOLANDA',
    },
    {
      codigo: 'LAC-003',
      nombre: 'Queso paraguay',
      unidad: UnidadMedida.GRAMO,
      costo: 40,
      categoria: 'Lácteos',
      proveedor: 'LACTEOS LA HOLANDA',
    },
    {
      codigo: 'LAC-004',
      nombre: 'Manteca',
      unidad: UnidadMedida.GRAMO,
      costo: 30,
      categoria: 'Lácteos',
      proveedor: 'LACTEOS LA HOLANDA',
    },

    // Panadería
    {
      codigo: 'PAN-001',
      nombre: 'Pan de hamburguesa',
      unidad: UnidadMedida.UNIDAD,
      costo: 2000,
      categoria: 'Panadería',
      proveedor: 'PANADERIA DEL CENTRO S.R.L.',
    },
    {
      codigo: 'PAN-002',
      nombre: 'Pan árabe',
      unidad: UnidadMedida.UNIDAD,
      costo: 2500,
      categoria: 'Panadería',
      proveedor: 'PANADERIA DEL CENTRO S.R.L.',
    },
    {
      codigo: 'PAN-003',
      nombre: 'Chipa cruda armada',
      unidad: UnidadMedida.UNIDAD,
      costo: 1500,
      categoria: 'Panadería',
    },

    // Vegetales
    {
      codigo: 'VEG-001',
      nombre: 'Lechuga',
      unidad: UnidadMedida.GRAMO,
      costo: 5,
      categoria: 'Vegetales',
    },
    {
      codigo: 'VEG-002',
      nombre: 'Tomate',
      unidad: UnidadMedida.UNIDAD,
      costo: 1500,
      categoria: 'Vegetales',
    },
    {
      codigo: 'VEG-003',
      nombre: 'Cebolla',
      unidad: UnidadMedida.UNIDAD,
      costo: 1000,
      categoria: 'Vegetales',
    },
    {
      codigo: 'VEG-004',
      nombre: 'Pickle',
      unidad: UnidadMedida.GRAMO,
      costo: 25,
      categoria: 'Vegetales',
    },
    {
      codigo: 'VEG-005',
      nombre: 'Papa pre-frita congelada',
      unidad: UnidadMedida.GRAMO,
      costo: 12,
      categoria: 'Congelados',
    },
    {
      codigo: 'VEG-006',
      nombre: 'Aro de cebolla rebozado',
      unidad: UnidadMedida.UNIDAD,
      costo: 800,
      categoria: 'Congelados',
    },

    // Salsas y condimentos
    {
      codigo: 'SAL-001',
      nombre: 'Mayonesa',
      unidad: UnidadMedida.MILILITRO,
      costo: 8,
      categoria: 'Salsas',
    },
    {
      codigo: 'SAL-002',
      nombre: 'Mostaza',
      unidad: UnidadMedida.MILILITRO,
      costo: 6,
      categoria: 'Salsas',
    },
    {
      codigo: 'SAL-003',
      nombre: 'Ketchup',
      unidad: UnidadMedida.MILILITRO,
      costo: 7,
      categoria: 'Salsas',
    },
    {
      codigo: 'SAL-004',
      nombre: 'Salsa BBQ',
      unidad: UnidadMedida.MILILITRO,
      costo: 12,
      categoria: 'Salsas',
    },
    {
      codigo: 'SAL-005',
      nombre: 'Salsa de tomate (pizza)',
      unidad: UnidadMedida.MILILITRO,
      costo: 10,
      categoria: 'Salsas',
    },

    // Otros insumos
    {
      codigo: 'OTR-001',
      nombre: 'Aceite vegetal',
      unidad: UnidadMedida.MILILITRO,
      costo: 4,
      categoria: 'Otros',
    },
    { codigo: 'OTR-002', nombre: 'Sal', unidad: UnidadMedida.GRAMO, costo: 2, categoria: 'Otros' },
    {
      codigo: 'OTR-003',
      nombre: 'Harina',
      unidad: UnidadMedida.GRAMO,
      costo: 4,
      categoria: 'Otros',
    },
    {
      codigo: 'OTR-004',
      nombre: 'Huevo',
      unidad: UnidadMedida.UNIDAD,
      costo: 1200,
      categoria: 'Otros',
    },

    // Productos terminados (compras)
    {
      codigo: 'EMP-001',
      nombre: 'Empanada de carne (cruda)',
      unidad: UnidadMedida.UNIDAD,
      costo: 3500,
      categoria: 'Empanadas',
      proveedor: 'PANADERIA DEL CENTRO S.R.L.',
    },
    {
      codigo: 'EMP-002',
      nombre: 'Empanada de pollo (cruda)',
      unidad: UnidadMedida.UNIDAD,
      costo: 3500,
      categoria: 'Empanadas',
      proveedor: 'PANADERIA DEL CENTRO S.R.L.',
    },
    {
      codigo: 'EMP-003',
      nombre: 'Empanada jamón y queso (cruda)',
      unidad: UnidadMedida.UNIDAD,
      costo: 3500,
      categoria: 'Empanadas',
      proveedor: 'PANADERIA DEL CENTRO S.R.L.',
    },
    {
      codigo: 'POS-001',
      nombre: 'Helado vainilla (kg)',
      unidad: UnidadMedida.GRAMO,
      costo: 25,
      categoria: 'Postres',
    },
    {
      codigo: 'MIL-001',
      nombre: 'Milanesa de pollo cruda',
      unidad: UnidadMedida.UNIDAD,
      costo: 6000,
      categoria: 'Carnes',
    },

    // Bebidas
    {
      codigo: 'BEB-001',
      nombre: 'Coca-Cola 500ml',
      unidad: UnidadMedida.UNIDAD,
      codigoBarras: '7790895001234',
      costo: 5000,
      categoria: 'Bebidas',
      proveedor: 'DISTRIBUIDORA COCA-COLA PARAGUAY',
    },
    {
      codigo: 'BEB-002',
      nombre: 'Pulp 500ml',
      unidad: UnidadMedida.UNIDAD,
      codigoBarras: '7790895005678',
      costo: 4500,
      categoria: 'Bebidas',
      proveedor: 'DISTRIBUIDORA COCA-COLA PARAGUAY',
    },
    {
      codigo: 'BEB-003',
      nombre: 'Cerveza Pilsen 330ml',
      unidad: UnidadMedida.UNIDAD,
      codigoBarras: '7791234560001',
      costo: 7500,
      categoria: 'Cerveza',
    },
    {
      codigo: 'BEB-004',
      nombre: 'Agua mineral 500ml',
      unidad: UnidadMedida.UNIDAD,
      codigoBarras: '7791234560002',
      costo: 2500,
      categoria: 'Bebidas',
    },
    {
      codigo: 'BEB-005',
      nombre: 'Frugos 250ml',
      unidad: UnidadMedida.UNIDAD,
      codigoBarras: '7791234560003',
      costo: 3500,
      categoria: 'Bebidas',
    },
  ];

  for (const i of insumos) {
    await prisma.productoInventario.create({
      data: {
        empresaId,
        codigo: i.codigo,
        codigoBarras: i.codigoBarras,
        nombre: i.nombre,
        unidadMedida: i.unidad,
        costoUnitario: G(i.costo),
        categoria: i.categoria,
        proveedorId: i.proveedor ? (provByName.get(i.proveedor) ?? null) : null,
      },
    });
  }

  return prisma.productoInventario.findMany({ where: { empresaId } });
}

// ═══════════════════════════════════════════════════════════════════════════
//  STOCK POR SUCURSAL
// ═══════════════════════════════════════════════════════════════════════════

async function crearStock(
  insumos: { id: string; nombre: string; costoUnitario: bigint }[],
  sucursalCentroId: string,
  sucursalSanLorenzoId: string,
) {
  console.log('📊 Asignando stock por sucursal...');

  // Stock realista por sucursal
  for (const insumo of insumos) {
    // Centro tiene más stock (más volumen de venta)
    const stockCentro = randomStock(insumo.nombre);
    const stockSlo = Math.round(stockCentro * 0.65);

    await prisma.stockSucursal.createMany({
      data: [
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursalCentroId,
          stockActual: stockCentro,
          stockMinimo: Math.round(stockCentro * 0.2),
          stockMaximo: Math.round(stockCentro * 1.5),
          costoPromedio: insumo.costoUnitario,
        },
        {
          productoInventarioId: insumo.id,
          sucursalId: sucursalSanLorenzoId,
          stockActual: stockSlo,
          stockMinimo: Math.round(stockSlo * 0.2),
          stockMaximo: Math.round(stockSlo * 1.5),
          costoPromedio: insumo.costoUnitario,
        },
      ],
    });
  }
}

function randomStock(nombre: string): number {
  // Cantidades plausibles según tipo de insumo
  if (/medallón|empanada|milanesa|cerveza|coca|pulp|frugos|agua/i.test(nombre)) return 80;
  if (/queso cheddar|huevo|pan |aro|chipa cruda|pan árabe/i.test(nombre)) return 150;
  if (/lechuga|tomate|cebolla|pickle/i.test(nombre)) return 5000;
  if (/lomito|pollo|panceta|jamón|muzzarella|paraguay|manteca/i.test(nombre)) return 8000;
  if (/papa|aceite|mayonesa|mostaza|ketchup|bbq|salsa de tomate|harina|sal|helado/i.test(nombre))
    return 15000;
  return 1000;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PRODUCTOS DE VENTA + RECETAS + COMBOS + MODIFICADORES
// ═══════════════════════════════════════════════════════════════════════════

/** Banco de imágenes Unsplash por código de producto. URLs estables, sin auth. */
const IMG: Record<string, string> = {
  'HAM-001':
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=450&fit=crop&q=80',
  'HAM-002':
    'https://images.unsplash.com/photo-1572802419224-296b0aeee0d9?w=600&h=450&fit=crop&q=80',
  'HAM-003': 'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=600&h=450&fit=crop&q=80',
  'LOM-001': 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=600&h=450&fit=crop&q=80',
  'LOM-002': 'https://images.unsplash.com/photo-1561758033-d89a9ad46330?w=600&h=450&fit=crop&q=80',
  'LOM-003':
    'https://images.unsplash.com/photo-1610614819513-58e34989848b?w=600&h=450&fit=crop&q=80',
  'EMP-001':
    'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&h=450&fit=crop&q=80',
  'EMP-002':
    'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&h=450&fit=crop&q=80',
  'EMP-003':
    'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&h=450&fit=crop&q=80',
  'MIL-001':
    'https://images.unsplash.com/photo-1601314002957-de03d5dc1b59?w=600&h=450&fit=crop&q=80',
  'MIL-002':
    'https://images.unsplash.com/photo-1601314002957-de03d5dc1b59?w=600&h=450&fit=crop&q=80',
  'CHI-001':
    'https://images.unsplash.com/photo-1612871689353-cccf581d667b?w=600&h=450&fit=crop&q=80',
  'ACO-001':
    'https://images.unsplash.com/photo-1576107232684-1279f390859f?w=600&h=450&fit=crop&q=80',
  'ACO-002':
    'https://images.unsplash.com/photo-1639024471283-03518883512d?w=600&h=450&fit=crop&q=80',
  'PIZ-001':
    'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&h=450&fit=crop&q=80',
  'PIZ-002':
    'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&h=450&fit=crop&q=80',
  'POS-001': 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&h=450&fit=crop&q=80',
  'BEB-001': 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=600&h=450&fit=crop&q=80',
  'BEB-002':
    'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&h=450&fit=crop&q=80',
  'BEB-003':
    'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=600&h=450&fit=crop&q=80',
  'BEB-004': 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&h=450&fit=crop&q=80',
  'BEB-005':
    'https://images.unsplash.com/photo-1622597467836-f3e6047cc116?w=600&h=450&fit=crop&q=80',
  'COMBO-SMASH':
    'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=600&h=450&fit=crop&q=80',
};

async function crearProductosVenta(
  empresaId: string,
  insumos: { id: string; codigo: string | null; nombre: string }[],
  categorias: { id: string; nombre: string }[],
) {
  console.log('🍔 Creando productos de venta, recetas, combos y modificadores...');

  const insumoByCodigo = new Map(insumos.filter((i) => i.codigo).map((i) => [i.codigo!, i.id]));
  const catByName = new Map(categorias.map((c) => [c.nombre, c.id]));

  // ───── Sub-preparaciones (esPreparacion=true) ─────
  // Salsa de la casa: combina mayonesa + mostaza + ketchup
  const salsaCasa = await prisma.productoVenta.create({
    data: {
      empresaId,
      codigo: 'SUB-001',
      nombre: 'Salsa de la casa',
      precioBase: G(0),
      tasaIva: TasaIva.IVA_10,
      esPreparacion: true,
      esVendible: false,
      receta: {
        create: {
          empresaId,
          rinde: 100, // 100ml por preparación
          items: {
            create: [
              {
                productoInventarioId: insumoByCodigo.get('SAL-001')!,
                cantidad: 60,
                unidadMedida: UnidadMedida.MILILITRO,
              },
              {
                productoInventarioId: insumoByCodigo.get('SAL-002')!,
                cantidad: 25,
                unidadMedida: UnidadMedida.MILILITRO,
              },
              {
                productoInventarioId: insumoByCodigo.get('SAL-003')!,
                cantidad: 15,
                unidadMedida: UnidadMedida.MILILITRO,
              },
            ],
          },
        },
      },
    },
  });

  // ───── Hamburguesas ─────
  const hamburguesas = [
    {
      codigo: 'HAM-001',
      nombre: 'Smash Clásica',
      descripcion: 'Medallón 130g, queso cheddar, lechuga, tomate, cebolla, salsa de la casa',
      precio: 35000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 480,
      receta: [
        { codigo: 'PAN-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'LAC-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'VEG-001', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { codigo: 'VEG-003', cantidad: 0.25, unidad: UnidadMedida.UNIDAD },
        // Sub-receta: salsa de la casa, 30ml
        { subProducto: 'salsa', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
    {
      codigo: 'HAM-002',
      nombre: 'Doble Smash',
      descripcion: 'Doble medallón, doble queso, panceta, lechuga, tomate, salsa de la casa',
      precio: 50000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 540,
      receta: [
        { codigo: 'PAN-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-001', cantidad: 2, unidad: UnidadMedida.UNIDAD },
        { codigo: 'LAC-001', cantidad: 2, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-004', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-001', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { subProducto: 'salsa', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
    {
      codigo: 'HAM-003',
      nombre: 'Bacon Cheese',
      descripcion: 'Medallón, doble cheddar, panceta crocante, cebolla caramelizada, salsa BBQ',
      precio: 45000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 510,
      receta: [
        { codigo: 'PAN-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'LAC-001', cantidad: 2, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-004', cantidad: 40, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-003', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { codigo: 'SAL-004', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
  ];

  // ───── Lomitos ─────
  const lomitos = [
    {
      codigo: 'LOM-001',
      nombre: 'Lomito Tradicional',
      descripcion: 'Lomito de res, lechuga, tomate, mayonesa',
      precio: 40000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 480,
      receta: [
        { codigo: 'PAN-002', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-002', cantidad: 150, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-001', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { codigo: 'SAL-001', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
    {
      codigo: 'LOM-002',
      nombre: 'Lomito Argentino',
      descripcion: 'Lomito de res, queso, jamón, huevo frito, lechuga, tomate',
      precio: 48000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 540,
      receta: [
        { codigo: 'PAN-002', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-002', cantidad: 150, unidad: UnidadMedida.GRAMO },
        { codigo: 'CAR-005', cantidad: 50, unidad: UnidadMedida.GRAMO },
        { codigo: 'LAC-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'OTR-004', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'VEG-001', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { codigo: 'SAL-001', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
    {
      codigo: 'LOM-003',
      nombre: 'Lomito Completo',
      descripcion: 'Lomito de res, queso, jamón, huevo, panceta, lechuga, tomate, mayonesa',
      precio: 52000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 600,
      receta: [
        { codigo: 'PAN-002', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-002', cantidad: 150, unidad: UnidadMedida.GRAMO },
        { codigo: 'CAR-005', cantidad: 50, unidad: UnidadMedida.GRAMO },
        { codigo: 'CAR-004', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'LAC-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'OTR-004', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'VEG-001', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 0.5, unidad: UnidadMedida.UNIDAD },
        { codigo: 'SAL-001', cantidad: 30, unidad: UnidadMedida.MILILITRO },
      ],
    },
  ];

  // ───── Empanadas, milanesas, chipa, acompañamientos, pizzas ─────
  const otros = [
    {
      categoria: 'Empanadas',
      codigo: 'EMP-001',
      nombre: 'Empanada de carne',
      precio: 8000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 240,
      receta: [{ codigo: 'EMP-001', cantidad: 1, unidad: UnidadMedida.UNIDAD }],
    },
    {
      categoria: 'Empanadas',
      codigo: 'EMP-002',
      nombre: 'Empanada de pollo',
      precio: 8000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 240,
      receta: [{ codigo: 'EMP-002', cantidad: 1, unidad: UnidadMedida.UNIDAD }],
    },
    {
      categoria: 'Empanadas',
      codigo: 'EMP-003',
      nombre: 'Empanada jamón y queso',
      precio: 8000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 240,
      receta: [{ codigo: 'EMP-003', cantidad: 1, unidad: UnidadMedida.UNIDAD }],
    },
    {
      categoria: 'Milanesas',
      codigo: 'MIL-001',
      nombre: 'Milanesa de pollo',
      precio: 35000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 540,
      receta: [
        { codigo: 'MIL-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'VEG-005', cantidad: 200, unidad: UnidadMedida.GRAMO },
      ],
    },
    {
      categoria: 'Milanesas',
      codigo: 'MIL-002',
      nombre: 'Milanesa napolitana',
      precio: 42000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 600,
      receta: [
        { codigo: 'MIL-001', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'SAL-005', cantidad: 60, unidad: UnidadMedida.MILILITRO },
        { codigo: 'LAC-002', cantidad: 80, unidad: UnidadMedida.GRAMO },
        { codigo: 'CAR-005', cantidad: 30, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-005', cantidad: 200, unidad: UnidadMedida.GRAMO },
      ],
    },
    {
      categoria: 'Chipa y panificados',
      codigo: 'CHI-001',
      nombre: 'Porción de chipa (4 unidades)',
      precio: 15000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 300,
      receta: [{ codigo: 'PAN-003', cantidad: 4, unidad: UnidadMedida.UNIDAD }],
    },
    {
      categoria: 'Acompañamientos',
      codigo: 'ACO-001',
      nombre: 'Papas fritas',
      precio: 18000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 300,
      receta: [
        { codigo: 'VEG-005', cantidad: 250, unidad: UnidadMedida.GRAMO },
        { codigo: 'OTR-002', cantidad: 2, unidad: UnidadMedida.GRAMO },
      ],
    },
    {
      categoria: 'Acompañamientos',
      codigo: 'ACO-002',
      nombre: 'Aros de cebolla',
      precio: 20000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 300,
      receta: [{ codigo: 'VEG-006', cantidad: 8, unidad: UnidadMedida.UNIDAD }],
    },
    {
      categoria: 'Pizzas',
      codigo: 'PIZ-001',
      nombre: 'Pizza Margherita',
      precio: 45000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 720,
      receta: [
        { codigo: 'OTR-003', cantidad: 250, unidad: UnidadMedida.GRAMO }, // harina
        { codigo: 'SAL-005', cantidad: 100, unidad: UnidadMedida.MILILITRO },
        { codigo: 'LAC-002', cantidad: 200, unidad: UnidadMedida.GRAMO },
      ],
    },
    {
      categoria: 'Pizzas',
      codigo: 'PIZ-002',
      nombre: 'Pizza Napolitana',
      precio: 52000,
      sector: SectorComanda.COCINA_CALIENTE,
      tiempoPrep: 720,
      receta: [
        { codigo: 'OTR-003', cantidad: 250, unidad: UnidadMedida.GRAMO },
        { codigo: 'SAL-005', cantidad: 100, unidad: UnidadMedida.MILILITRO },
        { codigo: 'LAC-002', cantidad: 200, unidad: UnidadMedida.GRAMO },
        { codigo: 'VEG-002', cantidad: 1, unidad: UnidadMedida.UNIDAD },
        { codigo: 'CAR-005', cantidad: 50, unidad: UnidadMedida.GRAMO },
      ],
    },
    {
      categoria: 'Postres',
      codigo: 'POS-001',
      nombre: 'Helado de vainilla (porción)',
      precio: 12000,
      sector: SectorComanda.POSTRES,
      tiempoPrep: 60,
      receta: [{ codigo: 'POS-001', cantidad: 100, unidad: UnidadMedida.GRAMO }],
    },
  ];

  // ───── Bebidas (van a BAR, no llevan receta de cocina — son productos directos) ─────
  const bebidas = [
    {
      categoria: 'Bebidas frías',
      codigo: 'BEB-001',
      nombre: 'Coca-Cola 500ml',
      precio: 10000,
      sector: SectorComanda.BAR,
      insumo: 'BEB-001',
    },
    {
      categoria: 'Bebidas frías',
      codigo: 'BEB-002',
      nombre: 'Pulp 500ml',
      precio: 10000,
      sector: SectorComanda.BAR,
      insumo: 'BEB-002',
    },
    {
      categoria: 'Cerveza',
      codigo: 'BEB-003',
      nombre: 'Cerveza Pilsen 330ml',
      precio: 15000,
      sector: SectorComanda.BAR,
      insumo: 'BEB-003',
    },
    {
      categoria: 'Bebidas frías',
      codigo: 'BEB-004',
      nombre: 'Agua mineral 500ml',
      precio: 6000,
      sector: SectorComanda.BAR,
      insumo: 'BEB-004',
    },
    {
      categoria: 'Bebidas frías',
      codigo: 'BEB-005',
      nombre: 'Frugos 250ml',
      precio: 8000,
      sector: SectorComanda.BAR,
      insumo: 'BEB-005',
    },
  ];

  // Helper para crear ProductoVenta + Receta
  async function crearProducto(args: {
    categoria: string;
    codigo: string;
    nombre: string;
    descripcion?: string;
    precio: number;
    sector: SectorComanda;
    tiempoPrep?: number;
    codigoBarras?: string;
    receta: { codigo?: string; subProducto?: string; cantidad: number; unidad: UnidadMedida }[];
  }) {
    return prisma.productoVenta.create({
      data: {
        empresaId,
        categoriaId: catByName.get(args.categoria) ?? null,
        codigo: args.codigo,
        codigoBarras: args.codigoBarras,
        nombre: args.nombre,
        descripcion: args.descripcion,
        precioBase: G(args.precio),
        tasaIva: TasaIva.IVA_10,
        sectorComanda: args.sector,
        tiempoPrepSegundos: args.tiempoPrep,
        imagenUrl: IMG[args.codigo] ?? null,
        receta: {
          create: {
            empresaId,
            items: {
              create: args.receta.map((r) => ({
                productoInventarioId: r.codigo ? insumoByCodigo.get(r.codigo)! : null,
                subProductoVentaId: r.subProducto === 'salsa' ? salsaCasa.id : null,
                cantidad: r.cantidad,
                unidadMedida: r.unidad,
              })),
            },
          },
        },
      },
    });
  }

  // Helper para bebidas: producto sin receta (1 insumo = 1 producto)
  async function crearBebida(args: {
    categoria: string;
    codigo: string;
    nombre: string;
    precio: number;
    sector: SectorComanda;
    insumo: string;
    codigoBarras?: string;
  }) {
    return prisma.productoVenta.create({
      data: {
        empresaId,
        categoriaId: catByName.get(args.categoria) ?? null,
        codigo: args.codigo,
        nombre: args.nombre,
        precioBase: G(args.precio),
        tasaIva: TasaIva.IVA_10,
        sectorComanda: args.sector,
        imagenUrl: IMG[args.codigo] ?? null,
        receta: {
          create: {
            empresaId,
            items: {
              create: [
                {
                  productoInventarioId: insumoByCodigo.get(args.insumo)!,
                  cantidad: 1,
                  unidadMedida: UnidadMedida.UNIDAD,
                },
              ],
            },
          },
        },
      },
    });
  }

  const productosCreados: { codigo: string; id: string; nombre: string }[] = [];

  for (const h of hamburguesas) {
    const p = await crearProducto({ categoria: 'Hamburguesas', ...h });
    productosCreados.push({ codigo: h.codigo, id: p.id, nombre: h.nombre });
  }
  for (const l of lomitos) {
    const p = await crearProducto({ categoria: 'Lomitos', ...l });
    productosCreados.push({ codigo: l.codigo, id: p.id, nombre: l.nombre });
  }
  for (const o of otros) {
    const p = await crearProducto(o);
    productosCreados.push({ codigo: o.codigo, id: p.id, nombre: o.nombre });
  }
  for (const b of bebidas) {
    const p = await crearBebida(b);
    productosCreados.push({ codigo: b.codigo, id: p.id, nombre: b.nombre });
  }

  // ───── COMBO Smash ─────
  console.log('🍟 Creando combo configurable...');

  const findP = (codigo: string) => productosCreados.find((p) => p.codigo === codigo)!;

  const combo = await prisma.productoVenta.create({
    data: {
      empresaId,
      categoriaId: catByName.get('Combos') ?? null,
      codigo: 'COMBO-SMASH',
      nombre: 'Combo Smash',
      descripcion: 'Hamburguesa + acompañamiento + bebida',
      precioBase: G(55000),
      tasaIva: TasaIva.IVA_10,
      esCombo: true,
      imagenUrl: IMG['COMBO-SMASH'] ?? null,
      combo: {
        create: {
          empresaId,
          descripcion: 'Armá tu combo: elegí hamburguesa, acompañamiento y bebida',
          grupos: {
            create: [
              {
                nombre: 'Elegí tu hamburguesa',
                orden: 1,
                obligatorio: true,
                opciones: {
                  create: [
                    {
                      productoVentaId: findP('HAM-001').id,
                      precioExtra: G(0),
                      esDefault: true,
                      orden: 1,
                    },
                    {
                      productoVentaId: findP('HAM-002').id,
                      precioExtra: G(8000),
                      esDefault: false,
                      orden: 2,
                    },
                    {
                      productoVentaId: findP('HAM-003').id,
                      precioExtra: G(5000),
                      esDefault: false,
                      orden: 3,
                    },
                  ],
                },
              },
              {
                nombre: 'Elegí tu acompañamiento',
                orden: 2,
                obligatorio: true,
                opciones: {
                  create: [
                    {
                      productoVentaId: findP('ACO-001').id,
                      precioExtra: G(0),
                      esDefault: true,
                      orden: 1,
                    },
                    {
                      productoVentaId: findP('ACO-002').id,
                      precioExtra: G(3000),
                      esDefault: false,
                      orden: 2,
                    },
                  ],
                },
              },
              {
                nombre: 'Elegí tu bebida',
                orden: 3,
                obligatorio: true,
                opciones: {
                  create: [
                    {
                      productoVentaId: findP('BEB-001').id,
                      precioExtra: G(0),
                      esDefault: true,
                      orden: 1,
                    },
                    {
                      productoVentaId: findP('BEB-002').id,
                      precioExtra: G(0),
                      esDefault: false,
                      orden: 2,
                    },
                    {
                      productoVentaId: findP('BEB-003').id,
                      precioExtra: G(5000),
                      esDefault: false,
                      orden: 3,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  });

  // ───── MODIFICADORES ─────
  console.log('🧂 Creando modificadores...');

  const grupoPunto = await prisma.modificadorGrupo.create({
    data: {
      empresaId,
      nombre: 'Punto de cocción',
      tipo: TipoModificadorGrupo.UNICA,
      obligatorio: true,
      minSeleccion: 1,
      maxSeleccion: 1,
      opciones: {
        create: [
          { nombre: 'Jugoso', orden: 1 },
          { nombre: 'Medio', orden: 2 },
          { nombre: 'Bien cocido', orden: 3 },
        ],
      },
    },
  });

  const grupoSin = await prisma.modificadorGrupo.create({
    data: {
      empresaId,
      nombre: 'Sin...',
      tipo: TipoModificadorGrupo.MULTIPLE,
      obligatorio: false,
      opciones: {
        create: [
          { nombre: 'Sin cebolla', orden: 1 },
          { nombre: 'Sin tomate', orden: 2 },
          { nombre: 'Sin lechuga', orden: 3 },
          { nombre: 'Sin pickle', orden: 4 },
          { nombre: 'Sin salsa', orden: 5 },
        ],
      },
    },
  });

  const grupoExtras = await prisma.modificadorGrupo.create({
    data: {
      empresaId,
      nombre: 'Extras',
      tipo: TipoModificadorGrupo.MULTIPLE,
      obligatorio: false,
      maxSeleccion: 5,
      opciones: {
        create: [
          { nombre: '+ Queso cheddar', precioExtra: G(5000), orden: 1 },
          { nombre: '+ Panceta', precioExtra: G(10000), orden: 2 },
          { nombre: '+ Huevo frito', precioExtra: G(5000), orden: 3 },
          { nombre: '+ Carne extra', precioExtra: G(15000), orden: 4 },
          { nombre: '+ Cebolla caramelizada', precioExtra: G(3000), orden: 5 },
        ],
      },
    },
  });

  // Vinculo los grupos a las hamburguesas y lomitos (no a empanadas/bebidas/etc.)
  const productosConModif = [
    ...hamburguesas.map((h) => h.codigo),
    ...lomitos.map((l) => l.codigo),
    'MIL-001',
    'MIL-002',
  ];

  for (const codigo of productosConModif) {
    const p = findP(codigo);
    const grupos = [
      { grupo: grupoPunto.id, orden: 1 },
      { grupo: grupoSin.id, orden: 2 },
      { grupo: grupoExtras.id, orden: 3 },
    ];
    // El punto de cocción no aplica a milanesa
    const grpsAplicables = codigo.startsWith('MIL') ? grupos.slice(1) : grupos;
    for (const g of grpsAplicables) {
      await prisma.productoVentaModificadorGrupo.create({
        data: {
          productoVentaId: p.id,
          modificadorGrupoId: g.grupo,
          ordenEnProducto: g.orden,
        },
      });
    }
  }

  return { combo, productosCreados };
}

// ═══════════════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🌱 Iniciando seed Smash...');

  await limpiar();
  const permisos = await crearPermisos();
  const { empresa, sucursalCentro, sucursalSanLorenzo, ptoCentro1, ptoCentro2, ptoSanLorenzo1 } =
    await crearEmpresaYSucursales();
  await crearCajasYMesas(
    sucursalCentro.id,
    sucursalSanLorenzo.id,
    ptoCentro1.id,
    ptoCentro2.id,
    ptoSanLorenzo1.id,
  );
  await crearUsuarios(empresa.id, sucursalCentro.id, sucursalSanLorenzo.id, permisos);
  await crearClientes(empresa.id);
  const categorias = await crearCategorias(empresa.id);
  const proveedores = await crearProveedores(empresa.id);
  const insumos = await crearInsumos(empresa.id, proveedores);
  await crearStock(insumos, sucursalCentro.id, sucursalSanLorenzo.id);
  await crearProductosVenta(empresa.id, insumos, categorias);

  // ───── Resumen ─────
  const counts = await Promise.all([
    prisma.empresa.count(),
    prisma.sucursal.count(),
    prisma.usuario.count(),
    prisma.cliente.count(),
    prisma.proveedor.count(),
    prisma.productoInventario.count(),
    prisma.productoVenta.count(),
    prisma.receta.count(),
    prisma.itemReceta.count(),
    prisma.combo.count(),
    prisma.comboGrupoOpcion.count(),
    prisma.modificadorGrupo.count(),
    prisma.modificadorOpcion.count(),
    prisma.stockSucursal.count(),
    prisma.mesa.count(),
    prisma.timbrado.count(),
    prisma.permiso.count(),
  ]);

  console.log('\n✅ Seed completado. Resumen:');
  console.log(`   Empresas:                ${counts[0]}`);
  console.log(`   Sucursales:              ${counts[1]}`);
  console.log(`   Usuarios:                ${counts[2]}`);
  console.log(`   Clientes:                ${counts[3]}`);
  console.log(`   Proveedores:             ${counts[4]}`);
  console.log(`   Insumos:                 ${counts[5]}`);
  console.log(`   Productos venta:         ${counts[6]}`);
  console.log(`   Recetas:                 ${counts[7]}`);
  console.log(`   Items de receta:         ${counts[8]}`);
  console.log(`   Combos:                  ${counts[9]}`);
  console.log(`   Opciones de combo:       ${counts[10]}`);
  console.log(`   Grupos modificadores:    ${counts[11]}`);
  console.log(`   Opciones modificadores:  ${counts[12]}`);
  console.log(`   Stock por sucursal:      ${counts[13]}`);
  console.log(`   Mesas:                   ${counts[14]}`);
  console.log(`   Timbrados:               ${counts[15]}`);
  console.log(`   Permisos:                ${counts[16]}`);
  console.log('\n🔐 Credenciales de prueba (password: Smash123!):');
  console.log('   superadmin@smash.local           — SUPER_ADMIN (sin empresa)');
  console.log('   admin@smash.com.py               — ADMIN_EMPRESA (Centro + San Lorenzo)');
  console.log('   gerente.centro@smash.com.py      — GERENTE_SUCURSAL (Centro)');
  console.log('   gerente.sanlorenzo@smash.com.py  — GERENTE_SUCURSAL (San Lorenzo)');
  console.log('   cajero1@smash.com.py             — CAJERO Centro');
  console.log('   cajero2@smash.com.py             — CAJERO San Lorenzo');
  console.log('   cocina1@smash.com.py             — COCINA Centro');
  console.log('   cocina2@smash.com.py             — COCINA San Lorenzo');
  console.log('   mesero1@smash.com.py             — MESERO Centro');
  console.log('   repartidor1@smash.com.py         — REPARTIDOR Centro');
}

main()
  .catch((e) => {
    console.error('❌ Seed falló:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
