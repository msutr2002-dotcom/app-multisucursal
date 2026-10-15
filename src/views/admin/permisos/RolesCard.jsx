import React, { useState } from 'react'
import { CCard, CCardBody, CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilShieldAlt, cilLockLocked } from '@coreui/icons'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'

const MODULOS = [
  'usuarios',
  'empresas',
  'sucursales',
  'bodegas',
  'roles',
  'pos',
  'productos',
  'ingredientes',
  'clientes',
  'catalogos',
  'historial',
  'compras',
  'traslados',
  'inventario',
  'reportes',
  'facturacion',
  // pos-ux-permisos RF-P2: botones del POS (solo casilla Ver)
  'pos_cotizar',
  'pos_ver_cotizaciones',
]

const RolesCard = ({
  rol,
  onRecargar,
  onEliminar,
  onEditar,
  onPermisos,
  puedeEditar,
  puedeEliminar,
}) => {
  const [modalConfirmar, setModalConfirmar] = useState(false)

  const confirmarEliminar = async () => {
    // El resultado (toast éxito/error) lo comunica el contenedor (Roles.jsx).
    await onEliminar(rol)
    setModalConfirmar(false)
  }

  return (
    <>
      <CCard className="mb-3">
        <CCardBody>
          <div className="d-flex align-items-center gap-3">
            <CIcon icon={cilShieldAlt} size="xl" />
            <div className="flex-grow-1">
              <h6 className="mb-0">{rol.name}</h6>
              <small className="text-body-secondary">{rol.descripcion}</small>
            </div>
          </div>
          <div className="d-flex gap-1 flex-wrap mt-2">
            {MODULOS.map((mod) => {
              const permiso = rol.permisos?.find((p) => p.modulo === mod)
              if (!permiso) return null
              return (
                <CBadge key={mod} color="info">
                  {mod}:{' '}
                  {[
                    permiso.puede_ver && 'ver',
                    permiso.puede_crear && 'crear',
                    permiso.puede_editar && 'editar',
                    permiso.puede_eliminar && 'eliminar',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </CBadge>
              )
            })}
          </div>
          <div className="d-flex justify-content-end gap-2 mt-3">
            {puedeEditar && (
              <CButton color="primary" size="sm" onClick={() => onEditar(rol)}>
                <CIcon icon={cilPen} className="me-1" /> Editar
              </CButton>
            )}
            {puedeEditar && (
              <CButton color="warning" size="sm" onClick={() => onPermisos(rol)}>
                <CIcon icon={cilLockLocked} className="me-1" /> Permisos
              </CButton>
            )}
            {puedeEliminar && (
              <CButton color="danger" size="sm" onClick={() => setModalConfirmar(true)}>
                <CIcon icon={cilTrash} className="me-1" /> Eliminar
              </CButton>
            )}
          </div>
        </CCardBody>
      </CCard>

      <ConfirmModal
        visible={modalConfirmar}
        title="Confirmar eliminación"
        message={`¿Estás seguro de eliminar el rol "${rol.name}"?`}
        onConfirm={confirmarEliminar}
        onCancel={() => setModalConfirmar(false)}
      />
    </>
  )
}

export default RolesCard
