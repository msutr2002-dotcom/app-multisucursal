import { useEffect, useState } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CSpinner,
  CAlert,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWarning, cilPrint, cilExternalLink } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { formatQ } from '../../utils/format'
import useEstadoRed from '../../hooks/useEstadoRed'
import MarcaAguaComprobante from '../../components/common/MarcaAguaComprobante'
import { LEYENDA_SIN_RED } from '../../services/historialOfflineService'
import { leerComprobanteLocal } from '../../services/compraOfflineService'

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// En el servidor `items` viene como conteo; en el espejo local como snapshot
const numItems = (items) => (Array.isArray(items) ? items.length : Number(items) || 0)

const filaDato = (etiqueta, valor) => (
  <div className="d-flex justify-content-between">
    <span className="text-body-secondary">{etiqueta}</span>
    <span>{valor}</span>
  </div>
)

/**
 * Comprobante de compra (Task 6, RF-C4/C5): previsualización e impresión SIN
 * red desde IndexedDB — nunca llama al servidor para resolver el documento.
 *
 * Prioridad del espejo local:
 * 1. Adjunto original del proveedor en `comprobante_cache` (imagen o PDF).
 * 2. Sin adjunto: ticket armado con el snapshot `items` de la compra local,
 *    con marca de agua y la leyenda "PENDIENTE DE SINCRONIZACIÓN FISCAL"
 *    (RF-C5: lo que se arma en este equipo no es fiscal).
 *
 * @param {boolean} visible
 * @param {object} compra - fila del listado (trae proveedor/usuario denormalizados)
 * @param {() => void} onClose
 */
const ModalComprobanteCompra = ({ visible, compra, onClose }) => {
  const enLinea = useEstadoRed()
  const [carga, setCarga] = useState({ id: null, fila: null, adjunto: null, error: null })
  const [empresa, setEmpresa] = useState(null)
  const [sucursal, setSucursal] = useState(null)

  // Mismo mecanismo de impresión que ModalComprobante: al abrir se marca el body
  // para que @media print solo deje pasar el .comprobante-ticket a la hoja.
  useEffect(() => {
    if (!visible) return
    document.body.classList.add('imprimir-comprobante')
    return () => {
      document.body.classList.remove('imprimir-comprobante')
      document.getElementById('pagina-impresion')?.remove()
    }
  }, [visible])

  // Nombre/NIT de la empresa solo como lectura de cortesía con red; el ticket
  // funciona igual sin eso (criterio: abrir el comprobante con la red cortada).
  useEffect(() => {
    if (!visible || !enLinea) return
    const empresaId = localStorage.getItem('empresaSeleccionada')
    if (empresaId) {
      Promise.resolve(supabase.from('empresa').select('*').eq('id', empresaId).single())
        .then(({ data }) => {
          if (data) setEmpresa(data)
        })
        .catch(() => {})
    }
    // NIT fiscal: de la SUCURSAL de la sesión (fallback empresa en el render)
    let usuarioActual = null
    try {
      usuarioActual = JSON.parse(localStorage.getItem('currentUser'))
    } catch (e) {
      usuarioActual = null
    }
    if (usuarioActual?.id_sucursal) {
      Promise.resolve(
        supabase.from('sucursal').select('*').eq('id', usuarioActual.id_sucursal).single(),
      )
        .then(({ data }) => {
          if (data) setSucursal(data)
        })
        .catch(() => {})
    }
  }, [visible, enLinea])

  // Offline-First: IndexedDB es la única fuente del documento (RF-C5).
  useEffect(() => {
    if (!visible || !compra?.id) return
    let vivo = true
    const correr = async () => {
      // La fila de la lista puede venir del servidor (items = conteo): el
      // snapshot local manda para el ticket y proveedor/usuario quedan de la lista.
      const local = await db.compras.get(compra.id).catch(() => null)
      const cache = await leerComprobanteLocal({ idCompra: compra.id }).catch(() => null)
      if (!vivo) return
      const fila = { ...compra, ...(local || {}) }
      setCarga({ id: compra.id, fila, adjunto: cache?.contenido || null, error: null })
    }
    // Cualquier error inesperado se muestra en el modal (nunca spinner eterno)
    correr().catch((e) => {
      if (vivo) {
        setCarga({ id: compra.id, fila: null, adjunto: null, error: String(e?.message || e) })
      }
    })
    return () => {
      vivo = false
    }
  }, [visible, compra])

  const listo = carga.id != null && carga.id === compra?.id
  const fila = listo ? carga.fila : null
  const adjunto = listo ? carga.adjunto : null
  const error = listo ? carga.error : null
  const esPdf = typeof adjunto === 'string' && adjunto.startsWith('data:application/pdf')
  const items = Array.isArray(fila?.items) ? fila.items : null

  const imprimir = (tamano) => {
    if (!fila) return
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

  // El PDF no se imprime desde la app (el plugin no pagina con window.print):
  // se abre en una pestaña y desde ahí el visor del navegador imprime.
  const abrirPestana = () => {
    if (adjunto) window.open(adjunto, '_blank')
  }

  // Se construye solo con fila cargada: el JSX se evalúa aunque CModal esté
  // cerrado, y fila puede ser null (ErrorBoundary si no se guarda).
  const encabezado = fila ? (
    <>
      <div className="text-center">
        <div className="fw-bold fs-6">{empresa?.name || 'Negocio'}</div>
        {(sucursal?.nit || empresa?.nit) && (
          <div className="small">NIT: {sucursal?.nit || empresa?.nit}</div>
        )}
        {sucursal?.address && <div className="small">{sucursal.address}</div>}
        <div className="fw-bold text-uppercase mt-2 small">Comprobante de compra</div>
        <div className="small text-body-secondary">
          {adjunto ? 'Adjunto original del proveedor · copia local' : 'No es factura fiscal'}
        </div>
      </div>
      <hr className="my-2" />
      <div className="small">
        {filaDato(
          'Folio',
          <span className="font-monospace">{fila.id.slice(0, 8).toUpperCase()}</span>,
        )}
        {filaDato('Proveedor', fila.proveedor || '—')}
        {filaDato('Fecha', fechaHora(fila.fecha))}
        {filaDato('Usuario', fila.usuario || '—')}
        {fila.estado && filaDato('Estado', fila.estado)}
        {fila.motivo_anulacion && filaDato('Motivo anulación', fila.motivo_anulacion)}
      </div>
      <hr className="my-2" />
    </>
  ) : null

  return (
    <CModal visible={visible} onClose={onClose} alignment="center" size="lg">
      <CModalHeader onClose={onClose}>
        <CModalTitle>
          Comprobante de compra
          {adjunto ? (
            <span className="fs-6 fw-normal text-body-secondary ms-2">adjunto local</span>
          ) : fila ? (
            <span className="fs-6 fw-normal text-body-secondary ms-2">copia local</span>
          ) : null}
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-2 p-md-3">
        {error ? (
          <p className="text-danger text-center mb-0">{error}</p>
        ) : !listo ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : (
          <div
            className="comprobante-ticket mx-auto border rounded bg-white text-dark p-3"
            style={{ position: 'relative', maxWidth: adjunto ? undefined : 420 }}
          >
            {encabezado}
            {!adjunto && <MarcaAguaComprobante />}
            {adjunto ? (
              esPdf ? (
                <iframe
                  src={adjunto}
                  title="Comprobante de compra"
                  className="w-100 border-0"
                  style={{ height: '60vh' }}
                />
              ) : (
                <img
                  src={adjunto}
                  alt="Comprobante de compra"
                  className="img-fluid d-block mx-auto"
                />
              )
            ) : items?.length ? (
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
                  {items.map((it, i) => (
                    <tr key={i}>
                      <td>{it.name || it.id_producto}</td>
                      <td className="text-center">{it.cantidad}</td>
                      <td className="text-end monto">{formatQ(it.precio_unitario)}</td>
                      <td className="text-end monto">
                        {formatQ(it.sub_total ?? it.precio_unitario * it.cantidad)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="small text-body-secondary text-center py-1">
                Artículos: {numItems(fila.items)}
              </div>
            )}
            <div className="d-flex justify-content-between fs-6 fw-bold">
              <span>Total</span>
              <span className="monto">{formatQ(fila.total)}</span>
            </div>
            <div className="text-center small mt-2 text-body-secondary">
              ¡Gracias por su compra!
            </div>
          </div>
        )}
        {listo && !adjunto && (
          <CAlert color="warning" className="d-flex align-items-start gap-2 mt-3 mb-0 small">
            <CIcon icon={cilWarning} className="mt-1" />
            <span>
              Ticket armado desde los datos locales de este equipo con la leyenda «{LEYENDA_SIN_RED}
              ». No es factura fiscal.
            </span>
          </CAlert>
        )}
      </CModalBody>
      <CModalFooter className="flex-wrap justify-content-center">
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cerrar
        </CButton>
        {esPdf ? (
          <CButton color="primary" onClick={abrirPestana} disabled={!adjunto}>
            <CIcon icon={cilExternalLink} className="me-2" />
            Abrir en pestaña
          </CButton>
        ) : (
          <>
            <CButton color="primary" onClick={() => imprimir('ticket')} disabled={!fila}>
              <CIcon icon={cilPrint} className="me-2" />
              Ticket 80 mm
            </CButton>
            <CButton color="primary" onClick={() => imprimir('carta')} disabled={!fila}>
              <CIcon icon={cilPrint} className="me-2" />
              Carta
            </CButton>
          </>
        )}
      </CModalFooter>
    </CModal>
  )
}

export default ModalComprobanteCompra
