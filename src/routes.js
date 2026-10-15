import React from 'react'

// Dashboard
const DashboardRoute = React.lazy(() => import('./views/dashboard/DashboardRoute'))
const Usuarios = React.lazy(() => import('./views/admin/usuarios/Usuarios'))
const Empresas = React.lazy(() => import('./views/admin/empresas/Empresas'))
const Sucursales = React.lazy(() => import('./views/admin/sucursales/Sucursales'))
const Bodegas = React.lazy(() => import('./views/admin/bodegas/Bodegas'))
const Roles = React.lazy(() => import('./views/admin/permisos/Roles'))
const AdminDashboardRoute = React.lazy(() => import('./views/dashboard/AdminDashboardRoute'))
const POSPage = React.lazy(() => import('./views/pos/POSPage'))
const Productos = React.lazy(() => import('./views/admin/productos/Productos'))
const Catalogos = React.lazy(() => import('./views/admin/catalogos/Catalogos'))
const Historial = React.lazy(() => import('./views/historial/HistorialPage'))
const Inventario = React.lazy(() => import('./views/inventario/InventarioPage'))
const Compras = React.lazy(() => import('./views/compras/ComprasPage'))
const Traslados = React.lazy(() => import('./views/traslados/TrasladosPage'))
const Reportes = React.lazy(() => import('./views/reportes/ReportesPage'))
const Ingredientes = React.lazy(() => import('./views/admin/ingredientes/IngredientesPage'))
const Clientes = React.lazy(() => import('./views/admin/clientes/ClientesPage'))
const Facturas = React.lazy(() => import('./views/facturacion/FacturasPage'))

export const routes = [
  { path: '/', exact: true, name: 'Inicio' },
  { path: '/dashboard', name: 'Dashboard', element: DashboardRoute },
  { path: '/usuarios', name: 'Usuarios', element: Usuarios, modulo: 'usuarios' },
  { path: '/Empresas', name: 'Empresas', element: Empresas, modulo: 'empresas' },
  { path: '/sucursales', name: 'Sucursales', element: Sucursales, modulo: 'sucursales' },
  { path: '/bodegas', name: 'Bodegas', element: Bodegas, modulo: 'bodegas' },
  { path: '/roles', name: 'Roles', element: Roles, modulo: 'roles' },
  { path: '/admin-dashboard', name: 'Dashboard', element: AdminDashboardRoute },
  { path: '/productos', name: 'Productos', element: Productos, modulo: 'productos' },
  { path: '/ingredientes', name: 'Ingredientes', element: Ingredientes, modulo: 'ingredientes' },
  { path: '/clientes', name: 'Clientes', element: Clientes, modulo: 'clientes' },
  { path: '/pos', name: 'Punto de Venta', element: POSPage },
  { path: '/catalogos', name: 'Catálogos', element: Catalogos, modulo: 'catalogos' },
  { path: '/historial', name: 'Historial', element: Historial, modulo: 'historial' },
  { path: '/inventario', name: 'Inventario', element: Inventario, modulo: 'inventario' },
  { path: '/compras', name: 'Compras', element: Compras, modulo: 'compras' },
  { path: '/traslados', name: 'Traslados', element: Traslados, modulo: 'traslados' },
  { path: '/reportes', name: 'Reportes', element: Reportes, modulo: 'reportes' },
  { path: '/facturas', name: 'Facturación', element: Facturas, modulo: 'facturacion' },
]

export default routes
