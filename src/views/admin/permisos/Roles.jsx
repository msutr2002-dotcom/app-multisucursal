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
  CSpinner,
  CRow,
  CCol,
} from '@coreui/react'
import RolesCard from './RolesCard'
import ModalRoles from './ModalRoles'
import ModalPermisos from './ModalPermisos'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import { ACCIONES } from './modulosPermisos'

const Roles = () => {
  const puedeCrear = usePermission('roles', 'crear')
  const puedeEditar = usePermission('roles', 'editar')
  const puedeEliminar = usePermission('roles', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [roles, setRoles] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
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
    setCargando(true)
    setError(null)
    supabase.rpc('get_roles_con_permisos').then(({ data, error }) => {
      if (error) {
        setError(error.message)
        showToast('danger', 'Error', error.message)
        setRoles([])
        setCargando(false)
        return
      }
      setRoles(data || [])
      setCargando(false)
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
    // diferido con setTimeout: react-hooks v7 prohíbe setState síncrono dentro
    // del effect (cargarDatos ahora hace setCargando/setError)
    const t = setTimeout(() => cargarDatos(), 0)
    return () => clearTimeout(t)
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
              placeholder="Buscar rol..."
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
                <CIcon icon={cilPlus} className="me-2" /> Nuevo rol
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
        {cargando && roles.length === 0 && (
          <div className="text-center text-body-secondary py-4">
            <CSpinner size="sm" className="me-2" />
            Cargando roles…
          </div>
        )}
        {!cargando && error && (
          <CAlert
            color="danger"
            className="d-flex align-items-center justify-content-between gap-2"
          >
            <span>No se pudieron cargar los roles: {error}</span>
            <CButton color="danger" size="sm" variant="outline" onClick={cargarDatos}>
              Reintentar
            </CButton>
          </CAlert>
        )}
        {!cargando && !error && enLinea && rolesFiltrados.length === 0 && (
          <p className="text-body-secondary text-center py-4 mb-0">
            {roles.length === 0
              ? 'No hay roles registrados.'
              : `Sin resultados para «${busqueda}».`}
          </p>
        )}
        {rolesFiltrados.length > 0 && (
          <div className="d-flex flex-wrap align-items-center gap-3 small text-body-secondary mb-3">
            <span>Permisos:</span>
            {ACCIONES.map((a) => (
              <span key={a.key} className="d-inline-flex align-items-center gap-1">
                <span className="roles-perm-dot bg-primary text-white">{a.letra}</span>
                {a.label}
              </span>
            ))}
          </div>
        )}
        {rolesFiltrados.map((rol) => (
          <RolesCard
            key={rol.id}
            rol={rol}
            onEditar={handleEditar}
            onEliminar={handleEliminar}
            onPermisos={handlePermisos}
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
        onClose={() => {
          // Refresca las tarjetas: al guardar permisos, la vista debe reflejar
          // el nuevo estado (si no, los puntos quedan viejos — P1 del critique).
          setModalPermisosVisible(false)
          cargarDatos()
        }}
        rol={rolSeleccionado}
      />
    </CCard>
  )
}

export default Roles
