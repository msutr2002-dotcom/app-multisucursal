import { useState, useEffect } from 'react'
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
  CFormCheck,
} from '@coreui/react'

const ModalBodegas = ({ visible, onClose, onSave, bodega }) => {
  const [formData, setFormData] = useState({ name: '', es_principal: false, activa: true })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!visible) return
    setTimeout(() => {
      setFormData(
        bodega
          ? {
              name: bodega.name || '',
              es_principal: Boolean(bodega.es_principal),
              activa: bodega.activa !== false,
            }
          : { name: '', es_principal: false, activa: true },
      )
    }, 0)
  }, [visible, bodega])

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) return
    setGuardando(true)
    try {
      const resultado = await onSave(formData)
      if (!resultado?.error) onClose()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader onClose={onClose}>
        <CModalTitle>{bodega ? 'Editar Bodega' : 'Nueva Bodega'}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <CForm onSubmit={handleSubmit}>
          <div className="mb-3">
            <CFormLabel htmlFor="bodega-name">Nombre</CFormLabel>
            <CFormInput
              id="bodega-name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Ej: Principal, Trasera, Vitrina"
              required
              autoFocus
            />
          </div>
          <CFormCheck
            id="bodega-principal"
            name="es_principal"
            label="Bodega Principal"
            checked={formData.es_principal}
            onChange={handleChange}
            className="mb-2"
          />
          <small className="text-body-secondary d-block mb-3">
            Solo puede haber una bodega Principal por sucursal. El POS usa la Principal por defecto.
          </small>
          {bodega && (
            <CFormCheck
              id="bodega-activa"
              name="activa"
              label="Activa"
              checked={formData.activa}
              onChange={handleChange}
            />
          )}
        </CForm>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={onClose}>
          Cancelar
        </CButton>
        <CButton
          color="primary"
          onClick={handleSubmit}
          disabled={guardando || !formData.name.trim()}
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalBodegas
