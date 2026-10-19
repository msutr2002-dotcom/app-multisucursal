import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CFormInput,
  CFormSelect,
  CRow,
  CCol,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CTableDataCell,
  CBadge,
  CSpinner,
  CButton,
  CPagination,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch, cilInbox } from '@coreui/icons'
import { db } from '../../lib/db'
import useEstadoRed from '../../hooks/useEstadoRed'
import { hayRed } from '../../services/redService'
import { formatQ } from '../../utils/format'
import { useToast } from '../../components/common/ToastContext'
import TarjetaRegistro from '../../components/common/TarjetaRegistro'
import { leerStockPorBodega, hidratarCatalogoParaSucursal } from '../../services/catalogSyncService'
import { agruparComponentes, disponibilidadCombo } from '../pos/comboUtils'

const PAGE_SIZE = 25

const InventarioPage = () => {
  const enLinea = useEstadoRed()
  const showToast = useToast()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursal = currentUser?.id_sucursal
  const empresaId = localStorage.getItem('empresaSeleccionada')

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [pagina, setPagina] = useState(1)

  // Multibodega Task 10: bodegas de la sucursal + bodega activa
  const [bodegas, setBodegas] = useState([])
  const [bodegaId, setBodegaId] = useState(() => localStorage.getItem('bodegaSeleccionada') || null)

  // Multibodega Task 10: cargar bodegas (reintento si Dexie aún no hizo upgrade v10)
  useEffect(() => {
    if (!idSucursal) return
    let vivo = true
    const leer = (intento = 0) => {
      if (!db.bodegas) {
        if (intento < 10) setTimeout(() => leer(intento + 1), 500)
        return
      }
      db.bodegas
        .where('id_sucursal')
        .equals(idSucursal)
        .filter((b) => b.activa)
        .toArray()
        .then((lista) => {
          if (!vivo) return
          setBodegas(lista)
          const guardada = localStorage.getItem('bodegaSeleccionada')
          const activa = lista.find((b) => b.id === guardada) || lista.find((b) => b.es_principal)
          if (activa) setBodegaId(activa.id)
        })
        .catch(() => {
          if (vivo && intento < 10) setTimeout(() => leer(intento + 1), 500)
        })
    }
    leer()
    return () => {
      vivo = false
    }
  }, [idSucursal])

  const secRef = useRef(0)

  // F9 (fixes-prod): Inventario lee el espejo Offline-First del POS, pero antes
  // no lo hidrataba ni escuchaba eventos → los productos creados después de la
  // última hidratación (POS/Login/Historial) nunca aparecían. Ahora hidrata su
  // espejo y reacciona a `cola-sincronizada`/`online`.
  const cargar = useCallback(
    async (hidratar = false) => {
      const sec = ++secRef.current
      if (!idSucursal) {
        setCargando(false)
        return
      }
      try {
        if (hidratar && hayRed()) {
          await hidratarCatalogoParaSucursal(idSucursal).catch(() => {})
          if (sec !== secRef.current) return
        }
        const [prods, cats, stocks, stockSuc, comps, ings] = await Promise.all([
          db.productos.toArray(),
          db.categorias
            .where('id_empresa')
            .equals(empresaId || '')
            .toArray(),
          // multibodega Task 10: si hay bodega seleccionada, stock de esa
          // bodega; si no, fallback a productos_sucursal (compatibilidad)
          bodegaId
            ? leerStockPorBodega(bodegaId).catch(() => [])
            : db.productos_sucursal
                .where('[id_sucursal+id_producto]')
                .between([idSucursal, ''], [idSucursal, '\uffff'])
                .toArray(),
          // F10: la disponibilidad de combos se calcula con el stock de la
          // SUCURSAL (determinista tras la hidratación del catálogo; no depende
          // de que `hidratarBodegas` haya terminado). `productos_sucursal` puede
          // traer duplicados → se suman.
          db.productos_sucursal
            .where('[id_sucursal+id_producto]')
            .between([idSucursal, ''], [idSucursal, '\uffff'])
            .toArray(),
          db.combo_componentes.toArray().catch(() => []),
          db.ingredientes_sucursal
            .where('id_sucursal')
            .equals(idSucursal)
            .toArray()
            .catch(() => []),
        ])
        if (sec !== secRef.current) return

        const stockMap = new Map(stocks.map((s) => [s.id_producto, s]))
        const catMap = new Map(cats.map((c) => [c.id, c.name]))
        const componentesPorProducto = agruparComponentes(comps)
        const ingredientesPorId = new Map(ings.map((s) => [s.id_ingrediente, s.stock ?? 0]))
        const stockSucursalPorProducto = new Map()
        stockSuc.forEach((s) =>
          stockSucursalPorProducto.set(
            s.id_producto,
            (stockSucursalPorProducto.get(s.id_producto) || 0) + (s.stock || 0),
          ),
        )

        // Primera pasada: stock propio (bodega/sucursal) y, para combos, la
        // disponibilidad derivada de la receta (F10).
        const base = prods.map((p) => {
          const esCombo = !!p.contiene_insumos
          const stockPropio = stockMap.get(p.id)?.stock ?? 0
          return {
            ...p,
            esCombo,
            stockPropio,
            stockMostrado: esCombo
              ? disponibilidadCombo(p.id, {
                  componentesPorProducto,
                  stockPorProducto: stockSucursalPorProducto,
                  ingredientesPorId,
                })
              : stockPropio,
            stockMinimo: stockMap.get(p.id)?.stock_minimo ?? 0,
            categoriaNombre: catMap.get(p.id_categoria) || '—',
          }
        })

        // Segunda pasada: un contenedor (con hijos) muestra la suma de sus hijos.
        const hijosPorPadre = new Map()
        base.forEach((p) => {
          if (p.id_padre) {
            const arr = hijosPorPadre.get(p.id_padre) || []
            arr.push(p)
            hijosPorPadre.set(p.id_padre, arr)
          }
        })
        const lista = base.map((p) => {
          const hijos = hijosPorPadre.get(p.id) || []
          if (hijos.length) {
            return {
              ...p,
              esContenedor: true,
              stockMostrado: hijos.reduce((acc, h) => acc + (h.stockMostrado ?? 0), 0),
            }
          }
          return p
        })

        setProductos(lista)
        setCategorias(cats)
      } catch (e) {
        if (sec !== secRef.current) return
        showToast('danger', 'Error', String(e?.message || e))
      } finally {
        if (sec === secRef.current) setCargando(false)
      }
    },
    [idSucursal, empresaId, bodegaId, showToast],
  )

  // Montar / cambiar empresa, sucursal o bodega: hidratar (si hay red) y leer.
  useEffect(() => {
    setTimeout(() => cargar(true), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, empresaId, bodegaId, enLinea])

  // F9: reaccionar a la sincronización (productos/stock) y a la reconexión.
  useEffect(() => {
    const onSync = (e) => {
      const t = e?.detail?.tabla
      if (t && t !== 'stock_bodega' && t !== 'productos') return
      cargar(false) // solo re-leer Dexie (sin re-hidratar → sin bucle)
    }
    const onOnline = () => cargar(true)
    window.addEventListener('cola-sincronizada', onSync)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('cola-sincronizada', onSync)
      window.removeEventListener('online', onOnline)
    }
  }, [cargar])

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return productos.filter((p) => {
      if (filtroCategoria && p.id_categoria !== filtroCategoria) return false
      if (q) {
        const ok =
          (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
        if (!ok) return false
      }
      return true
    })
  }, [productos, busqueda, filtroCategoria])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  const paginaActual = Math.min(pagina, totalPaginas)
  const paginaProductos = filtrados.slice((paginaActual - 1) * PAGE_SIZE, paginaActual * PAGE_SIZE)

  const stockBajo = (p) => !p.esCombo && !p.esContenedor && p.stockMostrado <= p.stockMinimo

  if (!idSucursal) {
    return (
      <p className="text-body-secondary text-center py-4 mb-0">No se encontró la sucursal activa</p>
    )
  }

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Inventario</h5>
          </CCol>
          <CCol xs={12} md={6} className="text-md-end text-body-secondary small">
            {!cargando && `${filtrados.length} producto${filtrados.length === 1 ? '' : 's'}`}
          </CCol>
        </CRow>
        <CRow className="align-items-center g-2">
          <CCol xs={12} md={4}>
            <CFormInput
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPagina(1)
              }}
              placeholder="Buscar por nombre o SKU..."
            />
          </CCol>
          <CCol xs={6} md={3}>
            <CFormSelect
              value={filtroCategoria}
              onChange={(e) => {
                setFiltroCategoria(e.target.value)
                setPagina(1)
              }}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </CFormSelect>
          </CCol>
          {/* Multibodega Task 10: dropdown de bodega (default Principal) */}
          {bodegas.length > 0 && (
            <CCol xs={6} md={2}>
              <CFormSelect
                value={bodegaId || ''}
                onChange={(e) => {
                  setBodegaId(e.target.value)
                  setPagina(1)
                }}
                data-testid="selector-bodega-inventario"
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    📦 {b.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
          )}
          {!enLinea && (
            <CCol xs={12}>
              <small className="text-warning">Sin conexión — mostrando el espejo local.</small>
            </CCol>
          )}
        </CRow>
      </CCardHeader>
      <CCardBody>
        {cargando ? (
          <div className="text-center py-5">
            <CSpinner color="primary" />
          </div>
        ) : paginaProductos.length === 0 ? (
          <div className="text-center py-5 text-body-secondary">
            <CIcon icon={cilInbox} width={36} className="mb-2 opacity-50" />
            <p className="mb-0">No hay productos en el inventario local</p>
          </div>
        ) : (
          <>
            <div className="d-none d-md-block table-responsive">
              <CTable align="middle" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    {['SKU', 'Producto', 'Categoría', 'Stock', 'Stock mín.', 'Precio'].map((h) => (
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
                  {paginaProductos.map((p) => {
                    const bajo = stockBajo(p)
                    return (
                      <CTableRow key={p.id}>
                        <td className="font-monospace small">{p.sku || '—'}</td>
                        <td>{p.name}</td>
                        <td>{p.categoriaNombre}</td>
                        <td>
                          <CBadge color={bajo ? 'danger' : p.esCombo ? 'info' : 'success'}>
                            {p.stockMostrado}
                          </CBadge>
                          {p.esCombo && (
                            <span className="ms-1 small text-body-secondary">
                              Disponible (combo)
                            </span>
                          )}
                          {p.esContenedor && (
                            <span className="ms-1 small text-body-secondary">Variantes</span>
                          )}
                          {bajo && <span className="ms-1 small text-danger">Stock bajo</span>}
                        </td>
                        <td>{p.esCombo || p.esContenedor ? '—' : p.stockMinimo}</td>
                        <td className="monto">
                          {p.precios && p.precios.length > 0 ? formatQ(p.precios[0].precio) : '—'}
                        </td>
                      </CTableRow>
                    )
                  })}
                </CTableBody>
              </CTable>
            </div>

            {/* Móvil (<768px): una tarjeta por producto con stock y precio */}
            <div className="d-md-none lista-tarjetas p-2">
              {paginaProductos.map((p) => {
                const bajo = stockBajo(p)
                return (
                  <TarjetaRegistro
                    key={p.id}
                    titulo={p.name}
                    subtitulo={
                      <>
                        {p.sku || 'Sin SKU'} · {p.categoriaNombre}
                      </>
                    }
                    badge={
                      <div className="d-flex gap-1 flex-wrap justify-content-end">
                        <CBadge color={bajo ? 'danger' : p.esCombo ? 'info' : 'success'}>
                          {p.stockMostrado}
                        </CBadge>
                        {p.esCombo && (
                          <CBadge color="info" className="text-dark">
                            Combo
                          </CBadge>
                        )}
                        {bajo && (
                          <CBadge color="warning" className="text-dark">
                            Stock bajo
                          </CBadge>
                        )}
                      </div>
                    }
                    campos={[
                      {
                        label: p.esCombo ? 'Disponible' : 'Stock',
                        value: p.stockMostrado,
                      },
                      {
                        label: 'Stock mín.',
                        value: p.esCombo || p.esContenedor ? '—' : p.stockMinimo,
                      },
                      {
                        label: 'Precio',
                        value: (
                          <span className="monto">
                            {p.precios && p.precios.length > 0 ? formatQ(p.precios[0].precio) : '—'}
                          </span>
                        ),
                      },
                    ]}
                  />
                )
              })}
            </div>
            {totalPaginas > 1 && (
              <div className="d-flex justify-content-center mt-3">
                <CPagination
                  active={paginaActual}
                  pages={totalPaginas}
                  onActivePageChange={setPagina}
                />
              </div>
            )}
          </>
        )}
      </CCardBody>
    </CCard>
  )
}

export default InventarioPage
