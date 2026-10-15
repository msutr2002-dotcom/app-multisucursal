import { useState, useEffect, useMemo } from 'react'
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
import { formatQ } from '../../utils/format'
import { useToast } from '../../components/common/ToastContext'
import { leerStockPorBodega } from '../../services/catalogSyncService'

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

  useEffect(() => {
    ;(async () => {
      if (!idSucursal) {
        setCargando(false)
        return
      }
      try {
        const [prods, cats, stocks] = await Promise.all([
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
        ])
        const stockMap = new Map(stocks.map((s) => [s.id_producto, s]))
        const catMap = new Map(cats.map((c) => [c.id, c.name]))
        const lista = prods.map((p) => ({
          ...p,
          stockActual: stockMap.get(p.id)?.stock ?? 0,
          stockMinimo: stockMap.get(p.id)?.stock_minimo ?? 0,
          categoriaNombre: catMap.get(p.id_categoria) || '—',
        }))
        setProductos(lista)
        setCategorias(cats)
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      } finally {
        setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, empresaId, bodegaId])

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

  const stockBajo = (p) => p.stockActual <= p.stockMinimo

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
            <div className="table-responsive">
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
                          <CBadge color={bajo ? 'danger' : 'success'}>{p.stockActual}</CBadge>
                          {bajo && <span className="ms-1 small text-danger">Stock bajo</span>}
                        </td>
                        <td>{p.stockMinimo}</td>
                        <td className="monto">
                          {p.precios && p.precios.length > 0 ? formatQ(p.precios[0].precio) : '—'}
                        </td>
                      </CTableRow>
                    )
                  })}
                </CTableBody>
              </CTable>
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
