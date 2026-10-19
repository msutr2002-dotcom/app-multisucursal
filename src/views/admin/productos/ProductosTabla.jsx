import { useState, Fragment } from 'react'
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
import {
  cilPen,
  cilTrash,
  cilMinus,
  cilPlus,
  cilChevronRight,
  cilChevronBottom,
} from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ImagenProducto from '../../../components/common/ImagenProducto'

const PRECIO_VERDE = 'var(--pos-success)'

const ProductosTabla = ({
  productos,
  hijosPorPadre,
  disponibilidadPorId,
  idSucursalActual,
  puedeEditar,
  puedeEliminar,
  puedeCrear,
  onEditar,
  onAgregarVariante,
  onPrecios,
  onStock,
  onEliminar,
  onStockDelta,
}) => {
  const [expandidos, setExpandidos] = useState({})
  const toggle = (id) => setExpandidos((prev) => ({ ...prev, [id]: !prev[id] }))

  const precioNormalDe = (p) => {
    const normal = (p.precios || []).find((t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL')
    return normal ? normal.precio : null
  }
  const stockDe = (p) => p.stock?.find((s) => s.id_sucursal === idSucursalActual)?.stock ?? 0

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

  // Fila de un producto vendible (suelto o variante).
  const filaVendible = (p, { esVariante = false, padre = null } = {}) => {
    const precio = precioNormalDe(p)
    const costo = p.precio_compra || 0
    const margen =
      precio != null && precio > 0 ? Math.round(((precio - costo) / precio) * 100) : null
    const stockMiSucursal = stockDe(p)

    return (
      <CTableRow
        key={p.id}
        style={esVariante ? { backgroundColor: 'rgba(13,110,253,0.04)' } : undefined}
      >
        {/* PRODUCTO */}
        <CTableDataCell className="border-bottom">
          <div className="d-flex align-items-center gap-2">
            <span style={{ width: esVariante ? '18px' : 0, display: 'inline-block' }}>
              {esVariante && <CIcon icon={cilChevronRight} style={{ color: '#adb5bd' }} />}
            </span>
            <ImagenProducto src={p.imagen} alt={p.name} size={esVariante ? 30 : 38} />
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
                {padre ? ` · variante de ${padre.name}` : ''}
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
            color: margen == null ? undefined : margen > 0 ? PRECIO_VERDE : 'var(--pos-danger)',
          }}
        >
          {margen == null ? '—' : `${margen}%`}
        </CTableDataCell>

        {/* STOCK: − n +  (n clic → modal stock). F10: un combo no tiene stock
            propio → disponibilidad derivada de su receta, sin controles. */}
        <CTableDataCell className="border-bottom">
          {p.contiene_insumos ? (
            <div className="d-flex align-items-center justify-content-center gap-1">
              <CBadge color="info" className="text-dark">
                Disponible: {disponibilidadPorId?.[p.id] ?? 0}
              </CBadge>
              <span className="small text-body-secondary">según receta</span>
            </div>
          ) : (
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
          )}
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
  }

  // Fila de un padre (contenedor): no vendible, stock = suma de variantes.
  const filaPadre = (p, hijos) => {
    const abierto = !!expandidos[p.id]
    const stockTotal = hijos.reduce((acc, h) => acc + stockDe(h), 0)

    return (
      <CTableRow key={p.id}>
        <CTableDataCell className="border-bottom">
          <div className="d-flex align-items-center gap-2">
            <CButton
              size="sm"
              color="link"
              className="p-0 text-body"
              aria-label={abierto ? `Ocultar variantes de ${p.name}` : `Ver variantes de ${p.name}`}
              onClick={() => toggle(p.id)}
            >
              <CIcon icon={abierto ? cilChevronBottom : cilChevronRight} />
            </CButton>
            <ImagenProducto src={p.imagen} alt={p.name} size={38} />
            <div>
              <div className="fw-semibold">
                {p.name}
                <CBadge color="secondary" className="ms-2">
                  {hijos.length} variante{hijos.length === 1 ? '' : 's'}
                </CBadge>
              </div>
              <div className="small text-body-secondary">
                {p.sku || 'Sin SKU'} · {p.estado} · agrupa variantes
              </div>
            </div>
          </div>
        </CTableDataCell>

        <CTableDataCell className="border-bottom small text-body-secondary">
          {p.marca || '—'}
        </CTableDataCell>

        <CTableDataCell className="border-bottom">
          <CBadge color="light" className="text-dark border">
            {p.categoria || '—'}
          </CBadge>
        </CTableDataCell>

        <CTableDataCell className="border-bottom text-body-secondary">—</CTableDataCell>
        <CTableDataCell className="border-bottom text-body-secondary">—</CTableDataCell>
        <CTableDataCell className="border-bottom text-body-secondary">—</CTableDataCell>

        {/* STOCK = suma de las variantes (solo lectura) */}
        <CTableDataCell className="border-bottom">
          <div className="d-flex align-items-center justify-content-center gap-1">
            <span
              style={{ minWidth: '34px', textAlign: 'center' }}
              title="Suma del stock de sus variantes"
            >
              {stockTotal}
            </span>
          </div>
        </CTableDataCell>

        <CTableDataCell className="border-bottom">
          <div className="d-flex gap-1">
            {puedeCrear && (
              <CButton
                size="sm"
                color="light"
                className="border"
                onClick={() => onAgregarVariante(p)}
              >
                <CIcon icon={cilPlus} className="me-1" />
                Agregar variante
              </CButton>
            )}
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
  }

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
          const hijos = hijosPorPadre?.[p.id] || []
          const abierto = !!expandidos[p.id]
          if (hijos.length === 0) return filaVendible(p)
          return (
            <Fragment key={p.id}>
              {filaPadre(p, hijos)}
              {abierto && hijos.map((h) => filaVendible(h, { esVariante: true, padre: p }))}
            </Fragment>
          )
        })}
      </CTableBody>
    </CTable>
  )
}

export default ProductosTabla
