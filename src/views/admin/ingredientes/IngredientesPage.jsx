import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilWarning, cilMinus, cilPen } from '@coreui/icons'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CForm,
  CFormInput,
  CFormSelect,
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
} from '@coreui/react'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import useFlagsSucursal from '../../../hooks/useFlagsSucursal'
import { formatQ } from '../../../utils/format'
import { db } from '../../../lib/db'
import {
  leerIngredientesLocal,
  leerCatalogosLocales,
  hidratarIngredientes,
} from '../../../services/catalogSyncService'

const vacio = {
  name: '',
  sku: '',
  descripcion: '',
  id_unidad: '',
  precio_compra: '',
  activo: true,
}

const IngredientesPage = () => {
  const puedeCrear = usePermission('ingredientes', 'crear')
  const puedeEditar = usePermission('ingredientes', 'editar')
  const showToast = useToast()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursalActual = currentUser?.id_sucursal
  const empresaId = localStorage.getItem('empresaSeleccionada')

  const enLinea = useEstadoRed()
  const { esComida, listo: flagsListos } = useFlagsSucursal()
  const [sinConexion, setSinConexion] = useState(false)

  const [ingredientes, setIngredientes] = useState([])
  const [unidades, setUnidades] = useState([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)

  const [modalVisible, setModalVisible] = useState(false)
  const [ingredienteSel, setIngredienteSel] = useState(null)
  const [f, setF] = useState(vacio)

  const cargar = async () => {
    if (!empresaId) {
      showToast('danger', 'Error', 'No se encontró la empresa activa')
      return
    }
    try {
      if (enLinea) {
        setSinConexion(false)
        // Ingredientes y unidades desde el servidor; se cachean en Dexie para offline
        await hidratarIngredientes(empresaId)
        const resUnidades = await supabase
          .from('unidades')
          .select('*')
          .eq('id_empresa', empresaId)
          .eq('activo', true)
          .order('name')
        if (resUnidades.data?.length) {
          await db.unidades.bulkPut(resUnidades.data.map((u) => ({ ...u, id_empresa: empresaId })))
        }
      } else {
        setSinConexion(true)
      }
      const [ings, cats] = await Promise.all([
        leerIngredientesLocal(empresaId, idSucursalActual),
        leerCatalogosLocales(empresaId),
      ])
      setIngredientes(ings)
      setUnidades(cats.unidades || [])
    } catch (e) {
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => cargar(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])

  const abrirCrear = () => {
    if (!puedeCrear) return
    setIngredienteSel(null)
    setF(vacio)
    setModalVisible(true)
  }

  const abrirEditar = (ing) => {
    if (!puedeEditar) return
    setIngredienteSel(ing)
    setF({
      name: ing.name || '',
      sku: ing.sku || '',
      descripcion: ing.descripcion || '',
      id_unidad: ing.id_unidad || '',
      precio_compra: ing.precio_compra != null ? (ing.precio_compra / 100).toFixed(2) : '',
      activo: ing.activo ?? true,
    })
    setModalVisible(true)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setF((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const cerrarModal = () => {
    setModalVisible(false)
    setIngredienteSel(null)
  }

  const guardar = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) {
      showToast('danger', 'Error', 'El nombre es obligatorio')
      return
    }
    const precioCents = f.precio_compra === '' ? 0 : Math.round(parseFloat(f.precio_compra) * 100)
    const { error } = await supabase.rpc('upsert_ingrediente', {
      p_id: ingredienteSel?.id ?? null,
      p_name: f.name,
      p_sku: f.sku || null,
      p_descripcion: f.descripcion || null,
      p_id_unidad: f.id_unidad || null,
      p_precio_compra: precioCents,
      p_activo: f.activo,
      p_id_empresa: empresaId,
    })
    if (error) {
      showToast('danger', 'Error', error.message)
      return
    }
    showToast('success', 'Éxito', ingredienteSel ? 'Ingrediente editado' : 'Ingrediente creado')
    cerrarModal()
    await cargar()
  }

  const cambiarStock = async (ing, delta) => {
    if (!puedeEditar) return
    const actual = ing.stock ?? 0
    const nuevo = Math.max(0, actual + delta)
    if (nuevo === actual) return
    const { error } = await supabase.rpc('set_ingrediente_stock', {
      p_id_ingrediente: ing.id,
      p_id_sucursal: idSucursalActual,
      p_stock: nuevo,
    })
    if (error) showToast('danger', 'Error', error.message)
    else await cargar()
  }

  const filtrados = ingredientes.filter((i) => {
    const q = busqueda.toLowerCase()
    return i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)
  })

  // Sucursal con "activar ingredientes" OFF: el módulo no aplica (el nav
  // también lo oculta); acceso directo por URL redirige al dashboard.
  if (flagsListos && !esComida) return <Navigate to="/dashboard" replace />

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Ingredientes</h5>
          </CCol>
        </CRow>
        <CRow className="align-items-center g-2">
          <CCol xs={12} md={6}>
            <CFormInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código..."
            />
          </CCol>
          <CCol xs={12} md={6} className="d-flex justify-content-end">
            {puedeCrear && (
              <CButton color="primary" className="text-nowrap" onClick={abrirCrear}>
                <CIcon icon={cilPlus} className="me-2" />
                Ingrediente
              </CButton>
            )}
          </CCol>
        </CRow>
      </CCardHeader>

      {sinConexion && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>Sin conexión. Ingredientes desde almacenamiento local — solo lectura.</span>
        </CAlert>
      )}

      <CCardBody>
        {cargando ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : filtrados.length === 0 ? (
          <p className="text-body-secondary text-center py-4 mb-0">
            {sinConexion
              ? 'Sin datos locales de ingredientes'
              : 'No hay ingredientes. Crea el primero para armar recetas.'}
          </p>
        ) : (
          <div className="table-responsive">
            <CTable align="middle" className="mb-0">
              <CTableHead>
                <CTableRow>
                  {['Ingrediente', 'Código', 'Unidad', 'Costo', 'Stock', 'Estado', 'Acciones'].map(
                    (h) => (
                      <CTableHeaderCell
                        key={h}
                        className="small text-uppercase text-body-secondary border-bottom"
                      >
                        {h}
                      </CTableHeaderCell>
                    ),
                  )}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filtrados.map((i) => (
                  <CTableRow key={i.id}>
                    <CTableDataCell className="border-bottom">
                      <div className="fw-semibold">{i.name}</div>
                      {i.descripcion && (
                        <div className="small text-body-secondary">{i.descripcion}</div>
                      )}
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom small text-body-secondary">
                      {i.sku || '—'}
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom">
                      <CBadge color="light" className="text-dark border">
                        {i.unidad_abrev || i.unidad_name || 'und'}
                      </CBadge>
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom small monto">
                      {formatQ(i.precio_compra || 0)}
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom">
                      <div className="d-flex align-items-center justify-content-center gap-1">
                        <CButton
                          size="sm"
                          className="p-1 border-0"
                          style={{
                            background: 'rgba(13,122,95,0.12)',
                            color: 'var(--pos-success)',
                          }}
                          disabled={!puedeEditar || (i.stock ?? 0) <= 0}
                          onClick={() => cambiarStock(i, -1)}
                        >
                          <CIcon icon={cilMinus} />
                        </CButton>
                        <span style={{ minWidth: '34px', textAlign: 'center' }}>
                          {i.stock ?? 0}
                        </span>
                        <CButton
                          size="sm"
                          className="p-1 border-0"
                          style={{
                            background: 'rgba(13,122,95,0.12)',
                            color: 'var(--pos-success)',
                          }}
                          disabled={!puedeEditar}
                          onClick={() => cambiarStock(i, 1)}
                        >
                          <CIcon icon={cilPlus} />
                        </CButton>
                      </div>
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom">
                      <CBadge color={i.activo === false ? 'secondary' : 'success'}>
                        {i.activo === false ? 'Inactivo' : 'Activo'}
                      </CBadge>
                    </CTableDataCell>
                    <CTableDataCell className="border-bottom">
                      {puedeEditar && (
                        <CButton
                          size="sm"
                          color="light"
                          className="border"
                          onClick={() => abrirEditar(i)}
                        >
                          <CIcon icon={cilPen} className="me-1" style={{ color: '#e55f0a' }} />
                          Editar
                        </CButton>
                      )}
                    </CTableDataCell>
                  </CTableRow>
                ))}
              </CTableBody>
            </CTable>
          </div>
        )}
      </CCardBody>

      <CModal visible={modalVisible} onClose={cerrarModal}>
        <CModalHeader onClose={cerrarModal}>
          <CModalTitle>{ingredienteSel ? 'Editar Ingrediente' : 'Nuevo Ingrediente'}</CModalTitle>
        </CModalHeader>
        <CForm onSubmit={guardar}>
          <CModalBody>
            <div className="mb-3">
              <CFormLabel>Nombre *</CFormLabel>
              <CFormInput name="name" value={f.name} onChange={handleChange} required />
            </div>
            <CRow>
              <CCol md={6} className="mb-3">
                <CFormLabel>Código</CFormLabel>
                <CFormInput name="sku" value={f.sku} onChange={handleChange} />
              </CCol>
              <CCol md={6} className="mb-3">
                <CFormLabel>Unidad base</CFormLabel>
                <CFormSelect name="id_unidad" value={f.id_unidad} onChange={handleChange}>
                  <option value="">—</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.abreviatura ? ` (${u.abreviatura})` : ''}
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            </CRow>
            <div className="mb-3">
              <CFormLabel>Descripción</CFormLabel>
              <CFormInput name="descripcion" value={f.descripcion} onChange={handleChange} />
            </div>
            <div className="mb-3">
              <CFormLabel>Costo de compra (Q)</CFormLabel>
              <CFormInput
                type="number"
                step="0.01"
                min="0"
                name="precio_compra"
                value={f.precio_compra}
                onChange={handleChange}
                placeholder="0.00"
              />
              <small className="text-body-secondary d-block mt-1">
                Se usa para el precio sugerido de las recetas de comida.
              </small>
            </div>
            <CFormSwitch label="Activo" name="activo" checked={f.activo} onChange={handleChange} />
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" type="button" onClick={cerrarModal}>
              Cancelar
            </CButton>
            <CButton color="primary" type="submit">
              {ingredienteSel ? 'Guardar Cambios' : 'Crear Ingrediente'}
            </CButton>
          </CModalFooter>
        </CForm>
      </CModal>
    </CCard>
  )
}

export default IngredientesPage
