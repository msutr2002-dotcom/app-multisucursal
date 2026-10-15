import React from 'react'
import { CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilDollar } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import TarjetaRegistro from '../../../components/common/TarjetaRegistro'

const precioNormalDe = (p) => {
  const normal = (p.precios || []).find((t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL')
  return normal ? normal.precio : null
}

/**
 * Versión tarjeta de ProductosTabla para móvil (<768px): SKU, producto, categoría,
 * precio/costo/margen, stock ± y acciones Editar / Precios / Eliminar visibles
 * (evita el scroll horizontal para llegar a ACCIONES).
 */
const ProductosTarjeta = ({
  productos,
  idSucursalActual,
  puedeEditar,
  puedeEliminar,
  onEditar,
  onPrecios,
  onStock,
  onEliminar,
  onStockDelta,
}) => {
  return (
    <>
      {productos.map((p) => {
        const precio = precioNormalDe(p)
        const costo = p.precio_compra || 0
        const margen =
          precio != null && precio > 0 ? Math.round(((precio - costo) / precio) * 100) : null
        const stockMiSucursal = p.stock?.find((s) => s.id_sucursal === idSucursalActual)?.stock ?? 0
        const sinStock = stockMiSucursal === 0

        return (
          <TarjetaRegistro
            key={p.id}
            titulo={p.name}
            subtitulo={`${p.sku || 'Sin SKU'} · ${p.estado}${p.contiene_insumos ? ' · Combo' : ''}`}
            badge={
              <div className="d-flex gap-1 flex-wrap justify-content-end">
                <CBadge color={sinStock ? 'danger' : 'success'}>{stockMiSucursal}</CBadge>
                {sinStock && (
                  <CBadge color="warning" className="text-dark">
                    Sin stock
                  </CBadge>
                )}
              </div>
            }
            campos={[
              {
                label: 'Precio',
                value: <span className="monto">{precio != null ? formatQ(precio) : '—'}</span>,
              },
              {
                label: 'Costo',
                value: <span className="monto text-body-secondary small">{formatQ(costo)}</span>,
              },
              {
                label: 'Margen',
                value: (
                  <span
                    className={`fw-semibold ${
                      margen == null
                        ? 'text-body-secondary'
                        : margen > 0
                          ? 'text-success'
                          : 'text-danger'
                    }`}
                  >
                    {margen == null ? '—' : `${margen}%`}
                  </span>
                ),
              },
              {
                label: 'Stock',
                value: (
                  <CButton
                    color="link"
                    variant="text"
                    className="text-decoration-none p-0 d-flex align-items-center gap-1"
                    style={{ color: 'inherit' }}
                    aria-label={`Editar stock de ${p.name}`}
                    onClick={() => onStock(p)}
                  >
                    {stockMiSucursal}
                    <CIcon icon={cilPen} className="ms-1" style={{ fontSize: '0.75rem' }} />
                  </CButton>
                ),
              },
            ]}
            acciones={
              <>
                {puedeEditar && (
                  <CButton
                    color="info"
                    variant="outline"
                    aria-label="Editar precios"
                    onClick={() => onPrecios(p)}
                  >
                    <CIcon icon={cilDollar} className="me-1" />
                    Precios
                  </CButton>
                )}
                {puedeEditar && (
                  <CButton
                    color="primary"
                    variant="outline"
                    aria-label="Editar producto"
                    onClick={() => onEditar(p)}
                  >
                    <CIcon icon={cilPen} className="me-1" />
                    Editar
                  </CButton>
                )}
                {puedeEliminar && (
                  <CButton
                    color="danger"
                    variant="outline"
                    aria-label="Eliminar producto"
                    onClick={() => onEliminar(p)}
                  >
                    <CIcon icon={cilTrash} />
                  </CButton>
                )}
              </>
            }
          />
        )
      })}
    </>
  )
}

export default ProductosTarjeta
