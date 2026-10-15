import React, { useState, useMemo } from 'react'
import { CCard, CCardBody, CButton, CCollapse, CBadge, CFormSelect } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilTags, cilBarcode, cilChevronBottom, cilChevronTop } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import { calcularTier, precioAuto, factorDe, esPresentacion, maxCantidad } from '../precioUtils'
import PrecioSelector from './PrecioSelector'
import ImagenProducto from '../../../components/common/ImagenProducto'
import CampoNumero from '../../../components/common/CampoNumero'

/**
 * RF-V2 (v4): layout estilo sistema viejo con cabecera resaltada —
 * franja verde suave con pastilla SKU (esquina izquierda) y pastillas de
 * Stock/Marca/Categoría (esquina derecha); título centrado debajo. Siempre
 * visibles: dropdown "Precio:", Cantidad + total + Agregar y el cuadro
 * "En Tienda | Otras Bodegas". El enlace "Ver / Ocultar" alterna el detalle
 * (imagen + descripción en panel blanco), plegado por defecto. El remount por
 * `key={selected.id}` en POSPage lo reinicia al cambiar de producto.
 */
const ProductoDetalle = ({ producto, stockBodega, onAgregar, colores = [], onCambiarColor }) => {
  const [cantidad, setCantidad] = useState(1)
  const [override, setOverride] = useState(null) // null = Auto
  const [abierto, setAbierto] = useState(false)

  const precios = useMemo(() => producto.precios || [], [producto.precios])
  const stockInfo = useMemo(() => producto.stock || [], [producto.stock])
  const actual = useMemo(() => stockInfo.find((s) => s.es_actual), [stockInfo])
  // D6 (stock-bodega-fuente-verdad): manda el stock de la bodega activa; si esa
  // bodega no tiene fila para el producto, se cae al caché de sucursal.
  const stockActual = typeof stockBodega === 'number' ? stockBodega : (actual?.stock ?? 0)
  const otrasBodegas = useMemo(() => stockInfo.filter((s) => !s.es_actual), [stockInfo])

  const tier = useMemo(
    () => calcularTier(precios, cantidad, override),
    [precios, cantidad, override],
  )

  const subtotal = tier ? tier.precio * cantidad : 0

  // Máximo en la UNIDAD del tier: 1 Caja de 12 und solo cabe si hay 12× unds
  const factorTier = factorDe(tier)
  const maxDisp = maxCantidad(stockActual, factorTier)
  const sinStockParaTier = esPresentacion(tier) && maxDisp < 1

  const cambiarCantidad = (nueva) => {
    setCantidad(Math.max(1, Math.min(nueva || 1, Math.max(maxDisp, 1))))
    // La selección manual del dropdown se mantiene al cambiar la cantidad
    // (igual que el sistema viejo).
  }
  // Al cambiar de tier se conserva el número y se recorta al nuevo máximo (D4)
  const cambiarTier = (id) => {
    setOverride(id)
    const tierNuevo = id ? precios.find((p) => p.id === id) : precioAuto(precios, cantidad)
    const maxNuevo = maxCantidad(stockActual, factorDe(tierNuevo))
    setCantidad((prev) => (maxNuevo >= 1 ? Math.min(prev, maxNuevo) : Math.max(prev, 1)))
  }

  const handleAgregar = () => {
    onAgregar(cantidad, override)
  }

  return (
    <CCard className="border-0 shadow-sm overflow-hidden">
      {/* ===== Cabecera: datos resaltados en las esquinas + título centrado ===== */}
      <div className="pos-detalle-header px-3 pt-2">
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
          <CBadge
            color="dark"
            className="rounded-pill px-2 py-1"
            style={{ border: '1px solid rgba(255, 255, 255, 0.2)' }}
          >
            <CIcon icon={cilBarcode} className="me-1" />
            SKU: {producto.sku || '—'}
          </CBadge>
          <div className="d-flex gap-1 flex-wrap justify-content-end">
            <CBadge
              color={stockActual > 0 ? 'success' : 'danger'}
              className="rounded-pill px-2 py-1"
            >
              Stock: {stockActual}
            </CBadge>
            {producto.marca && (
              <CBadge color="info" className="rounded-pill px-2 py-1">
                {producto.marca}
              </CBadge>
            )}
            {producto.categoria && (
              <CBadge color="secondary" className="rounded-pill px-2 py-1">
                {producto.categoria}
              </CBadge>
            )}
          </div>
        </div>
        <h6 className="text-center fw-bold mt-2 mb-2">{producto.name}</h6>
      </div>

      <CCardBody className="pb-2">
        <div className="row g-3">
          {/* ===== Izquierda: Precio + Cantidad + total + Agregar ===== */}
          <div className="col-12 col-md-7">
            {colores.length > 1 && (
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className="small text-body-secondary">Color:</span>
                <CFormSelect
                  size="sm"
                  aria-label="Color"
                  className="w-auto"
                  style={{ maxWidth: '260px' }}
                  value={colores.find((c) => c.activo)?.id ?? ''}
                  onChange={(e) => {
                    const c = colores.find((x) => x.id === e.target.value)
                    if (c && !c.activo) onCambiarColor?.(c.producto)
                  }}
                >
                  {colores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.stock === 0 ? `${c.nombre} (sin stock)` : c.nombre}
                    </option>
                  ))}
                </CFormSelect>
              </div>
            )}
            <PrecioSelector
              precios={precios}
              value={override}
              onChange={cambiarTier}
              cantidad={cantidad}
            />

            <div className="d-flex align-items-center gap-2 flex-wrap mt-2">
              <span className="small text-body-secondary">Cantidad:</span>
              <CampoNumero
                size="sm"
                value={cantidad}
                min={1}
                max={Math.max(maxDisp, 1)}
                onCommit={cambiarCantidad}
                style={{ width: '72px' }}
                aria-label="Cantidad"
              />
              <span className="small text-body-secondary">total:</span>
              <strong className="fs-6" style={{ color: 'var(--pos-primary)' }}>
                {formatQ(subtotal)}
              </strong>
              <CButton
                color="success"
                disabled={!precios.length || stockActual <= 0 || sinStockParaTier}
                onClick={handleAgregar}
              >
                <CIcon icon={cilTags} className="me-1" />
                Agregar
              </CButton>
            </div>

            {!precios.length && (
              <div className="text-danger small mt-2">
                Este producto no tiene precios configurados
              </div>
            )}
            {stockActual <= 0 && (
              <div className="text-danger small mt-2">
                Sin stock en tu sucursal — revisa disponibilidad en otras bodegas
              </div>
            )}
            {sinStockParaTier && (
              <div className="text-danger small mt-2">
                {`Stock insuficiente para 1 ${tier.unidad || 'unidad'}: requiere ${factorTier} und, hay ${stockActual}`}
              </div>
            )}
          </div>

          {/* ===== Derecha: cuadro En Tienda | Otras Bodegas ===== */}
          <div className="col-12 col-md-5">
            <table className="table table-sm table-bordered align-middle mb-0 small">
              <thead>
                <tr>
                  <th
                    className="text-center"
                    style={{ backgroundColor: 'var(--pos-primary)', color: '#fff' }}
                  >
                    En Tienda
                  </th>
                  <th
                    className="text-center"
                    style={{ backgroundColor: 'var(--pos-primary)', color: '#fff' }}
                  >
                    Otras Bodegas
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ width: '50%' }}>
                    <div className="d-flex justify-content-between px-2">
                      <span>Disponible:</span>
                      <strong>{stockActual}</strong>
                    </div>
                    <div className="d-flex justify-content-between px-2">
                      <span>Mínimo:</span>
                      <span>{actual?.stock_minimo ?? '—'}</span>
                    </div>
                  </td>
                  <td style={{ width: '50%' }}>
                    {otrasBodegas.length ? (
                      otrasBodegas.map((s) => (
                        <div key={s.id_sucursal} className="px-2">
                          <strong>{s.stock}</strong>
                          <span className="text-body-secondary"> | {s.sucursal}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-body-secondary px-2">—</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ===== Ver / Ocultar (alterna el detalle) ===== */}
        <div className="text-center mt-3">
          <CButton
            color="link"
            size="sm"
            className="text-decoration-underline"
            onClick={() => setAbierto(!abierto)}
          >
            <CIcon icon={abierto ? cilChevronTop : cilChevronBottom} className="me-1" />
            Ver / Ocultar
          </CButton>
        </div>
      </CCardBody>

      {/* ===== Detalle plegable: imagen + panel blanco con descripción ===== */}
      {/* CoreUI 5: CCollapse usa `visible` (la prop `open` se ignora) */}
      <CCollapse visible={abierto}>
        <div data-testid="detalle-producto" className="bg-body-tertiary border-top p-3">
          <div className="row g-3 align-items-start">
            <div className="col-auto">
              {producto.imagen ? (
                <ImagenProducto
                  src={producto.imagen}
                  alt={producto.name}
                  size={120}
                  radius={8}
                  ampliable
                />
              ) : (
                <div
                  className="bg-body border d-flex align-items-center justify-content-center text-body-secondary small rounded"
                  style={{ width: 120, height: 120 }}
                >
                  Sin imagen
                </div>
              )}
            </div>
            <div className="col">
              <div className="bg-body border rounded p-3 text-center">
                {producto.descripcion ? (
                  <p className="mb-2">{producto.descripcion}</p>
                ) : (
                  <p className="mb-2 text-body-secondary fst-italic">Sin descripción</p>
                )}
                <div className="small">
                  Marca: <strong>{producto.marca || '—'}</strong>
                </div>
                <div className="small text-body-secondary">
                  Categoría: <strong>{producto.categoria || '—'}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CCollapse>
    </CCard>
  )
}

export default ProductoDetalle
