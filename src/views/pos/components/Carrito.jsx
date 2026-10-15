import React from 'react'
import { CCard, CCardHeader, CCardBody, CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBasket, cilBookmark, cilList, cilTrash } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import CarritoFila from './CarritoFila'
import CarritoFilaTarjeta from './CarritoFilaTarjeta'

const Carrito = ({
  items,
  total,
  onCantidad,
  onRemove,
  onClear,
  onPendiente,
  onVerPendientes,
  pendientesCount = 0,
}) => {
  const vacio = items.length === 0

  return (
    <CCard className="border-0 shadow-sm">
      <CCardHeader className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div className="d-flex align-items-center gap-2">
          <CIcon icon={cilBasket} />
          <strong>Carrito</strong>
          <CBadge color="primary">{items.length}</CBadge>
        </div>

        <div className="d-flex gap-2 flex-wrap">
          <CButton
            size="sm"
            color="secondary"
            variant="outline"
            onClick={onVerPendientes}
            disabled={pendientesCount === 0}
            title="Ventas guardadas que faltan por cobrar"
          >
            <CIcon icon={cilList} className="me-1" />
            En espera ({pendientesCount})
          </CButton>
          <CButton
            size="sm"
            color="warning"
            variant="outline"
            disabled={vacio}
            onClick={onPendiente}
            title="Guardar esta venta para cobrarla después"
          >
            <CIcon icon={cilBookmark} className="me-1" />
            Guardar venta
          </CButton>
          <CButton size="sm" color="secondary" variant="outline" onClick={onClear} disabled={vacio}>
            <CIcon icon={cilTrash} className="me-1" />
            Vaciar
          </CButton>
        </div>
      </CCardHeader>

      <div className="d-none d-md-block table-responsive">
        <table className="table align-middle mb-0">
          <thead>
            <tr className="small text-body-secondary">
              <th>PRODUCTO</th>
              <th className="text-center">CANTIDAD</th>
              <th className="text-center">PRECIO</th>
              <th className="text-center">TOTAL</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {vacio ? (
              <tr>
                <td colSpan={5} className="text-center text-body-secondary py-4">
                  Carrito vacío
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <CarritoFila
                  key={`${item.idProducto}__${item.id_unidad_venta || ''}`}
                  item={item}
                  onCantidad={onCantidad}
                  onRemove={onRemove}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Móvil (<768px): una tarjeta por línea, con cantidad y "Quitar" visibles */}
      {!vacio && (
        <div className="d-md-none lista-tarjetas p-2">
          {items.map((item) => (
            <CarritoFilaTarjeta
              key={`${item.idProducto}__${item.id_unidad_venta || ''}`}
              item={item}
              onCantidad={onCantidad}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}

      <div className="p-3 border-top d-flex justify-content-between align-items-center">
        <span className="fs-5 fw-bold">Total</span>
        <span className="fs-4 fw-bold monto" style={{ color: 'var(--pos-primary)' }}>
          {formatQ(total)}
        </span>
      </div>
    </CCard>
  )
}

export default Carrito
