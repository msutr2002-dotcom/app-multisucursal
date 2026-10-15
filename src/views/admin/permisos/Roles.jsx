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
import RolesCard from './RolesCard'
import ModalRoles from './ModalRoles'
import ModalPermisos from './ModalPermisos'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'

const Roles = () => {
  const puedeCrear = usePermission('roles', 'crear')
  const puedeEditar = usePermission('roles', 'editar')
  const puedeEliminar = usePermission('roles', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [roles, setRoles] = useState([])
  const [modalRolVisible, setModalRolVisible] = useState(false)
  const [modalPermisosVisible, setModalPermisosVisible] = useState(false)
  const [rolSeleccionado, setRolSeleccionado] = useState(null)

  const handleCrear = () => {
    setRolSeleccionado(null)
    setModalRolVisible(true)
  }

  const cargarDatos = () => {
    // Estilo .then (no async/await en callee): react-hooks/set-state-in-effect
    // (v7) flaggea setStates alcanzables desde el effect con await; .then pasa.
    supabase.rpc('get_roles_con_permisos').then(({ data, error }) => {
      if (error) {
        showToast('danger', 'Error', error.message)
        setRoles([])
        return
      }
      setRoles(data || [])
    })
  }

  const handleEditar = (rol) => {
    setRolSeleccionado(rol)
    setModalRolVisible(true)
  }

  const handlePermisos = (rol) => {
    setRolSeleccionado(rol)
    setModalPermisosVisible(true)
  }

  const handleEliminar = async (rol) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede eliminar roles sin conexión')
      return { error: 'sin-conexion' }
    }
    const { error } = await supabase.rpc('delete_rol_admin', { p_id: rol.id })
    if (error) {
      showToast('danger', 'Error al eliminar', error.message)
      return { error: error.message }
    }
    showToast('success', 'Éxito', 'Rol eliminado correctamente')
    cargarDatos()
    return { ok: true }
  }

  const handleGuardar = async (datos) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede guardar roles sin conexión')
      return { error: 'sin-conexion' }
    }
    if (currentUser?.id_rol?.name !== 'Admin') {
      showToast('danger', 'Sin permisos', 'No tienes permisos para realizar esta acción')
      return { error: 'sin-permisos' }
    }

    let resultado
    if (rolSeleccionado) {
      resultado = await supabase.rpc('update_rol_admin', {
        p_id: rolSeleccionado.id,
        p_name: datos.name,
        p_descripcion: datos.descripcion,
      })
    } else {
      resultado = await supabase.rpc('create_rol_admin', {
        p_name: datos.name,
        p_descripcion: datos.descripcion,
      })
    }
    if (resultado.error) {
      showToast('danger', 'Error', resultado.error.message)
      return { error: resultado.error.message }
    }
    setModalRolVisible(false)
    cargarDatos()
    showToast(
      'success',
      'Éxito',
      rolSeleccionado ? 'Rol editado correctamente' : 'Rol creado correctamente',
    )
    return { ok: true }
  }

  useEffect(() => {
    // Recarga al montar y cada vez que vuelve la red (offline-first).
    if (!enLinea) return
    cargarDatos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])

  const rolesFiltrados = roles.filter((rol) =>
    rol.name?.toLowerCase().includes(busqueda.toLowerCase()),
  )

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Roles y Permisos</h5>
          </CCol>
        </CRow>
        <CRow className="align-items-center">
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
                <CIcon icon={cilPlus} className="me-2" /> Rol
              </CButton>
            )}
          </CCol>
        </CRow>
      </CCardHeader>

      {!enLinea && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>
            Sin conexión. La gestión de roles y permisos requiere el servidor: la lista puede estar
            vacía y las acciones están deshabilitadas hasta volver en línea.
          </span>
        </CAlert>
      )}

      <CCardBody>
        {rolesFiltrados.map((rol) => (
          <RolesCard
            key={rol.id}
            rol={rol}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onPermisos={handlePermisos}
            onRecargar={cargarDatos}
            puedeEditar={puedeEditar && enLinea}
            puedeEliminar={puedeEliminar && enLinea}
          />
        ))}
      </CCardBody>
      <ModalRoles
        visible={modalRolVisible}
        onClose={() => setModalRolVisible(false)}
        onSave={handleGuardar}
        rol={rolSeleccionado}
      />
      <ModalPermisos
        visible={modalPermisosVisible}
        onClose={() => setModalPermisosVisible(false)}
        rol={rolSeleccionado}
      />
    </CCard>
  )
}

export default Roles
