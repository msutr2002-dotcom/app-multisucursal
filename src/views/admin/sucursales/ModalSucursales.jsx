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
} from '@coreui/react'
import { supabase } from '../../../lib/supabase'

const ModalSucursales = ({ visible, onClose, onSave, sucursal }) => {
  const [formData, setFormData] = useState({
    name: '',
    id_empresa: '',
    address: '',
    nit: '',
    tel: '',
    activo: true,
    vender_sin_stock: false,
    activar_ingredientes: false,
  })
  const [empresas, setEmpresas] = useState([])

  const cargarEmpresas = async () => {
    const { data } = await supabase.from('empresa').select('*').eq('activo', true)
    setEmpresas(data || [])
  }

  useEffect(() => {
    if (!visible) return undefined
    // Diferido para no setear estado de forma síncrona dentro del efecto.
    const t = setTimeout(() => {
      cargarEmpresas()
      // La lista llega con `id_empresa(*)`: es un objeto, no el uuid.
      setFormData(
        sucursal
          ? {
              name: sucursal.name || '',
              id_empresa: sucursal.id_empresa?.id || '',
              address: sucursal.address || '',
              nit: sucursal.nit || '',
              tel: sucursal.tel || '',
              activo: sucursal.activo ?? true,
              vender_sin_stock: sucursal.vender_sin_stock ?? false,
              activar_ingredientes: sucursal.activar_ingredientes ?? false,
            }
          : {
              name: '',
              id_empresa: '',
              address: '',
              nit: '',
              tel: '',
              activo: true,
              vender_sin_stock: false,
              activar_ingredientes: false,
            },
      )
    }, 0)
    return () => clearTimeout(t)
  }, [visible, sucursal])

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
        <CModalTitle>{sucursal ? 'Editar Sucursal' : 'Nueva Sucursal'}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          <div className="mb-3">
            <CFormLabel>Nombre *</CFormLabel>
            <CFormInput name="name" value={formData.name} onChange={handleChange} required />
          </div>
          <div className="mb-3">
            <CFormLabel>Empresa *</CFormLabel>
            <CFormSelect
              name="id_empresa"
              value={formData.id_empresa}
              onChange={handleChange}
              required
            >
              <option value="">Seleccionar...</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </CFormSelect>
          </div>
          <div className="mb-3">
            <CFormLabel>Dirección</CFormLabel>
            <CFormInput name="address" value={formData.address} onChange={handleChange} />
          </div>
          <div className="mb-3">
            <CFormLabel>NIT</CFormLabel>
            <CFormInput
              name="nit"
              value={formData.nit}
              onChange={handleChange}
              placeholder="Ej. 1234567-8"
            />
          </div>
          <div className="mb-3">
            <CFormLabel>Teléfono</CFormLabel>
            <CFormInput name="tel" value={formData.tel} onChange={handleChange} />
          </div>
          <CFormSwitch
            label="Activa"
            name="activo"
            checked={formData.activo}
            onChange={handleChange}
          />
          <CFormSwitch
            label="Permitir venta sin stock (combos pueden quedar en negativo)"
            name="vender_sin_stock"
            checked={formData.vender_sin_stock}
            onChange={handleChange}
          />
          <CFormSwitch
            label="Activar ingredientes (negocio de comida)"
            name="activar_ingredientes"
            checked={formData.activar_ingredientes}
            onChange={handleChange}
          />
          <small className="text-body-secondary d-block mt-1">
            Si está activo, las recetas de combos usan ingredientes con stock propio en vez de
            productos.
          </small>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={onClose}>
            Cancelar
          </CButton>
          <CButton color="primary" type="submit">
            {sucursal ? 'Guardar Cambios' : 'Crear Sucursal'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ModalSucursales
