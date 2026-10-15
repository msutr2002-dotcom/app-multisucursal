import {
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CBadge,
  CButton,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilMinus, cilPlus } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ImagenProducto from '../../../components/common/ImagenProducto'

const PRECIO_VERDE = '#0d7a5f'

const ProductosTabla = ({
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
  const precioNormalDe = (p) => {
    const normal = (p.precios || []).find((t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL')
    return normal ? normal.precio : null
  }

  const cabecera = [
    'Producto',
    'Marca',
    'Categoría',
    'Precio',
    'Costo',
    'Margen',
    'Stock',
    'Acciones',
  ]

  return (
    <CTable align="middle" className="mb-0">
      <CTableHead>
        <CTableRow>
          {cabecera.map((h) => (
            <CTableHeaderCell
              key={h}
              className="small text-uppercase text-body-secondary border-bottom"
            >
              {h}
            </CTableHeaderCell>
          ))}
        </CTableRow>
      </CTableHead>
      <CTableBody>
        {productos.map((p) => {
          const precio = precioNormalDe(p)
          const costo = p.precio_compra || 0
          const margen =
            precio != null && precio > 0 ? Math.round(((precio - costo) / precio) * 100) : null
          const stockMiSucursal =
            p.stock?.find((s) => s.id_sucursal === idSucursalActual)?.stock ?? 0

          return (
            <CTableRow key={p.id}>
              {/* PRODUCTO */}
              <CTableDataCell className="border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <ImagenProducto src={p.imagen} alt={p.name} size={38} />
                  <div>
                    <div className="fw-semibold">
                      {p.name}
                      {p.contiene_insumos && (
                        <CBadge color="info" className="ms-2">
                          Combo
                        </CBadge>
                      )}
                    </div>
                    <div className="small text-body-secondary">
                      {p.sku || 'Sin SKU'} · {p.estado}
                    </div>
                  </div>
                </div>
              </CTableDataCell>

              {/* MARCA */}
              <CTableDataCell className="border-bottom small text-body-secondary">
                {p.marca || '—'}
              </CTableDataCell>

              {/* CATEGORÍA */}
              <CTableDataCell className="border-bottom">
                <CBadge color="light" className="text-dark border">
                  {p.categoria || '—'}
                </CBadge>
              </CTableDataCell>

              {/* PRECIO (clic → modal de precios) */}
              <CTableDataCell
                className="border-bottom"
                style={{ cursor: 'pointer', color: PRECIO_VERDE }}
                title="Clic para editar precios"
                onClick={() => onPrecios(p)}
              >
                <strong className="monto">{precio != null ? formatQ(precio) : '—'}</strong>
              </CTableDataCell>

              {/* COSTO */}
              <CTableDataCell className="border-bottom small text-body-secondary monto">
                {formatQ(costo)}
              </CTableDataCell>

              {/* MARGEN */}
              <CTableDataCell
                className="border-bottom fw-semibold"
                style={{
                  color: margen == null ? undefined : margen > 0 ? PRECIO_VERDE : '#dc3545',
                }}
              >
                {margen == null ? '—' : `${margen}%`}
              </CTableDataCell>

              {/* STOCK: − n +  (n clic → modal stock) */}
              <CTableDataCell className="border-bottom">
                <div className="d-flex align-items-center justify-content-center gap-1">
                  <CButton
                    size="sm"
                    className="p-1 border-0"
                    style={{ background: 'rgba(13,122,95,0.12)', color: PRECIO_VERDE }}
                    disabled={!puedeEditar || stockMiSucursal <= 0}
                    aria-label={`Disminuir stock de ${p.name || 'la línea'}`}
                    onClick={() => onStockDelta(p, -1)}
                  >
                    <CIcon icon={cilMinus} />
                  </CButton>
                  <span
                    style={{ minWidth: '34px', textAlign: 'center', cursor: 'pointer' }}
                    title="Ver stock por sucursal"
                    onClick={() => onStock(p)}
                  >
                    {stockMiSucursal}
                  </span>
                  <CButton
                    size="sm"
                    className="p-1 border-0"
                    style={{ background: 'rgba(13,122,95,0.12)', color: PRECIO_VERDE }}
                    disabled={!puedeEditar}
                    aria-label={`Aumentar stock de ${p.name || 'la línea'}`}
                    onClick={() => onStockDelta(p, 1)}
                  >
                    <CIcon icon={cilPlus} />
                  </CButton>
                </div>
              </CTableDataCell>

              {/* ACCIONES */}
              <CTableDataCell className="border-bottom">
                <div className="d-flex gap-1">
                  {puedeEditar && (
                    <CButton size="sm" color="light" className="border" onClick={() => onEditar(p)}>
                      <CIcon icon={cilPen} className="me-1" style={{ color: '#e55f0a' }} />
                      Editar
                    </CButton>
                  )}
                  {puedeEliminar && (
                    <CButton
                      size="sm"
                      color="danger"
                      className="p-2"
                      aria-label="Eliminar producto"
                      onClick={() => onEliminar(p)}
                    >
                      <CIcon icon={cilTrash} />
                    </CButton>
                  )}
                </div>
              </CTableDataCell>
            </CTableRow>
          )
        })}
      </CTableBody>
    </CTable>
  )
}

export default ProductosTabla
