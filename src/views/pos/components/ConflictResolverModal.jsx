import React, { useEffect, useMemo, useState } from 'react'
import {
  CAlert,
  CBadge,
  CButton,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilArrowRight,
  cilBan,
  cilCheckCircle,
  cilFile,
  cilInfo,
  cilPen,
  cilWarning,
} from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import {
  AVISO_COMPROBANTE_SIN_RED,
  detectarConflictos,
} from '../../../services/cotizacionOfflineService'

const MARCA_AGUA = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) rotate(-20deg)',
  color: 'rgba(220, 53, 69, 0.35)',
  fontSize: '0.95rem',
  fontWeight: 800,
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  zIndex: 2,
}

const PreComprobanteSinRed = ({ cotizacion, items }) => {
  const folioLocal = cotizacion?.temp_id
    ? String(cotizacion.temp_id).slice(0, 8).toUpperCase()
    : '—'
  const total = items.reduce((suma, it) => suma + (it.cantidad || 0) * (it.offline?.precio || 0), 0)
  return (
    <div
      className="position-relative overflow-hidden border rounded p-3 mt-3 bg-body"
      style={{ maxWidth: '20rem', margin: '0.75rem auto 0' }}
    >
      <span aria-hidden="true" style={MARCA_AGUA}>
        NO VÁLIDO - PENDIENTE DE RED
      </span>
      <div className="text-center small">
        <div className="fw-bold">PRE-COMPROBANTE</div>
        <div className="text-body-secondary">Folio local: {folioLocal}</div>
        <div className="text-body-secondary">Sin folio oficial hasta recuperar la conexión</div>
      </div>
      <hr className="my-2" />
      <div className="small d-flex flex-column gap-1">
        {items.map((it, i) => (
          <div key={it.id_producto ?? i} className="d-flex justify-content-between gap-2">
            <span className="text-truncate">
              {it.cantidad}× {it.name}
            </span>
            <span>{formatQ((it.cantidad || 0) * (it.offline?.precio || 0))}</span>
          </div>
        ))}
        {items.length === 0 && <div className="text-body-secondary text-center">Sin productos</div>}
      </div>
      <hr className="my-2" />
      <div className="d-flex justify-content-between fw-semibold">
        <span>Total</span>
        <span className="monto">{formatQ(total)}</span>
      </div>
    </div>
  )
}

/**
 * Modal de resolución de conflictos de cotización Offline-First (Task 4 / RF-02).
 * Muestra lado a lado el valor guardado offline vs. el actual del servidor
 * (precio y stock) con las acciones: "Aceptar cambios del servidor",
 * "Editar cotización" y "Descartar".
 *
 * Incluye RF-03 (limitación documentada): sin red el botón "Emitir comprobante
 * oficial" queda deshabilitado, se muestra el aviso con el texto exacto de la
 * regla de negocio y se ofrece un pre-comprobante con marca de agua
 * "NO VÁLIDO - PENDIENTE DE RED". Toca solo UI: la emisión real es la Task 5.
 *
 * @param {Array} items - productos con `{ id_producto, name, sku, cantidad, offline, servidor }`
 * @param {Object} cotizacion - `{ temp_id, receipt_status? }`
 * @param {string} [errorServidor] - rechazo de negocio (Task 5) a mostrar como alerta
 * @param {(conflictos: Array) => void} [onAceptarServidor] - adopta valores del servidor
 * @param {() => void} [onEditar] - ajuste manual de la cotización
 * @param {() => void} [onDescartar] - cancela la cotización
 * @param {() => void} [onEmitirComprobante] - emisión online (Task 5)
 */
const ConflictResolverModal = ({
  visible,
  onClose,
  items = [],
  cotizacion = null,
  errorServidor = null,
  onAceptarServidor,
  onEditar,
  onDescartar,
  onEmitirComprobante,
  cargando = false,
}) => {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [verPreComprobante, setVerPreComprobante] = useState(false)

  useEffect(() => {
    const alVolver = () => setEnLinea(true)
    const alCortar = () => setEnLinea(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCortar)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCortar)
    }
  }, [])

  const anotados = useMemo(() => detectarConflictos(items), [items])
  const conflictos = useMemo(
    () => anotados.filter((it) => it.conflictos.precio || it.conflictos.stock),
    [anotados],
  )
  const conPrecio = conflictos.filter((it) => it.conflictos.precio).length
  const conStock = conflictos.filter((it) => it.conflictos.stock).length
  const emitido = cotizacion?.receipt_status === 'issued'
  const folioLocal = cotizacion?.temp_id
    ? String(cotizacion.temp_id).slice(0, 8).toUpperCase()
    : '—'

  return (
    <CModal
      visible={visible}
      onClose={onClose}
      alignment="center"
      className="modal-sheet"
      scrollable
      size="lg"
    >
      <CModalHeader onClose={onClose}>
        <CModalTitle className="fs-6 fw-bold d-flex align-items-center gap-2">
          <CIcon icon={cilWarning} />
          Resolver conflictos de cotización
        </CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <span className="text-body-secondary small">
            Cotización <strong>{folioLocal}</strong> · {items.length} producto
            {items.length !== 1 ? 's' : ''}
          </span>
          <div className="d-flex gap-1 flex-wrap">
            {conPrecio > 0 && <CBadge color="warning">{conPrecio} con precio modificado</CBadge>}
            {conStock > 0 && <CBadge color="danger">{conStock} sin stock suficiente</CBadge>}
            {!emitido && <CBadge color="secondary">Comprobante pendiente de emisión</CBadge>}
          </div>
        </div>

        {/* Rechazo de negocio (Task 5): no hay precios/stock que comparar */}
        {errorServidor && (
          <CAlert color="danger" className="d-flex align-items-start gap-2 mb-3">
            <CIcon icon={cilWarning} className="mt-1" />
            <span>El servidor rechazó esta cotización: {errorServidor}</span>
          </CAlert>
        )}

        {conflictos.length === 0 ? (
          <p className="text-body-secondary text-center py-4 mb-0">
            {items.length === 0
              ? 'No hay productos en la cotización.'
              : 'No se detectaron discrepancias entre la cotización y el servidor.'}
          </p>
        ) : (
          <>
            <div className="d-flex flex-column gap-3">
              {conflictos.map((it, i) => {
                const subio = (it.servidor?.precio || 0) > (it.offline?.precio || 0)
                return (
                  <div key={it.id_producto ?? i} className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                      <div>
                        <span className="fw-semibold">
                          {it.cantidad}× {it.name}
                        </span>
                        {it.sku && (
                          <span className="text-body-secondary small ms-2">SKU {it.sku}</span>
                        )}
                      </div>
                      <div className="d-flex gap-1 flex-wrap">
                        {it.conflictos.precio && <CBadge color="warning">Precio cambió</CBadge>}
                        {it.conflictos.stock && <CBadge color="danger">Stock insuficiente</CBadge>}
                      </div>
                    </div>

                    <div className="row g-2 text-center">
                      <div className="col-5 border rounded p-2">
                        <div className="text-uppercase text-body-secondary small">
                          Guardado offline
                        </div>
                        <div className="fw-bold fs-6">{formatQ(it.offline?.precio)}</div>
                        <div className="small text-body-secondary">
                          Stock registrado: {it.offline?.stock ?? '—'}
                        </div>
                      </div>
                      <div className="col-2 d-flex align-items-center justify-content-center text-body-secondary">
                        <CIcon icon={cilArrowRight} />
                      </div>
                      <div className="col-5 border rounded p-2">
                        <div className="text-uppercase text-body-secondary small">Servidor</div>
                        <div
                          className={`fw-bold fs-6 ${it.conflictos.precio ? 'text-warning-emphasis' : ''}`}
                        >
                          {formatQ(it.servidor?.precio)}
                        </div>
                        <div
                          className={`small ${
                            it.conflictos.stock ? 'text-danger fw-semibold' : 'text-body-secondary'
                          }`}
                        >
                          Stock actual: {it.servidor?.stock ?? '—'}
                        </div>
                      </div>
                    </div>

                    <div className="d-flex justify-content-between align-items-center mt-2 small flex-wrap gap-1">
                      <span className="text-body-secondary">
                        Cantidad solicitada: <strong>{it.cantidad}</strong>
                      </span>
                      {it.conflictos.precio && (
                        <span className={subio ? 'text-warning-emphasis' : 'text-success'}>
                          Diferencia: {formatQ(it.conflictos.diferenciaPrecio)}{' '}
                          {subio ? '(sube)' : '(baja)'}
                        </span>
                      )}
                      {it.conflictos.stock && (
                        <span className="text-danger fw-semibold">
                          Solo {it.servidor?.stock ?? 0} disponibles en servidor
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="border rounded p-3 mt-3">
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2 fw-semibold">
                  <CIcon icon={cilFile} />
                  Comprobante oficial
                </div>
                <CBadge color={emitido ? 'success' : 'warning'}>
                  {emitido ? 'Emitido' : 'Pendiente de emisión'}
                </CBadge>
              </div>

              {!enLinea && (
                <CAlert color="warning" className="d-flex align-items-start gap-2 mt-2 mb-0">
                  <CIcon icon={cilInfo} className="mt-1" />
                  <span>{AVISO_COMPROBANTE_SIN_RED}</span>
                </CAlert>
              )}

              <div className="d-flex gap-2 mt-3 flex-wrap">
                <CButton
                  color="primary"
                  size="sm"
                  onClick={() => onEmitirComprobante?.()}
                  disabled={!enLinea || emitido}
                  title={
                    !enLinea
                      ? 'No se permite generar folios fiscales sin conexión'
                      : emitido
                        ? 'El comprobante ya fue emitido'
                        : undefined
                  }
                >
                  <CIcon icon={cilFile} className="me-1" />
                  {emitido ? 'Comprobante emitido' : 'Emitir comprobante oficial'}
                </CButton>
                {!enLinea && (
                  <CButton
                    color="secondary"
                    size="sm"
                    variant="outline"
                    onClick={() => setVerPreComprobante((v) => !v)}
                    aria-expanded={verPreComprobante}
                  >
                    <CIcon icon={cilInfo} className="me-1" />
                    {verPreComprobante ? 'Ocultar pre-comprobante' : 'Ver pre-comprobante'}
                  </CButton>
                )}
              </div>

              {verPreComprobante && !enLinea && (
                <PreComprobanteSinRed cotizacion={cotizacion} items={items} />
              )}
            </div>
          </>
        )}
      </CModalBody>
      <CModalFooter className="d-flex justify-content-between">
        <CButton
          color="danger"
          variant="outline"
          onClick={onDescartar}
          disabled={cargando || items.length === 0}
        >
          <CIcon icon={cilBan} className="me-1" />
          Descartar
        </CButton>
        <div className="d-flex gap-2">
          <CButton color="secondary" variant="outline" onClick={onEditar} disabled={cargando}>
            <CIcon icon={cilPen} className="me-1" />
            Editar cotización
          </CButton>
          <CButton
            color="primary"
            onClick={() => onAceptarServidor?.(conflictos)}
            disabled={cargando || conflictos.length === 0}
          >
            <CIcon icon={cilCheckCircle} className="me-1" />
            Aceptar cambios del servidor
          </CButton>
        </div>
      </CModalFooter>
    </CModal>
  )
}

export default ConflictResolverModal
