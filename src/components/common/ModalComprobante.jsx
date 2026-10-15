import { useState, useEffect } from 'react'
import {
  CAlert,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPrint, cilWarning } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { formatQ } from '../../utils/format'
import { leerMetodosPagoLocales } from '../../services/catalogSyncService'
import { leerDetalleVentaLocal, LEYENDA_SIN_RED } from '../../services/historialOfflineService'
import { AVISO_FOLIO_SIN_RED } from '../../services/redService'
import useEstadoRed from '../../hooks/useEstadoRed'
import MarcaAguaComprobante from './MarcaAguaComprobante'

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Comprobante de venta (RF-03 / Task 2 de specs/offline-suite.md).
 *
 * Offline-First: el detalle se resuelve primero desde el espejo local de
 * IndexedDB. Si la venta todavía no llegó al servidor (o no hay red) NO se
 * hace ninguna llamada —tampoco al folio oficial— y el ticket se arma con los
 * datos locales, agregando la marca de agua y la leyenda
 * "PENDIENTE DE SINCRONIZACIÓN FISCAL" (obligatorio para que el papel impreso
 * no se confunda con un comprobante fiscal). Con red y venta ya sincronizada
 * se pide el RPC `get_venta_detalle`; si el servidor no responde, se cae al
 * espejo local con la misma marca de agua.
 *
 * @param {boolean} visible
 * @param {string} idVenta
 * @param {() => void} onClose
 * @param {boolean} [forzarLocal] - no consultar el servidor aunque haya red
 */
const ModalComprobante = ({ visible, idVenta, onClose, forzarLocal = false }) => {
  const enLinea = useEstadoRed()
  const [carga, setCarga] = useState({ id: null, venta: null, error: null })
  const [empresa, setEmpresa] = useState(null)
  const [sucursal, setSucursal] = useState(null)
  const [metodos, setMetodos] = useState({})

  // Sin red nunca se pide nada al servidor (tampoco el folio oficial): el
  // estado se deriva en `cargar()` y del `detalle` que se terminó mostrando.

  useEffect(() => {
    if (!visible) return
    document.body.classList.add('imprimir-comprobante')
    return () => {
      document.body.classList.remove('imprimir-comprobante')
      document.getElementById('pagina-impresion')?.remove()
    }
  }, [visible])

  // Empresa y métodos de pago: con red se piden al servidor (NIT/dirección);
  // sin red se usan los catálogos locales y nunca se espera al servidor.
  useEffect(() => {
    if (!visible) return
    if (!enLinea) {
      leerMetodosPagoLocales()
        .then(setMetodos)
        .catch(() => {})
      return
    }
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
    // NIT/dirección fiscales: de la SUCURSAL de la sesión (con fallback empresa en el render)
    let usuarioActual = null
    try {
      usuarioActual = JSON.parse(localStorage.getItem('currentUser'))
    } catch (e) {
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
    supabase
      .rpc('get_metodos_pago')
      .then(({ data }) => {
        if (data) {
          const mapa = {}
          data.forEach((m) => {
            mapa[m.id] = m.name
          })
          setMetodos(mapa)
        }
      })
      .catch(() => {})
  }, [visible, enLinea])

  useEffect(() => {
    if (!visible || !idVenta) return

    let vivo = true
    const resolverError = (texto) => {
      if (vivo) setCarga({ id: idVenta, venta: null, error: texto })
    }

    // Offline-First: el espejo local de IndexedDB es la fuente de verdad y se
    // resuelve primero, sin esperar al servidor (RF-03).
    const correr = async () => {
      const local = await leerDetalleVentaLocal(idVenta).catch(() => null)
      if (!vivo) return

      if (!local) {
        // Sin red no hay nada más que hacer: no se llama al servidor.
        if (!enLinea || forzarLocal) {
          resolverError(
            'Sin conexión: esta venta no está en el almacenamiento local de este equipo.',
          )
          return
        }
        const currentUser = JSON.parse(localStorage.getItem('currentUser'))
        // Promise.resolve: el builder de supabase.rpc no tiene .catch (igual
        // que en catalogSyncService); sin esto lanza TypeError síncrono.
        const { data, error } = await Promise.resolve(
          supabase.rpc('get_venta_detalle', {
            p_id: idVenta,
            p_id_sucursal: currentUser?.id_sucursal,
          }),
        ).catch((e) => ({ data: null, error: { message: String(e?.message || e) } }))
        if (!vivo) return
        if (error) resolverError(error.message)
        else setCarga({ id: idVenta, venta: data, error: null })
        return
      }

      // Venta aún en la cola (o impresion forzada desde el historial): ticket
      // local con marca de agua, sin pedir nada al servidor — tampoco folio.
      if (!enLinea || forzarLocal || local.pendienteSync) {
        setCarga({ id: idVenta, venta: local, error: null })
        return
      }

      // Ya sincronizada: se pide el ticket al servidor y, si no responde, se
      // cae al espejo local (marca de agua) en vez de dejar el modal vacío.
      const currentUser = JSON.parse(localStorage.getItem('currentUser'))
      // Promise.resolve: el builder de supabase.rpc no tiene .catch (igual que
      // arriba); sin esto lanza TypeError síncrono y el modal queda girando.
      const { data, error } = await Promise.resolve(
        supabase.rpc('get_venta_detalle', {
          p_id: idVenta,
          p_id_sucursal: currentUser?.id_sucursal,
        }),
      ).catch((e) => ({ data: null, error: { message: String(e?.message || e) } }))
      if (!vivo) return
      if (error || !data) {
        setCarga({ id: idVenta, venta: local, error: null })
        return
      }
      setCarga({ id: idVenta, venta: data, error: null })
    }

    // Cualquier error inesperado debe verse en el modal (no un spinner eterno)
    correr().catch((e) => resolverError(String(e?.message || e)))
    return () => {
      vivo = false
    }
  }, [visible, idVenta, enLinea, forzarLocal])

  const detalle = carga.id === idVenta ? carga.venta : null
  const error = carga.id === idVenta ? carga.error : null
  // El aviso y la marca de agua dependen de la FUENTE del ticket impreso, no
  // solo de la red: un ticket armado desde el espejo local nunca es fiscal.
  const desdeLocal = !!detalle?.esLocal

  const imprimir = (tamano) => {
    if (!detalle) return
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
    setTimeout(() => window.print(), 150)
  }

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="sm">
      <CModalHeader onClose={onClose}>
        <CModalTitle>
          Comprobante de venta
          {desdeLocal ? (
            <span className="fs-6 fw-normal text-body-secondary ms-2">copia local</span>
          ) : null}
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-2 p-md-3">
        {error ? (
          <p className="text-danger text-center mb-0">{error}</p>
        ) : !detalle ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : (
          <div
            className="comprobante-ticket mx-auto border rounded bg-white text-dark p-3"
            style={{ position: 'relative' }}
          >
            <div className="text-center">
              <div className="fw-bold fs-6">{empresa?.name || 'Negocio'}</div>
              {(sucursal?.nit || empresa?.nit) && (
                <div className="small">NIT: {sucursal?.nit || empresa?.nit}</div>
              )}
              {sucursal?.address && <div className="small">{sucursal.address}</div>}
              <div className="fw-bold text-uppercase mt-2 small">Comprobante de venta</div>
              <div className="small text-body-secondary">No es factura fiscal</div>
            </div>
            {desdeLocal && <MarcaAguaComprobante />}
            <hr className="my-2" />
            <div className="small">
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Folio</span>
                <span className="font-monospace">{detalle.id.slice(0, 8).toUpperCase()}</span>
              </div>
              {detalle.cliente && (
                <div className="d-flex justify-content-between">
                  <span className="text-body-secondary">Cliente</span>
                  <span>{detalle.cliente}</span>
                </div>
              )}
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Fecha</span>
                <span>{fechaHora(detalle.fecha)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Vendedor</span>
                <span>{detalle.usuario}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Método de pago</span>
                <span>{detalle.id_metodo_pago ? metodos[detalle.id_metodo_pago] || '—' : '—'}</span>
              </div>
            </div>
            <hr className="my-2" />
            <table className="table table-sm small mb-1">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-center">Cant</th>
                  <th className="text-end">P.U.</th>
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {(detalle.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.producto}</td>
                    <td className="text-center">{it.cantidad}</td>
                    <td className="text-end monto">{formatQ(it.unitario)}</td>
                    <td className="text-end monto">{formatQ(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(detalle.descuento_monto || 0) > 0 && (
              <div className="d-flex justify-content-between fs-6">
                <span style={{ color: 'var(--cui-success)' }}>
                  Descuento mayoreo ({(detalle.descuento_bp || 0) / 100}%)
                </span>
                <span className="monto" style={{ color: 'var(--cui-success)' }}>
                  −{formatQ(detalle.descuento_monto)}
                </span>
              </div>
            )}
            <div className="d-flex justify-content-between fs-6 fw-bold">
              <span>Total</span>
              <span className="monto">{formatQ(detalle.total)}</span>
            </div>
            <div className="text-center small mt-2 text-body-secondary">
              ¡Gracias por su compra!
            </div>
          </div>
        )}
        {desdeLocal && (
          <CAlert color="warning" className="d-flex align-items-start gap-2 mt-3 mb-0 small">
            <CIcon icon={cilWarning} className="mt-1" />
            <span>
              Comprobante generado desde los datos locales de este equipo con la leyenda «
              {LEYENDA_SIN_RED}». {AVISO_FOLIO_SIN_RED}
            </span>
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter className="flex-wrap justify-content-center">
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cerrar
        </CButton>
        <CButton color="primary" onClick={() => imprimir('ticket')} disabled={!detalle}>
          <CIcon icon={cilPrint} className="me-2" />
          Ticket 80 mm
        </CButton>
        <CButton color="primary" onClick={() => imprimir('carta')} disabled={!detalle}>
          <CIcon icon={cilPrint} className="me-2" />
          Carta
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalComprobante
