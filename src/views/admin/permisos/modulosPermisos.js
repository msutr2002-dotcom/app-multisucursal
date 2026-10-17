// Catálogo de módulos de permisos compartido por la matriz (`ModalPermisos`) y
// las tarjetas de rol (`RolesCard`). Las secciones y su orden espejan el nav
// (`src/_nav.jsx`): Punto de Venta (arriba), Operación, Catálogos, Administración.
//
// Al agregar un módulo, mantener en sincronía con `useNavPermissions.MODULOS`,
// `_nav.jsx` y `routes.js` (regla de los lugares de AGENTS.md).

export const GRUPOS = [
  {
    titulo: 'Punto de Venta',
    // pos-ux-permisos RF-P2: botones del POS, solo casilla Ver (default true)
    modulos: ['pos', 'pos_cotizar', 'pos_ver_cotizaciones'],
  },
  {
    titulo: 'Operación',
    modulos: ['inventario', 'historial', 'compras', 'traslados', 'reportes', 'facturacion'],
  },
  {
    titulo: 'Catálogos',
    modulos: [
      'productos',
      'ingredientes',
      'clientes',
      'catalogos',
      // Catálogos individuales (permiso por catálogo: ver/crear/editar/eliminar)
      'colores',
      'marcas',
      'categorias',
      'proveedores',
      'unidades',
      'tipos_precio',
    ],
  },
  {
    titulo: 'Administración',
    modulos: ['usuarios', 'empresas', 'sucursales', 'bodegas', 'roles'],
  },
]

export const MODULOS = GRUPOS.flatMap((g) => g.modulos)

// Estos módulos solo tienen casilla Ver (default true al cargar: sin fila el
// botón es visible; el admin lo oculta desmarcando).
export const SOLO_VER = new Set(['pos_cotizar', 'pos_ver_cotizaciones'])

// Acciones aplicables a una fila: los botones del POS solo permiten Ver.
export const accionesDe = (modulo) =>
  SOLO_VER.has(modulo) ? ['ver'] : ['ver', 'crear', 'editar', 'eliminar']

// Orden/label/letra de las acciones (matriz y tarjetas de rol).
export const ACCIONES = [
  { key: 'ver', letra: 'V', label: 'Ver' },
  { key: 'crear', letra: 'C', label: 'Crear' },
  { key: 'editar', letra: 'E', label: 'Editar' },
  { key: 'eliminar', letra: 'D', label: 'Eliminar' },
]

// Nombre humano de cada módulo (nunca mostrar la clave cruda en la UI).
export const LABELS = {
  pos: 'Punto de venta',
  pos_cotizar: 'Cotizaciones',
  pos_ver_cotizaciones: 'Ver cotizaciones',
  inventario: 'Inventario',
  historial: 'Historial',
  compras: 'Compras',
  traslados: 'Traslados',
  reportes: 'Reportes',
  facturacion: 'Facturación',
  productos: 'Productos',
  ingredientes: 'Ingredientes',
  clientes: 'Clientes',
  catalogos: 'Catálogos',
  colores: 'Colores',
  marcas: 'Marcas',
  categorias: 'Categorías',
  proveedores: 'Proveedores',
  unidades: 'Unidades',
  tipos_precio: 'Tipos de precio',
  usuarios: 'Usuarios',
  empresas: 'Empresas',
  sucursales: 'Sucursales',
  bodegas: 'Bodegas',
  roles: 'Roles y permisos',
}

// Fallback: si aparece un módulo nuevo sin label, se humaniza la clave.
export const labelDe = (modulo) => LABELS[modulo] ?? modulo.replace(/_/g, ' ')
