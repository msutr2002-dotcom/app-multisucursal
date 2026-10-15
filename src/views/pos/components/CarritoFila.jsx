import React from 'react'
import { CButton, CFormInput } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilMinus, cilPlus, cilX, cilTags } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import { factorDe, maxCantidad } from '../precioUtils'

const CarritoFila = ({ item, onCantidad, onRemove }) => {
  // Máximo en la unidad de la línea: 1 Caja = 12 unds → floor(stock/12) cajas
  const max = Math.max(maxCantidad(item.stock, factorDe(item)), 1)
  return (
    <tr>
      {/* PRODUCTO */}
      <td>
        <div className="d-flex align-items-center gap-2">
          <CIcon icon={cilTags} className="text-body-secondary" />
          <div className="lh-sm">
            <div className="small fw-semibold">{item.name}</div>
            <div className="text-body-secondary" style={{ fontSize: '0.7rem' }}>
              {item.sku || 'Sin SKU'} · {item.tipoPrecio}
            </div>
          </div>
        </div>
      </td>

      {/* CANTIDAD */}
      <td>
        <div className="d-flex align-items-center justify-content-center gap-1">
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
          <CFormInput
            type="number"
            size="sm"
            value={item.cantidad}
            min={1}
            max={max}
            aria-label={`Cantidad de ${item.name || 'la línea'}`}
            onChange={(e) =>
              onCantidad(item.idProducto, parseInt(e.target.value, 10) || 1, item.id_unidad_venta)
            }
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
      </td>

      {/* PRECIO (en la unidad de la línea: ×12 und si es presentación) */}
      <td className="text-center text-body-secondary small monto text-nowrap">
        {formatQ(item.precio)}
        {factorDe(item) > 1 && <span className="text-body-secondary"> ×{factorDe(item)} und</span>}
      </td>

      {/* TOTAL */}
      <td className="text-center fw-bold monto" style={{ color: 'var(--pos-primary)' }}>
        {formatQ(item.subtotal)}
      </td>

      {/* ELIMINAR */}
      <td className="text-end">
        <CButton
          size="sm"
          color="link"
          className="text-body-secondary p-0"
          title="Eliminar"
          aria-label={`Eliminar ${item.name || 'la línea'} del carrito`}
          onClick={() => onRemove(item.idProducto, item.id_unidad_venta)}
        >
          <CIcon icon={cilX} />
        </CButton>
      </td>
    </tr>
  )
}

export default CarritoFila
