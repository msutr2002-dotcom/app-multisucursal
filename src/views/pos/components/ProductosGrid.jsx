import React, { useMemo, useState } from 'react'
import { CNav, CNavItem, CNavLink, CBadge } from '@coreui/react'
import ImagenProducto from '../../../components/common/ImagenProducto'
import { formatQ } from '../../../utils/format'

/** Precio del tile: tier NORMAL base si existe; si no, el más barato base; si no, el más barato. */
function precioTile(p) {
  const todos = p.precios || []
  const base = todos.filter((x) => (x.factor ?? 1) === 1)
  const pool = base.length ? base : todos
  const normal = pool.find((x) => x.tipo === 'NORMAL')
  if (normal) return normal.precio
  if (!pool.length) return 0
  return Math.min(...pool.map((x) => x.precio))
}

/**
 * RF-C5: grid de tiles para el POS en modo comida. Pestañas = categorías del
 * catálogo local (+ "Todos"). Tap = +1 al carrito (fusiona línea); productos
 * sin stock quedan atenuados y no cliqueables.
 */
const ProductosGrid = ({ productos, stockPorProducto, onAgregar }) => {
  const [activa, setActiva] = useState('__todos__')

  const categorias = useMemo(() => {
    const set = new Set()
    productos.forEach((p) => {
      if (p.categoria) set.add(p.categoria)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [productos])

  const visibles = useMemo(
    () => (activa === '__todos__' ? productos : productos.filter((p) => p.categoria === activa)),
    [productos, activa],
  )

  return (
    <div className="mt-3">
      <CNav variant="tabs" className="flex-wrap mb-2">
        <CNavItem>
          <CNavLink
            active={activa === '__todos__'}
            onClick={() => setActiva('__todos__')}
            style={{ cursor: 'pointer' }}
          >
            Todos
          </CNavLink>
        </CNavItem>
        {categorias.map((c) => (
          <CNavItem key={c}>
            <CNavLink
              active={activa === c}
              onClick={() => setActiva(c)}
              style={{ cursor: 'pointer' }}
            >
              {c}
            </CNavLink>
          </CNavItem>
        ))}
      </CNav>

      {visibles.length === 0 ? (
        <p className="text-body-secondary mb-0">Sin productos en esta categoría.</p>
      ) : (
        <div className="pos-grid">
          {visibles.map((p) => {
            // D6: stock de la bodega activa; fallback al caché de sucursal.
            const deBodega = stockPorProducto?.get(p.id)
            const stock =
              deBodega !== undefined ? deBodega : (p.stock?.find((s) => s.es_actual)?.stock ?? 0)
            const sinStock = stock <= 0
            return (
              <button
                key={p.id}
                type="button"
                className="btn border text-center p-2 d-flex flex-column align-items-center h-100 gap-1"
                style={{ opacity: sinStock ? 0.45 : 1 }}
                disabled={sinStock}
                title={sinStock ? 'Sin stock en esta sucursal' : `Agregar ${p.name}`}
                onClick={() => onAgregar(p)}
              >
                <div className="pos-imagen">
                  <ImagenProducto src={p.imagen} alt={p.name} size={64} radius={10} />
                </div>
                <span
                  className="fw-semibold text-truncate"
                  style={{ fontSize: '0.8rem', lineHeight: 1.15, maxWidth: '120px' }}
                >
                  {p.name}
                </span>
                <span className="text-primary fw-bold" style={{ fontSize: '0.875rem' }}>
                  {formatQ(precioTile(p))}
                </span>
                {p.contiene_insumos ? (
                  <CBadge color="info" className="mt-1">
                    Combo
                  </CBadge>
                ) : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProductosGrid
