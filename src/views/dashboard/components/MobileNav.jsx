import React, { useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import CIcon from '@coreui/icons-react'
import { cilGrid } from '@coreui/icons'
import { CModal, CModalHeader, CModalTitle, CModalBody } from '@coreui/react'
import obtenerNav from '../../../_nav'
import useNavPermissions from '../../../hooks/useNavPermissions'
import useFlagsSucursal from '../../../hooks/useFlagsSucursal'

// Destinos que viven fijos en la barra inferior, por clave de módulo. El resto
// (Catálogos, Administración, Facturación) se alcanza desde «Más». Dashboard no
// tiene módulo (siempre visible) → se ancla por la ruta que arma obtenerNav().
const MODULOS_BARRA = ['inventario', 'historial', 'compras', 'traslados', 'reportes']

// Los iconos del nav son elementos <CIcon customClassName="nav-icon" />; se
// clonan para reemplazar el tamaño del sidebar por el del contexto móvil
// (con customClassName el prop `size` se ignora).
const iconoMobile = (elemento, size) =>
  elemento ? React.cloneElement(elemento, { size, customClassName: undefined }) : null

/**
 * Navegación móvil (barra inferior + bottom sheet «Más»).
 *
 * Deriva TODA su estructura de `obtenerNav()` —única fuente de verdad, la misma
 * que el sidebar— y aplica su mismo filtrado: permisos por módulo
 * (`useNavPermissions`) y el flag de ingredientes de la sucursal
 * (`useFlagsSucursal`). Así el menú móvil no vuelve a quedarse fuera de
 * sincronía cuando se agrega o reubica un módulo (hallazgo de critique P1).
 */
const MobileNav = () => {
  const permisos = useNavPermissions()
  const { esComida } = useFlagsSucursal()
  const navigate = useNavigate()
  const [sheetAbierto, setSheetAbierto] = useState(false)

  const { pos, barra, secciones } = useMemo(() => {
    // Mismo criterio que AppSidebar: títulos (sin módulo) y Dashboard siempre
    // visibles; los módulos esperan a que `permisos` resuelva (sin flash de admin).
    const visible = (item) => {
      if (item.modulo === 'ingredientes' && !esComida) return false
      if (!item.modulo) return true
      if (permisos === null) return false
      return permisos[item.modulo] !== false
    }
    const esBarra = (item) => !item.modulo || MODULOS_BARRA.includes(item.modulo)

    let pos = null
    let titulo = null
    const barra = []
    const secciones = []

    for (const item of obtenerNav()) {
      if (!item.to) {
        titulo = item.name // CNavTitle → encabezado de la siguiente sección
        continue
      }
      if (!visible(item)) continue
      if (item.modulo === 'pos') {
        pos = item
        continue
      }
      if (esBarra(item)) {
        barra.push(item)
        continue
      }
      let seccion = secciones.find((s) => s.titulo === titulo)
      if (!seccion) {
        seccion = { titulo, items: [] }
        secciones.push(seccion)
      }
      seccion.items.push(item)
    }

    return { pos, barra, secciones }
  }, [permisos, esComida])

  const irSheet = (to) => {
    setSheetAbierto(false)
    navigate(to)
  }

  return (
    <>
      <nav className="mobile-nav d-md-none">
        {/* Círculo POS — primer lugar, derivado del ítem 'pos' del nav */}
        {pos && (
          <NavLink
            to={pos.to}
            className={({ isActive }) => `mobile-nav-fab${isActive ? ' active' : ''}`}
          >
            <span className="mobile-nav-fab-circle">{iconoMobile(pos.icon, 'xl')}</span>
            <small>{pos.name}</small>
          </NavLink>
        )}

        {barra.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `mobile-nav-item${isActive ? ' active' : ''}`}
          >
            {iconoMobile(item.icon, 'lg')}
            <small>{item.name}</small>
          </NavLink>
        ))}

        {/* «Más» — abre el bottom sheet con el resto de módulos del nav */}
        <button
          type="button"
          className={`mobile-nav-item${sheetAbierto ? ' active' : ''}`}
          onClick={() => setSheetAbierto(true)}
          aria-expanded={sheetAbierto}
          aria-label="Más módulos"
        >
          <CIcon icon={cilGrid} size="lg" />
          <small>Más</small>
        </button>
      </nav>

      {/* Bottom sheet con los módulos que no viven en la barra, por sección */}
      <CModal
        alignment="bottom"
        visible={sheetAbierto}
        onClose={() => setSheetAbierto(false)}
        className="modal-mas-modulos"
        scrollable
      >
        <CModalHeader onClose={() => setSheetAbierto(false)}>
          <CModalTitle className="fs-6 fw-bold">Todos los módulos</CModalTitle>
        </CModalHeader>
        <CModalBody className="p-0">
          {secciones.map((seccion) => (
            <div key={seccion.titulo || 'general'}>
              {seccion.titulo && (
                <div className="px-3 py-2 text-uppercase text-body-secondary small fw-semibold">
                  {seccion.titulo}
                </div>
              )}
              {seccion.items.map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className="d-flex align-items-center gap-3 w-100 border-0 bg-transparent px-3 py-2 text-start"
                  style={{ minHeight: 44 }}
                  onClick={() => irSheet(item.to)}
                >
                  {iconoMobile(item.icon, 'lg')}
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          ))}
        </CModalBody>
      </CModal>
    </>
  )
}

export default MobileNav
