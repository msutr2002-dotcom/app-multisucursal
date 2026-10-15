import React from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CButton,
  CBadge,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilClipboard, cilTrash, cilWarning, cilPrint } from '@coreui/icons'
import { formatQ } from '../../../utils/format'

const COLORES_ESTADO = {
  pendiente: 'warning',
  aceptada: 'success',
  rechazada: 'danger',
  convertida: 'primary',
  borrador: 'info',
  conflicto: 'danger',
}

// Enums crudos → etiqueta legible (mismo patrón que Historial/Traslados)
const etiquetaEstado = (estado) => {
  const t = String(estado || '')
    .replace(/_/g, ' ')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

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

const ModalCotizaciones = ({
  visible,
  onClose,
  cotizaciones,
  cargando = false,
  onEliminar,
  onResolver,
  onImprimir,
}) => (
  <CModal visible={visible} onClose={onClose} alignment="center" className="modal-sheet" scrollable>
    <CModalHeader onClose={onClose}>
      <CModalTitle className="fs-6 fw-bold d-flex align-items-center gap-2">
        <CIcon icon={cilClipboard} />
        Cotizaciones
      </CModalTitle>
    </CModalHeader>
    <CModalBody>
      {cargando ? (
        <div className="text-center py-4">
          <CSpinner color="primary" />
        </div>
      ) : cotizaciones.length === 0 ? (
        <p className="text-body-secondary text-center py-4 mb-0">
          No hay cotizaciones en esta sucursal.
        </p>
      ) : (
        <div className="d-flex flex-column gap-2">
          {cotizaciones.map((c) => (
            <div
              key={c.id}
              className="border rounded p-2 d-flex justify-content-between align-items-center flex-wrap gap-2"
            >
              <div>
                <div className="d-flex align-items-center gap-2 small">
                  <span className="fw-semibold">
                    Folio {String(c.id).slice(0, 8).toUpperCase()}
                  </span>
                  <CBadge color={COLORES_ESTADO[c.estado] || 'secondary'}>
                    {etiquetaEstado(c.estado)}
                  </CBadge>
                </div>
                <div className="text-body-secondary small">
                  {fechaCorta(c.fecha)} · {c.items || 0} artículo{c.items !== 1 ? 's' : ''}
                </div>
                {Array.isArray(c.detalle) && c.detalle.length > 0 && (
                  <div className="text-body-secondary small" style={{ maxWidth: '16rem' }}>
                    {c.detalle.map((d, i) => (
                      <div key={i} className="text-truncate">
                        {d.cantidad}× {d.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                <strong className="monto">{formatQ(c.total)}</strong>
                {typeof onImprimir === 'function' && (
                  <CButton
                    size="sm"
                    color="secondary"
                    variant="outline"
                    title="Imprimir cotización"
                    onClick={() => onImprimir(c)}
                  >
                    <CIcon icon={cilPrint} />
                  </CButton>
                )}
                {c.local && c.estado === 'conflicto' && typeof onResolver === 'function' && (
                  <CButton
                    size="sm"
                    color="danger"
                    title="Resolver conflicto"
                    onClick={() => onResolver(c)}
                  >
                    <CIcon icon={cilWarning} />
                  </CButton>
                )}
                <CButton
                  size="sm"
                  color="danger"
                  variant="outline"
                  title={c.local ? 'Eliminar borrador' : 'Eliminar cotización'}
                  onClick={() => onEliminar(c)}
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

export default ModalCotizaciones
