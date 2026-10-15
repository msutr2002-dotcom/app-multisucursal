import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import bcrypt from 'bcryptjs'
import {
  CButton,
  CCol,
  CForm,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CInputGroupText,
  CInputGroup,
  CTooltip,
  CAlert,
  CSpinner,
  CToast,
  CToastBody,
  CToastHeader,
  CToaster,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'

import { eye } from 'src/assets/icons/eye'
import {
  hidratarCatalogoParaSucursal,
  hidratarClientes,
} from '../../../services/catalogSyncService'
import { marcarActividad } from '../../../services/sesionService'

const Login = () => {
  const [empresa, setEmpresa] = useState(() => {
    return localStorage.getItem('empresaSeleccionada') || ''
  })
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState('')
  const [toast, setToast] = useState(null)
  const [empresas, setEmpresas] = useState([])
  const [alertType, setAlertType] = useState('danger')
  const [showPassword, setShowPassword] = useState(false)
  const toaster = useRef()
  useEffect(() => {
    const cargarEmpresas = async () => {
      const { data } = await supabase.from('empresa').select('*').eq('activo', true)
      setEmpresas(data || [])
    }
    cargarEmpresas()
  }, [])

  const heandleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // Candidatos por username (mismo username permitido en distintas sucursales,
    // UNIQUE compuesto (id_sucursal, username)). Nota: id_sucursal se anida como
    // objeto {id, id_empresa}; el UUID queda en id_sucursal.id. Búsqueda
    // case-insensitive: se escapan los comodines de ILIKE del input del usuario.
    const usuarioBuscado = username.trim().replace(/[\\%_]/g, '\\$&')
    const { data: userCandidates, error: userError } = await supabase
      .from('users')
      .select('*, id_sucursal(id, id_empresa, name)')
      .ilike('username', usuarioBuscado)

    if (userError) {
      setAlertType('danger')
      setError('Error al buscar usuario. Intente nuevamente')
      setLoading(false)
      return
    }

    if (!userCandidates || userCandidates.length === 0) {
      setAlertType('danger')
      setError('Usuario no encontrado. Verifique el usuario')
      setLoading(false)
      return
    }

    // Contraseña válida en alguno de los candidatos (pueden diferir entre sucursales)
    const candidatosOk = []
    for (const candidato of userCandidates) {
      if (await bcrypt.compare(password, candidato.password)) candidatosOk.push(candidato)
    }
    if (candidatosOk.length === 0) {
      setAlertType('danger')
      setError('Contraseña incorrecta')
      setLoading(false)
      return
    }

    const rolIds = [...new Set(candidatosOk.map((u) => u.id_rol))]
    const { data: rolesCands } = await supabase.from('roles').select('id,name').in('id', rolIds)
    const rolMap = (rolesCands || []).reduce((acc, r) => ({ ...acc, [r.id]: r }), {})
    const candidatosConRol = candidatosOk.map((u) => ({ ...u, rol: rolMap[u.id_rol] }))

    // Resolver candidato:
    // 1) Con empresa seleccionada → el de esa empresa.
    // 2) Si no coincide (o sin empresa) → un Admin, que ingresa con cualquier empresa.
    let userData = empresa
      ? candidatosConRol.find((c) => c.id_sucursal?.id_empresa === empresa)
      : null
    if (!userData) {
      userData = candidatosConRol.find((c) => c.rol?.name === 'Admin')
    }
    if (!userData) {
      setAlertType('warning')
      setError(
        empresa
          ? 'No pertenece a esta empresa. Seleccione la empresa correcta'
          : 'Debe seleccionar una empresa para continuar',
      )
      setLoading(false)
      return
    }

    const rolData = userData.rol
    // El select anidó id_sucursal: recuperar el UUID plano y el nombre para la sesión.
    const sucursalId = userData.id_sucursal?.id ?? userData.id_sucursal ?? null
    const sucursalNombre =
      typeof userData.id_sucursal === 'object' && userData.id_sucursal
        ? userData.id_sucursal.name
        : null

    const currentUser = {
      id: userData.id,
      name: userData.name,
      username: userData.username,
      email: userData.email,
      id_rol: rolData,
      id_sucursal: sucursalId,
      sucursalName: sucursalNombre,
    }

    const isAdmin = rolData?.name === 'Admin'
    localStorage.setItem('currentUser', JSON.stringify(currentUser))
    // Reinicia el reloj de inactividad: evita que una marca vieja de una
    // sesión previa cierre esta sesión recién iniciada (specs/sesion-inactividad.md).
    marcarActividad()

    const welcomeToast = (
      <CToast autohide={true} visible={true} color="primary">
        <CToastHeader closeButton>
          <strong className="me-auto">Bienvenido</strong>
        </CToastHeader>
        <CToastBody>Sesion iniciada correctamente. Redirigiendo...</CToastBody>
      </CToast>
    )
    setToast(welcomeToast)

    // Offline-First: copia el catálogo a IndexedDB en segundo plano (no bloquea el ingreso)
    if (currentUser.id_sucursal) {
      hidratarCatalogoParaSucursal(currentUser.id_sucursal).catch((err) =>
        console.warn('No se pudo hidratar el catálogo local:', err),
      )
    }
    // Clientes: espejo local por sucursal (heredados incluidos) para el
    // datalist del POS y la lectura offline de ClientesPage
    if (empresa && currentUser.id_sucursal) {
      hidratarClientes(empresa, currentUser.id_sucursal).catch((err) =>
        console.warn('No se pudieron hidratar los clientes:', err),
      )
    }

    setTimeout(() => {
      navigate(isAdmin ? '/admin-dashboard' : '/dashboard', { replace: true })
    }, 1500)
  }

  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    localStorage.removeItem('empresaSeleccionada')
    navigate('/login')
  }
  return (
    <div className="login">
      <aside className="login-panel">
        <div>
          <div className="login-mark">Punto de Venta</div>
          <p className="login-tagline">Ventas, inventario y reportes de la librería.</p>
        </div>
        <span className="login-q" aria-hidden="true">
          Q
        </span>
      </aside>

      <main className="login-body">
        <div className="login-form">
          <h1 className="h4 mb-1">Ingresar</h1>
          <p className="text-body-secondary mb-4">
            Elige la empresa con la que vas a trabajar hoy.
          </p>

          {error && (
            <CAlert color={alertType} dismissible onClose={() => setError('')}>
              {error}
            </CAlert>
          )}

          <CForm className="row gy-3" onSubmit={heandleLogin}>
            <CCol xs={12}>
              <CFormLabel htmlFor="email">Usuario</CFormLabel>
              <CFormInput
                id="email"
                type="text"
                placeholder="Ej. Juan"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </CCol>
            <CCol xs={12}>
              <CFormLabel htmlFor="password">Contraseña</CFormLabel>
              <CInputGroup>
                <CFormInput
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Tu contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <CInputGroupText>
                  <CTooltip content={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                    <CButton
                      type="button"
                      color="secondary"
                      variant="outline"
                      aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      <CIcon icon={eye} size="sm" />
                    </CButton>
                  </CTooltip>
                </CInputGroupText>
              </CInputGroup>
            </CCol>
            <CCol xs={12}>
              <CFormLabel htmlFor="empresa">Empresa</CFormLabel>
              <CFormSelect
                id="empresa"
                value={empresa}
                disabled={!!loading}
                onChange={(e) => {
                  setEmpresa(e.target.value)
                  localStorage.setItem('empresaSeleccionada', e.target.value)
                }}
              >
                <option value="">Selecciona tu empresa</option>
                {empresas.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={12}>
              <CButton
                data-testid="btn-login"
                color="primary"
                type="submit"
                className="w-100"
                size="lg"
                disabled={!!loading}
                aria-busy={!!loading}
              >
                {loading ? (
                  <>
                    <CSpinner size="sm" className="me-2" />
                    Ingresando...
                  </>
                ) : (
                  'Ingresar'
                )}
              </CButton>
            </CCol>
          </CForm>

          <CToaster ref={toaster} push={toast} placement="top-end" />
        </div>
      </main>
    </div>
  )
}

export default Login
