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
  CFormTextarea,
} from '@coreui/react'

const ModalRoles = ({ visible, onClose, onSave, rol }) => {
  const [formData, setFormData] = useState({ name: '', descripcion: '' })

  useEffect(() => {
    if (!visible) return undefined
    // set-state-in-effect (eslint v7): el reset se difiere al próximo tick,
    // mismo patrón que Catalogos/useNavPermissions en este repo.
    const timer = setTimeout(() => {
      setFormData(
        rol
          ? { name: rol.name || '', descripcion: rol.descripcion || '' }
          : { name: '', descripcion: '' },
      )
    }, 0)
    return () => clearTimeout(timer)
  }, [visible, rol])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    // El toast (éxito o error) y el cierre los administra el contenedor; aquí
    // solo se cierra si el guardado realmente funcionó.
    const resultado = await onSave(formData)
    if (!resultado?.error) onClose()
  }

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader onClose={onClose}>
        <CModalTitle>{rol ? 'Editar Rol' : 'Nuevo Rol'}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          <div className="mb-3">
            <CFormLabel>Nombre *</CFormLabel>
            <CFormInput name="name" value={formData.name} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <CFormLabel>Descripción</CFormLabel>
            <CFormTextarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={3}
            />
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={onClose}>
            Cancelar
          </CButton>
          <CButton color="primary" type="submit">
            {rol ? 'Guardar Cambios' : 'Crear Rol'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ModalRoles
