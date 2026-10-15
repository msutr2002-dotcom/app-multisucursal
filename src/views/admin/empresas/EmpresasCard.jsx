import React, { useState } from 'react'
import { CCard, CCardBody, CButton, CBadge, CFormSwitch } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilBuilding } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'

const EmpresasCard = ({
  empresa,
  onRecargar,
  onEliminar,
  onEditar,
  puedeEditar,
  puedeEliminar,
}) => {
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const showToast = useToast()

  const handleToggleActivo = async () => {
    await supabase.rpc('toggle_empresa_activo', { p_id: empresa.id })
    onRecargar()
  }

  const handleEliminarClick = () => {
    setModalConfirmar(true)
  }

  const confirmarEliminar = async () => {
    await onEliminar(empresa)
    setModalConfirmar(false)
    showToast('success', 'Éxito', 'Empresa eliminada correctamente')
  }

  return (
    <>
      <CCard className="mb-3">
        <CCardBody>
          <div className="d-flex align-items-center gap-3">
            <CIcon icon={cilBuilding} size="xl" />
            <div className="flex-grow-1">
              <h6 className="mb-0">{empresa.name}</h6>
            </div>
            <CBadge color={empresa.activo ? 'success' : 'danger'}>
              {empresa.activo ? 'Activa' : 'Inactiva'}
            </CBadge>
          </div>
          <div className="d-flex align-items-center justify-content-between mt-3">
            <CFormSwitch label="Activa" checked={empresa.activo} onChange={handleToggleActivo} />
            <div className="d-flex gap-2">
              {puedeEditar && (
                <CButton color="primary" size="sm" onClick={() => onEditar(empresa)}>
                  <CIcon icon={cilPen} className="me-1" /> Editar
                </CButton>
              )}
              {puedeEliminar && (
                <CButton color="danger" size="sm" onClick={handleEliminarClick}>
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
        message={`¿Estás seguro de eliminar la empresa "${empresa.name}"?`}
        onConfirm={confirmarEliminar}
        onCancel={() => setModalConfirmar(false)}
      />
    </>
  )
}

export default EmpresasCard
