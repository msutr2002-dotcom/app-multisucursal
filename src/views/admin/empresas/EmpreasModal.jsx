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
  CFormSwitch,
} from '@coreui/react'
import { supabase } from '../../../lib/supabase'

const ModalEmpresas = ({ visible, onClose, onSave, empresa }) => {
  const [formData, setFormData] = useState({
    name: '',
    activo: true,
  })

  useEffect(() => {
    if (!visible) return undefined
    // Diferido para no setear estado de forma síncrona dentro del efecto.
    const t = setTimeout(() => {
      setFormData(
        empresa
          ? { name: empresa.name || '', activo: empresa.activo ?? true }
          : { name: '', activo: true },
      )
    }, 0)
    return () => clearTimeout(t)
  }, [visible, empresa])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
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
        <CModalTitle>{empresa ? 'Editar Empresa' : 'Nueva Empresa'}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          <div className="mb-3">
            <CFormLabel>Nombre</CFormLabel>
            <CFormInput
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Nombre de la empresa"
            />
          </div>
          <CFormSwitch
            label="Activa"
            name="activo"
            checked={formData.activo}
            onChange={handleChange}
          />
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={onClose}>
            Cancelar
          </CButton>
          <CButton color="primary" type="submit">
            {empresa ? 'Guardar Cambios' : 'Crear Empresa'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ModalEmpresas
