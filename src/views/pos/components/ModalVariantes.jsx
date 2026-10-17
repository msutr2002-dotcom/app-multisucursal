import React, { useState } from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilX } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ImagenProducto from '../../../components/common/ImagenProducto'
import { precioNormal } from '../precioUtils'

/** Precio a mostrar de una opción: tier (`.precio`) o producto (tier NORMAL). */
function precioDe(op) {
  if (op == null) return 0
  if (op.precio != null) return op.precio
  return precioNormal(op.precios || [])?.precio ?? 0
}

/**
 * ModalVariantes — pantalla de selección de opciones de un producto.
 *
 * Dos modos:
 * 1. **Variantes de un padre (id_padre):** llega `opciones` con los productos
 *    hijos; cada fila es un producto vendible con su precio (D4).
 * 2. **Tiers de precio:** sin `opciones`, cada `precio` del producto es una
 *    opción (ej. "Pollo" → Menú Súper / Menú).
 *
 * Muestra cada opción como una fila con imagen, nombre y precio, y un radio a
 * la derecha; "Continuar" agrega la opción elegida al carrito.
 *
 * @param {object} props
 * @param {boolean} props.visible
 * @param {Function} props.onClose
 * @param {object} props.producto  Producto (padre o con tiers) con `precios`, `name`, `imagen`
 * @param {Array}  [props.opciones]  Lista explícita de opciones (ej. hijos de un padre)
 * @param {Function} props.onSeleccionar  (opcionElegida) => se agrega al carrito
 */
const ModalVariantes = ({ visible, onClose, producto, opciones, onSeleccionar }) => {
  const precios = producto?.precios || []

  // Si llega una lista explícita (variantes = hijos), se usa tal cual.
  // Si no: múltiples precios → cada tier es una opción; sin precios → el producto.
  const lista =
    Array.isArray(opciones) && opciones.length > 0
      ? opciones
      : precios.length > 0
        ? precios
        : [producto]
  const opcionesFinales = lista.filter((op) => op != null)

  const [seleccionadaId, setSeleccionadaId] = useState(opcionesFinales[0]?.id ?? null)

  const seleccionar = (id) => setSeleccionadaId(id)

  const opcionSeleccionada =
    opcionesFinales.find((o) => o?.id === seleccionadaId) || opcionesFinales[0]

  // Una opción es válida si tiene precio propio (tier) o precios (producto).
  // Evita enviar un PADRE contenedor (sin precios) al carrito.
  const opcionValida =
    !!opcionSeleccionada &&
    (opcionSeleccionada.precio != null || (opcionSeleccionada.precios || []).length > 0)

  const continuar = () => {
    if (opcionSeleccionada && opcionValida) {
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
        {opcionesFinales.length === 0 ? (
          <div className="text-center py-4">
            <span className="text-body-secondary">No hay variantes disponibles</span>
          </div>
        ) : (
          <div>
            {opcionesFinales.map((op, index) => {
              const precio = precioDe(op)
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
        <CButton color="success" disabled={!opcionValida} onClick={continuar} className="w-48">
          Continuar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalVariantes
