/**
 * AppSidebar Component
 *
 * Collapsible navigation sidebar with branding, menu items, and toggle controls.
 *
 * Features:
 * - Redux-controlled visibility state
 * - Unfoldable/narrow mode for more screen space
 * - Brand logo with full and narrow variants
 * - Close button for mobile devices
 * - Footer with toggle button
 * - Dark color scheme
 * - Fixed positioning
 *
 * @component
 * @example
 * return (
 *   <AppSidebar />
 * )
 */

import React, { useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useLocation } from 'react-router-dom'

import {
  CCloseButton,
  CSidebar,
  CSidebarBrand,
  CSidebarFooter,
  CSidebarHeader,
  CSidebarToggler,
} from '@coreui/react'

import { AppSidebarNav } from './AppSidebarNav'

// sidebar nav config (función: se recalcula en cada render para leer el rol vigente)
import obtenerNav from '../_nav'
import useNavPermissions from '../hooks/useNavPermissions'
import useFlagsSucursal from '../hooks/useFlagsSucursal'

/**
 * AppSidebar functional component
 *
 * Manages sidebar state with Redux:
 * - sidebarShow: Controls sidebar visibility
 * - sidebarUnfoldable: Controls narrow/wide mode
 *
 * Renders navigation from _nav.js configuration file.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns {React.ReactElement} Sidebar with navigation
 */
const AppSidebar = () => {
  const dispatch = useDispatch()
  const unfoldable = useSelector((state) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state) => state.sidebarShow)
  const permisos = useNavPermissions()
  const { esComida } = useFlagsSucursal()
  const ubicacion = useLocation()

  // En móvil/tablet el sidebar es off-canvas: al navegar se cierra para no
  // tapar el contenido. En escritorio (>=992px) no se toca.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 991.98px)').matches) {
      dispatch({ type: 'set', sidebarShow: false })
    }
  }, [ubicacion.pathname, dispatch])

  // Al cruzar el breakpoint: en escritorio se abre, en móvil se cierra
  // (el sidebar off-canvas no debe quedar tapando el contenido al encoger).
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(min-width: 992px)')
    const sync = (e) => dispatch({ type: 'set', sidebarShow: e.matches })
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [dispatch])

  // Filtra por permisos. Los títulos de sección (CNavTitle, sin `to`) solo se
  // conservan si al menos un ítem visible los sigue: si no, un usuario sin
  // permisos de administración vería el título "Administración" vacío.
  const navFiltrado = []
  {
    const visible = (item) => {
      // El módulo de ingredientes solo existe en sucursales con
      // "activar ingredientes" ON (flag de la sucursal, RF-C5).
      if (item.modulo === 'ingredientes' && !esComida) return false
      if (!item.modulo) return true // ítems sin módulo (p. ej. Dashboard) siempre visibles
      if (permisos === null) return false // resolviendo: no mostrar módulos hasta confirmar
      return permisos[item.modulo] !== false
    }
    let tituloPendiente = null
    for (const item of obtenerNav()) {
      if (!item.to) {
        tituloPendiente = item // CNavTitle → se decide al ver el primer ítem visible
        continue
      }
      if (!visible(item)) continue
      if (tituloPendiente) {
        navFiltrado.push(tituloPendiente)
        tituloPendiente = null
      }
      navFiltrado.push(item)
    }
  }

  return (
    <CSidebar
      className="border-end"
      colorScheme="dark"
      position="fixed"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <CSidebarHeader className="border-bottom">
        <CSidebarBrand to="/">
          <div className="sidebar-brand-full d-flex align-items-center gap-2">
            <span className="brand-mark" aria-hidden="true">
              Q
            </span>
            <span className="brand-name">Punto de Venta</span>
          </div>
          <div className="sidebar-brand-narrow d-flex justify-content-center">
            <span className="brand-mark" aria-hidden="true">
              Q
            </span>
          </div>
        </CSidebarBrand>
        <CCloseButton
          className="d-lg-none"
          dark
          onClick={() => dispatch({ type: 'set', sidebarShow: false })}
        />
      </CSidebarHeader>
      <AppSidebarNav items={navFiltrado} />
      <CSidebarFooter className="border-top d-none d-lg-flex">
        <CSidebarToggler
          onClick={() => dispatch({ type: 'set', sidebarUnfoldable: !unfoldable })}
        />
      </CSidebarFooter>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
