import { hayRed } from './redService'

/**
 * Precarga todas las rutas lazy de la aplicación para que los chunks queden
 * en caché del navegador y funcionen sin red (offline-suite).
 * Se llama al arrancar la app cuando hay conexión.
 */
export async function precargarRutas() {
  if (!hayRed()) return

  const rutas = [
    () => import('../layout/DefaultLayout'),
    () => import('../views/dashboard/DashboardRoute'),
    () => import('../views/admin/usuarios/Usuarios'),
    () => import('../views/admin/empresas/Empresas'),
    () => import('../views/admin/sucursales/Sucursales'),
    () => import('../views/admin/permisos/Roles'),
    () => import('../views/dashboard/AdminDashboardRoute'),
    () => import('../views/pos/POSPage'),
    () => import('../views/admin/productos/Productos'),
    () => import('../views/admin/catalogos/Catalogos'),
    () => import('../views/historial/HistorialPage'),
    () => import('../views/inventario/InventarioPage'),
    () => import('../views/reportes/ReportesPage'),
  ]

  await Promise.allSettled(rutas.map((r) => r()))
}
