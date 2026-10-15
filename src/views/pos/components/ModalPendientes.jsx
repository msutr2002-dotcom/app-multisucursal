import React from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CButton, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilArrowCircleRight, cilTrash, cilBookmark } from '@coreui/icons'
import { formatQ } from '../../../utils/format'

const fechaCorta = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-GT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const ModalPendientes = ({
  visible,
  onClose,
  pendientes,
  cargando = false,
  onCargar,
  onEliminar,
}) => (
  <CModal visible={visible} onClose={onClose} alignment="center" className="modal-sheet" scrollable>
    <CModalHeader onClose={onClose}>
      <CModalTitle className="fs-6 fw-bold d-flex align-items-center gap-2">
        <CIcon icon={cilBookmark} />
        Ventas pendientes
      </CModalTitle>
    </CModalHeader>
    <CModalBody>
      {cargando ? (
        <div className="text-center py-4">
          <CSpinner color="primary" />
        </div>
      ) : pendientes.length === 0 ? (
        <p className="text-body-secondary text-center py-4 mb-0">
          No hay ventas pendientes en esta sucursal.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {pendientes.map((p) => (
            <div
              key={p.id}
              className="border rounded p-2 d-flex justify-content-between align-items-center flex-wrap gap-2"
            >
              <div>
                <div className="fw-semibold small">{fechaCorta(p.fecha)}</div>
                <div className="text-body-secondary small">
                  {p.items?.length || 0} artículo{(p.items?.length || 0) !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="d-flex align-items-center gap-2">
                <strong className="monto">{formatQ(p.total)}</strong>
                <CButton
                  size="sm"
                  color="primary"
                  variant="outline"
                  title="Cargar al carrito"
                  aria-label="Cargar pendiente al carrito"
                  onClick={() => onCargar(p)}
                >
                  <CIcon icon={cilArrowCircleRight} />
                </CButton>
                <CButton
                  size="sm"
                  color="danger"
                  variant="outline"
                  title="Eliminar pendiente"
                  aria-label="Eliminar pendiente"
                  onClick={() => onEliminar(p)}
                >
                  <CIcon icon={cilTrash} />
                </CButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </CModalBody>
  </CModal>
)

export default ModalPendientes
