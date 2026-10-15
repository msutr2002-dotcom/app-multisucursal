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
import SucursalesCard from './SucursalesCard'
import ModalSucursales from './ModalSucursales'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'

const Sucursales = () => {
  const puedeCrear = usePermission('sucursales', 'crear')
  const puedeEditar = usePermission('sucursales', 'editar')
  const puedeEliminar = usePermission('sucursales', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [sucursales, setSucursales] = useState([])
  const [empresas, setEmpresas] = useState([])
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [sucursalSeleccionada, setSucursalSeleccionada] = useState(null)

  const cargarDatos = async () => {
    const { data: sucData } = await supabase.from('sucursal').select('*, id_empresa(*)')
    const { data: empData } = await supabase.from('empresa').select('*').eq('activo', true)
    setSucursales(sucData || [])
    setEmpresas(empData || [])
  }

  useEffect(() => {
    // Recarga al montar y cada vez que vuelve la red (offline-first).
    if (!enLinea) return
    setTimeout(() => cargarDatos(), 0)
  }, [enLinea])

  const handleCrear = () => {
    setSucursalSeleccionada(null)
    setModalVisible(true)
  }

  const handleEditar = (sucursal) => {
    setSucursalSeleccionada(sucursal)
    setModalVisible(true)
  }

  const handleEliminar = async (sucursal) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede eliminar sucursales sin conexión')
      return
    }
    await supabase.rpc('delete_sucursal_admin', { p_id: sucursal.id })
    cargarDatos()
  }

  const handleGuardar = async (datos) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede guardar sucursales sin conexión')
      return { error: 'sin-conexion' }
    }
    if (currentUser?.id_rol?.name !== 'Admin') {
      showToast('danger', 'Sin permisos', 'No tienes permisos para realizar esta acción')
      return { error: 'sin-permisos' }
    }

    let resultado
    if (sucursalSeleccionada) {
      resultado = await supabase.rpc('update_sucursal_admin', {
        p_id: sucursalSeleccionada.id,
        p_name: datos.name,
        p_id_empresa: datos.id_empresa,
        p_address: datos.address,
        p_tel: datos.tel,
        p_activo: datos.activo,
      })
      // RF-C2: el flag de venta sin stock se guarda con RPC aparte (los RPCs
      // de sucursal no lo aceptan); solo si cambió.
      if (
        !resultado.error &&
        Boolean(datos.vender_sin_stock) !== Boolean(sucursalSeleccionada.vender_sin_stock)
      ) {
        const resFlag = await supabase.rpc('set_sucursal_vender_sin_stock', {
          p_id: sucursalSeleccionada.id,
          p_valor: Boolean(datos.vender_sin_stock),
        })
        if (resFlag.error) resultado = resFlag
      }
      // Task 4: flag de ingredientes (modelo dual) — mismo patrón, solo si cambió.
      if (
        !resultado.error &&
        Boolean(datos.activar_ingredientes) !== Boolean(sucursalSeleccionada.activar_ingredientes)
      ) {
        const resFlagIng = await supabase.rpc('set_sucursal_activar_ingredientes', {
          p_id: sucursalSeleccionada.id,
          p_valor: Boolean(datos.activar_ingredientes),
        })
        if (resFlagIng.error) resultado = resFlagIng
      }
      // NIT fiscal: RPC aparte (los RPCs de sucursal no lo aceptan), solo si cambió.
      if (!resultado.error && (datos.nit || '') !== (sucursalSeleccionada.nit || '')) {
        const resNit = await supabase.rpc('set_sucursal_nit', {
          p_id: sucursalSeleccionada.id,
          p_nit: datos.nit || '',
        })
        if (resNit.error) resultado = resNit
      }
    } else {
      resultado = await supabase.rpc('create_sucursal_admin', {
        p_name: datos.name,
        p_id_empresa: datos.id_empresa,
        p_address: datos.address,
        p_tel: datos.tel,
        p_activo: datos.activo,
      })
      // NIT post-creación: el RPC no lo acepta; si devuelve el id, lo guardamos.
      if (!resultado.error && (datos.nit || '').trim()) {
        const r = resultado.data
        const idNuevo = typeof r === 'string' && r ? r : r?.id || r?.id_sucursal || null
        if (idNuevo) {
          const resNit = await supabase.rpc('set_sucursal_nit', { p_id: idNuevo, p_nit: datos.nit })
          if (resNit.error) resultado = resNit
        } else {
          console.warn('create_sucursal_admin no devolvió id: el NIT se guarda al editar')
        }
      }
    }

    // Se devuelve el resultado para que el modal no cierre ni anuncie éxito
    // cuando el RPC falló (antes siempre cerraba con "editada correctamente").
    if (resultado.error) {
      showToast('danger', 'Error', resultado.error.message)
      return { error: resultado.error.message }
    }

    setModalVisible(false)
    cargarDatos()
    showToast(
      'success',
      'Éxito',
      sucursalSeleccionada ? 'Sucursal editada correctamente' : 'Sucursal creada correctamente',
    )
    return { ok: true }
  }

  const sucursalesFiltradas = sucursales.filter((suc) => {
    const coincideBusqueda = suc.name?.toLowerCase().includes(busqueda.toLowerCase())
    const coincideEmpresa = !filtroEmpresa || suc.id_empresa?.id === filtroEmpresa
    return coincideBusqueda && coincideEmpresa
  })

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Sucursales</h5>
          </CCol>
        </CRow>
        <CRow className="align-items-center mb-2">
          <CCol xs={8} md={9}>
            <CFormInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar..."
            />
          </CCol>
          <CCol xs={4} md={3} className="d-flex justify-content-end">
            {puedeCrear && (
              <CButton
                className="text-nowrap"
                color="primary"
                onClick={handleCrear}
                disabled={!enLinea}
                title={enLinea ? undefined : 'Sin conexión: requiere el servidor'}
              >
                <CIcon icon={cilPlus} className="me-2" /> Sucursal
              </CButton>
            )}
          </CCol>
        </CRow>
        <CRow>
          <CCol xs={12} md={4}>
            <CFormSelect value={filtroEmpresa} onChange={(e) => setFiltroEmpresa(e.target.value)}>
              <option value="">Todas las empresas</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
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
            Sin conexión. La gestión de sucursales requiere el servidor: la lista puede estar vacía
            y las acciones están deshabilitadas hasta volver en línea.
          </span>
        </CAlert>
      )}

      <CCardBody>
        {sucursalesFiltradas.map((sucursal) => (
          <SucursalesCard
            key={sucursal.id}
            sucursal={sucursal}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onRecargar={cargarDatos}
            puedeEditar={puedeEditar && enLinea}
            puedeEliminar={puedeEliminar && enLinea}
          />
        ))}
      </CCardBody>
      <ModalSucursales
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleGuardar}
        sucursal={sucursalSeleccionada}
      />
    </CCard>
  )
}

export default Sucursales
