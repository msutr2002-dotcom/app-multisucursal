import { useState } from 'react'
import { CCard, CBadge, CButton, CCollapse } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilLayers, cilPen, cilBan, cilChevronRight } from '@coreui/icons'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'

const BodegasCard = ({ bodega, onEditar, onDesactivar, puedeEditar, puedeEliminar }) => {
  const [abierto, setAbierto] = useState(false)
  const [modalConfirmar, setModalConfirmar] = useState(false)
  const showToast = useToast()

  const confirmarDesactivar = async () => {
    const resultado = await onDesactivar(bodega)
    setModalConfirmar(false)
    if (resultado?.ok) showToast('success', 'Éxito', 'Bodega desactivada correctamente')
  }

  return (
    <CCard className="mb-3">
      <div
        className="d-flex align-items-center justify-content-between p-3"
        style={{ cursor: 'pointer' }}
        onClick={() => setAbierto(!abierto)}
      >
        <div className="d-flex align-items-center gap-3">
          <CIcon icon={cilLayers} className="text-primary fs-4" />
          <div>
            <div className="fw-semibold">
              {bodega.name}
              {bodega.es_principal && (
                <CBadge color="primary" className="ms-2">
                  Principal
                </CBadge>
              )}
            </div>
            <small className="text-body-secondary">{bodega.activa ? 'Activa' : 'Inactiva'}</small>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          {puedeEditar && (
            <CButton
              color="primary"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onEditar(bodega)
              }}
            >
              <CIcon icon={cilPen} />
            </CButton>
          )}
          {puedeEliminar && bodega.activa && (
            <CButton
              color="danger"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setModalConfirmar(true)
              }}
            >
              <CIcon icon={cilBan} />
            </CButton>
          )}
          <CIcon
            icon={cilChevronRight}
            className={`text-body-secondary transition-transform ${abierto ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      <CCollapse visible={abierto}>
        <div className="px-3 pb-3">
          <small className="text-body-secondary">
            ID: {bodega.id} · Sucursal: {bodega.id_sucursal}
          </small>
        </div>
      </CCollapse>
      <ConfirmModal
        visible={modalConfirmar}
        title="Desactivar bodega"
        message={`¿Estás seguro de desactivar la bodega "${bodega.name}"? Los productos con stock en ella quedarán sin asignar.`}
        onConfirm={confirmarDesactivar}
        onCancel={() => setModalConfirmar(false)}
      />
    </CCard>
  )
}

export default BodegasCard
