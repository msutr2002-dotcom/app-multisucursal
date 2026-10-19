/**
 * Sidebar Navigation Configuration
 *
 * Defines the structure and content of the sidebar navigation menu.
 * Supports multiple navigation component types from CoreUI React:
 * - CNavItem: Single navigation link
 * - CNavGroup: Collapsible group of links
 * - CNavTitle: Section title/divider
 *
 * El array se construye en cada llamada a `obtenerNav()` (leído por
 * `AppSidebar` en cada render) para que el destino del ítem "Dashboard"
 * refleje SIEMPRE el rol de la sesión vigente — un array a nivel de
 * módulo queda stale tras un cambio de sesión sin recargar (bug:
 * usuario no-admin aterrizaba en /admin-dashboard).
 *
 * @module _nav
 */

import React from 'react'
import CIcon from '@coreui/icons-react'
import {
  cilBuilding,
  cilIndustry,
  cilShieldAlt,
  cilSpeedometer,
  cilUser,
  cilPeople,
  cilBasket,
  cilInbox,
  cilCalendar,
  cilCart,
  cilDollar,
  cilTag,
  cilGraph,
  cilTransfer,
  cilLeaf,
  cilFile,
  cilLayers,
} from '@coreui/icons'
import { CNavGroup, CNavItem, CNavTitle } from '@coreui/react'

/**
 * Navigation menu structure array
 *
 * @type {Array<Object>}
 * @property {React.ComponentType} component - CoreUI nav component (CNavItem, CNavGroup, CNavTitle)
 * @property {string} name - Display text for the nav item
 * @property {string} [to] - Internal route path (for CNavItem with routing)
 * @property {string} [href] - External route path (for CNavItem with external links)
 * @property {React.ReactNode} [icon] - Icon element to display
 * @property {Object} [badge] - Optional badge configuration
 * @property {string} badge.color - badge color (info, danger, success, etc.)
 * @property {string} badge.text - badge text content
 * @property {Array<Object>} [items] - Child items for CNavGroup
 * @property {string} [modulo] - Clave de permisos (si no tiene, el ítem siempre es visible)
 *
 * @example
 * // Simple navigation item
 * {
 *   component: CNavItem,
 *   name: 'Dashboard',
 *   to: '/dashboard',
 *   icon: <CIcon icon={cilSpeedometer} customClassName="nav-icon" />,
 * }
 *
 * @example
 * // Navigation group with children
 * {
 *   component: CNavGroup,
 *   name: 'Components',
 *   icon: <CIcon icon={cilPuzzle} customClassName="nav-icon" />,
 *   items: [
 *     {
 *       component: CNavItem,
 *       name: 'Cards',
 *       to: '/components/cards',
 *     },
 *   ],
 * }
 *
 * @example
 * // Section title
 * {
 *   component: CNavTitle,
 *   name: 'UI Elements',
 * }
 */
const obtenerNav = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const isAdmin = currentUser?.id_rol?.name === 'Admin'

  return [
    {
      component: CNavItem,
      name: 'Dashboard',
      to: isAdmin ? '/admin-dashboard' : '/dashboard',
      icon: <CIcon icon={cilSpeedometer} customClassName="nav-icon" />,
    },
    {
      component: CNavItem,
      name: 'Punto de Venta',
      shortName: 'Vender',
      to: '/pos',
      icon: <CIcon icon={cilBasket} customClassName="nav-icon" />,
      modulo: 'pos',
    },
    { component: CNavTitle, name: 'Operación' },
    {
      component: CNavItem,
      name: 'Inventario',
      to: '/inventario',
      icon: <CIcon icon={cilInbox} customClassName="nav-icon" />,
      modulo: 'inventario',
    },
    {
      component: CNavItem,
      name: 'Historial',
      to: '/historial',
      icon: <CIcon icon={cilCalendar} customClassName="nav-icon" />,
      modulo: 'historial',
    },
    {
      component: CNavItem,
      name: 'Compras',
      to: '/compras',
      icon: <CIcon icon={cilCart} customClassName="nav-icon" />,
      modulo: 'compras',
    },
    {
      component: CNavItem,
      name: 'Traslados',
      to: '/traslados',
      icon: <CIcon icon={cilTransfer} customClassName="nav-icon" />,
      modulo: 'traslados',
    },
    {
      component: CNavItem,
      name: 'Reportes',
      to: '/reportes',
      icon: <CIcon icon={cilGraph} customClassName="nav-icon" />,
      modulo: 'reportes',
    },
    {
      component: CNavItem,
      name: 'Facturación',
      to: '/facturas',
      icon: <CIcon icon={cilFile} customClassName="nav-icon" />,
      modulo: 'facturacion',
    },
    { component: CNavTitle, name: 'Catálogos' },
    {
      component: CNavItem,
      name: 'Productos',
      to: '/productos',
      icon: <CIcon icon={cilInbox} customClassName="nav-icon" />,
      modulo: 'productos',
    },
    {
      component: CNavItem,
      name: 'Ingredientes',
      to: '/ingredientes',
      icon: <CIcon icon={cilLeaf} customClassName="nav-icon" />,
      modulo: 'ingredientes',
    },
    {
      component: CNavItem,
      name: 'Clientes',
      to: '/clientes',
      icon: <CIcon icon={cilPeople} customClassName="nav-icon" />,
      modulo: 'clientes',
    },
    {
      component: CNavItem,
      name: 'Catálogos',
      to: '/catalogos',
      icon: <CIcon icon={cilTag} customClassName="nav-icon" />,
      modulo: 'catalogos',
    },
    { component: CNavTitle, name: 'Administración' },
    {
      component: CNavItem,
      name: 'Usuarios',
      to: '/usuarios',
      icon: <CIcon icon={cilUser} customClassName="nav-icon" />,
      modulo: 'usuarios',
    },
    {
      component: CNavItem,
      name: 'Empresas',
      to: '/Empresas',
      icon: <CIcon icon={cilBuilding} customClassName="nav-icon" />,
      modulo: 'empresas',
    },
    {
      component: CNavItem,
      name: 'Sucursales',
      to: '/sucursales',
      icon: <CIcon icon={cilIndustry} customClassName="nav-icon" />,
      modulo: 'sucursales',
    },
    {
      component: CNavItem,
      name: 'Bodegas',
      to: '/bodegas',
      icon: <CIcon icon={cilLayers} customClassName="nav-icon" />,
      modulo: 'bodegas',
    },
    {
      component: CNavItem,
      name: 'Roles y permisos',
      to: '/roles',
      icon: <CIcon icon={cilShieldAlt} customClassName="nav-icon" />,
      modulo: 'roles',
    },
  ]
}

export default obtenerNav
