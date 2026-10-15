import { useState, useEffect } from 'react'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CRow,
  CCol,
  CButton,
  CFormInput,
  CFormSelect,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CBadge,
  CSpinner,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CAlert,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilInfo,
  cilTrash,
  cilReload,
  cilCalendar,
  cilPrint,
  cilWarning,
  cilX,
} from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { formatQ } from '../../utils/format'
import { useToast } from '../../components/common/ToastContext'
import usePermission from '../../hooks/usePermission'
import useEstadoRed from '../../hooks/useEstadoRed'
import ConfirmModal from '../dashboard/components/common/ConfirmModal'
import ModalComprobante from '../../components/common/ModalComprobante'
import ModalImpresionCotizacion from '../pos/components/ModalImpresionCotizacion'
import {
  leerMetodosPagoLocales,
  hidratarCatalogoParaSucursal,
} from '../../services/catalogSyncService'
import { AVISO_FOLIO_SIN_RED, puedeSolicitarFolioOficial } from '../../services/redService'
import {
  filtrarFilasLocales,
  leerCotizacionesLocales,
  leerDetalleCotizacionLocal,
  leerDetalleVentaLocal,
  leerVentasLocales,
  normalizarVentasRemotas,
} from '../../services/historialOfflineService'

const LIMITE = 50

const BADGE_ESTADO = {
  completada: 'success',
  pendiente: 'warning',
  anulada: 'danger',
  borrador: 'info',
  conflicto: 'danger',
}

// Enums crudos → etiqueta legible (mismo patrón que TrasladosPage)
const etiquetaEstado = (estado) => {
  const t = String(estado || '')
    .replace(/_/g, ' ')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

const BADGE_TIPO = {
  venta: 'secondary',
  cotizacion: 'info',
}

const ETIQUETA_TIPO = {
  venta: 'Venta',
  cotizacion: 'Cotización',
}

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const HistorialPage = () => {
  const showToast = useToast()
  const puedeEliminar = usePermission('historial', 'eliminar')
  const puedeEditar = usePermission('historial', 'editar')
  const enLinea = useEstadoRed()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursal = currentUser?.id_sucursal

  const [filtros, setFiltros] = useState({ estado: '', desde: '', hasta: '' })
  const [tipo, setTipo] = useState('')
  const [busquedaInput, setBusquedaInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [ventas, setVentas] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [cargando, setCargando] = useState(!!idSucursal)
  const [metodos, setMetodos] = useState({})
  const [detalle, setDetalle] = useState(null)
  const [aAnular, setAAnular] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)
  const [comprobante, setComprobante] = useState(null)
  const [impresionCotizacion, setImpresionCotizacion] = useState(null)
  const [editarCliente, setEditarCliente] = useState(null) // null | { nombre }
  const [guardandoCliente, setGuardandoCliente] = useState(false)

  // Métodos de pago: con red se piden al RPC, sin red del espejo local.
  useEffect(() => {
    if (enLinea) {
      supabase
        .rpc('get_metodos_pago')
        .then(({ data, error }) => {
          if (error) return
          const mapa = {}
          ;(data || []).forEach((m) => {
            mapa[m.id] = m.name
          })
          setMetodos(mapa)
        })
        .catch(() => {})
      return
    }
    leerMetodosPagoLocales()
      .then(setMetodos)
      .catch(() => {})
  }, [enLinea])

  useEffect(() => {
    if (!idSucursal) return
    const desdeIso = filtros.desde ? new Date(filtros.desde + 'T00:00:00').toISOString() : null
    const hastaIso = filtros.hasta
      ? new Date(new Date(filtros.hasta + 'T00:00:00').getTime() + 86400000).toISOString()
      : null

    // Las cotizaciones no viven en `get_ventas_historial`: son solo locales.
    const soloLocales = tipo === 'cotizacion'

    // 1) Locales primero (IndexedDB: instantáneo y funciona sin red — RNF-02).
    const localesFiltradas = (lista) =>
      filtrarFilasLocales(lista, {
        estado: filtros.estado,
        desde: desdeIso,
        hasta: hastaIso,
        busqueda,
        tipo,
      })

    Promise.all([leerVentasLocales(idSucursal), leerCotizacionesLocales(idSucursal)])
      .then(([ventasLocales, cotizacionesLocales]) => {
        const locales = [...ventasLocales, ...cotizacionesLocales]

        // Sin red la lista completa sale del espejo local: filtros y paginación
        // se aplican en memoria (mismo criterio que el RPC).
        if (!enLinea || soloLocales) {
          const filtradas = localesFiltradas(locales)
          setTotal(filtradas.length)
          setVentas((prev) =>
            offset > 0 ? [...prev, ...filtradas.slice(offset, offset + LIMITE)] : filtradas,
          )
          setCargando(false)
          return null
        }

        // 2) Con red: el servidor manda y se suman solo los registros locales
        // que la cola todavía no pudo enviar (`pendienteSync`), que por
        // definición aún no existen allá (evita duplicar ventas ya sincronizadas).
        return supabase
          .rpc('get_ventas_historial', {
            p_id_sucursal: idSucursal,
            p_estado: filtros.estado || null,
            p_desde: desdeIso,
            p_hasta: hastaIso,
            p_busqueda: busqueda || null,
            p_limite: LIMITE,
            p_offset: offset,
          })
          .then(({ data, error }) => {
            if (error) {
              // El navegador tiene red pero el servidor no respondió: se cae al
              // espejo local en vez de dejar la tabla vacía.
              showToast('warning', 'Sin respuesta del servidor', error.message)
              const filtradas = localesFiltradas(locales)
              setTotal(filtradas.length)
              setVentas((prev) => (offset > 0 ? prev : filtradas))
              return
            }
            const remotas = normalizarVentasRemotas(data?.ventas || [])
            // Solo en la primera página: las filas locales no se paginan.
            const extraLocal =
              offset === 0 ? localesFiltradas(locales.filter((f) => f.pendienteSync)) : []
            setTotal((data?.total ?? 0) + extraLocal.length)
            setVentas((prev) => (offset > 0 ? [...prev, ...remotas] : [...remotas, ...extraLocal]))
          })
      })
      .then(() => setCargando(false))
      .catch((e) => {
        showToast('danger', 'Error', String(e?.message || e))
        setCargando(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, filtros, busqueda, offset, tick, tipo, enLinea])

  const aplicarFiltro = (cambios) => {
    setCargando(true)
    setOffset(0)
    setFiltros((f) => ({ ...f, ...cambios }))
  }

  const aplicarBusqueda = () => {
    if (busquedaInput === busqueda) return
    setCargando(true)
    setOffset(0)
    setBusqueda(busquedaInput)
  }

  const cargarMas = () => {
    if (cargando || ventas.length >= total) return
    setCargando(true)
    setOffset((o) => o + LIMITE)
  }

  const refrescar = () => {
    setCargando(true)
    setTick((t) => t + 1)
  }

  // Detalle: venta o cotización local → IndexedDB (nunca RPC); venta del
  // servidor → `get_venta_detalle`. Sin red solo se puede abrir lo local.
  const abrirDetalle = (v) => {
    setDetalle({ v, data: null })

    if (v.esLocal) {
      const leer = v.tipo === 'cotizacion' ? leerDetalleCotizacionLocal : leerDetalleVentaLocal
      leer(v.id)
        .then((data) => {
          if (!data) {
            showToast('danger', 'Error', 'El registro local ya no está disponible')
            setDetalle(null)
            return
          }
          setDetalle({ v, data })
        })
        .catch((e) => {
          showToast('danger', 'Error', String(e?.message || e))
          setDetalle(null)
        })
      return
    }

    if (!puedeSolicitarFolioOficial()) {
      showToast('warning', 'Sin conexión', 'Este registro solo está en el servidor')
      return
    }

    supabase
      .rpc('get_venta_detalle', { p_id: v.id, p_id_sucursal: idSucursal })
      .then(({ data, error }) => {
        if (error) {
          showToast('danger', 'Error', error.message)
          setDetalle(null)
          return
        }
        setDetalle({ v, data })
      })
      .catch((e) => {
        showToast('danger', 'Error', String(e?.message || e))
        setDetalle(null)
      })
  }

  // Ticket de cotización local desde el detalle del Historial (sin red).
  const handleImprimirCotizacionLocal = (data) => {
    setImpresionCotizacion({
      id: data.id,
      fecha: data.fecha,
      total: data.total,
      detalle: (data.items || []).map((it) => ({
        name: it.producto,
        cantidad: it.cantidad,
        precio_unitario: it.unitario,
      })),
      local: true,
      pendiente: true,
    })
  }

  const guardarCliente = () => {
    if (guardandoCliente || !editarCliente || !detalle) return
    if (!puedeSolicitarFolioOficial()) {
      showToast('warning', 'Sin conexión', AVISO_FOLIO_SIN_RED)
      setEditarCliente(null)
      return
    }
    const venta = detalle.v
    const nombre = editarCliente.nombre.trim()
    setGuardandoCliente(true)
    ;(async () => {
      try {
        // 1) crear/reutilizar el cliente en la SUCURSAL de la sesión (v2:
        //    NIT opcional; homónimos los resuelve el RPC pidiendo NIT)
        let idCliente = null
        if (nombre) {
          const palabras = nombre.split(/\s+/)
          const { data: idCli, error: errC } = await supabase.rpc('upsert_cliente', {
            p_id_sucursal: idSucursal,
            p_nombre: palabras[0],
            p_apellido: palabras.slice(1).join(' ') || null,
            p_nit: null,
          })
          if (errC) throw errC
          idCliente = idCli
        }
        // 2) asignarlo (o quitarlo con null) a la venta
        const { error: errV } = await supabase.rpc('set_venta_cliente', {
          p_id_venta: venta.id,
          p_id_sucursal: idSucursal,
          p_id_cliente: idCliente,
        })
        if (errV) throw errV
        // 3) actualizar el detalle en pantalla
        setDetalle((d) => (d ? { ...d, data: { ...d.data, cliente: nombre } } : d))
        setEditarCliente(null)
        showToast('success', 'Éxito', nombre ? 'Cliente guardado' : 'Cliente quitado de la venta')
      } catch (err) {
        showToast('danger', 'Error', err.message || 'No se pudo guardar el cliente')
      } finally {
        setGuardandoCliente(false)
      }
    })()
  }

  const handleAnular = () => {
    if (anulando) return
    if (!puedeSolicitarFolioOficial()) {
      setAAnular(null)
      showToast(
        'warning',
        'Sin conexión',
        'La anulación se registra en el servidor: inténtala de nuevo al recuperar la red.',
      )
      return
    }
    const venta = aAnular
    const motivoEnvio = motivo
    setAnulando(true)
    setAAnular(null)
    setMotivo('')
    supabase
      .rpc('anular_venta', {
        p_id: venta.id,
        p_id_sucursal: idSucursal,
        p_id_usuario_anula: currentUser?.id,
        p_motivo: motivoEnvio.trim() || null,
      })
      .then(({ error }) => {
        setAnulando(false)
        if (error) {
          showToast('danger', 'Error', error.message)
          return
        }
        showToast('success', 'Venta anulada', 'El stock fue devuelto a la sucursal')
        // Espejo local (RF-P4): la venta pasa a anulada y el stock local se
        // rehidrata desde el servidor (el revert ×factor ya lo hizo RPC).
        db.ventas
          .get(venta.id)
          .then((fila) => (fila ? db.ventas.update(venta.id, { estado: 'anulada' }) : null))
          .catch(() => {})
        hidratarCatalogoParaSucursal(idSucursal).catch((e) =>
          console.warn('Rehidratación de stock pospuesta:', e),
        )
        refrescar()
      })
      .catch((e) => {
        setAnulando(false)
        showToast('danger', 'Error', String(e?.message || e))
      })
  }

  if (!idSucursal) {
    return (
      <p className="text-body-secondary text-center py-4 mb-0">No se encontró la sucursal activa</p>
    )
  }

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Historial de Ventas y Cotizaciones</h5>
          </CCol>
          <CCol xs={12} md={6}>
            <div className="d-flex align-items-center justify-content-md-end gap-2 flex-wrap">
              <CFormSelect
                value={tipo}
                onChange={(e) => {
                  setCargando(true)
                  setOffset(0)
                  setTipo(e.target.value)
                }}
                title="Ventas y cotizaciones"
                style={{ maxWidth: '14rem' }}
              >
                <option value="">Ventas y cotizaciones</option>
                <option value="venta">Solo ventas</option>
                <option value="cotizacion">Solo cotizaciones</option>
              </CFormSelect>
              <span className="text-body-secondary small text-nowrap">
                {total > 0 && !cargando ? `Mostrando ${ventas.length} de ${total}` : ''}
              </span>
            </div>
          </CCol>
        </CRow>
        <CRow className="align-items-end g-2">
          <CCol xs={12} md={3}>
            <CFormInput
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarBusqueda()}
              placeholder="Buscar por folio o usuario (Enter)"
            />
          </CCol>
          <CCol xs={6} md={3}>
            <CFormSelect
              value={filtros.estado}
              onChange={(e) => aplicarFiltro({ estado: e.target.value })}
            >
              <option value="">Todos los estados</option>
              <option value="completada">Completadas</option>
              <option value="pendiente">Pendientes</option>
              <option value="anulada">Anuladas</option>
            </CFormSelect>
          </CCol>
          <CCol xs={6} md={2}>
            <label className="form-label small mb-1" htmlFor="filtro-desde">
              Desde
            </label>
            <CFormInput
              id="filtro-desde"
              type="date"
              value={filtros.desde}
              onChange={(e) => aplicarFiltro({ desde: e.target.value })}
              aria-label="Fecha desde"
            />
          </CCol>
          <CCol xs={6} md={2}>
            <label className="form-label small mb-1" htmlFor="filtro-hasta">
              Hasta
            </label>
            <CFormInput
              id="filtro-hasta"
              type="date"
              value={filtros.hasta}
              onChange={(e) => aplicarFiltro({ hasta: e.target.value })}
              aria-label="Fecha hasta"
            />
          </CCol>
          <CCol xs={6} md={2} className="d-flex">
            <CButton
              color="secondary"
              variant="outline"
              className="w-100"
              onClick={() => {
                setBusquedaInput('')
                setBusqueda('')
                setTipo('')
                aplicarFiltro({ estado: '', desde: '', hasta: '' })
              }}
            >
              <CIcon icon={cilX} className="me-2" />
              Limpiar
            </CButton>
          </CCol>
        </CRow>
      </CCardHeader>

      <CCardBody>
        {!enLinea && (
          <CAlert color="warning" className="d-flex align-items-start gap-2">
            <CIcon icon={cilWarning} className="mt-1" />
            <span className="small">
              <strong>Sin conexión.</strong> Se muestran los registros guardados en este dispositivo
              (ventas y cotizaciones de la sucursal activa). El comprobante se imprime con la
              leyenda de pendiente de sincronización fiscal; anulaciones y edición de cliente quedan
              deshabilitadas hasta recuperar la red.
            </span>
          </CAlert>
        )}

        {cargando ? (
          <div className="text-center py-5">
            <CSpinner color="primary" />
          </div>
        ) : ventas.length === 0 ? (
          <div className="text-center py-5 text-body-secondary">
            <CIcon icon={cilCalendar} width={36} className="mb-2 opacity-50" />
            <p className="mb-0">
              No hay registros con esos filtros
              {!enLinea ? ' en el almacenamiento local' : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <CTable align="middle" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    {[
                      'Fecha',
                      'Tipo',
                      'Folio',
                      'Usuario',
                      'Método',
                      'Ítems',
                      'Total',
                      'Estado',
                      'Acciones',
                    ].map((h) => (
                      <CTableHeaderCell
                        key={h}
                        className="small text-uppercase text-body-secondary border-bottom"
                      >
                        {h}
                      </CTableHeaderCell>
                    ))}
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {ventas.map((v) => (
                    <CTableRow key={`${v.tipo || 'venta'}-${v.id}`}>
                      <td>{fechaHora(v.fecha)}</td>
                      <td>
                        <CBadge color={BADGE_TIPO[v.tipo] || 'secondary'}>
                          {ETIQUETA_TIPO[v.tipo] || 'Venta'}
                        </CBadge>
                      </td>
                      <td className="font-monospace small">{v.id.slice(0, 8).toUpperCase()}</td>
                      <td>{v.usuario}</td>
                      <td>{v.id_metodo_pago ? metodos[v.id_metodo_pago] || '—' : '—'}</td>
                      <td>
                        {v.items} ítem{v.items === 1 ? '' : 's'}
                      </td>
                      <td className="monto">{formatQ(v.total)}</td>
                      <td>
                        <div className="d-flex gap-1 flex-wrap">
                          <CBadge color={BADGE_ESTADO[v.estado] || 'secondary'}>
                            {etiquetaEstado(v.estado)}
                          </CBadge>
                          {v.pendienteSync && (
                            <CBadge color="warning" title="Aún no está en el servidor">
                              sin sincronizar
                            </CBadge>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-1">
                          <CButton
                            color="info"
                            variant="outline"
                            size="sm"
                            title="Ver detalle"
                            aria-label="Ver detalle de la venta"
                            onClick={() => abrirDetalle(v)}
                          >
                            <CIcon icon={cilInfo} />
                          </CButton>
                          {puedeEliminar &&
                            v.tipo !== 'cotizacion' &&
                            v.estado === 'completada' &&
                            enLinea && (
                              <CButton
                                color="danger"
                                variant="outline"
                                size="sm"
                                title={
                                  v.esLocal
                                    ? 'La venta aún no está en el servidor: se anulará al sincronizar'
                                    : 'Anular venta'
                                }
                                aria-label="Anular venta"
                                onClick={() => {
                                  setMotivo('')
                                  setAAnular(v)
                                }}
                              >
                                <CIcon icon={cilTrash} />
                              </CButton>
                            )}
                        </div>
                      </td>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
            {ventas.length < total && (
              <div className="text-center mt-3">
                <CButton
                  color="secondary"
                  variant="outline"
                  onClick={cargarMas}
                  disabled={cargando}
                >
                  <CIcon icon={cilReload} className="me-2" />
                  Cargar más
                </CButton>
              </div>
            )}
          </>
        )}
      </CCardBody>

      <CModal visible={!!detalle} onClose={() => setDetalle(null)} size="lg">
        <CModalHeader onClose={() => setDetalle(null)}>
          <CModalTitle>
            {detalle?.v?.tipo === 'cotizacion' ? 'Detalle de cotización' : 'Detalle de venta'}
            {detalle ? (
              <span className="font-monospace ms-2 small">
                {detalle.v.id.slice(0, 8).toUpperCase()}
              </span>
            ) : null}
          </CModalTitle>
        </CModalHeader>
        <CModalBody>
          {!detalle || !detalle.data ? (
            <div className="text-center py-4">
              <CSpinner color="primary" />
            </div>
          ) : (
            <>
              {detalle.v.esLocal && (
                <CAlert color="warning" className="d-flex align-items-start gap-2">
                  <CIcon icon={cilWarning} className="mt-1" />
                  <span className="small">
                    {detalle.data.pendienteSync
                      ? 'Registro guardado solo en este dispositivo. Se enviará al servidor al recuperar la red.'
                      : 'Registro guardado en este dispositivo.'}
                  </span>
                </CAlert>
              )}
              <CRow className="mb-3 g-2">
                <CCol xs={6} md={2}>
                  <div className="small text-body-secondary">Fecha</div>
                  <div>{fechaHora(detalle.data.fecha)}</div>
                </CCol>
                <CCol xs={6} md={2}>
                  <div className="small text-body-secondary">Usuario</div>
                  <div>{detalle.data.usuario}</div>
                </CCol>
                {detalle.v.tipo === 'cotizacion' ? (
                  <CCol xs={6} md={2}>
                    <div className="small text-body-secondary">Tipo</div>
                    <div>
                      <CBadge color={BADGE_TIPO.cotizacion}>Cotización</CBadge>
                    </div>
                  </CCol>
                ) : (
                  <CCol xs={6} md={2}>
                    <div className="small text-body-secondary">Método de pago</div>
                    <div>
                      {detalle.data.id_metodo_pago
                        ? metodos[detalle.data.id_metodo_pago] || '—'
                        : '—'}
                    </div>
                  </CCol>
                )}
                <CCol xs={6} md={2}>
                  <div className="small text-body-secondary">Estado</div>
                  <div>
                    <CBadge color={BADGE_ESTADO[detalle.data.estado] || 'secondary'}>
                      {etiquetaEstado(detalle.data.estado)}
                    </CBadge>
                  </div>
                </CCol>
                {detalle.v.tipo === 'cotizacion' ? (
                  <CCol xs={6} md={2}>
                    <div className="small text-body-secondary">Folio</div>
                    <div className="font-monospace small">Solo local</div>
                  </CCol>
                ) : (
                  <CCol xs={6} md={2}>
                    <div className="small text-body-secondary">Cliente</div>
                    <div className={detalle.data.cliente ? '' : 'text-body-secondary'}>
                      {detalle.data.cliente || 'Sin cliente'}
                    </div>
                    {puedeEditar && detalle.data.estado !== 'anulada' && (
                      <CButton
                        size="sm"
                        color="primary"
                        variant="outline"
                        className="mt-1"
                        disabled={detalle.v.esLocal && !enLinea}
                        title={
                          detalle.v.esLocal && !enLinea
                            ? 'Requiere conexión: el cliente se registra en el servidor'
                            : undefined
                        }
                        onClick={() => setEditarCliente({ nombre: detalle.data.cliente || '' })}
                      >
                        Editar
                      </CButton>
                    )}
                  </CCol>
                )}
              </CRow>

              {detalle.data.estado === 'anulada' && (
                <div className="border rounded p-3 mb-3 bg-body-tertiary small">
                  <div>
                    <strong>Anulada el:</strong> {fechaHora(detalle.data.fecha_anulacion)}
                  </div>
                  <div>
                    <strong>Por:</strong> {detalle.data.anulado_por || '—'}
                  </div>
                  <div>
                    <strong>Motivo:</strong> {detalle.data.motivo_anulacion || 'Sin motivo'}
                  </div>
                </div>
              )}

              <div className="table-responsive">
                <CTable align="middle" className="mb-2">
                  <CTableHead>
                    <CTableRow>
                      <th className="small text-uppercase text-body-secondary">Producto</th>
                      <th className="small text-uppercase text-body-secondary">Cantidad</th>
                      <th className="small text-uppercase text-body-secondary">Precio unit.</th>
                      <th className="small text-uppercase text-body-secondary text-end">
                        Subtotal
                      </th>
                    </CTableRow>
                  </CTableHead>
                  <CTableBody>
                    {(detalle.data.items || []).map((it, i) => (
                      <CTableRow key={i}>
                        <td>
                          {it.producto}
                          {it.sku ? (
                            <span className="text-body-secondary small ms-2 font-monospace">
                              {it.sku}
                            </span>
                          ) : null}
                        </td>
                        <td>{it.cantidad}</td>
                        <td className="monto">{formatQ(it.unitario)}</td>
                        <td className="monto text-end">{formatQ(it.subtotal)}</td>
                      </CTableRow>
                    ))}
                  </CTableBody>
                </CTable>
              </div>
              <div className="d-flex justify-content-between align-items-center">
                {detalle.v.tipo === 'cotizacion' ? (
                  <CButton
                    color="primary"
                    variant="outline"
                    onClick={() => handleImprimirCotizacionLocal(detalle.data)}
                  >
                    <CIcon icon={cilPrint} className="me-2" />
                    Imprimir cotización
                  </CButton>
                ) : (
                  <CButton
                    color="primary"
                    variant="outline"
                    onClick={() => setComprobante(detalle.v.id)}
                    disabled={detalle.data.estado !== 'completada'}
                  >
                    <CIcon icon={cilPrint} className="me-2" />
                    Imprimir comprobante
                  </CButton>
                )}
                <span className="fs-5">
                  <span className="text-body-secondary me-2">Total:</span>
                  <strong className="monto">{formatQ(detalle.data.total)}</strong>
                </span>
              </div>
            </>
          )}
        </CModalBody>
      </CModal>

      <ModalComprobante
        visible={!!comprobante}
        idVenta={comprobante}
        onClose={() => setComprobante(null)}
        forzarLocal={detalle?.v?.esLocal}
      />

      <ModalImpresionCotizacion
        visible={!!impresionCotizacion}
        cotizacion={impresionCotizacion}
        onClose={() => setImpresionCotizacion(null)}
      />

      <ConfirmModal
        visible={!!aAnular}
        title="Anular venta"
        message={`¿Anular la venta ${aAnular ? aAnular.id.slice(0, 8).toUpperCase() : ''} por ${aAnular ? formatQ(aAnular.total) : ''}? El stock se devolverá a la sucursal.`}
        confirmText="Anular venta"
        onConfirm={handleAnular}
        onCancel={() => setAAnular(null)}
      >
        <CFormInput
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de anulación (opcional)"
          className="mt-2"
        />
      </ConfirmModal>

      <ConfirmModal
        visible={!!editarCliente}
        title="Cliente de la venta"
        message={`Venta ${
          detalle?.v?.id ? detalle.v.id.slice(0, 8).toUpperCase() : ''
        } — escribe el nombre del cliente. Déjalo vacío para quitarlo.`}
        confirmText="Guardar"
        confirmColor="success"
        onConfirm={guardarCliente}
        onCancel={() => setEditarCliente(null)}
      >
        <CFormInput
          value={editarCliente?.nombre ?? ''}
          onChange={(e) => setEditarCliente((c) => (c ? { ...c, nombre: e.target.value } : c))}
          placeholder="Nombre del cliente"
          className="mt-2"
          autoFocus
          disabled={guardandoCliente}
        />
      </ConfirmModal>
    </CCard>
  )
}

export default HistorialPage
