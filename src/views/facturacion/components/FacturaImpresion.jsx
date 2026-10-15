import { useState, useEffect } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CSpinner,
  CBadge,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPrint } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import { formatQ } from '../../../utils/format'
import { leerMetodosPagoLocales } from '../../../services/catalogSyncService'
import { lineasFel } from '../../../services/satFelService'
import useEstadoRed from '../../../hooks/useEstadoRed'

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Caché del emisor fiscal (sucursal + nombre de empresa) para que la carta FEL
// se imprima completa también sin red (la reimpresión offline es espejo D7 y la
// sucursal solo se pide al servidor con conexión).
const CLAVE_EMISOR = 'pos_emisor_fiscal'
function leerEmisorCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_EMISOR))
    const u = JSON.parse(localStorage.getItem('currentUser'))
    return c && u && c.id === u.id_sucursal ? c : null
  } catch (e) {
    return null
  }
}

/**
 * Factura simulada (spec facturas-sat D1/D4): vista previa e impresión en
 * **80 mm (rollo POS) y carta**. Reutiliza el ciclo de impresión del
 * comprobante (`.comprobante-ticket` + `body.imprimir-comprobante` +
 * `@page` dinámico), así que no necesita CSS propio.
 *
 * SIN marca de agua ni avisos de sincronización (D4): este documento se
 * emite solo con red y el folio es oficial desde el servidor.
 *
 * @param {boolean} visible
 * @param {object|null} factura - payload completo (folio + venta) de
 *   `emitir_factura` / `get_factura` / espejo local
 * @param {() => void} onClose
 */
const FacturaImpresion = ({ visible, factura, onClose }) => {
  const enLinea = useEstadoRed()
  const [empresa, setEmpresa] = useState(() => {
    const c = leerEmisorCache()
    return c?.empresaNombre ? { name: c.empresaNombre } : null
  })
  const [sucursal, setSucursal] = useState(() => {
    const c = leerEmisorCache()
    return c ? { id: c.id, name: c.name, nit: c.nit, address: c.address } : null
  })
  const [metodos, setMetodos] = useState({})
  // Formato de impresión vigente (D1): 'ticket' = 80 mm, 'carta' = hoja carta
  // con el layout FEL real del SAT (D17). El modal recuerda la última elección.
  const [tamano, setTamano] = useState('ticket')
  // QR del DTE (D17): data-URL generado en cliente desde `fel.uuid` con la dep
  // `qrcode` (import dinámico — solo se carga al ver/ imprimir la carta).
  const [qr, setQr] = useState({ uuid: null, url: null })

  useEffect(() => {
    if (!visible) return
    document.body.classList.add('imprimir-comprobante')
    return () => {
      document.body.classList.remove('imprimir-comprobante')
      document.getElementById('pagina-impresion-factura')?.remove()
    }
  }, [visible])

  // Encabezado fiscal (NIT/dirección) y métodos: con red se piden al servidor;
  // sin red SOLO catálogos locales (nunca se llama al servidor — la factura ya
  // emitida se imprime igual desde el espejo).
  useEffect(() => {
    if (!visible) return
    leerMetodosPagoLocales()
      .then(setMetodos)
      .catch(() => {})
    if (!enLinea) return
    const empresaId = localStorage.getItem('empresaSeleccionada')
    if (empresaId) {
      Promise.resolve(supabase.from('empresa').select('*').eq('id', empresaId).single())
        .then(({ data }) => setEmpresa(data))
        .catch(() => {})
    }
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
        .then(({ data }) => setSucursal(data))
        .catch(() => {})
    }
    Promise.resolve(supabase.rpc('get_metodos_pago'))
      .then(({ data }) => {
        if (Array.isArray(data)) {
          const mapa = {}
          data.forEach((m) => {
            mapa[m.id] = m.name
          })
          setMetodos(mapa)
        }
      })
      .catch(() => {})
  }, [visible, enLinea])

  const venta = factura?.venta || null
  const fel = factura?.fel || null
  // Totales certificados (centavos); filas antiguas sin FEL muestran Total
  // de la venta y dejan Subtotal/IVA en «—».
  const subtotal = fel?.subtotal ?? null
  const iva = fel?.iva ?? null
  const total = fel?.total ?? venta?.total ?? null
  const anulada = fel?.estado === 'ANULADO'

  // Caché del emisor (escritura): solo para reimpresión offline de la carta;
  // no toca la red ni el render (D7/D17).
  useEffect(() => {
    if (!visible || !sucursal?.id) return
    try {
      localStorage.setItem(
        CLAVE_EMISOR,
        JSON.stringify({
          id: sucursal.id,
          name: sucursal.name || '',
          nit: sucursal.nit || '',
          address: sucursal.address || '',
          empresaNombre: empresa?.name || '',
        }),
      )
    } catch (e) {
      /* sin storage: la carta imprime igual con lo cargado */
    }
  }, [visible, sucursal, empresa])

  // QR del DTE (D17): se genera al entrar en la vista carta (import dinámico
  // de `qrcode`, fuera del bundle principal). Estilo .then(callback) para no
  // pisar el lint de set-state-in-effect.
  useEffect(() => {
    if (!visible || tamano !== 'carta' || !fel?.uuid || qr.uuid === fel.uuid) return
    let vivo = true
    import('qrcode')
      .then((m) => (m.default || m).toDataURL(fel.uuid, { width: 168, margin: 1 }))
      .then((url) => {
        if (vivo) setQr({ uuid: fel.uuid, url })
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [visible, tamano, fel?.uuid, qr.uuid])

  // Líneas de la carta FEL (D17): misma prorrateo/÷1.12 certificado en el SAT
  // (`lineasFel`), con base e IVA por línea derivados del monto certificado.
  const lineasCarta = (() => {
    try {
      return lineasFel(venta?.items, total).map((l) => {
        const base = Math.round(l.monto / 1.12)
        return { ...l, base, iva: l.monto - base }
      })
    } catch (e) {
      return []
    }
  })()

  const imprimir = (t) => {
    if (!factura) return
    setTamano(t)
    let styleTag = document.getElementById('pagina-impresion-factura')
    if (!styleTag) {
      styleTag = document.createElement('style')
      styleTag.id = 'pagina-impresion-factura'
      document.head.appendChild(styleTag)
    }
    styleTag.textContent =
      t === 'carta'
        ? '@page { size: letter; margin: 10mm; }'
        : '@page { size: 80mm auto; margin: 5mm; }'
    const ticket = document.querySelector('.factura-ticket')
    if (ticket) ticket.classList.toggle('comprobante-carta', t === 'carta')
    setTimeout(() => window.print(), 150)
  }

  return (
    <CModal
      visible={visible}
      onClose={onClose}
      alignment="center"
      size={tamano === 'carta' ? 'lg' : 'sm'}
    >
      <CModalHeader onClose={onClose}>
        <CModalTitle>
          Factura
          <span className="fs-6 fw-normal text-body-secondary ms-2 font-monospace">
            {factura?.folio || ''}
          </span>
        </CModalTitle>
      </CModalHeader>
      <CModalBody className="p-2 p-md-3">
        {!factura || !venta ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : tamano === 'carta' ? (
          <div
            className="comprobante-ticket factura-ticket comprobante-carta mx-auto border rounded bg-white text-dark p-3"
            style={{ position: 'relative', maxWidth: '740px' }}
            data-testid="factura-ticket"
          >
            {/* Carta FEL real (D17): encabezado 2 columnas, columnas SAT de
                ítems, fila TOTALES, forma de pago, nota ISR, certificador +
                QR del DTE y pie. Los totales salen de los valores certificados
                (D15); los ítems reutilizan `lineasFel` (÷1.12, D11). */}
            <div className="d-flex justify-content-between align-items-start gap-3 border-bottom pb-2 mb-2">
              <div>
                <div className="fw-bold text-uppercase" data-testid="factura-carta-emisor">
                  {sucursal?.name || empresa?.name || 'Negocio'}
                </div>
                <div>
                  NIT:{' '}
                  <span className="font-monospace">{sucursal?.nit || empresa?.nit || '—'}</span>
                </div>
                {sucursal?.address && <div>{sucursal.address}</div>}
                <div className="fw-bold text-uppercase mt-2">Factura Electrónica</div>
                <div className="font-monospace">
                  Folio interno: <span data-testid="factura-folio">{factura.folio}</span>
                </div>
                {anulada && (
                  <CBadge color="danger" className="mt-1" data-testid="factura-badge-anulada">
                    FACTURA ANULADA
                  </CBadge>
                )}
              </div>
              <div className="text-end">
                <div className="text-body-secondary">N° Autorización (UUID)</div>
                <div
                  className="font-monospace"
                  data-testid="factura-carta-uuid"
                  style={{ fontSize: '0.7rem', wordBreak: 'break-all' }}
                >
                  {fel?.uuid || '—'}
                </div>
                <div>
                  <span className="text-body-secondary">Serie - N° DTE:</span>{' '}
                  <span className="font-monospace" data-testid="factura-folio-fiscal">
                    {fel ? `${fel.serie}-${fel.numeroDTE}` : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-body-secondary">Fecha de emisión:</span>{' '}
                  <span className="text-nowrap">{fechaHora(factura.fecha)}</span>
                </div>
                <div>
                  <span className="text-body-secondary">Fecha de certificación:</span>{' '}
                  <span className="text-nowrap">
                    {fel?.fechaCertificacion ? fechaHora(fel.fechaCertificacion) : '—'}
                  </span>
                </div>
                <div>
                  <span className="text-body-secondary">Moneda:</span> GTQ
                </div>
              </div>
            </div>
            <div className="border-bottom pb-2 mb-2" data-testid="factura-carta-comprador">
              <div className="fw-bold text-uppercase">Datos del comprador</div>
              <div className="d-flex gap-3 flex-wrap">
                <div>
                  <span className="text-body-secondary">Nombre / Razón social:</span>{' '}
                  <span data-testid="factura-cliente">{factura.nombre_cliente || '—'}</span>
                </div>
                <div>
                  <span className="text-body-secondary">NIT:</span>{' '}
                  <span className="font-monospace">{factura.nit_cliente || 'CF'}</span>
                </div>
              </div>
              {factura.direccion_cliente && (
                <div>
                  <span className="text-body-secondary">Dirección:</span>{' '}
                  {factura.direccion_cliente}
                </div>
              )}
            </div>
            <table
              className="table table-sm table-bordered mb-1 factura-carta-items"
              data-testid="factura-carta-items"
            >
              <thead>
                <tr className="text-uppercase">
                  <th style={{ width: '6%' }}>#No</th>
                  <th style={{ width: '6%' }}>B/S</th>
                  <th style={{ width: '7%' }}>Cant</th>
                  <th style={{ width: '19%' }}>Descripción</th>
                  <th className="text-end" style={{ width: '12%' }}>
                    P. Unitario
                  </th>
                  <th className="text-end" style={{ width: '13%' }}>
                    Descuentos
                  </th>
                  <th className="text-end" style={{ width: '12%' }}>
                    Otros Desc.
                  </th>
                  <th className="text-end" style={{ width: '9%' }}>
                    Total
                  </th>
                  <th className="text-end" style={{ width: '16%' }}>
                    Impuestos (IVA)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineasCarta.map((l, i) => (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td className="text-center">B</td>
                    <td className="text-center">{l.cantidad}</td>
                    <td>{l.descripcion}</td>
                    {/* precioUnitario viene del payload FEL en "centavos-world"
                        (la misma convención con la que el SAT recalcula sus
                        totales); para IMPRIMIR en quetzales hay que ÷100. */}
                    <td className="text-end monto">Q{(l.precioUnitario / 100).toFixed(6)}</td>
                    <td className="text-end monto">Q0.00</td>
                    <td className="text-end monto">Q0.00</td>
                    <td className="text-end monto">{formatQ(l.monto)}</td>
                    <td className="text-end monto">{formatQ(l.iva)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="border-top border-bottom d-flex justify-content-between flex-wrap gap-2 fw-semibold py-1 mb-2 text-uppercase"
              data-testid="factura-carta-totales"
            >
              <span>Totales</span>
              <span className="d-flex gap-3 flex-wrap fw-normal text-uppercase">
                <span>
                  Subtotal:{' '}
                  <span className="monto" data-testid="factura-subtotal">
                    {subtotal != null ? formatQ(subtotal) : '—'}
                  </span>
                </span>
                <span>
                  Descuentos: <span className="monto">Q0.00</span>
                </span>
                <span>
                  Otros Desc.: <span className="monto">Q0.00</span>
                </span>
                <span>
                  IVA 12%:{' '}
                  <span className="monto" data-testid="factura-iva">
                    {iva != null ? formatQ(iva) : '—'}
                  </span>
                </span>
                <span>
                  Total:{' '}
                  <span className="monto fw-bold" data-testid="factura-total">
                    {total != null ? formatQ(total) : '—'}
                  </span>
                </span>
              </span>
            </div>
            <div className="d-flex justify-content-between mb-1">
              <span className="text-body-secondary">Forma de pago</span>
              <span>{venta.id_metodo_pago ? metodos[venta.id_metodo_pago] || '—' : '—'}</span>
            </div>
            <div className="mb-2" data-testid="factura-carta-isr">
              <span className="fw-semibold">Nota ISR:</span> el Impuesto sobre la Renta (ISR) no
              aplica a esta operación (Q0.00).
            </div>
            <div className="border-top d-flex justify-content-between align-items-center gap-3 pt-2">
              <div>
                <div className="fw-bold text-uppercase">Datos del certificador</div>
                <div>Servicio de Administración Tributaria (SAT)</div>
                <div>
                  NIT:{' '}
                  <span className="font-monospace" data-testid="factura-carta-certificador">
                    16693949
                  </span>
                </div>
              </div>
              <div className="text-center">
                {qr.url && qr.uuid === fel?.uuid ? (
                  <img
                    src={qr.url}
                    alt="QR del DTE"
                    data-testid="factura-qr"
                    style={{ width: 110, height: 110 }}
                  />
                ) : (
                  <div className="text-body-secondary">Generando QR…</div>
                )}
              </div>
            </div>
            <div
              className="text-center fw-bold text-uppercase mt-2"
              data-testid="factura-carta-pie"
            >
              Contribuyendo juntos por Guatemala
            </div>
          </div>
        ) : (
          <div
            className="comprobante-ticket factura-ticket mx-auto border rounded bg-white text-dark p-3"
            style={{ position: 'relative', maxWidth: '360px' }}
            data-testid="factura-ticket"
          >
            <div className="text-center">
              <div className="fw-bold fs-6">{empresa?.name || 'Negocio'}</div>
              {(sucursal?.nit || empresa?.nit) && (
                <div className="small">NIT: {sucursal?.nit || empresa?.nit}</div>
              )}
              {sucursal?.address && <div className="small">{sucursal.address}</div>}
              {sucursal?.name && <div className="small">{sucursal.name}</div>}
              <div className="fw-bold text-uppercase mt-2">Factura</div>
            </div>
            <hr className="my-2" />
            <div className="small">
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Folio interno</span>
                <span className="font-monospace" data-testid="factura-folio">
                  {factura.folio}
                </span>
              </div>
              {fel?.serie && (
                <>
                  <div className="d-flex justify-content-between">
                    <span className="text-body-secondary">Folio fiscal SAT</span>
                    <span className="font-monospace" data-testid="factura-folio-fiscal">
                      {fel.serie}-{fel.numeroDTE}
                    </span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span className="text-body-secondary">UUID DTE</span>
                    <span className="font-monospace" style={{ fontSize: '0.65rem' }}>
                      {fel.uuid}
                    </span>
                  </div>
                </>
              )}
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Fecha</span>
                <span>{fechaHora(fel?.fechaCertificacion || factura.fecha)}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Vendedor</span>
                <span>{venta.usuario || '—'}</span>
              </div>
              {anulada && (
                <div className="text-center mt-1">
                  <CBadge color="danger" data-testid="factura-badge-anulada">
                    FACTURA ANULADA
                  </CBadge>
                </div>
              )}
            </div>
            <hr className="my-2" />
            <div className="small">
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">Cliente</span>
                <span data-testid="factura-cliente">{factura.nombre_cliente}</span>
              </div>
              <div className="d-flex justify-content-between">
                <span className="text-body-secondary">NIT</span>
                <span className="font-monospace">{factura.nit_cliente}</span>
              </div>
              {factura.direccion_cliente && (
                <div className="d-flex justify-content-between">
                  <span className="text-body-secondary">Dirección</span>
                  <span className="text-end ps-2">{factura.direccion_cliente}</span>
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
                  <th className="text-end">Total</th>
                </tr>
              </thead>
              <tbody>
                {(venta.items || []).map((it, i) => (
                  <tr key={i}>
                    <td>{it.producto}</td>
                    <td className="text-center">{it.cantidad}</td>
                    <td className="text-end monto">{formatQ(it.unitario)}</td>
                    <td className="text-end monto">{formatQ(it.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(venta.descuento_monto || 0) > 0 && (
              <div className="d-flex justify-content-between fs-6">
                <span style={{ color: 'var(--cui-success)' }}>
                  Descuento mayoreo ({(venta.descuento_bp || 0) / 100}%)
                </span>
                <span className="monto" style={{ color: 'var(--cui-success)' }}>
                  −{formatQ(venta.descuento_monto)}
                </span>
              </div>
            )}
            <div className="d-flex justify-content-between small">
              <span className="text-body-secondary">Método de pago</span>
              <span>{venta.id_metodo_pago ? metodos[venta.id_metodo_pago] || '—' : '—'}</span>
            </div>
            <hr className="my-2" />
            <div className="d-flex justify-content-between small">
              <span className="text-body-secondary">Subtotal</span>
              <span className="monto" data-testid="factura-subtotal">
                {subtotal != null ? formatQ(subtotal) : '—'}
              </span>
            </div>
            <div className="d-flex justify-content-between small">
              <span className="text-body-secondary">IVA 12%</span>
              <span className="monto" data-testid="factura-iva">
                {iva != null ? formatQ(iva) : '—'}
              </span>
            </div>
            {(factura.cambio || 0) > 0 && (
              <div className="d-flex justify-content-between small">
                <span className="text-body-secondary">Cambio</span>
                <span className="monto">{formatQ(factura.cambio)}</span>
              </div>
            )}
            <div className="d-flex justify-content-between fs-6 fw-bold">
              <span>Total</span>
              <span className="monto" data-testid="factura-total">
                {total != null ? formatQ(total) : '—'}
              </span>
            </div>
            <div className="text-center small mt-2 text-body-secondary">
              ¡Gracias por su compra!
            </div>
          </div>
        )}
      </CModalBody>
      <CModalFooter className="flex-wrap justify-content-center">
        <CButton color="secondary" variant="outline" onClick={onClose}>
          Cerrar
        </CButton>
        <CButton
          color="primary"
          onClick={() => imprimir('ticket')}
          disabled={!factura}
          data-testid="btn-factura-80"
        >
          <CIcon icon={cilPrint} className="me-2" />
          Imprimir 80 mm
        </CButton>
        <CButton
          color="primary"
          onClick={() => imprimir('carta')}
          disabled={!factura}
          data-testid="btn-factura-carta"
        >
          <CIcon icon={cilPrint} className="me-2" />
          Carta
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default FacturaImpresion
