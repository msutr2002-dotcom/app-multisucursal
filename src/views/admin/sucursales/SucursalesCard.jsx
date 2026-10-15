import React, { useState } from 'react'
import { CCard, CCardBody, CButton, CBadge, CFormSwitch } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilIndustry } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'

const SucursalesCard = ({
  sucursal,
  onRecargar,
  onEliminar,
  onEditar,
  puedeEditar,
  puedeEliminar,
}) => {
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const showToast = useToast()

  const handleToggleActivo = async () => {
    await supabase.rpc('toggle_sucursal_activo', { p_id: sucursal.id })
    onRecargar()
  }

  const confirmarEliminar = async () => {
    await onEliminar(sucursal)
    setModalConfirmar(false)
    showToast('success', 'Éxito', 'Sucursal eliminada correctamente')
  }

  return (
    <>
      <CCard className="mb-3">
        <CCardBody>
          <div className="d-flex align-items-center gap-3">
            <CIcon icon={cilIndustry} size="xl" />
            <div className="flex-grow-1">
              <h6 className="mb-0">{sucursal.name}</h6>
              <small className="text-body-secondary">🏢 {sucursal.id_empresa?.name || 'Sin empresa'}</small>
            </div>
            <CBadge color={sucursal.activo ? 'success' : 'danger'}>
              {sucursal.activo ? 'Activa' : 'Inactiva'}
            </CBadge>
          </div>
          <div className="d-flex align-items-center justify-content-between mt-3">
            <CFormSwitch label="Activa" checked={sucursal.activo} onChange={handleToggleActivo} />
            <div className="d-flex gap-2">
              {puedeEditar && (
                <CButton color="primary" size="sm" onClick={() => onEditar(sucursal)}>
                  <CIcon icon={cilPen} className="me-1" /> Editar
                </CButton>
              )}
              {puedeEliminar && (
                <CButton color="danger" size="sm" onClick={() => setModalConfirmar(true)}>
                  <CIcon icon={cilTrash} className="me-1" /> Eliminar
                </CButton>
              )}
            </div>
          </div>
        </CCardBody>
      </CCard>

      <ConfirmModal
        visible={modalConfirmar}
        title="Confirmar eliminación"
        message={`¿Estás seguro de eliminar la sucursal "${sucursal.name}"?`}
        onConfirm={confirmarEliminar}
        onCancel={() => setModalConfirmar(false)}
      />
    </>
  )
}

export default SucursalesCard
