import React from 'react'
import { CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMinus, cilPlus, cilX } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import { factorDe, maxCantidad } from '../precioUtils'
import CampoNumero from '../../../components/common/CampoNumero'
import TarjetaRegistro from '../../../components/common/TarjetaRegistro'

/**
 * Versión tarjeta de CarritoFila para móvil (<768px): producto, cantidad ±,
 * precio (en la unidad de la línea) y total, con "Quitar" siempre visible.
 */
const CarritoFilaTarjeta = ({ item, onCantidad, onRemove }) => {
  const max = Math.max(maxCantidad(item.stock, factorDe(item)), 1)
  const factor = factorDe(item)
  return (
    <TarjetaRegistro
      titulo={item.name}
      subtitulo={`${item.sku || 'Sin SKU'} · ${item.tipoPrecio}`}
      campos={[
        {
          label: 'Cantidad',
          value: (
            <div className="d-flex align-items-center gap-1">
              <CButton
                size="sm"
                color="light"
                variant="outline"
                aria-label={`Disminuir cantidad de ${item.name || 'la línea'}`}
                onClick={() => onCantidad(item.idProducto, item.cantidad - 1, item.id_unidad_venta)}
                disabled={item.cantidad <= 1}
              >
                <CIcon icon={cilMinus} />
              </CButton>
              <CampoNumero
                size="sm"
                value={item.cantidad}
                min={1}
                max={max}
                aria-label={`Cantidad de ${item.name || 'la línea'}`}
                onCommit={(n) => onCantidad(item.idProducto, n, item.id_unidad_venta)}
                style={{ width: '54px', textAlign: 'center' }}
              />
              <CButton
                size="sm"
                color="success"
                variant="outline"
                aria-label={`Aumentar cantidad de ${item.name || 'la línea'}`}
                onClick={() => onCantidad(item.idProducto, item.cantidad + 1, item.id_unidad_venta)}
                disabled={item.cantidad >= max}
              >
                <CIcon icon={cilPlus} />
              </CButton>
            </div>
          ),
        },
        {
          label: 'Precio',
          value: (
            <span className="text-nowrap">
              {formatQ(item.precio)}
              {factor > 1 && <span className="text-body-secondary"> ×{factor} und</span>}
            </span>
          ),
        },
        {
          label: 'Total',
          value: (
            <strong className="monto" style={{ color: 'var(--pos-accent)' }}>
              {formatQ(item.subtotal)}
            </strong>
          ),
        },
      ]}
      acciones={
        <CButton
          color="danger"
          variant="outline"
          aria-label={`Eliminar ${item.name || 'la línea'} del carrito`}
          onClick={() => onRemove(item.idProducto, item.id_unidad_venta)}
        >
          <CIcon icon={cilX} className="me-1" />
          Quitar
        </CButton>
      }
    />
  )
}

export default CarritoFilaTarjeta
