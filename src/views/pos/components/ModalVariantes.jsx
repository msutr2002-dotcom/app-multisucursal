import React, { useState } from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilX } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ImagenProducto from '../../../components/common/ImagenProducto'

/**
 * ModalVariantes — pantalla de selección de variantes/opciones de un producto
 * (ej. "Pollo" → "Menú Súper Campero Q68.00", "Menú Campero Q53.00").
 *
 * Muestra cada variante como una fila con: imagen pequeña a la izquierda,
 * nombre y precio en el centro, y un radio button a la derecha. Al elegir una
 * variante se habilita el botón "Continuar" para agregarla al carrito.
 *
 * @param {object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {object} props.producto  Producto padre con `precios`, `name`, `imagen`, `id_color`
 * @param {Function} props.onSeleccionar  (variante) => se agrega al carrito
 */
const ModalVariantes = ({ visible, onClose, producto, onSeleccionar }) => {
  const precios = producto?.precios || []

  // Variantes: si hay múltiples precios, cada uno es una opción.
  // Si no hay precios, el producto es la única opción.
  const opciones = (precios.length > 0 ? precios : [producto]).filter((op) => op != null)

  const [seleccionadaId, setSeleccionadaId] = useState(
    opciones.length > 0 ? (opciones[0]?.id ?? null) : null,
  )

  const seleccionar = (id) => {
    setSeleccionadaId(id)
  }

  const opcionSeleccionada = opciones.find((o) => o?.id === seleccionadaId) || opciones[0]

  const continuar = () => {
    if (opcionSeleccionada) {
      onSeleccionar(opcionSeleccionada)
      onClose()
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} size="md" scrollable>
      <CModalHeader onClose={onClose}>
        <CModalTitle>Elije tu producto</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {opciones.length === 0 ? (
          <div className="text-center py-4">
            <span className="text-body-secondary">No hay variantes disponibles</span>
          </div>
        ) : (
          <div>
            {opciones.map((op, index) => {
              const precio = op?.precio ?? 0
              const nombre = op?.name || op?.tipo || 'Producto'
              const imagen = op?.imagen || producto?.imagen
              const isChecked = op?.id === seleccionadaId
              return (
                <div
                  key={op?.id || index}
                  className="d-flex align-items-center gap-3 p-3 border-bottom cursor-pointer"
                  onClick={() => seleccionar(op?.id)}
                  style={{ backgroundColor: isChecked ? '#f8f9fa' : '#fff' }}
                >
                  <div
                    className="variante-imagen"
                    style={{ width: '56px', height: '56px', flexShrink: 0 }}
                  >
                    <ImagenProducto src={imagen} alt={nombre} size={48} radius={8} />
                  </div>
                  <div className="flex-grow-1">
                    <div className="fw-semibold text-dark">{nombre}</div>
                    <div className="text-primary fw-bold">{formatQ(precio)}</div>
                  </div>
                  <div>
                    <input
                      type="radio"
                      name="variante"
                      value={op?.id}
                      checked={isChecked}
                      onChange={() => seleccionar(op?.id)}
                      style={{
                        accentColor: '#0d7a5f',
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CModalBody>
      <CModalFooter className="py-3">
        <CButton color="secondary" onClick={onClose} className="w-48">
          <CIcon icon={cilX} className="me-1" />
          Cancelar
        </CButton>
        <CButton
          color="success"
          disabled={!opcionSeleccionada}
          onClick={continuar}
          className="w-48"
        >
          Continuar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalVariantes
