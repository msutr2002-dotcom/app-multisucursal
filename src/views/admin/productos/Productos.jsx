import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilWarning } from '@coreui/icons'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CFormInput,
  CFormSelect,
  CRow,
  CCol,
  CAlert,
  CSpinner,
} from '@coreui/react'
import ProductosTabla from './ProductosTabla'
import ModalProductos from './ModalProductos'
import ModalPrecios from './ModalPrecios'
import ModalStock from './ModalStock'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'
import TarjetaRegistro from '../../../components/common/TarjetaRegistro'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import ProductosTarjeta from './ProductosTarjeta'
import {
  leerProductosAdminLocal,
  leerIngredientesLocal,
  leerFlagsSucursal,
  hidratarIngredientes,
  hidratarFlagsSucursal,
} from '../../../services/catalogSyncService'

const Productos = () => {
  const puedeCrear = usePermission('productos', 'crear')
  const puedeEditar = usePermission('productos', 'editar')
  const puedeEliminar = usePermission('productos', 'eliminar')
  const showToast = useToast()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursalActual = currentUser?.id_sucursal
  const empresaId = localStorage.getItem('empresaSeleccionada')

  const enLinea = useEstadoRed()
  const [sinConexion, setSinConexion] = useState(false)

  const [productos, setProductos] = useState([])
  const [activarIngredientes, setActivarIngredientes] = useState(false)
  const [ingredientes, setIngredientes] = useState([])
  const [opciones, setOpciones] = useState({
    categorias: [],
    marcas: [],
    proveedores: [],
    tipos_precio: [],
    unidades: [],
    colores: [],
  })
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [modalProducto, setModalProducto] = useState(false)
  const [productoSel, setProductoSel] = useState(null)
  const [padreInicial, setPadreInicial] = useState(null)
  const [modalPrecios, setModalPrecios] = useState(false)
  const [modalStock, setModalStock] = useState(false)
  const [aEliminar, setAEliminar] = useState(null)

  const cargar = async () => {
    if (!empresaId) {
      showToast('danger', 'Error', 'No se encontró la empresa activa')
      return
    }
    if (!enLinea) {
      // Sin red: leer de IndexedDB (Task 3)
      setSinConexion(true)
      try {
        const [local, flags, ings] = await Promise.all([
          leerProductosAdminLocal(empresaId, idSucursalActual),
          leerFlagsSucursal(idSucursalActual),
          leerIngredientesLocal(empresaId, idSucursalActual),
        ])
        setProductos(local.productos || [])
        setActivarIngredientes(!!flags?.activar_ingredientes)
        setIngredientes(ings)
        setOpciones({
          categorias: local.categorias || [],
          marcas: local.marcas || [],
          proveedores: local.proveedores || [],
          tipos_precio: local.tipos_precio || [],
          unidades: local.unidades || [],
          colores: local.colores || [],
        })
        setProductoSel((prev) =>
          prev ? (local.productos || []).find((x) => x.id === prev.id) || null : null,
        )
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      }
      return
    }
    setSinConexion(false)
    const [resProductos, resCatalogos] = await Promise.all([
      supabase.rpc('get_productos_admin', {
        p_id_empresa: empresaId,
      }),
      supabase.rpc('get_catalogos', { p_id_empresa: empresaId }),
    ])
    const { data, error } = resProductos
    if (error) {
      showToast('danger', 'Error', error.message)
      return
    }
    if (resCatalogos.error) {
      showToast('danger', 'Error', resCatalogos.error.message)
      return
    }
    // Flags de sucursal + ingredientes (fire-and-forget: no bloquean la vista)
    try {
      await Promise.all([hidratarFlagsSucursal(idSucursalActual), hidratarIngredientes(empresaId)])
      const [flags, ings] = await Promise.all([
        leerFlagsSucursal(idSucursalActual),
        leerIngredientesLocal(empresaId, idSucursalActual),
      ])
      setActivarIngredientes(!!flags?.activar_ingredientes)
      setIngredientes(ings)
    } catch {
      /* sin ingredientes la vista sigue funcionando en modo OFF */
    }
    const lista = data.productos || []
    setProductos(lista)
    setOpciones({
      categorias: data.categorias || [],
      marcas: data.marcas || [],
      proveedores: data.proveedores || [],
      tipos_precio: resCatalogos.data?.tipos_precio || [],
      unidades: data.unidades || [],
      colores: data.colores || resCatalogos.data?.colores || [],
    })
    // mantiene fresco el producto seleccionado tras recargar
    setProductoSel((prev) => (prev ? lista.find((x) => x.id === prev.id) || null : null))
  }

  useEffect(() => {
    setTimeout(() => cargar(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])
  const handleStockDelta = async (producto, delta) => {
    const fila = (producto.stock || []).find((s) => s.id_sucursal === idSucursalActual)
    const actual = fila?.stock ?? 0
    const nuevo = Math.max(0, actual + delta)
    if (nuevo === actual) return

    const { error } = await supabase.rpc('upsert_producto_sucursal', {
      p_id_producto: producto.id,
      p_id_sucursal: idSucursalActual,
      p_stock: nuevo,
      p_stock_minimo: fila?.stock_minimo ?? 0,
    })
    if (error) showToast('danger', 'Error', error.message)
    else cargar()
  }
  const toCents = (v) => (v === '' || v == null ? null : Math.round(parseFloat(v) * 100))

  const handleGuardar = async (datos) => {
    const base = {
      p_name: datos.name,
      p_sku: datos.sku || null,
      p_descripcion: datos.descripcion || null,
      p_id_categoria: datos.id_categoria || null,
      p_id_marca: datos.id_marca || null,
      p_id_proveedor: datos.id_proveedor || null,
      p_id_color: datos.id_color || null,
      p_id_padre: datos.id_padre || null,
      p_precio_compra: toCents(datos.precio_compra) ?? 0,
      p_tipo: datos.tipo,
      p_estado: datos.estado,
      p_id_unidad_compra: datos.id_unidad_compra || null,
      p_id_unidad_venta: datos.id_unidad_venta || null,
      p_imagen: datos.imagen ?? null,
    }

    let idProducto = productoSel?.id ?? null
    let error

    if (productoSel) {
      const res = await supabase.rpc('update_producto_admin', {
        p_id: productoSel.id,
        ...base,
      })
      error = res.error
    } else {
      const res = await supabase.rpc('create_producto_admin', {
        ...base,
        p_precio_normal: toCents(datos.precio_inicial),
        p_id_empresa: empresaId,
      })
      error = res.error
      // RF-C2: para crear combo en un solo paso necesitamos el id retornado
      if (!error && res.data) {
        idProducto =
          typeof res.data === 'string'
            ? res.data
            : res.data.id || res.data.id_producto || res.data?.producto?.id || null
      }
    }
    if (error) return { error: error.message }

    // RF-C2: receta del combo (el switch "Contiene insumos" estaba ON)
    if (datos.contiene_insumos && datos.receta) {
      if (!idProducto) {
        return {
          error:
            'Producto guardado, pero no se pudo obtener su id para la receta. ' +
            'Edítalo y guarda la receta de nuevo.',
        }
      }
      const { error: eReceta } = await supabase.rpc('upsert_combo_componentes', {
        p_id_producto: idProducto,
        p_componentes: datos.receta.componentes,
      })
      if (eReceta) return { error: eReceta.message }

      const { error: eFlag } = await supabase.rpc('set_producto_contiene_insumos', {
        p_id: idProducto,
        p_valor: true,
      })
      if (eFlag) return { error: eFlag.message }

      // Precio final del combo → tier NORMAL (crear o actualizar)
      if (datos.receta.precioFinalCentavos != null) {
        const tipoNormal = (opciones.tipos_precio || []).find(
          (t) => (t.name || '').trim().toUpperCase() === 'NORMAL',
        )
        const normalActual = (productoSel?.precios || []).find(
          (t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL',
        )
        if (!tipoNormal && !normalActual) {
          return { error: 'No existe el tipo de precio NORMAL para esta empresa' }
        }
        const { error: ePrecio } = await supabase.rpc('upsert_precio_producto', {
          p_id: normalActual?.id ?? null,
          p_id_producto: idProducto,
          p_id_tipo_producto: normalActual?.id_tipo_producto ?? tipoNormal.id,
          p_precio: datos.receta.precioFinalCentavos,
          p_min_cantidad: normalActual?.min_cantidad ?? 1,
          p_id_unidad_venta: null,
          p_factor: 1,
        })
        if (ePrecio) return { error: ePrecio.message }
      }
    } else if (
      productoSel &&
      Boolean(datos.contiene_insumos) !== Boolean(productoSel.contiene_insumos)
    ) {
      // Cambio del flag sin receta en el payload (desactivar o activar vacío)
      const { error: eFlag } = await supabase.rpc('set_producto_contiene_insumos', {
        p_id: productoSel.id,
        p_valor: Boolean(datos.contiene_insumos),
      })
      if (eFlag) return { error: eFlag.message }
    }

    await cargar()
    return null
  }
  const handleEliminarConfirm = async () => {
    const { error } = await supabase.rpc('delete_producto_admin', { p_id: aEliminar.id })
    setAEliminar(null)
    if (error) {
      showToast('danger', 'Error', error.message)
    } else {
      showToast('success', 'Éxito', 'Producto eliminado')
      cargar()
    }
  }

  // Agrupación padre/hijo: hijos indexados por id_padre.
  const hijosPorPadre = {}
  productos.forEach((p) => {
    if (p.id_padre) {
      if (!hijosPorPadre[p.id_padre]) hijosPorPadre[p.id_padre] = []
      hijosPorPadre[p.id_padre].push(p)
    }
  })

  const coincide = (p) => {
    const q = busqueda.toLowerCase()
    const okBusq =
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.marca?.toLowerCase().includes(q)
    const okEstado = !filtroEstado || p.estado === filtroEstado
    const okCat = !filtroCategoria || p.id_categoria === filtroCategoria
    return okBusq && okEstado && okCat
  }

  // Solo raíces (padres + productos sueltos). Un padre entra si él o alguna
  // de sus variantes coincide con los filtros.
  const filtrados = productos.filter(
    (p) => !p.id_padre && (coincide(p) || (hijosPorPadre[p.id] || []).some(coincide)),
  )

  const abrirEditar = (p) => {
    setPadreInicial(null)
    setProductoSel(p)
    setModalProducto(true)
  }
  const abrirAgregarVariante = (p) => {
    setProductoSel(null)
    setPadreInicial(p)
    setModalProducto(true)
  }

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center mb-2">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Gestión de Productos</h5>
          </CCol>
        </CRow>
        <CRow className="align-items-center g-2">
          <CCol xs={12} md={4}>
            <CFormInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre, SKU o marca..."
            />
          </CCol>
          <CCol xs={6} md={3}>
            <CFormSelect value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
              <option value="">Todos los estados</option>
              <option value="disponible">Disponible</option>
              <option value="agotado">Agotado</option>
              <option value="descontinuado">Descontinuado</option>
            </CFormSelect>
          </CCol>
          <CCol xs={6} md={3}>
            <CFormSelect
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {(opciones.categorias || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </CFormSelect>
          </CCol>
          <CCol xs={12} md={2} className="d-flex justify-content-end">
            {puedeCrear && (
              <CButton
                color="primary"
                className="text-nowrap"
                onClick={() => {
                  setPadreInicial(null)
                  setProductoSel(null)
                  setModalProducto(true)
                }}
              >
                <CIcon icon={cilPlus} className="me-2" />
                Producto
              </CButton>
            )}
          </CCol>
        </CRow>
      </CCardHeader>

      {sinConexion && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>Sin conexión. Productos desde almacenamiento local — solo lectura.</span>
        </CAlert>
      )}

      <CCardBody>
        {filtrados.length === 0 ? (
          <p className="text-body-secondary text-center py-4 mb-0">No hay productos</p>
        ) : (
          <>
            {/* Escritorio: tabla (Desktop intacto) */}
            <div className="d-none d-md-block table-responsive">
              <ProductosTabla
                productos={filtrados}
                hijosPorPadre={hijosPorPadre}
                idSucursalActual={idSucursalActual}
                puedeEditar={puedeEditar}
                puedeEliminar={puedeEliminar}
                puedeCrear={puedeCrear}
                onEditar={abrirEditar}
                onAgregarVariante={abrirAgregarVariante}
                onPrecios={(p) => {
                  setProductoSel(p)
                  setModalPrecios(true)
                }}
                onStock={(p) => {
                  setProductoSel(p)
                  setModalStock(true)
                }}
                onEliminar={(p) => setAEliminar(p)}
                onStockDelta={handleStockDelta}
              />
            </div>

            {/* Móvil (<768px): tarjetas con acciones visibles */}
            <div className="d-md-none lista-tarjetas p-2">
              <ProductosTarjeta
                productos={filtrados}
                hijosPorPadre={hijosPorPadre}
                idSucursalActual={idSucursalActual}
                puedeEditar={puedeEditar}
                puedeEliminar={puedeEliminar}
                puedeCrear={puedeCrear}
                onEditar={abrirEditar}
                onAgregarVariante={abrirAgregarVariante}
                onPrecios={(p) => {
                  setProductoSel(p)
                  setModalPrecios(true)
                }}
                onStock={(p) => {
                  setProductoSel(p)
                  setModalStock(true)
                }}
                onEliminar={(p) => setAEliminar(p)}
                onStockDelta={handleStockDelta}
              />
            </div>
          </>
        )}
      </CCardBody>

      <ModalProductos
        visible={modalProducto}
        onClose={() => {
          setModalProducto(false)
          setPadreInicial(null)
        }}
        onSave={handleGuardar}
        producto={productoSel}
        opciones={opciones}
        productos={productos}
        modoIngrediente={activarIngredientes}
        ingredientes={ingredientes}
        padreInicial={padreInicial}
        nHijos={(hijosPorPadre[productoSel?.id] || []).length}
      />

      <ModalPrecios
        visible={modalPrecios}
        onClose={() => setModalPrecios(false)}
        producto={productoSel}
        tiposPrecio={opciones.tipos_precio}
        unidades={opciones.unidades}
        onCambio={cargar}
      />

      <ModalStock
        visible={modalStock}
        onClose={() => setModalStock(false)}
        producto={productoSel}
        onCambio={cargar}
        idSucursalActual={idSucursalActual}
      />

      <ConfirmModal
        visible={!!aEliminar}
        message={`¿Eliminar el producto "${aEliminar?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={handleEliminarConfirm}
        onCancel={() => setAEliminar(null)}
      />
    </CCard>
  )
}

export default Productos
