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
  CRow,
  CCol,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilPlus } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import { formatQ } from '../../../utils/format'
import { useToast } from '../../../components/common/ToastContext'

const vacio = {
  id: null,
  id_tipo_producto: '',
  precio: '',
  min_cantidad: '1',
  id_unidad_venta: '',
  factor: '1',
}

const ModalPrecios = ({ visible, onClose, producto, tiposPrecio, unidades, onCambio }) => {
  const showToast = useToast()
  const [n, setN] = useState(vacio)
  const [guardando, setGuardando] = useState(false)
  const [errorFactor, setErrorFactor] = useState('')

  useEffect(() => {
    if (!visible) return undefined
    // Diferido para no setear estado de forma síncrona dentro del efecto.
    const t = setTimeout(() => {
      setN(vacio)
      setErrorFactor('')
    }, 0)
    return () => clearTimeout(t)
  }, [visible])

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'id_unidad_venta') {
      // auto-fill: al elegir unidad se siembra su equivalencia como factor
      const u = (unidades || []).find((x) => x.id === value)
      setN((prev) => ({
        ...prev,
        id_unidad_venta: value,
        factor: value ? String(u?.equivalencia >= 1 ? u.equivalencia : 1) : '1',
      }))
      setErrorFactor('')
      return
    }
    if (name === 'factor') setErrorFactor('')
    setN((prev) => ({ ...prev, [name]: value }))
  }

  const editar = (tier) =>
    setN({
      id: tier.id,
      id_tipo_producto: tier.id_tipo_producto,
      precio: (tier.precio / 100).toFixed(2),
      min_cantidad: String(tier.min_cantidad),
      id_unidad_venta: tier.id_unidad_venta || '',
      factor: String(tier.factor ?? 1),
    })

  const guardar = async (e) => {
    e.preventDefault()
    const factorTxt = String(n.factor ?? '').trim()
    if (n.id_unidad_venta && (!/^\d+$/.test(factorTxt) || parseInt(factorTxt, 10) < 1)) {
      setErrorFactor('Debe ser un entero ≥ 1 (unidades base por 1 unidad)')
      return
    }
    setErrorFactor('')
    setGuardando(true)
    const { error } = await supabase.rpc('upsert_precio_producto', {
      p_id: n.id,
      p_id_producto: producto.id,
      p_id_tipo_producto: n.id_tipo_producto,
      p_precio: Math.round(parseFloat(n.precio || 0) * 100),
      p_min_cantidad: parseInt(n.min_cantidad, 10) || 1,
      p_id_unidad_venta: n.id_unidad_venta || null,
      p_factor: n.id_unidad_venta ? parseInt(factorTxt, 10) : 1,
    })
    setGuardando(false)
    if (error) {
      showToast('danger', 'Error', error.message)
    } else {
      showToast('success', 'Éxito', n.id ? 'Precio actualizado' : 'Precio agregado')
      setN(vacio)
      onCambio()
    }
  }

  const eliminar = async (tier) => {
    const { error } = await supabase.rpc('delete_precio_producto', { p_id: tier.id })
    if (error) {
      showToast('danger', 'Error', error.message)
    } else {
      showToast('success', 'Éxito', 'Precio eliminado')
      onCambio()
    }
  }

  const precios = producto?.precios || []
  // Unidad elegida en el formulario + factor numérico para la etiqueta dinámica
  const unidadSel = (unidades || []).find((u) => u.id === n.id_unidad_venta) || null
  const factorNum = parseInt(n.factor, 10) || 0

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader onClose={onClose}>
        <CModalTitle>Precios — {producto?.name}</CModalTitle>
      </CModalHeader>

      <CModalBody>
        {/* Lista */}
        {precios.length === 0 ? (
          <p className="text-body-secondary small">Este producto no tiene precios.</p>
        ) : (
          <div className="mb-3">
            {precios.map((t) => {
              const uTier = (unidades || []).find((u) => u.id === t.id_unidad_venta)
              return (
                <div
                  key={t.id}
                  className="d-flex justify-content-between align-items-center border-bottom py-2 small"
                >
                  <span>
                    <strong>{t.tipo}</strong> · desde {t.min_cantidad}
                    {uTier ? ` ${uTier.name}` : ''}
                    {(t.factor ?? 1) > 1 ? ` (x${t.factor} und)` : ''}{' '}
                    <span className="text-body-secondary monto">({formatQ(t.precio)})</span>
                  </span>
                  <span>
                    <CButton size="sm" color="link" className="p-1" onClick={() => editar(t)}>
                      <CIcon icon={cilPen} />
                    </CButton>
                    <CButton
                      size="sm"
                      color="link"
                      className="text-danger p-1"
                      onClick={() => eliminar(t)}
                    >
                      <CIcon icon={cilTrash} />
                    </CButton>
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Formulario alta/edición */}
        <CForm onSubmit={guardar}>
          <CRow>
            <CCol xs={5} className="mb-2">
              <CFormLabel className="small">Tipo de precio</CFormLabel>
              <CFormSelect
                name="id_tipo_producto"
                value={n.id_tipo_producto}
                onChange={handleChange}
                required
                size="sm"
              >
                <option value="">Seleccionar...</option>
                {(tiposPrecio || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={3} className="mb-2">
              <CFormLabel className="small">Desde</CFormLabel>
              <CFormInput
                type="number"
                min="1"
                name="min_cantidad"
                value={n.min_cantidad}
                onChange={handleChange}
                required
                size="sm"
              />
            </CCol>
            <CCol xs={4} className="mb-2">
              <CFormLabel className="small">Precio (Q)</CFormLabel>
              <CFormInput
                type="number"
                step="0.01"
                min="0"
                name="precio"
                value={n.precio}
                onChange={handleChange}
                required
                size="sm"
                placeholder="0.00"
              />
            </CCol>
          </CRow>
          <CRow>
            <CCol xs={3} className="mb-2">
              <CFormLabel className="small">Unidad (opcional)</CFormLabel>
              <CFormSelect
                name="id_unidad_venta"
                value={n.id_unidad_venta}
                onChange={handleChange}
                size="sm"
              >
                <option value="">—</option>
                {(unidades || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol xs={4} className="mb-2">
              <CFormLabel
                className="small"
                title="Cuántas unidades base (piezas) equivalen a 1 de la unidad elegida"
              >
                {unidadSel ? `Und. base por 1 ${unidadSel.name}` : 'Factor'}
              </CFormLabel>
              <CFormInput
                type="number"
                name="factor"
                value={n.factor}
                onChange={handleChange}
                disabled={!n.id_unidad_venta}
                invalid={!!errorFactor}
                size="sm"
              />
              {unidadSel && factorNum >= 1 && !errorFactor && (
                <div className="text-body-secondary small mt-1">
                  1 {unidadSel.name} = {factorNum} und. base
                </div>
              )}
              {errorFactor && <div className="text-danger small mt-1">{errorFactor}</div>}
            </CCol>
            <CCol xs={5} className="d-flex align-items-end mb-2">
              <CButton
                color="success"
                size="sm"
                type="submit"
                disabled={guardando}
                className="w-100"
              >
                <CIcon icon={cilPlus} className="me-1" />
                {n.id ? 'Actualizar' : 'Agregar'}
              </CButton>
            </CCol>
          </CRow>
        </CForm>
      </CModalBody>

      <CModalFooter>
        <CButton color="secondary" onClick={onClose}>
          Cerrar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalPrecios
