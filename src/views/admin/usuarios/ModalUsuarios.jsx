import React, { useState, useEffect } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CForm,
  CFormLabel,
  CFormInput,
  CFormSelect,
  CFormSwitch,
  CRow,
  CCol,
  CInputGroup,
  CInputGroupText,
} from '@coreui/react'
import { supabase } from '../../../lib/supabase'
import bcrypt from 'bcryptjs'
import { cilLockLocked, cilLockUnlocked } from '@coreui/icons'
import CIcon from '@coreui/icons-react'

const ModalUsuario = ({ visible, onClose, onSave, usuario }) => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    id_rol: '',
    id_sucursal: '',
    activo: true,
  })
  const [roles, setRoles] = useState([])
  const [sucursales, setSucursales] = useState([])
  const [mostrarPassword, setMostrarPassword] = useState(false)

  //cargar los roles y sucursales
  useEffect(() => {
    if (visible) {
      setMostrarPassword()
      cargarDropdowns()
      if (usuario) {
        setFormData({
          name: usuario.name || '',
          username: usuario.username || '',
          email: usuario.email || '',
          password: '',
          id_rol: usuario.id_rol?.id || '',
          id_sucursal: usuario.id_sucursal?.id || '',
          activo: usuario.activo ?? true,
        })
      } else {
        setFormData({
          name: '',
          username: '',
          email: '',
          password: '',
          id_rol: '',
          id_sucursal: '',
          activo: true,
        })
      }
    }
  }, [visible, usuario])

  const cargarDropdowns = async () => {
    const { data: rolesData } = await supabase.from('roles').select('*')
    const { data: sucData } = await supabase.from('sucursal').select('*')
    setRoles(rolesData || [])
    setSucursales(sucData || [])
  }
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'username' ? { email: `${value}@auth.local` } : {}),
    }))
  }
  const handleSubmit = async (e) => {
    e.preventDefault()

    // si es creacion y hay password ,hasher

    let datosAGuardar = { ...formData }
    if (!usuario && formData.password) {
      datosAGuardar.password = await bcrypt.hash(formData.password, 10)
    } else if (usuario && formData.password) {
      datosAGuardar.password = await bcrypt.hash(formData.password, 10)
    } else if (usuario && !formData.password) {
      datosAGuardar.password = null
    }

    const resultado = await onSave(datosAGuardar)
    if (!resultado?.error) onClose()
  }

  return (
    <>
      <CModal visible={visible} onClose={onClose}>
        <CModalHeader onClose={onClose}>
          <CModalTitle>{usuario ? 'Editar Usuario' : 'Nuevo Usuario'}</CModalTitle>
        </CModalHeader>
        <CForm onSubmit={handleSubmit}>
          <CModalBody>
            {/**fila 1: nombre y usuario */}
            <CRow>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>Nombre Completo</CFormLabel>
                  <CFormInput name="name" value={formData.name} onChange={handleChange} required />
                </div>
              </CCol>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>Usuario</CFormLabel>
                  <CFormInput
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    required
                  />
                </div>
              </CCol>
            </CRow>
            {/**fila 2: Email y Contreseña */}
            <CRow>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>Email</CFormLabel>
                  <CFormInput
                    name="email"
                    type="email"
                    value={formData.email}
                    readOnly={!usuario}
                    placeholder={usuario ? '' : 'se genera automaticamente'}
                    onChange={handleChange}
                    required
                  />
                </div>
              </CCol>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>
                    {usuario
                      ? mostrarPassword
                        ? 'Contraseña actual (hash)'
                        : 'Nueva contraseña (vacío = no cambia)'
                      : 'Contraseña'}
                  </CFormLabel>
                  <CInputGroup>
                    <CFormInput
                      name="password"
                      type={mostrarPassword ? 'text' : 'password'}
                      value={
                        mostrarPassword
                          ? usuario
                            ? usuario.password
                            : formData.password
                          : formData.password
                      }
                      onChange={handleChange}
                      required={!usuario}
                      readOnly={mostrarPassword && !!usuario}
                      placeholder={usuario ? 'Dejar vacío para no cambiar' : ''}
                    />
                    <CInputGroupText>
                      <CButton
                        color="ghost"
                        size="sm"
                        onClick={() => setMostrarPassword(!mostrarPassword)}
                      >
                        <CIcon icon={mostrarPassword ? cilLockLocked : cilLockUnlocked} />
                      </CButton>
                    </CInputGroupText>
                  </CInputGroup>
                </div>
              </CCol>
            </CRow>
            {/**fila 3: Rol y Sucursal */}
            <CRow>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>Rol</CFormLabel>
                  <CFormSelect
                    name="id_rol"
                    value={formData.id_rol}
                    onChange={handleChange}
                    required
                  >
                    <option value="">seleccionar...</option>
                    {roles.map((rol) => (
                      <option key={rol.id} value={rol.id}>
                        {rol.name}
                      </option>
                    ))}
                  </CFormSelect>
                </div>
              </CCol>
              <CCol xs={12} md={6}>
                <div className="mb-3">
                  <CFormLabel>Sucursal</CFormLabel>
                  <CFormSelect
                    name="id_sucursal"
                    value={formData.id_sucursal}
                    onChange={handleChange}
                    required
                  >
                    <option value="">seleccionar...</option>
                    {sucursales.map((suc) => (
                      <option key={suc.id} value={suc.id}>
                        {suc.name}
                      </option>
                    ))}
                  </CFormSelect>
                </div>
              </CCol>
            </CRow>
            {/**fila 4: Activo */}
            <div className="mb-3">
              <CFormSwitch
                label="Activo"
                name="activo"
                checked={formData.activo}
                onChange={handleChange}
              />
            </div>
          </CModalBody>
          <CModalFooter>
            <CButton color="secondary" onClick={onClose}>
              Cancelar
            </CButton>
            <CButton color="primary" type="submit">
              {usuario ? 'Guardar Cambios' : 'Crear Usuario'}
            </CButton>
          </CModalFooter>
        </CForm>
      </CModal>
    </>
  )
}
export default ModalUsuario
