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
import { useToast } from '../../../components/common/ToastContext'

const NOMBRES = {
  marcas: 'Marca',
  categorias: 'Categoría',
  proveedores: 'Proveedor',
  unidades: 'Unidad',
  tipos_precio: 'Tipo de Precio',
  colores: 'Color',
}

const vacio = {
  name: '',
  address: '',
  email: '',
  tel: '',
  abreviatura: '',
  equivalencia: '',
  activo: true,
}

const ModalCatalogo = ({ visible, onClose, onSave, tipo, item }) => {
  const showToast = useToast()
  const [f, setF] = useState(vacio)

  useEffect(() => {
    if (!visible) return
    setF({
      name: item?.name || '',
      address: item?.address || '',
      email: item?.email || '',
      tel: item?.tel || '',
      abreviatura: item?.abreviatura || '',
      equivalencia: item?.equivalencia != null ? String(item.equivalencia) : '',
      activo: item?.activo ?? true,
    })
  }, [visible, item])

  const handleChange = (e) => {
    const { name, value } = e.target
    setF((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const campos = { name: f.name }

    if (tipo === 'proveedores') {
      campos.address = f.address
      campos.email = f.email
      campos.tel = f.tel
    }
    if (tipo === 'unidades') {
      campos.abreviatura = f.abreviatura
      campos.equivalencia = f.equivalencia
      campos.activo = f.activo
    }

    const resultado = await onSave(campos, item)
    if (resultado?.error) {
      showToast('danger', 'Error', resultado.error)
    } else {
      showToast('success', 'Éxito', item ? 'Guardado correctamente' : `${NOMBRES[tipo]} creada`)
      onClose()
    }
  }

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader onClose={onClose}>
        <CModalTitle>{item ? `Editar ${NOMBRES[tipo]}` : `Nueva ${NOMBRES[tipo]}`}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          <div className="mb-3">
            <CFormLabel>Nombre *</CFormLabel>
            <CFormInput name="name" value={f.name} onChange={handleChange} required autoFocus />
          </div>

          {tipo === 'proveedores' && (
            <>
              <div className="mb-3">
                <CFormLabel>Dirección</CFormLabel>
                <CFormInput name="address" value={f.address} onChange={handleChange} />
              </div>
              <div className="mb-3">
                <CFormLabel>Correo</CFormLabel>
                <CFormInput type="email" name="email" value={f.email} onChange={handleChange} />
              </div>
              <div className="mb-3">
                <CFormLabel>Teléfono</CFormLabel>
                <CFormInput name="tel" value={f.tel} onChange={handleChange} />
              </div>
            </>
          )}

          {tipo === 'unidades' && (
            <>
              <div className="mb-3">
                <CFormLabel>Abreviatura</CFormLabel>
                <CFormInput
                  name="abreviatura"
                  value={f.abreviatura}
                  onChange={handleChange}
                  placeholder="UNI"
                />
              </div>
              <div className="mb-3">
                <CFormLabel>Equivalencia</CFormLabel>
                <CFormInput
                  type="number"
                  min="1"
                  name="equivalencia"
                  value={f.equivalencia}
                  onChange={handleChange}
                />
              </div>
              <CFormSwitch
                label="Activa"
                checked={f.activo}
                onChange={(e) => setF((prev) => ({ ...prev, activo: e.target.checked }))}
              />
            </>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" type="button" onClick={onClose}>
            Cancelar
          </CButton>
          <CButton color="primary" type="submit">
            {item ? 'Guardar Cambios' : 'Crear'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ModalCatalogo
