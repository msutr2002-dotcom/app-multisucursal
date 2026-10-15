import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilWarning } from '@coreui/icons'
import {
  CAlert,
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CFormInput,
  CRow,
  CCol,
  CFormSelect,
} from '@coreui/react'
import BodegasCard from './BodegasCard'
import ModalBodegas from './ModalBodegas'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'

const Bodegas = () => {
  const puedeCrear = usePermission('bodegas', 'crear')
  const puedeEditar = usePermission('bodegas', 'editar')
  const puedeEliminar = usePermission('bodegas', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [bodegas, setBodegas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [filtroSucursal, setFiltroSucursal] = useState(() => currentUser?.id_sucursal || '')
  const [modalVisible, setModalVisible] = useState(false)
  const [bodegaSeleccionada, setBodegaSeleccionada] = useState(null)

  const cargarSucursales = async () => {
    const { data } = await supabase.from('sucursal').select('*')
    setSucursales(data || [])
  }

  const cargarBodegas = async (idSuc) => {
    if (!idSuc) return
    const { data } = await supabase.rpc('get_bodegas', { p_id_sucursal: idSuc })
    setBodegas(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    if (!enLinea) return
    setTimeout(() => {
      cargarSucursales()
      if (filtroSucursal) cargarBodegas(filtroSucursal)
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])

  useEffect(() => {
    if (!enLinea || !filtroSucursal) return
    setTimeout(() => cargarBodegas(filtroSucursal), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroSucursal])

  const handleCrear = () => {
    setBodegaSeleccionada(null)
    setModalVisible(true)
  }

  const handleEditar = (bodega) => {
    setBodegaSeleccionada(bodega)
    setModalVisible(true)
  }

  const handleDesactivar = async (bodega) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede desactivar bodegas sin conexión')
      return { error: 'sin-conexion' }
    }
    const { error } = await supabase.rpc('update_bodega', {
      p_id: bodega.id,
      p_name: bodega.name,
      p_es_principal: bodega.es_principal,
      p_activa: false,
    })
    if (error) {
      showToast('danger', 'Error', error.message)
      return { error: error.message }
    }
    cargarBodegas(filtroSucursal)
    showToast('success', 'Éxito', 'Bodega desactivada correctamente')
    return { ok: true }
  }

  const handleGuardar = async (datos) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede guardar bodegas sin conexión')
      return { error: 'sin-conexion' }
    }
    if (currentUser?.id_rol?.name !== 'Admin') {
      showToast('danger', 'Sin permisos', 'No tienes permisos para realizar esta acción')
      return { error: 'sin-permisos' }
    }

    let resultado
    if (bodegaSeleccionada) {
      resultado = await supabase.rpc('update_bodega', {
        p_id: bodegaSeleccionada.id,
        p_name: datos.name,
        p_es_principal: Boolean(datos.es_principal),
        p_activa: Boolean(datos.activa),
      })
    } else {
      resultado = await supabase.rpc('create_bodega', {
        p_id_sucursal: filtroSucursal,
        p_name: datos.name,
        p_es_principal: Boolean(datos.es_principal),
      })
    }

    if (resultado.error) {
      showToast('danger', 'Error', resultado.error.message)
      return { error: resultado.error.message }
    }

    // El RPC devuelve {ok, mensaje} — verificar el flag de negocio
    const cuerpo = resultado.data
    if (cuerpo && cuerpo.ok === false) {
      showToast('danger', 'Error', cuerpo.mensaje || 'No se pudo guardar')
      return { error: cuerpo.mensaje }
    }

    setModalVisible(false)
    cargarBodegas(filtroSucursal)
    showToast(
      'success',
      'Éxito',
      bodegaSeleccionada ? 'Bodega editada correctamente' : 'Bodega creada correctamente',
    )
    return { ok: true }
  }

  const bodegasFiltradas = bodegas.filter((b) =>
    b.name?.toLowerCase().includes(busqueda.toLowerCase()),
  )

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Bodegas</h5>
          </CCol>
        </CRow>
        <CRow className="align-items-center mb-2">
          <CCol xs={8} md={9}>
            <CFormInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar bodega..."
            />
          </CCol>
          <CCol xs={4} md={3} className="d-flex justify-content-end">
            {puedeCrear && (
              <CButton
                className="text-nowrap"
                color="primary"
                onClick={handleCrear}
                disabled={!enLinea || !filtroSucursal}
                title={enLinea ? undefined : 'Sin conexión: requiere el servidor'}
              >
                <CIcon icon={cilPlus} className="me-2" /> Bodega
              </CButton>
            )}
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12} md={4}>
            <CFormSelect value={filtroSucursal} onChange={(e) => setFiltroSucursal(e.target.value)}>
              <option value="">Seleccionar sucursal</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </CFormSelect>
          </CCol>
        </CRow>
      </CCardHeader>

      {!enLinea && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>
            Sin conexión. La gestión de bodegas requiere el servidor: la lista puede estar vacía y
            las acciones están deshabilitadas hasta volver en línea.
          </span>
        </CAlert>
      )}

      <CCardBody>
        {!filtroSucursal && (
          <p className="text-body-secondary mb-0">Selecciona una sucursal para ver sus bodegas.</p>
        )}
        {filtroSucursal && bodegasFiltradas.length === 0 && (
          <p className="text-body-secondary mb-0">No hay bodegas registradas en esta sucursal.</p>
        )}
        {bodegasFiltradas.map((bodega) => (
          <BodegasCard
            key={bodega.id}
            bodega={bodega}
            onEditar={handleEditar}
            onDesactivar={handleDesactivar}
            puedeEditar={puedeEditar && enLinea}
            puedeEliminar={puedeEliminar && enLinea}
          />
        ))}
      </CCardBody>
      <ModalBodegas
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleGuardar}
        bodega={bodegaSeleccionada}
      />
    </CCard>
  )
}

export default Bodegas
