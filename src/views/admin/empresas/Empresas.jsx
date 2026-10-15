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
} from '@coreui/react'
import EmpresasCard from './EmpresasCard'
import ModalEmpresas from './EmpreasModal'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
const Empresas = () => {
  const puedeCrear = usePermission('empresas', 'crear')
  const puedeEditar = usePermission('empresas', 'editar')
  const puedeEliminar = usePermission('empresas', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [empresas, setEmpresas] = useState([])
  const [modalVisible, setModalVisible] = useState(false)
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState(null)

  const cargarDatos = async () => {
    const { data } = await supabase.from('empresa').select('*')
    setEmpresas(data || [])
  }

  useEffect(() => {
    // Recarga al montar y cada vez que vuelve la red (offline-first).
    if (!enLinea) return
    setTimeout(() => cargarDatos(), 0)
  }, [enLinea])

  const handleCrear = () => {
    setEmpresaSeleccionada(null)
    setModalVisible(true)
  }

  const handleEditar = (empresa) => {
    setEmpresaSeleccionada(empresa)
    setModalVisible(true)
  }

  const handleEliminar = async (empresa) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede eliminar empresas sin conexión')
      return
    }
    await supabase.rpc('delete_empresa_admin', { p_id: empresa.id })
    cargarDatos()
  }

  const handleGuardar = async (datos) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede guardar empresas sin conexión')
      return { error: 'sin-conexion' }
    }
    if (currentUser?.id_rol?.name !== 'Admin') {
      showToast('danger', 'Sin permisos', 'No tienes permisos para realizar esta acción')
      return { error: 'sin-permisos' }
    }

    let resultado
    if (empresaSeleccionada) {
      resultado = await supabase.rpc('update_empresa_admin', {
        p_id: empresaSeleccionada.id,
        p_name: datos.name,
        p_activo: datos.activo,
      })
    } else {
      resultado = await supabase.rpc('create_empresa_admin', {
        p_name: datos.name,
        p_activo: datos.activo,
      })
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
      empresaSeleccionada ? 'Empresa editada correctamente' : 'Empresa creada correctamente',
    )
    return { ok: true }
  }

  const empresasFiltradas = empresas.filter((emp) =>
    emp.name?.toLowerCase().includes(busqueda.toLowerCase()),
  )

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Empresas</h5>
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
                <CIcon icon={cilPlus} className="me-2" /> Empresa
              </CButton>
            )}
          </CCol>
        </CRow>
      </CCardHeader>

      {!enLinea && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>
            Sin conexión. La gestión de empresas requiere el servidor: la lista puede estar vacía y
            las acciones están deshabilitadas hasta volver en línea.
          </span>
        </CAlert>
      )}

      <CCardBody>
        {empresasFiltradas.map((empresa) => (
          <EmpresasCard
            key={empresa.id}
            empresa={empresa}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onRecargar={cargarDatos}
            puedeEditar={puedeEditar && enLinea}
            puedeEliminar={puedeEliminar && enLinea}
          />
        ))}
      </CCardBody>
      <ModalEmpresas
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleGuardar}
        empresa={empresaSeleccionada}
      />
    </CCard>
  )
}

export default Empresas
