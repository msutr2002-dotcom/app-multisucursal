import React, { useState } from 'react'
import { CModal, CModalBody, CButton, CAlert, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCheckCircle, cilPrint, cilWarning, cilFile } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ModalComprobante from '../../../components/common/ModalComprobante'
import ModalImpresionCotizacion from './ModalImpresionCotizacion'
import { AVISO_COMPROBANTE_SIN_RED } from '../../../services/cotizacionOfflineService'
import useEstadoRed from '../../../hooks/useEstadoRed'
import { emitirFactura } from '../../../services/facturaSyncService'
import FacturaImpresion from '../../facturacion/components/FacturaImpresion'

const ModalResultadoVenta = ({ resultado, onClose }) => {
  const [comprobante, setComprobante] = useState(false)
  const [cotizacionImpresion, setCotizacionImpresion] = useState(null)
  const [emitirCargando, setEmitirCargando] = useState(false)
  const [emitirError, setEmitirError] = useState(null)
  const [factura, setFactura] = useState(null)
  const enLinea = useEstadoRed()

  if (!resultado) return null

  // Facturas-SAT (spec facturas-sat, D9/D10): atajo post-venta, FUERA del
  // camino crítico de cobro. Solo con red — el SAT y el correlativo viven en
  // servidores. Con NIT del cliente enlazado → «Emitir factura» (valida el
  // padrón del SAT); sin NIT (casual) → «Facturar a CF».
  const puedeFacturar = resultado.imprimir && !resultado.folioLocal && !resultado.cotizacion
  const emitir = async () => {
    setEmitirCargando(true)
    setEmitirError(null)
    try {
      let usuarioActual = null
      try {
        usuarioActual = JSON.parse(localStorage.getItem('currentUser'))
      } catch (e) {
        usuarioActual = null
      }
      const payload = await emitirFactura({
        idVenta: resultado.id_venta,
        idSucursal: usuarioActual?.id_sucursal,
        idUsuario: usuarioActual?.id || null,
        nitCliente: resultado.nitCliente || null,
        nombreCliente: resultado.clienteNombre || null,
      })
      setFactura(payload)
    } catch (e) {
      setEmitirError(e.message || 'No se pudo emitir la factura')
    } finally {
      setEmitirCargando(false)
    }
  }

  return (
    <CModal visible={!!resultado} onClose={onClose} alignment="center">
      <CModalBody className="text-center py-4">
        <CIcon
          icon={cilCheckCircle}
          width={64}
          height={64}
          className="mb-3"
          style={{ color: 'var(--pos-primary)' }}
        />

        <h5 className="fw-bold mb-1">{resultado.titulo || '¡Venta realizada!'}</h5>
        {resultado.folioLocal ? (
          <>
            <p className="text-body-secondary small mb-1">
              Folio local: {String(resultado.id_venta).slice(0, 8).toUpperCase()}
            </p>
            <CBadge color="warning" className="mb-2">
              Pendiente de sincronizar — sin folio oficial
            </CBadge>
          </>
        ) : (
          <p className="text-body-secondary small mb-3">
            Folio: {String(resultado.id_venta).slice(0, 8).toUpperCase()}
          </p>
        )}

        <div className="bg-body-secondary rounded p-3 mb-3">
          <div className="d-flex justify-content-between mb-1">
            <span className="text-body-secondary">Total</span>
            <strong className="fs-5 monto" style={{ color: 'var(--pos-primary)' }}>
              {formatQ(resultado.total)}
            </strong>
          </div>
          {resultado.cambio > 0 && (
            <div className="d-flex justify-content-between">
              <span className="text-body-secondary">Cambio</span>
              <strong className="monto" style={{ color: 'var(--cui-success)' }}>
                {formatQ(resultado.cambio)}
              </strong>
            </div>
          )}
        </div>

        {/* RF-03: aviso de limitación documentada para borradores sin red */}
        {resultado.avisoComprobante && !enLinea && (
          <CAlert color="warning" className="d-flex align-items-start gap-2 text-start small">
            <CIcon icon={cilWarning} className="mt-1" />
            <span>{AVISO_COMPROBANTE_SIN_RED}</span>
          </CAlert>
        )}

        <CButton color="success" className="w-100" onClick={onClose}>
          {resultado.accion || 'Nueva venta'}
        </CButton>

        {/* Task 1 offline-suite: el ticket de cotización se imprime desde
            datos locales — habilitado incluso sin conexión ni servidor. */}
        {resultado.cotizacion && (
          <CButton
            color="secondary"
            variant="outline"
            className="w-100 mt-2"
            title="Se imprime desde datos locales: no requiere conexión"
            onClick={() => setCotizacionImpresion(resultado.cotizacion)}
          >
            <CIcon icon={cilPrint} className="me-2" />
            Imprimir cotización
          </CButton>
        )}

        {/* Task 2 / RF-03: sin red el comprobante sale de los datos locales con
            la marca de agua "PENDIENTE DE SINCRONIZACIÓN FISCAL". */}
        {resultado.imprimir && (
          <CButton
            color="secondary"
            variant="outline"
            className="w-100 mt-2"
            title={
              enLinea
                ? undefined
                : 'Se imprime desde los datos locales con marca de agua: sin folio oficial'
            }
            onClick={() => setComprobante(true)}
          >
            <CIcon icon={cilPrint} className="me-2" />
            {enLinea ? 'Imprimir comprobante' : 'Imprimir comprobante sin conexión'}
          </CButton>
        )}

        {/* Facturas-SAT D9/D10: con NIT → emitir (padrón SAT); sin NIT → CF */}
        {puedeFacturar && (
          <CButton
            color="primary"
            variant="outline"
            className="w-100 mt-2"
            onClick={emitir}
            disabled={!enLinea || emitirCargando}
            title={
              enLinea
                ? resultado.nitCliente
                  ? 'Valida el NIT en el padrón del SAT, certifica y abre la factura para imprimir'
                  : 'Certifica la venta como Consumidor Final (CF) y abre la factura para imprimir'
                : 'Se requiere conexión para emitir una factura (el SAT vive en un servidor)'
            }
            data-testid="btn-emitir-factura"
          >
            <CIcon icon={cilFile} className="me-2" />
            {emitirCargando
              ? 'Certificando con el SAT…'
              : resultado.nitCliente
                ? 'Emitir factura'
                : 'Facturar a CF'}
          </CButton>
        )}
        {emitirError && (
          <CAlert
            color="danger"
            className="text-start small mt-2 mb-0"
            data-testid="error-emitir-factura"
          >
            {emitirError}
          </CAlert>
        )}
      </CModalBody>

      <ModalComprobante
        visible={comprobante}
        idVenta={resultado.id_venta}
        onClose={() => setComprobante(false)}
      />

      <ModalImpresionCotizacion
        visible={!!cotizacionImpresion}
        cotizacion={cotizacionImpresion}
        onClose={() => setCotizacionImpresion(null)}
      />

      <FacturaImpresion visible={!!factura} factura={factura} onClose={() => setFactura(null)} />
    </CModal>
  )
}

export default ModalResultadoVenta
