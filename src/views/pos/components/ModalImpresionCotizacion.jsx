import { useState, useEffect } from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPrint } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import { formatQ } from '../../../utils/format'
import { marcarCotizacionImpresa } from '../../../services/cotizacionOfflineService'

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Ticket de cotización (80 mm / carta) renderizado 100% desde datos locales:
 * sin RPC ni espera del servidor (Task 1 de offline-suite: imprimir sin red).
 * Reutiliza las clases `.comprobante-ticket` / `body.imprimir-comprobante`
 * del CSS de impresión existente (style.scss).
 */
const ModalImpresionCotizacion = ({ visible, cotizacion, onClose }) => {
  const [empresa, setEmpresa] = useState(null)
  const [sucursal, setSucursal] = useState(null)

  useEffect(() => {
    if (!visible) return
    document.body.classList.add('imprimir-comprobante')
    return () => {
      document.body.classList.remove('imprimir-comprobante')
      document.getElementById('pagina-impresion')?.remove()
    }
  }, [visible])

  // Mejor esfuerzo: en red trae NIT/dirección; sin red se cae al respaldo local.
  useEffect(() => {
    if (!visible) return
    const empresaId = localStorage.getItem('empresaSeleccionada')
    if (empresaId) {
      supabase
        .from('empresa')
        .select('*')
        .eq('id', empresaId)
        .single()
        .then(({ data }) => setEmpresa(data))
        .catch(() => {})
    }
    // NIT/dirección fiscales: de la SUCURSAL de la sesión (fallback empresa en el render)
    let usuarioActual = null
    try {
      usuarioActual = JSON.parse(localStorage.getItem('currentUser'))
    } catch {
      usuarioActual = null
    }
    if (usuarioActual?.id_sucursal) {
      supabase
        .from('sucursal')
        .select('*')
        .eq('id', usuarioActual.id_sucursal)
        .single()
        .then(({ data }) => setSucursal(data))
        .catch(() => {})
    }
  }, [visible])

  if (!visible || !cotizacion) return null

  let usuario = null
  try {
    usuario = JSON.parse(localStorage.getItem('currentUser'))
  } catch {
    usuario = null
  }

  const pendiente = !!cotizacion.pendiente

  const imprimir = (tamano) => {
    let styleTag = document.getElementById('pagina-impresion')
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'pagina-impresion'
      document.head.appendChild(styleTag)
    }
    styleTag.textContent =
      tamano === 'carta'
        ? '@page { size: letter; margin: 10mm; }'
        : '@page { size: 80mm auto; margin: 5mm; }'
    const ticket = document.querySelector('.comprobante-ticket')
    if (ticket) ticket.classList.toggle('comprobante-carta', tamano === 'carta')
    // Modelo del spec: `printed_offline` en el borrador local.
    if (cotizacion.local && !navigator.onLine) {
      marcarCotizacionImpresa(cotizacion.id).catch((e) =>
        console.warn('No se pudo marcar printed_offline:', e),
      )
    }
    setTimeout(() => window.print(), 150)
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="sm">
      <CModalHeader onClose={onClose}>
        <CModalTitle>Cotización</CModalTitle>
      </CModalHeader>
      <CModalBody className="p-2 p-md-3">
        <div className="comprobante-ticket mx-auto border rounded bg-white text-dark p-3">
          <div className="text-center">
            <div className="fw-bold fs-6">
              {empresa?.name || usuario?.sucursalName || 'Negocio'}
            </div>
            {(sucursal?.nit || empresa?.nit) && (
              <div className="small">NIT: {sucursal?.nit || empresa?.nit}</div>
            )}
            {sucursal?.address && <div className="small">{sucursal.address}</div>}
            <div className="fw-bold text-uppercase mt-2 small">Cotización</div>
            <div className="small text-body-secondary">No es factura fiscal</div>
          </div>
          <hr className="my-2" />
          <div className="small">
            <div className="d-flex justify-content-between">
              <span className="text-body-secondary">Folio</span>
              <span className="font-monospace">
                {String(cotizacion.id).slice(0, 8).toUpperCase()}
              </span>
            </div>
            <div className="d-flex justify-content-between">
              <span className="text-body-secondary">Fecha</span>
              <span>{fechaHora(cotizacion.fecha)}</span>
            </div>
            {usuario?.name && (
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Vendedor</span>
                <span>{usuario.name}</span>
              </div>
            )}
            {pendiente && (
              <div className="text-warning-emphasis small fw-semibold mt-1">
                Borrador local — pendiente de sincronizar
              </div>
            )}
          </div>
          <hr className="my-2" />
          <table className="table table-sm small mb-1">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-center">Cant</th>
                <th className="text-end">P.U.</th>
                <th className="text-end">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(cotizacion.detalle || []).map((it, i) => {
                const unitario = typeof it.precio_unitario === 'number' ? it.precio_unitario : null
                const subtotal = unitario !== null ? (it.cantidad || 0) * unitario : null
                return (
                  <tr key={i}>
                    <td>{it.name}</td>
                    <td className="text-center">{it.cantidad}</td>
                    <td className="text-end monto">
                      {unitario !== null ? formatQ(unitario) : '—'}
                    </td>
                    <td className="text-end monto">
                      {subtotal !== null ? formatQ(subtotal) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="d-flex justify-content-between fs-6 fw-bold">
            <span>Total</span>
            <span className="monto">{formatQ(cotizacion.total)}</span>
          </div>
          <div className="text-center small mt-2 text-body-secondary">
            ¡Gracias por su preferencia!
          </div>
        </div>
      </CModalBody>
      <CModalFooter className="flex-wrap justify-content-center">
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cerrar
        </CButton>
        <CButton color="primary" onClick={() => imprimir('ticket')}>
          <CIcon icon={cilPrint} className="me-2" />
          Ticket 80 mm
        </CButton>
        <CButton color="primary" onClick={() => imprimir('carta')}>
          <CIcon icon={cilPrint} className="me-2" />
          Carta
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalImpresionCotizacion
