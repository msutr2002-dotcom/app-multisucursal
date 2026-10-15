import { useState, useEffect, useRef } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CRow,
  CCol,
  CButton,
  CFormInput,
  CSpinner,
  CAlert,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CBadge,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilPrint, cilReload, cilBan } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { formatQ } from '../../utils/format'
import useEstadoRed from '../../hooks/useEstadoRed'
import { hayRed, AVISO_FOLIO_SIN_RED } from '../../services/redService'
import { useToast } from '../../components/common/ToastContext'
import ConfirmModal from '../dashboard/components/common/ConfirmModal'
import {
  hidratarFacturas,
  leerFacturasLocal,
  leerFacturaLocal,
  anularFactura,
} from '../../services/facturaSyncService'
import FacturaImpresion from './components/FacturaImpresion'

const POR_PAGINA = 50

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

/**
 * Facturación (spec facturas-sat): listado de facturas EMITIDAS con ver e
 * imprimir. Con red la fuente es el servidor (+ reflejo en el espejo local);
 * sin red se lista desde IndexedDB (D7) — emitir solo existe con red.
 */
const FacturasPage = () => {
  const enLinea = useEstadoRed()
  // ToastContext expone la función directamente (no un objeto): patrón del repo.
  const showToast = useToast()
  const idSucursal = (() => {
    try {
      return JSON.parse(localStorage.getItem('currentUser'))?.id_sucursal || null
    } catch (e) {
      return null
    }
  })()
  const [filas, setFilas] = useState([])
  // Sin sucursal activa no hay nada que cargar: arranca en estado final.
  const [cargando, setCargando] = useState(!!idSucursal)
  const [error, setError] = useState(
    idSucursal ? null : 'No hay una sucursal activa en esta sesión.',
  )
  const [busqueda, setBusqueda] = useState('')
  const [factura, setFactura] = useState(null)
  const [abriendo, setAbriendo] = useState(null)
  const [paraAnular, setParaAnular] = useState(null)
  const [anulando, setAnulando] = useState(null)
  const secRef = useRef(0)
  const cargar = async (texto) => {
    const sec = ++secRef.current
    setCargando(true)
    try {
      if (hayRed()) {
        const { data, error: err } = await Promise.resolve(
          supabase.rpc('get_facturas', {
            p_id_sucursal: idSucursal,
            p_busqueda: texto || null,
            p_limite: POR_PAGINA,
            p_offset: 0,
          }),
        ).catch((e) => ({ data: null, error: { message: String(e?.message || e) } }))
        if (sec !== secRef.current) return
        if (err) throw new Error(err.message)
        setFilas(data?.facturas || [])
        setError(null)
        // Espejo local best-effort para reimpresión offline posterior
        hidratarFacturas(idSucursal).catch(() => {})
      } else {
        const local = await leerFacturasLocal(idSucursal, {
          busqueda: texto,
          limite: POR_PAGINA,
        })
        if (sec !== secRef.current) return
        setFilas(local.facturas)
        setError(AVISO_FOLIO_SIN_RED + ' Listado desde el almacenamiento local de este equipo.')
      }
    } catch (e) {
      if (sec !== secRef.current) return
      const local = await leerFacturasLocal(idSucursal, {
        busqueda: texto,
        limite: POR_PAGINA,
      }).catch(() => null)
      if (sec !== secRef.current) return
      if (local) {
        setFilas(local.facturas)
        setError('No se pudo consultar el servidor. Listado local: ' + e.message)
      } else {
        setFilas([])
        setError(e.message)
      }
    } finally {
      if (sec === secRef.current) setCargando(false)
    }
  }

  useEffect(() => {
    if (!idSucursal) return
    // setTimeout: la regla react-hooks/set-state-in-effect prohíbe llamar
    // funciones con setState directo desde el effect (patrón del repo).
    const t = setTimeout(() => cargar(''), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal])

  const buscar = (e) => {
    e?.preventDefault?.()
    cargar(busqueda)
  }

  const verFactura = async (fila) => {
    setAbriendo(fila.id)
    try {
      if (hayRed()) {
        const { data, error: err } = await Promise.resolve(
          supabase.rpc('get_factura', { p_id: fila.id, p_id_sucursal: idSucursal }),
        ).catch((e) => ({ data: null, error: { message: String(e?.message || e) } }))
        if (err) throw new Error(err.message)
        setFactura(data)
      } else {
        const local = await leerFacturaLocal(fila.id)
        if (!local) {
          throw new Error(
            'Sin conexión: esta factura no está en el almacenamiento local de este equipo.',
          )
        }
        setFactura(local)
      }
    } catch (e) {
      showToast('danger', 'No se pudo abrir la factura', e.message)
    } finally {
      setAbriendo(null)
    }
  }

  // Facturas-SAT D14: anulación online-only (DELETE en el SAT + marca ANULADO).
  const confirmarAnular = async () => {
    const fila = paraAnular
    if (!fila) return
    setAnulando(fila.id)
    try {
      await anularFactura({ id: fila.id, idSucursal, uuidFel: fila.uuid_fel })
      showToast('success', 'Factura anulada', `La factura ${fila.folio} quedó anulada.`)
      await cargar(busqueda)
    } catch (e) {
      showToast('danger', 'No se pudo anular la factura', e.message)
    } finally {
      setAnulando(null)
      setParaAnular(null)
    }
  }

  return (
    <CCard className="mb-4">
      <CCardHeader className="d-flex flex-wrap align-items-center justify-content-between gap-2">
        <div>
          <h4 className="mb-0">Facturación</h4>
          <small className="text-body-secondary">
            Facturas emitidas de esta sucursal · una factura por venta
          </small>
        </div>
        <form className="d-flex gap-2" onSubmit={buscar}>
          <CFormInput
            placeholder="Folio, cliente o NIT"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            data-testid="input-busqueda-factura"
            style={{ minWidth: '220px' }}
          />
          <CButton color="primary" variant="outline" type="submit">
            <CIcon icon={cilSearch} />
          </CButton>
          <CButton
            color="secondary"
            variant="outline"
            onClick={() => cargar(busqueda)}
            title="Recargar"
            data-testid="btn-recargar-facturas"
          >
            <CIcon icon={cilReload} />
          </CButton>
        </form>
      </CCardHeader>
      <CCardBody>
        <CRow className="mb-3">
          <CCol xs="12">
            {!enLinea && (
              <CAlert color="warning" className="py-2 small mb-0" data-testid="aviso-offline">
                Sin conexión: viendo las facturas guardadas en este equipo. Emitir facturas nuevas
                requiere red.
              </CAlert>
            )}
          </CCol>
        </CRow>
        {error && (
          <CAlert color="warning" className="py-2 small" data-testid="error-facturas">
            {error}
          </CAlert>
        )}
        {cargando ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : filas.length === 0 ? (
          <p className="text-center text-body-secondary py-4 mb-0">
            {busqueda
              ? 'Ninguna factura coincide con la búsqueda.'
              : 'Aún no hay facturas emitidas.'}
          </p>
        ) : (
          <CTable hover responsive data-testid="tabla-facturas">
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Folio</CTableHeaderCell>
                <CTableHeaderCell>Folio fiscal SAT</CTableHeaderCell>
                <CTableHeaderCell>Estado</CTableHeaderCell>
                <CTableHeaderCell>Fecha</CTableHeaderCell>
                <CTableHeaderCell>Cliente</CTableHeaderCell>
                <CTableHeaderCell>NIT</CTableHeaderCell>
                <CTableHeaderCell className="text-end">Total</CTableHeaderCell>
                <CTableHeaderCell>Vendedor</CTableHeaderCell>
                <CTableHeaderCell className="text-center">Acciones</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {filas.map((f) => {
                const anulada = f.estado_fel === 'ANULADO'
                return (
                  <CTableRow key={f.id} data-testid="fila-factura">
                    <CTableDataCell>
                      <span className="font-monospace" data-testid="folio-factura">
                        {f.folio}
                      </span>
                    </CTableDataCell>
                    <CTableDataCell className="font-monospace">
                      {f.serie_fel && f.numero_dte ? `${f.serie_fel}-${f.numero_dte}` : '—'}
                    </CTableDataCell>
                    <CTableDataCell>
                      <CBadge color={anulada ? 'danger' : 'success'} data-testid="estado-factura">
                        {anulada ? 'ANULADO' : f.estado_fel || 'CERTIFICADO'}
                      </CBadge>
                    </CTableDataCell>
                    <CTableDataCell>{fechaHora(f.fecha)}</CTableDataCell>
                    <CTableDataCell>{f.nombre_cliente}</CTableDataCell>
                    <CTableDataCell className="font-monospace">{f.nit_cliente}</CTableDataCell>
                    <CTableDataCell className="text-end monto">
                      <CBadge color="secondary" className="me-1">
                        Venta
                      </CBadge>
                      {formatQ(f.total)}
                    </CTableDataCell>
                    <CTableDataCell>{f.vendedor}</CTableDataCell>
                    <CTableDataCell className="text-center">
                      <CButton
                        color="primary"
                        size="sm"
                        variant="outline"
                        className="me-1"
                        onClick={() => verFactura(f)}
                        disabled={abriendo === f.id}
                        data-testid="btn-ver-factura"
                      >
                        <CIcon icon={cilPrint} className="me-1" />
                        Ver e imprimir
                      </CButton>
                      {!anulada && (
                        <CButton
                          color="danger"
                          size="sm"
                          variant="outline"
                          onClick={() => setParaAnular(f)}
                          disabled={!enLinea || anulando === f.id}
                          title={
                            enLinea
                              ? 'Anula el DTE en el SAT y marca la factura como anulada'
                              : 'Se requiere conexión para anular facturas'
                          }
                          data-testid="btn-anular-factura"
                        >
                          <CIcon icon={cilBan} className="me-1" />
                          Anular
                        </CButton>
                      )}
                    </CTableDataCell>
                  </CTableRow>
                )
              })}
            </CTableBody>
          </CTable>
        )}
      </CCardBody>
      <FacturaImpresion visible={!!factura} factura={factura} onClose={() => setFactura(null)} />
      <ConfirmModal
        visible={!!paraAnular}
        title="Anular factura"
        message={
          paraAnular ? (
            <>
              ¿Anular la factura <strong>{paraAnular.folio}</strong>
              {paraAnular.serie_fel && paraAnular.numero_dte ? (
                <>
                  {' '}
                  (FEL{' '}
                  <span className="font-monospace">
                    {paraAnular.serie_fel}-{paraAnular.numero_dte}
                  </span>
                  )
                </>
              ) : null}
              ? Se eliminará el DTE en el SAT y la factura quedará marcada como ANULADO. La venta
              subyacente no se modifica.
            </>
          ) : (
            ''
          )
        }
        confirmText="Sí, anular"
        cancelText="Cancelar"
        onConfirm={confirmarAnular}
        onCancel={() => setParaAnular(null)}
      />
    </CCard>
  )
}

export default FacturasPage
