import React, { useState } from 'react'
import { CCard, CCardBody, CButton, CBadge, CFormSwitch } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import Avatar from '../../../components/common/Avatar'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'

const UsuariosCard = ({
  usuario,
  onRecargar,
  onEliminar,
  onEditar,
  puedeEditar,
  puedeEliminar,
}) => {
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const showToast = useToast()

  const heandleToogleActivo = async () => {
    await supabase.rpc('toggle_user_activo', { p_id: usuario.id })
    onRecargar()
  }

  const handleEliminarClick = () => {
    setModalConfirmar(true)
  }
  const confirmarEliminar = async () => {
    const ok = await onEliminar(usuario)
    setModalConfirmar(false)
    if (ok !== false) showToast('success', 'Exito', 'Usuario Eliminado correctamente')
  }
  return (
    <>
      <CCard className="mb-3">
        <CCardBody>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            {/** Avatar */}
            <Avatar name={usuario.name} size="md" />
            {/**Informacion */}
            <div className="flex-grow-1">
              <h6 className="mb-0">{usuario.name} </h6>
              <small className="text-body-secondary">{usuario.email} </small>
            </div>
            {/**Badges*/}
            <div className="d-flex gap-1 flex-wrap mt-1">
              <CBadge color={usuario.id_rol?.name === 'Admin' ? 'primary' : 'secondary'}>
                {usuario.id_rol?.name || 'Sin rol'}
              </CBadge>
              <CBadge color="info">{usuario.id_sucursal?.id_empresa?.name || ''}</CBadge>
              <CBadge color="warning">{usuario.id_sucursal?.name || ''}</CBadge>
            </div>
          </div>
          {/**Acciones */}
          <div className="d-flex align-items-center justify-content-between mt-3">
            <CFormSwitch label="Activo" checked={usuario.activo} onChange={heandleToogleActivo} />
            <div className="d-flex gap-1">
              {puedeEditar && (
                <CButton color="primary" size="sm" onClick={() => onEditar(usuario)}>
                  <CIcon icon={cilPen} className="me-1" />
                  Editar
                </CButton>
              )}
              {puedeEliminar && (
                <CButton color="danger" size="sm" onClick={handleEliminarClick}>
                  <CIcon icon={cilTrash} className="me-1" />
                  Eliminar
                </CButton>
              )}
            </div>
          </div>
        </CCardBody>
      </CCard>
      {/* Modal de confirmación */}
      <ConfirmModal
        visible={modalConfirmar}
        title="Confimrar Eliminación"
        message={`Estas Seguro de eliminar al usuario ${usuario.name}`}
        onConfirm={confirmarEliminar}
        onCancel={() => setModalConfirmar(false)}
      />
    </>
  )
}
export default UsuariosCard
