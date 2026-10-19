import React, { useState } from 'react'
import { CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import {
  cilPen,
  cilTrash,
  cilDollar,
  cilPlus,
  cilChevronRight,
  cilChevronBottom,
} from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import TarjetaRegistro from '../../../components/common/TarjetaRegistro'

const precioNormalDe = (p) => {
  const normal = (p.precios || []).find((t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL')
  return normal ? normal.precio : null
}

/**
 * Versión tarjeta de ProductosTabla para móvil (<768px): SKU, producto, categoría,
 * precio/costo/margen, stock ± y acciones Editar / Precios / Eliminar visibles
 * (evita el scroll horizontal para llegar a ACCIONES). Agrupa variantes bajo su
 * producto padre (expandible).
 */
const ProductosTarjeta = ({
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
  const stockDe = (p) => p.stock?.find((s) => s.id_sucursal === idSucursalActual)?.stock ?? 0

  // Tarjeta de un producto vendible (suelto o variante).
  const tarjetaVendible = (p, { esVariante = false, padre = null } = {}) => {
    const precio = precioNormalDe(p)
    const costo = p.precio_compra || 0
    const margen =
      precio != null && precio > 0 ? Math.round(((precio - costo) / precio) * 100) : null
    const stockMiSucursal = stockDe(p)
    // F10: un combo no tiene stock propio → disponibilidad derivada de su receta.
    const esCombo = !!p.contiene_insumos
    const disponible = disponibilidadPorId?.[p.id] ?? 0
    const sinStock = !esCombo && stockMiSucursal === 0

    return (
      <TarjetaRegistro
        key={p.id}
        titulo={
          <span>
            {esVariante && <CIcon icon={cilChevronRight} className="me-1" />}
            {p.name}
          </span>
        }
        subtitulo={`${p.sku || 'Sin SKU'} · ${p.estado}${p.contiene_insumos ? ' · Combo' : ''}${
          padre ? ` · variante de ${padre.name}` : ''
        }`}
        badge={
          <div className="d-flex gap-1 flex-wrap justify-content-end">
            {esCombo ? (
              <CBadge color="info" className="text-dark">
                Disponible: {disponible}
              </CBadge>
            ) : (
              <>
                <CBadge color={sinStock ? 'danger' : 'success'}>{stockMiSucursal}</CBadge>
                {sinStock && (
                  <CBadge color="warning" className="text-dark">
                    Sin stock
                  </CBadge>
                )}
              </>
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
          esCombo
            ? {
                label: 'Disponible',
                value: <span title="Derivado de la receta">{disponible}</span>,
              }
            : {
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
  }

  // Tarjeta de un padre (contenedor): no vendible, stock = suma de variantes.
  const tarjetaPadre = (p, hijos) => {
    const abierto = !!expandidos[p.id]
    const stockTotal = hijos.reduce((acc, h) => acc + stockDe(h), 0)

    return (
      <TarjetaRegistro
        key={p.id}
        titulo={p.name}
        subtitulo={`${hijos.length} variante${hijos.length === 1 ? '' : 's'} · agrupa`}
        badge={
          <div className="d-flex gap-1 flex-wrap justify-content-end">
            <CBadge color="secondary">
              {hijos.length} variante{hijos.length === 1 ? '' : 's'}
            </CBadge>
            <CBadge color="success">{stockTotal}</CBadge>
          </div>
        }
        campos={[
          { label: 'Precio', value: <span className="text-body-secondary">—</span> },
          { label: 'Costo', value: <span className="text-body-secondary">—</span> },
          {
            label: 'Stock',
            value: <span title="Suma del stock de sus variantes">{stockTotal}</span>,
          },
        ]}
        acciones={
          <>
            <CButton
              color="secondary"
              variant="outline"
              aria-label={abierto ? 'Ocultar variantes' : 'Ver variantes'}
              onClick={() => toggle(p.id)}
            >
              <CIcon icon={abierto ? cilChevronBottom : cilChevronRight} className="me-1" />
              {abierto ? 'Ocultar' : 'Ver'}
            </CButton>
            {puedeCrear && (
              <CButton
                color="success"
                variant="outline"
                aria-label="Agregar variante"
                onClick={() => onAgregarVariante(p)}
              >
                <CIcon icon={cilPlus} className="me-1" />
                Agregar variante
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
  }

  return (
    <>
      {productos.map((p) => {
        const hijos = hijosPorPadre?.[p.id] || []
        const abierto = !!expandidos[p.id]
        if (hijos.length === 0) return tarjetaVendible(p)
        return (
          <React.Fragment key={p.id}>
            {tarjetaPadre(p, hijos)}
            {abierto && hijos.map((h) => tarjetaVendible(h, { esVariante: true, padre: p }))}
          </React.Fragment>
        )
      })}
    </>
  )
}

export default ProductosTarjeta
