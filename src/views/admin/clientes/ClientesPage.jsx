import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilPen, cilList, cilBan, cilWarning } from '@coreui/icons'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CForm,
  CFormInput,
  CFormSwitch,
  CRow,
  CCol,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CBadge,
  CAlert,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CFormLabel,
  CSpinner,
  CPagination,
  CPaginationItem,
} from '@coreui/react'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import { formatQ } from '../../../utils/format'
import { db } from '../../../lib/db'
import { hidratarClientes, leerClientesLocal } from '../../../services/catalogSyncService'

const POR_PAGINA = 25

const vacio = {
  nombre: '',
  apellido: '',
  nit: '',
  telefono: '',
  direccion: '',
  activo: true,
  descuentoPct: '',
}

// Mayoreo: bp (centésimas de porcentaje) ↔ % con 1 decimal en el form.
const bpAPct = (bp) => (bp > 0 ? String(bp / 100) : '')
const pctABp = (pct) => {
  const n = parseFloat(String(pct ?? '').replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(10000, Math.round(n * 100))
}

const fecha = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return String(iso).slice(0, 10)
  }
}

const ClientesPage = () => {
  const puedeCrear = usePermission('clientes', 'crear')
  const puedeEditar = usePermission('clientes', 'editar')
  const showToast = useToast()
  const empresaId = localStorage.getItem('empresaSeleccionada')
  // Modelo por sucursal v2: el CRUD opera sobre la sucursal del dispositivo.
  const sucursalId = JSON.parse(localStorage.getItem('currentUser') || '{}')?.id_sucursal || null
  const enLinea = useEstadoRed()
  const secRef = useRef(0)

  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaInput, setBusquedaInput] = useState('')
  const [incluirInactivos, setIncluirInactivos] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [sinConexion, setSinConexion] = useState(false)

  const [modalVisible, setModalVisible] = useState(false)
  const [editando, setEditando] = useState(null)
  const [f, setF] = useState(vacio)
  const [guardando, setGuardando] = useState(false)

  const [detalle, setDetalle] = useState(null)
  const [ventasDetalle, setVentasDetalle] = useState([])
  const [cargandoDetalle, setCargandoDetalle] = useState(false)
  const [mapaMetodos, setMapaMetodos] = useState({})

  // Mapa local de métodos de pago para traducir id → nombre en el detalle.
  useEffect(() => {
    db.metodos_pago
      .toArray()
      .then((mps) => setMapaMetodos(Object.fromEntries(mps.map((m) => [m.id, m.name]))))
      .catch(() => {})
  }, [])

  const cargar = async (textoBusqueda = busqueda, pag = pagina) => {
    if (!empresaId || !sucursalId) {
      showToast('danger', 'Error', 'No se encontró la empresa o la sucursal activa')
      setCargando(false)
      return
    }
    const sec = ++secRef.current
    try {
      if (enLinea) {
        setSinConexion(false)
        const offset = (pag - 1) * POR_PAGINA
        const { data, error } = await supabase.rpc('get_clientes', {
          p_id_sucursal: sucursalId,
          p_busqueda: textoBusqueda || null,
          p_incluir_inactivos: incluirInactivos,
          // Los heredados (id_sucursal NULL) NUNCA aparecen en el CRUD (RF-CL4)
          p_incluir_heredados: false,
          p_limite: POR_PAGINA,
          p_offset: offset,
        })
        if (error) throw error
        if (sec !== secRef.current) return
        // Espejo local para el datalist del POS y la lectura offline.
        hidratarClientes(empresaId, sucursalId).catch(() => {})
        setFilas(data?.clientes || [])
        setTotal(data?.total || 0)
      } else {
        setSinConexion(true)
        const todas = await leerClientesLocal(empresaId, sucursalId, {
          busqueda: textoBusqueda,
          incluirInactivos,
        })
        if (sec !== secRef.current) return
        const offset = (pag - 1) * POR_PAGINA
        setFilas(todas.slice(offset, offset + POR_PAGINA))
        setTotal(todas.length)
      }
    } catch (e) {
      if (sec !== secRef.current) return
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      if (sec === secRef.current) setCargando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda, 1), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea, incluirInactivos])

  // Debounce de búsqueda (token de secuencia contra respuestas desordenadas).
  useEffect(() => {
    if (busquedaInput === busqueda) return
    const t = setTimeout(() => {
      setBusqueda(busquedaInput)
      setPagina(1)
      cargar(busquedaInput, 1)
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaInput])

  const cambiarPagina = (p) => {
    setPagina(p)
    cargar(busqueda, p)
  }

  const abrirCrear = () => {
    if (!puedeCrear) return
    setEditando(null)
    setF(vacio)
    setModalVisible(true)
  }

  const abrirEditar = (c) => {
    if (!puedeEditar) return
    setEditando(c)
    setF({
      nombre: c.nombre || c.name || '',
      apellido: c.apellido || '',
      nit: c.nit || '',
      telefono: c.telefono || '',
      direccion: c.direccion || '',
      activo: c.activo !== false,
      descuentoPct: bpAPct(c.descuento_bp),
    })
    setModalVisible(true)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setF((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const cerrarModal = () => {
    setModalVisible(false)
    setEditando(null)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.nombre.trim()) {
      showToast('danger', 'Error', 'El nombre es obligatorio')
      return
    }
    if (!enLinea) {
      showToast('warning', 'Sin conexión', 'La edición de clientes requiere conexión')
      return
    }
    setGuardando(true)
    try {
      const { error } = await supabase.rpc('upsert_cliente_admin', {
        p_id: editando?.id ?? null,
        p_id_sucursal: sucursalId,
        p_nombre: f.nombre,
        p_apellido: f.apellido || null,
        p_nit: f.nit || null,
        p_telefono: f.telefono || null,
        p_direccion: f.direccion || null,
        p_activo: f.activo,
        p_descuento_bp: pctABp(f.descuentoPct),
      })
      if (error) throw error
      showToast('success', 'Éxito', editando ? 'Cliente editado' : 'Cliente creado')
      cerrarModal()
      await cargar()
    } catch (err) {
      showToast('danger', 'Error', String(err?.message || err))
    } finally {
      setGuardando(false)
    }
  }

  const alternarActivo = async (c) => {
    if (!puedeEditar) return
    if (!enLinea) {
      showToast('warning', 'Sin conexión', 'La edición de clientes requiere conexión')
      return
    }
    const activo = c.activo === false
    const { error } = await supabase.rpc('upsert_cliente_admin', {
      p_id: c.id,
      p_id_sucursal: sucursalId,
      p_nombre: c.nombre || c.name,
      p_apellido: c.apellido || null,
      p_nit: c.nit || null,
      p_telefono: c.telefono || null,
      p_direccion: c.direccion || null,
      p_activo: activo,
      // Preserva el descuento existente (el default del RPC sería 0)
      p_descuento_bp: c.descuento_bp || 0,
    })
    if (error) showToast('danger', 'Error', error.message)
    else {
      showToast('success', 'Éxito', activo ? 'Cliente activado' : 'Cliente desactivado')
      await cargar()
    }
  }

  const verDetalle = async (c) => {
    setDetalle(c)
    setVentasDetalle([])
    if (!enLinea) {
      showToast('warning', 'Sin conexión', 'El historial de ventas requiere conexión')
      return
    }
    setCargandoDetalle(true)
    try {
      const { data, error } = await supabase.rpc('get_ventas_by_cliente', {
        p_id_cliente: c.id,
        p_limite: 50,
        p_offset: 0,
      })
      if (error) throw error
      setVentasDetalle(data?.ventas || [])
    } catch (err) {
      showToast('danger', 'Error', String(err?.message || err))
    } finally {
      setCargandoDetalle(false)
    }
  }

  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Clientes</h5>
            <div className="small text-body-secondary">
              Solo clientes de esta sucursal. Los heredados (pre-existentes) no se muestran aquí.
            </div>
          </CCol>
        </CRow>
        <CRow className="align-items-center g-2">
          <CCol xs={12} md={5}>
            <CFormInput
              value={busquedaInput}
              onChange={(e) => setBusquedaInput(e.target.value)}
              placeholder="Buscar por nombre o NIT..."
            />
          </CCol>
          <CCol xs="auto">
            <CFormSwitch
              label="Ver inactivos"
              checked={incluirInactivos}
              onChange={(e) => setIncluirInactivos(e.target.checked)}
            />
          </CCol>
          <CCol xs={12} md className="d-flex justify-content-end">
            {puedeCrear && (
              <CButton color="primary" className="text-nowrap" onClick={abrirCrear}>
                <CIcon icon={cilPlus} className="me-2" />
                Cliente
              </CButton>
            )}
          </CCol>
        </CRow>
      </CCardHeader>

      {sinConexion && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>
            Sin conexión. Clientes desde almacenamiento local — solo lectura. Crear/editar requiere
            conexión.
          </span>
        </CAlert>
      )}

      <CCardBody>
        {cargando ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : filas.length === 0 ? (
          <p className="text-body-secondary text-center py-4 mb-0">
            {sinConexion ? 'Sin datos locales de clientes' : 'No hay clientes. Crea el primero.'}
          </p>
        ) : (
          <>
            <div className="table-responsive">
              <CTable align="middle" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    {[
                      'Cliente',
                      'NIT',
                      'Teléfono',
                      'Mayoreo',
                      'Compras',
                      'Total',
                      'Última',
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
                  {filas.map((c) => (
                    <CTableRow key={c.id}>
                      <CTableDataCell className="border-bottom">
                        <div className="fw-semibold">{c.name}</div>
                        {c.direccion && (
                          <div className="small text-body-secondary">{c.direccion}</div>
                        )}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small text-body-secondary">
                        {c.nit || '—'}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small text-body-secondary">
                        {c.telefono || '—'}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small">
                        {c.descuento_bp > 0 ? (
                          <CBadge color="info">{c.descuento_bp / 100}%</CBadge>
                        ) : (
                          '—'
                        )}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom text-center">
                        {c.n_ventas ?? 0}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small monto">
                        {formatQ(c.total_gastado || 0)}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small text-body-secondary">
                        {fecha(c.ultima_compra)}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom">
                        <CBadge color={c.activo === false ? 'secondary' : 'success'}>
                          {c.activo === false ? 'Inactivo' : 'Activo'}
                        </CBadge>
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom">
                        <div className="d-flex gap-1 flex-wrap">
                          <CButton
                            size="sm"
                            color="light"
                            className="border"
                            onClick={() => verDetalle(c)}
                          >
                            <CIcon icon={cilList} className="me-1" style={{ color: '#0d7a5f' }} />
                            Ver
                          </CButton>
                          {puedeEditar && (
                            <>
                              <CButton
                                size="sm"
                                color="light"
                                className="border"
                                onClick={() => abrirEditar(c)}
                              >
                                <CIcon
                                  icon={cilPen}
                                  className="me-1"
                                  style={{ color: '#e55f0a' }}
                                />
                                Editar
                              </CButton>
                              <CButton
                                size="sm"
                                color="light"
                                className="border"
                                onClick={() => alternarActivo(c)}
                              >
                                <CIcon
                                  icon={cilBan}
                                  className="me-1"
                                  style={{ color: '#b10e1e' }}
                                />
                                {c.activo === false ? 'Activar' : 'Desactivar'}
                              </CButton>
                            </>
                          )}
                        </div>
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
            {paginas > 1 && (
              <CPagination align="center" className="mt-3">
                <CPaginationItem disabled={pagina <= 1} onClick={() => cambiarPagina(pagina - 1)}>
                  Anterior
                </CPaginationItem>
                {Array.from({ length: paginas }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === paginas || Math.abs(p - pagina) <= 2)
                  .map((p, idx, arr) => (
                    <CPaginationItem key={p} active={p === pagina} onClick={() => cambiarPagina(p)}>
                      {idx > 0 && arr[idx - 1] !== p - 1 ? `… ${p}` : p}
                    </CPaginationItem>
                  ))}
                <CPaginationItem
                  disabled={pagina >= paginas}
                  onClick={() => cambiarPagina(pagina + 1)}
                >
                  Siguiente
                </CPaginationItem>
              </CPagination>
            )}
          </>
        )}
      </CCardBody>

      {/* Modal alta/edición */}
      <CModal visible={modalVisible} onClose={cerrarModal}>
        <CModalHeader onClose={cerrarModal}>
          <CModalTitle>{editando ? 'Editar Cliente' : 'Nuevo Cliente'}</CModalTitle>
        </CModalHeader>
        <CForm onSubmit={guardar}>
          <CModalBody>
            <CRow>
              <CCol md={6} className="mb-3">
                <CFormLabel>Nombre *</CFormLabel>
                <CFormInput name="nombre" value={f.nombre} onChange={handleChange} required />
              </CCol>
              <CCol md={6} className="mb-3">
                <CFormLabel>Apellido</CFormLabel>
                <CFormInput name="apellido" value={f.apellido} onChange={handleChange} />
              </CCol>
            </CRow>
            <CRow>
              <CCol md={6} className="mb-3">
                <CFormLabel>NIT</CFormLabel>
                <CFormInput name="nit" value={f.nit} onChange={handleChange} />
                <div className="small text-body-secondary mt-1">
                  Único por sucursal. Obligatorio si el nombre ya existe.
                </div>
              </CCol>
              <CCol md={6} className="mb-3">
                <CFormLabel>Teléfono</CFormLabel>
                <CFormInput name="telefono" value={f.telefono} onChange={handleChange} />
              </CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Dirección</CFormLabel>
              <CFormInput name="direccion" value={f.direccion} onChange={handleChange} />
            </div>
            <div className="mb-3">
              <CFormLabel>Descuento mayoreo %</CFormLabel>
              <CFormInput
                name="descuentoPct"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={f.descuentoPct}
                onChange={handleChange}
                placeholder="0"
              />
              <div className="small text-body-secondary mt-1">
                Se aplica al total de las ventas enlazadas a este cliente.
              </div>
            </div>
            <CFormSwitch label="Activo" name="activo" checked={f.activo} onChange={handleChange} />
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" type="button" onClick={cerrarModal} disabled={guardando}>
              Cancelar
            </CButton>
            <CButton color="primary" type="submit" disabled={guardando}>
              {guardando ? (
                <>
                  <CSpinner size="sm" className="me-2" /> Guardando...
                </>
              ) : editando ? (
                'Guardar Cambios'
              ) : (
                'Crear Cliente'
              )}
            </CButton>
          </CModalFooter>
        </CForm>
      </CModal>

      {/* Modal detalle: últimas ventas */}
      <CModal visible={!!detalle} onClose={() => setDetalle(null)} size="lg">
        <CModalHeader onClose={() => setDetalle(null)}>
          <CModalTitle>Historial — {detalle?.name}</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <CRow className="mb-3 g-2">
            <CCol xs={6} md={3}>
              <div className="small text-body-secondary">Compras</div>
              <div className="fw-semibold">{detalle?.n_ventas ?? 0}</div>
            </CCol>
            <CCol xs={6} md={3}>
              <div className="small text-body-secondary">Total gastado</div>
              <div className="fw-semibold monto">{formatQ(detalle?.total_gastado || 0)}</div>
            </CCol>
            <CCol xs={6} md={3}>
              <div className="small text-body-secondary">Última compra</div>
              <div className="fw-semibold">{fecha(detalle?.ultima_compra)}</div>
            </CCol>
            <CCol xs={6} md={3}>
              <div className="small text-body-secondary">NIT</div>
              <div className="fw-semibold">{detalle?.nit || '—'}</div>
            </CCol>
          </CRow>
          {cargandoDetalle ? (
            <div className="text-center py-3">
              <CSpinner color="primary" />
            </div>
          ) : ventasDetalle.length === 0 ? (
            <p className="text-body-secondary text-center py-3 mb-0">
              {sinConexion
                ? 'Historial no disponible sin conexión'
                : 'Sin ventas registradas a este cliente'}
            </p>
          ) : (
            <div className="table-responsive">
              <CTable align="middle" className="mb-0" size="sm">
                <CTableHead>
                  <CTableRow>
                    {['Fecha', 'Sucursal', 'Método', 'Total'].map((h) => (
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
                  {ventasDetalle.map((v) => (
                    <CTableRow key={v.id}>
                      <CTableDataCell className="border-bottom small">
                        {fecha(v.fecha)}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small text-body-secondary">
                        {v.sucursal || '—'}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small text-body-secondary">
                        {mapaMetodos[v.id_metodo_pago] || '—'}
                      </CTableDataCell>
                      <CTableDataCell className="border-bottom small monto">
                        {formatQ(v.total || 0)}
                      </CTableDataCell>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
          )}
        </CModalBody>
      </CModal>
    </CCard>
  )
}

export default ClientesPage
