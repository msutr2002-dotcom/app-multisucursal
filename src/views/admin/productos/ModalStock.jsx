import React, { useState, useEffect } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CFormInput,
  CSpinner,
} from '@coreui/react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../components/common/ToastContext'

const ModalStock = ({ visible, onClose, producto, onCambio, idSucursalActual }) => {
  const showToast = useToast()
  const [filas, setFilas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!visible || !producto) return
    ;(async () => {
      setCargando(true)
      const empresaId = localStorage.getItem('empresaSeleccionada')
      let query = supabase.from('sucursal').select('id, name')
      if (empresaId) query = query.eq('id_empresa', empresaId)
      if (idSucursalActual) query = query.eq('id', idSucursalActual)
      const { data: sucursales } = await query
      const existentes = producto.stock || [] // ← NUEVA (esta línea faltaba)
      setFilas(
        (sucursales || []).map((s) => {
          const e = existentes.find((x) => x.id_sucursal === s.id)
          return {
            id_sucursal: s.id,
            sucursal: s.name,
            stock: e?.stock ?? 0,
            stock_minimo: e?.stock_minimo ?? 0,
          }
        }),
      )
      setCargando(false)
    })()
  }, [visible, producto, idSucursalActual])

  const handleChange = (idx, campo, valor) => {
    setFilas((prev) =>
      prev.map((fila, i) =>
        i === idx ? { ...fila, [campo]: Math.max(0, parseInt(valor, 10) || 0) } : fila,
      ),
    )
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      for (const fila of filas) {
        const { error } = await supabase.rpc('upsert_producto_sucursal', {
          p_id_producto: producto.id,
          p_id_sucursal: fila.id_sucursal,
          p_stock: fila.stock,
          p_stock_minimo: fila.stock_minimo,
        })
        if (error) throw error
      }
      showToast('success', 'Éxito', 'Stock guardado')
      onCambio()
      onClose()
    } catch (err) {
      showToast('danger', 'Error', err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose}>
      <CModalHeader onClose={onClose}>
        <CModalTitle>Stock — {producto?.name}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {cargando ? (
          <div className="text-center py-3">
            <CSpinner color="success" />
          </div>
        ) : (
          <>
            <div className="d-flex small fw-bold text-body-secondary border-bottom pb-1 mb-2">
              <div className="flex-grow-1">Sucursal</div>
              <div style={{ width: '90px' }} className="text-center">
                Stock
              </div>
              <div style={{ width: '90px' }} className="text-center">
                Mínimo
              </div>
            </div>

            {filas.map((fila, idx) => (
              <div key={fila.id_sucursal} className="d-flex align-items-center border-bottom py-2">
                <div className="flex-grow-1 small">{fila.sucursal}</div>
                <div style={{ width: '90px' }}>
                  <CFormInput
                    type="number"
                    min="0"
                    size="sm"
                    className="text-center"
                    value={fila.stock}
                    onChange={(e) => handleChange(idx, 'stock', e.target.value)}
                  />
                </div>
                <div style={{ width: '90px' }}>
                  <CFormInput
                    type="number"
                    min="0"
                    size="sm"
                    className="text-center"
                    value={fila.stock_minimo}
                    onChange={(e) => handleChange(idx, 'stock_minimo', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={onClose}>
          Cancelar
        </CButton>
        <CButton
          color="success"
          onClick={guardar}
          disabled={guardando || cargando || filas.length === 0}
        >
          {guardando ? 'Guardando...' : 'Guardar Stock'}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalStock
