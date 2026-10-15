import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilWarning } from '@coreui/icons'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import { useToast } from '../../../components/common/ToastContext'
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
import UsuarioCard from './UsuariosCard'
import ModalUsuario from './ModalUsuarios'
const Usuarios = () => {
  const puedeCrear = usePermission('usuarios', 'crear')
  const puedeEditar = usePermission('usuarios', 'editar')
  const puedeEliminar = usePermission('usuarios', 'eliminar')
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const [empresas, setEmpresas] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [filtroEmpresa, setFiltroEmpresa] = useState('')
  const [filtroSucursal, setFiltroSucursal] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [roles, setRoles] = useState([])
  const [filtroRol, setFiltroRol] = useState('')
  const [modalVisible, setModalVisible] = useState(false)
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState(null)

  const handleCrear = () => {
    setUsuarioSeleccionado(null)
    setModalVisible(true)
  }
  const handleEditar = (usuario) => {
    setUsuarioSeleccionado(usuario)
    setModalVisible(true)
  }

  const handleEliminar = async (usuario) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede eliminar usuarios sin conexión')
      return false
    }
    const { error } = await supabase.rpc('delete_user_admin', { p_id: usuario.id })
    if (error) {
      console.error('error al eliminar usuario', error)
      showToast('danger', 'No se pudo eliminar', error.message)
      return false
    }
    cargarDatos()
    return true
  }
  const handleGuardar = async (datos) => {
    if (!enLinea) {
      showToast('danger', 'Sin conexión', 'No se puede guardar usuarios sin conexión')
      return { error: 'Sin conexión' }
    }
    if (currentUser?.id_rol?.name !== 'Admin') {
      showToast('danger', 'Sin permisos', 'No tienes permisos para crear usuarios')
      return { error: 'Sin permisos' }
    }
    if (!datos.id_rol) {
      showToast('danger', 'Falta el rol', 'Selecciona un rol antes de guardar')
      return { error: 'Selecciona un rol' }
    }
    if (!datos.id_sucursal) {
      showToast('danger', 'Falta la sucursal', 'Selecciona una sucursal antes de guardar')
      return { error: 'Selecciona una sucursal' }
    }

    let resultado
    if (usuarioSeleccionado) {
      resultado = await supabase.rpc('update_user_admin', {
        p_id: usuarioSeleccionado.id,
        p_name: datos.name,
        p_username: datos.username,
        p_email: datos.email,
        p_password: datos.password || null,
        p_id_rol: datos.id_rol,
        p_id_sucursal: datos.id_sucursal,
        p_activo: datos.activo,
      })
    } else {
      resultado = await supabase.rpc('create_user_admin', {
        p_name: datos.name,
        p_username: datos.username,
        p_email: datos.email,
        p_password: datos.password,
        p_id_rol: datos.id_rol,
        p_id_sucursal: datos.id_sucursal,
        p_activo: datos.activo,
      })
    }
    if (resultado.error) {
      console.error('error de supabase', resultado.error)
      showToast('danger', 'Error', resultado.error.message)
      return { error: resultado.error.message }
    }
    showToast(
      'success',
      'Éxito',
      `Usuario ${usuarioSeleccionado ? 'editado' : 'creado'} correctamente`,
    )
    setModalVisible(false)
    cargarDatos()
  }
  const cargarDatos = async () => {
    const { data: usuariosData } = await supabase
      .from('users')
      .select('*,id_rol(*),id_sucursal(*,id_empresa(*))')
    const { data: rolesData } = await supabase.from('roles').select('*')
    const { data: empresasData } = await supabase.from('empresa').select('*').eq('activo', true)
    const { data: sucData } = await supabase.from('sucursal').select('*').eq('activo', true)
    setUsuarios(usuariosData || [])
    setRoles(rolesData || [])
    setEmpresas(empresasData || [])
    setSucursales(sucData || [])
  }
  useEffect(() => {
    // Recarga al montar y cada vez que vuelve la red (offline-first).
    if (!enLinea) return
    cargarDatos()
  }, [enLinea])
  const sucursalesFiltradas = filtroEmpresa
    ? sucursales.filter((s) => s.id_empresa === filtroEmpresa)
    : sucursales
  const usuariosFiltrados = usuarios.filter((usuario) => {
    const coincideBusqueda =
      usuario.name?.toLowerCase().includes(busqueda.toLowerCase()) ||
      usuario.email?.toLowerCase().includes(busqueda.toLowerCase())
    const coincideRol = !filtroRol || usuario.id_rol?.id === filtroRol
    const coincideEmpresa = !filtroEmpresa || usuario.id_sucursal?.id_empresa?.id === filtroEmpresa
    const coincideSucursal = !filtroSucursal || usuario.id_sucursal?.id === filtroSucursal
    return coincideBusqueda && coincideRol && coincideEmpresa && coincideSucursal
  })

  const handleEmpresaChange = (e) => {
    setFiltroEmpresa(e.target.value)
    setFiltroSucursal('')
  }

  return (
    <>
      <CCard>
        <CCardHeader>
          <CRow className="align-items-center mb-2">
            <CCol xs={12} md={6}>
              <h5 className="mb-0">Gestión de usuarios</h5>
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
                  <CIcon icon={cilPlus} className="me-2" />
                  Usuario
                </CButton>
              )}
            </CCol>
          </CRow>

          <CRow className="g-2">
            <CCol xs={6} md={4}>
              <CFormSelect value={filtroEmpresa} onChange={handleEmpresaChange}>
                <option value="">Empresas</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={6} md={4}>
              <CFormSelect
                value={filtroSucursal}
                onChange={(e) => setFiltroSucursal(e.target.value)}
                disabled={!filtroEmpresa}
              >
                <option value="">Sucursales</option>
                {sucursalesFiltradas.map((suc) => (
                  <option key={suc.id} value={suc.id}>
                    {suc.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={12} md={4}>
              <CFormSelect value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
                <option value={''}>Todos</option>
                {roles.map((rol) => (
                  <option key={rol.id} value={rol.id}>
                    {rol.name}{' '}
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
              Sin conexión. La gestión de usuarios requiere el servidor: la lista puede estar vacía
              y las acciones están deshabilitadas hasta volver en línea.
            </span>
          </CAlert>
        )}

        <CCardBody>
          {usuariosFiltrados.map((usuario) => (
            <UsuarioCard
              key={usuario.id}
              usuario={usuario}
              onEditar={handleEditar}
              onEliminar={handleEliminar}
              onRecargar={cargarDatos}
              showToast={showToast}
              puedeEditar={puedeEditar && enLinea}
              puedeEliminar={puedeEliminar && enLinea}
            />
          ))}
        </CCardBody>
        <ModalUsuario
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          onSave={handleGuardar}
          usuario={usuarioSeleccionado}
        />
      </CCard>
    </>
  )
}
export default Usuarios
