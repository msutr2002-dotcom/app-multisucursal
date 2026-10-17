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
 *
 * padre/hijo: solo se listan las RAÍCES (padres + sueltos). Un padre es una
 * entrada que muestra "N variantes", el precio más bajo de sus hijos y el
 * stock sumado; al tocarlo se eligen sus variantes (ModalVariantes). Los hijos
 * NO se listan sueltos.
 */
const ProductosGrid = ({ productos, stockPorProducto, onAgregar }) => {
  const [activa, setActiva] = useState('__todos__')

  // Hijos indexados por id_padre.
  const hijosPorPadre = useMemo(() => {
    const m = {}
    productos.forEach((p) => {
      if (!p.id_padre) return
      if (!m[p.id_padre]) m[p.id_padre] = []
      m[p.id_padre].push(p)
    })
    return m
  }, [productos])

  // Solo raíces (padres + productos sueltos).
  const raices = useMemo(() => productos.filter((p) => !p.id_padre), [productos])

  const categorias = useMemo(() => {
    const set = new Set()
    raices.forEach((p) => {
      if (p.categoria) set.add(p.categoria)
    })
    return [...set].sort((a, b) => a.localeCompare(b, 'es'))
  }, [raices])

  const visibles = useMemo(
    () => (activa === '__todos__' ? raices : raices.filter((p) => p.categoria === activa)),
    [raices, activa],
  )

  // D6: stock de la bodega activa; fallback al caché de sucursal.
  const stockDe = (p) => {
    const deBodega = stockPorProducto?.get(p.id)
    return deBodega !== undefined ? deBodega : (p.stock?.find((s) => s.es_actual)?.stock ?? 0)
  }

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
            const hijos = hijosPorPadre[p.id] || []
            const esPadre = hijos.length > 0
            // D2: el padre no tiene stock propio; se muestra la suma de sus hijos.
            const stock = esPadre ? hijos.reduce((acc, h) => acc + stockDe(h), 0) : stockDe(p)
            const sinStock = stock <= 0
            const precio = esPadre ? Math.min(...hijos.map(precioTile)) : precioTile(p)
            return (
              <button
                key={p.id}
                type="button"
                className="btn border text-center p-2 d-flex flex-column align-items-center h-100 gap-1"
                style={{ opacity: sinStock ? 0.45 : 1 }}
                disabled={sinStock}
                title={
                  sinStock
                    ? 'Sin stock en esta sucursal'
                    : esPadre
                      ? `Elegir variante de ${p.name}`
                      : `Agregar ${p.name}`
                }
                onClick={() => onAgregar(p)}
              >
                <div className="pos-imagen">
                  <ImagenProducto src={p.imagen} alt={p.name} size={64} radius={10} />
                </div>
                <div className="pos-texto" style={{ flexGrow: 1, minWidth: 0 }}>
                  <span
                    className="fw-semibold text-truncate d-block"
                    style={{ fontSize: '0.8rem', lineHeight: 1.15 }}
                  >
                    {p.name}
                  </span>
                  <span className="text-primary fw-bold d-block" style={{ fontSize: '0.875rem' }}>
                    {esPadre ? 'Desde ' : ''}
                    {formatQ(precio)}
                  </span>
                  {esPadre ? (
                    <CBadge color="secondary" className="mt-1">
                      {hijos.length} variantes
                    </CBadge>
                  ) : p.contiene_insumos ? (
                    <CBadge color="info" className="mt-1">
                      Combo
                    </CBadge>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ProductosGrid
