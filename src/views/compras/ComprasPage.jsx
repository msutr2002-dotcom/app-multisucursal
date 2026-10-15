import { useState, useEffect } from 'react'
import {
  CCard,
  CCardHeader,
  CCardBody,
  CRow,
  CCol,
  CButton,
  CFormInput,
  CFormSelect,
  CTable,
  CTableHead,
  CTableRow,
  CTableHeaderCell,
  CTableBody,
  CBadge,
  CSpinner,
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CAlert,
  CPagination,
  CTabs,
  CTabList,
  CTab,
  CTabContent,
  CTabPanel,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilReload, cilBan, cilX, cilFile, cilInbox, cilCheckCircle } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { formatQ } from '../../utils/format'
import { useToast } from '../../components/common/ToastContext'
import usePermission from '../../hooks/usePermission'
import useEstadoRed from '../../hooks/useEstadoRed'
import ConfirmModal from '../dashboard/components/common/ConfirmModal'
import ModalComprobanteCompra from './ModalComprobanteCompra'
import {
  registrarCompraLocal,
  listarComprasLocal,
  guardarComprobanteLocal,
  registrarEntradaLocal,
  listarEntradasLocal,
} from '../../services/compraOfflineService'
import {
  leerCatalogosLocales,
  leerIngredientesLocal,
  leerFlagsSucursal,
  hidratarIngredientes,
  hidratarFlagsSucursal,
} from '../../services/catalogSyncService'
import { hayRed } from '../../services/redService'

const LIMITE = 50

const BADGE_ESTADO = {
  completada: 'success',
  anulada: 'danger',
}

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// En el servidor `items` viene como conteo; en el espejo local como snapshot
const numItems = (items) => (Array.isArray(items) ? items.length : Number(items) || 0)

// Snapshot de líneas legible para el tooltip del conteo: "4 Caja (48 und) × Q15.00"
const resumenItems = (items) =>
  Array.isArray(items)
    ? items
        .map((i) => {
          const base = Number(i.factor) > 1 ? ` (${i.cantidad * i.factor} und)` : ''
          const und = i.unidad ? ` ${i.unidad}` : ''
          return `${i.cantidad}${und}${base} ${i.name}`.trim()
        })
        .join(' · ')
    : ''

// Filas locales que aún no están en el servidor: PENDING (esperando cola) o
// CONFLICT (rechazo de negocio, RF-C3) — ambas se suman a la lista con red
const esPendienteLocal = (f) => f.sync_status === 'PENDING' || f.sync_status === 'CONFLICT'

const ComprasPage = () => {
  const showToast = useToast()
  const puedeCrear = usePermission('compras', 'crear')
  const puedeAnular = usePermission('compras', 'eliminar')
  const enLinea = useEstadoRed()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursal = currentUser?.id_sucursal
  const empresaId = localStorage.getItem('empresaSeleccionada')

  const [pestana, setPestana] = useState('compras')
  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [cargando, setCargando] = useState(!!idSucursal)
  const [busquedaInput, setBusquedaInput] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  // Alta de compra
  const [modalAlta, setModalAlta] = useState(false)
  const [proveedores, setProveedores] = useState([])
  const [productosAlta, setProductosAlta] = useState([])
  const [activarIngredientes, setActivarIngredientes] = useState(false)
  const [ingredientesAlta, setIngredientesAlta] = useState([])
  const [idProveedor, setIdProveedor] = useState('')
  const [selTipo, setSelTipo] = useState('producto')
  const [selProducto, setSelProducto] = useState('')
  const [selUnidad, setSelUnidad] = useState('') // '' = unidad base (factor 1)
  const [unidadMap, setUnidadMap] = useState({})
  const [selIngrediente, setSelIngrediente] = useState('')
  const [selCantidad, setSelCantidad] = useState('1')
  const [selPrecio, setSelPrecio] = useState('')
  const [lineas, setLineas] = useState([])
  const [adjunto, setAdjunto] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [guardando, setGuardando] = useState(false)

  // Anulación (la UI "eliminar" es soft-delete, Task 1b)
  const [aAnular, setAAnular] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)
  // Task 6: previsualización/impresión del comprobante (espejo local, sin red)
  const [filaComp, setFilaComp] = useState(null)

  // Entrada de stock (Task 5)
  const [modalEntrada, setModalEntrada] = useState(false)
  const [entProducto, setEntProducto] = useState('')
  const [entCantidad, setEntCantidad] = useState('1')
  const [entMotivo, setEntMotivo] = useState('')
  const [guardandoEntrada, setGuardandoEntrada] = useState(false)

  // Multibodega Task 7: bodegas de la sucursal + bodega activa
  const [bodegas, setBodegas] = useState([])
  const [idBodega, setIdBodega] = useState(null)

  // Búsqueda con debounce (mismo patrón que HistorialPage)
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(busquedaInput)
      setOffset(0)
    }, 350)
    return () => clearTimeout(t)
  }, [busquedaInput])

  // Catálogos del alta: todo local, una sola vez
  useEffect(() => {
    if (!idSucursal) return
    ;(async () => {
      try {
        // Task 4: flags de sucursal + ingredientes (fire-and-forget con red)
        if (enLinea) {
          try {
            await Promise.all([hidratarFlagsSucursal(idSucursal), hidratarIngredientes(empresaId)])
          } catch {
            /* la compra de productos sigue funcionando sin esto */
          }
        }
        const [cats, prods, stocks, flags, ings, unidadesCat] = await Promise.all([
          leerCatalogosLocales(empresaId),
          db.productos.toArray(),
          db.productos_sucursal
            .where('[id_sucursal+id_producto]')
            .between([idSucursal, ''], [idSucursal, '\uffff'])
            .toArray(),
          leerFlagsSucursal(idSucursal),
          leerIngredientesLocal(empresaId, idSucursal),
          db.unidades.toArray(),
        ])
        const stockMap = new Map(stocks.map((s) => [s.id_producto, s]))
        setProveedores(cats.proveedores || [])
        setActivarIngredientes(!!flags?.activar_ingredientes)
        setIngredientesAlta(ings.filter((i) => i.activo !== false))
        setUnidadMap(Object.fromEntries(unidadesCat.map((u) => [u.id, u.name])))
        setProductosAlta(
          prods
            // Sin filtrar por productos_sucursal: un producto del catálogo sin
            // fila de sucursal (recién creado) debe poder comprarse (stock 0).
            .map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              stock: stockMap.get(p.id)?.stock ?? 0,
              stockMin: stockMap.get(p.id)?.stock_minimo ?? 0,
              // compras-unidades: tiers de presentación del catálogo hidratado
              precios: p.precios || [],
            }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        )
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, empresaId, enLinea])

  // Multibodega Task 7: cargar bodegas de la sucursal (reintento si Dexie aún no hizo upgrade)
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
          if (activa) setIdBodega(activa.id)
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

  // Listado: local primero (instantáneo y sin red); con red el servidor manda
  // y se suman solo las filas locales que la cola todavía no envió.
  useEffect(() => {
    if (!idSucursal) return
    ;(async () => {
      try {
        if (pestana === 'entradas') {
          const local = await listarEntradasLocal({
            idSucursal,
            busqueda,
            limite: LIMITE,
            offset,
          })
          if (!enLinea) {
            setFilas(local.entradas)
            setTotal(local.total)
            return
          }
          const { data, error } = await supabase.rpc('get_entradas', {
            p_id_sucursal: idSucursal,
            p_desde: null,
            p_hasta: null,
            p_busqueda: busqueda || null,
            p_limite: LIMITE,
            p_offset: offset,
          })
          if (error) {
            showToast('warning', 'Sin respuesta del servidor', error.message)
            setFilas(local.entradas)
            setTotal(local.total)
            return
          }
          const remotas = data?.entradas || []
          const idsRemotos = new Set(remotas.map((r) => r.id))
          const pendientes =
            offset === 0
              ? local.entradas.filter((f) => esPendienteLocal(f) && !idsRemotos.has(f.id))
              : []
          setTotal((data?.total ?? 0) + pendientes.length)
          setFilas(offset > 0 ? [...remotas] : [...remotas, ...pendientes])
          return
        }

        const local = await listarComprasLocal({
          idSucursal,
          busqueda,
          estado: filtroEstado || undefined,
          limite: LIMITE,
          offset,
        })

        if (!enLinea) {
          setFilas(local.compras)
          setTotal(local.total)
          return
        }

        const { data, error } = await supabase.rpc('get_compras', {
          p_id_sucursal: idSucursal,
          p_estado: filtroEstado || null,
          p_desde: null,
          p_hasta: null,
          p_busqueda: busqueda || null,
          p_limite: LIMITE,
          p_offset: offset,
        })
        if (error) {
          // El navegador tiene red pero el servidor no respondió: espejo local
          showToast('warning', 'Sin respuesta del servidor', error.message)
          setFilas(local.compras)
          setTotal(local.total)
          return
        }

        const remotas = data?.compras || []
        const idsRemotos = new Set(remotas.map((r) => r.id))
        const pendientes =
          offset === 0
            ? local.compras.filter((f) => esPendienteLocal(f) && !idsRemotos.has(f.id))
            : []
        setTotal((data?.total ?? 0) + pendientes.length)
        setFilas(offset > 0 ? [...remotas] : [...remotas, ...pendientes])
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      } finally {
        setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, busqueda, filtroEstado, offset, tick, enLinea, pestana])

  // Task 7: la cola sincroniza en segundo plano → refrescar al confirmarse filas
  useEffect(() => {
    const alSincronizar = () => {
      setCargando(true)
      setOffset(0)
      setTick((t) => t + 1)
    }
    window.addEventListener('cola-sincronizada', alSincronizar)
    return () => window.removeEventListener('cola-sincronizada', alSincronizar)
  }, [])

  const recargar = () => {
    setCargando(true)
    setOffset(0)
    setTick((t) => t + 1)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE))
  const paginaActual = Math.floor(offset / LIMITE) + 1

  const totalLineas = lineas.reduce((s, l) => s + l.subtotal, 0)

  const abrirAlta = () => {
    if (!puedeCrear) return
    setIdProveedor('')
    setSelTipo('producto')
    setSelProducto('')
    setSelUnidad('')
    setSelIngrediente('')
    setSelCantidad('1')
    setSelPrecio('')
    setLineas([])
    setAdjunto(null)
    setPreviewUrl(null)
    setModalAlta(true)
  }

  const cerrarAlta = () => {
    if (guardando) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setModalAlta(false)
  }

  // compras-unidades RF-UC1: tiers con factor > 1 del producto elegido;
  // sin tiers el flujo es idéntico al actual (unidad base, factor 1).
  const productoActivo = productosAlta.find((p) => p.id === selProducto) || null
  const presentaciones = (productoActivo?.precios || []).filter((t) => (Number(t.factor) || 1) > 1)
  const tierActivo = presentaciones.find((t) => t.id === selUnidad) || null
  const factorActivo = Number(tierActivo?.factor) || 1
  const nombreUnidad = tierActivo ? unidadMap[tierActivo.id_unidad_venta] || 'Presentación' : 'Und.'

  const agregarLinea = () => {
    const esIngrediente = activarIngredientes && selTipo === 'ingrediente'
    let nombre
    let idRef
    let idPrecio = null
    let factor = 1
    let unidadNombre = null

    if (esIngrediente) {
      const ing = ingredientesAlta.find((i) => i.id === selIngrediente)
      if (!ing) {
        showToast('warning', 'Falta el ingrediente', 'Selecciona un ingrediente de la lista')
        return
      }
      nombre = ing.name
      idRef = ing.id
    } else {
      const producto = productosAlta.find((p) => p.id === selProducto)
      if (!producto) {
        showToast('warning', 'Falta el producto', 'Selecciona un producto de la lista')
        return
      }
      nombre = producto.name
      idRef = producto.id
      // compras-unidades: unidad elegida (D1 — el precio es por la unidad de compra)
      if (tierActivo) {
        idPrecio = tierActivo.id
        factor = factorActivo
        unidadNombre = nombreUnidad
      }
    }

    const cantidad = Number.parseInt(selCantidad, 10)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      showToast('warning', 'Cantidad inválida', 'Usa un entero mayor a cero')
      return
    }
    const precioQ = Number.parseFloat(selPrecio)
    if (!Number.isFinite(precioQ) || precioQ < 0) {
      showToast('warning', 'Precio inválido', 'Ingresa el precio unitario en quetzales')
      return
    }
    const precio = Math.round(precioQ * 100)
    // D3: merge por (producto, unidad) — 2 CAJA + 3 UNIDAD son dos líneas
    const clave = `${idRef}|${idPrecio ?? ''}`
    const existente = !esIngrediente && lineas.find((l) => l.clave === clave)
    if (existente) {
      setLineas((ls) =>
        ls.map((l) =>
          l.clave === clave
            ? {
                ...l,
                cantidad: l.cantidad + cantidad,
                subtotal: (l.cantidad + cantidad) * l.precio,
              }
            : l,
        ),
      )
    } else {
      setLineas((ls) => [
        ...ls,
        esIngrediente
          ? {
              clave,
              id_ingrediente: idRef,
              name: nombre,
              cantidad,
              precio,
              subtotal: precio * cantidad,
            }
          : {
              clave,
              id_producto: idRef,
              id_precio_producto: idPrecio,
              factor,
              unidad: unidadNombre,
              name: nombre,
              cantidad,
              precio,
              subtotal: precio * cantidad,
            },
      ])
    }
    setSelProducto('')
    setSelUnidad('')
    setSelIngrediente('')
    setSelCantidad('1')
    setSelPrecio('')
  }

  const quitarLinea = (idx) => setLineas((ls) => ls.filter((_, i) => i !== idx))

  const onArchivo = (e) => {
    const f = e.target.files?.[0] || null
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    if (!f) {
      setAdjunto(null)
      setPreviewUrl(null)
      return
    }
    if (f.size > 4 * 1024 * 1024) {
      showToast('danger', 'Adjunto muy grande', 'El archivo no puede superar 4 MB')
      e.target.value = ''
      setAdjunto(null)
      setPreviewUrl(null)
      return
    }
    setAdjunto(f)
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  const registrar = async () => {
    if (guardando) return
    if (!idProveedor) {
      showToast('warning', 'Falta el proveedor', 'Selecciona el proveedor de la compra')
      return
    }
    if (!lineas.length) {
      showToast('warning', 'Sin productos', 'Agrega al menos una línea a la compra')
      return
    }
    setGuardando(true)
    try {
      const { idCompra } = await registrarCompraLocal({
        idSucursal,
        idProveedor,
        idUsuario: currentUser?.id ?? null,
        idBodega: idBodega || null,
        items: lineas.map((l) => ({
          ...(l.id_ingrediente
            ? { id_ingrediente: l.id_ingrediente }
            : { id_producto: l.id_producto }),
          cantidad: l.cantidad,
          precio_unitario: l.precio,
          // compras-unidades: el servidor resuelve el factor (D2)
          ...(l.id_precio_producto ? { id_precio_producto: l.id_precio_producto } : {}),
        })),
      })
      if (adjunto) {
        try {
          await guardarComprobanteLocal({
            idCompra,
            idSucursal,
            tipo: 'factura',
            archivo: adjunto,
          })
        } catch (e) {
          showToast('warning', 'Adjunto no guardado', String(e?.message || e))
        }
      }
      showToast(
        'success',
        'Compra registrada',
        enLinea
          ? 'Guardada en el dispositivo y en cola de sincronización'
          : 'Sin conexión: guardada localmente (cola PENDING)',
      )
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setModalAlta(false)
      recargar()
    } catch (e) {
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  const prodEntrada = productosAlta.find((p) => p.id === entProducto) || null
  const cantPrevista = Number.parseInt(entCantidad, 10)
  const stockFinal =
    prodEntrada && Number.isInteger(cantPrevista) && cantPrevista > 0
      ? prodEntrada.stock + cantPrevista
      : null

  const abrirEntrada = () => {
    if (!puedeCrear) return
    setEntProducto('')
    setEntCantidad('1')
    setEntMotivo('')
    setModalEntrada(true)
  }

  const cerrarEntrada = () => {
    if (guardandoEntrada) return
    setModalEntrada(false)
  }

  const registrarEntrada = async () => {
    if (guardandoEntrada) return
    if (!entProducto) {
      showToast('warning', 'Falta el producto', 'Selecciona el producto de la entrada')
      return
    }
    if (!Number.isInteger(cantPrevista) || cantPrevista <= 0) {
      showToast('warning', 'Cantidad inválida', 'Usa un entero mayor a cero')
      return
    }
    if (!entMotivo.trim()) {
      showToast('warning', 'Falta el motivo', 'El motivo de la entrada es obligatorio')
      return
    }
    setGuardandoEntrada(true)
    try {
      await registrarEntradaLocal({
        idSucursal,
        idProducto: entProducto,
        cantidad: cantPrevista,
        motivo: entMotivo.trim(),
        idUsuario: currentUser?.id ?? null,
        idBodega: idBodega || null,
      })
      // El stock del selector se actualiza al instante (criterio de la Task 5)
      setProductosAlta((ps) =>
        ps.map((p) => (p.id === entProducto ? { ...p, stock: p.stock + cantPrevista } : p)),
      )
      showToast(
        'success',
        'Entrada registrada',
        enLinea
          ? 'Stock actualizado en el dispositivo (cola PENDING)'
          : 'Sin conexión: guardada localmente (cola PENDING)',
      )
      setModalEntrada(false)
      recargar()
    } catch (e) {
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      setGuardandoEntrada(false)
    }
  }

  const abrirAnular = (fila) => {
    if (fila.sync_status === 'PENDING' || fila.sync_status === 'CONFLICT') {
      showToast(
        'warning',
        fila.sync_status === 'CONFLICT'
          ? 'Compra con error de sincronización'
          : 'Compra local sin sincronizar',
        fila.sync_status === 'CONFLICT'
          ? 'El servidor rechazó su sincronización: revísala antes de anularla.'
          : 'Todavía no existe en el servidor: la anulación estará disponible cuando se sincronice.',
      )
      return
    }
    setMotivo('')
    setAAnular(fila)
  }

  const handleAnular = () => {
    if (anulando) return
    if (!hayRed()) {
      setAAnular(null)
      showToast(
        'warning',
        'Sin conexión',
        'La anulación se registra en el servidor: inténtalo de nuevo al recuperar la red.',
      )
      return
    }
    const fila = aAnular
    const motivoEnvio = motivo
    setAnulando(true)
    setAAnular(null)
    setMotivo('')
    supabase
      .rpc('anular_compra', {
        p_id: fila.id,
        p_id_sucursal: idSucursal,
        p_id_usuario: currentUser?.id ?? null,
        p_motivo: motivoEnvio.trim() || null,
      })
      .then(async ({ error }) => {
        if (error) {
          showToast('danger', 'Error', error.message)
          return
        }
        await db.compras
          .update(fila.id, {
            estado: 'anulada',
            motivo_anulacion: motivoEnvio.trim() || null,
          })
          .catch(() => {})
        showToast('success', 'Compra anulada', 'El stock fue devuelto a la sucursal')
        recargar()
      })
      .catch((e) => {
        showToast('danger', 'Error', String(e?.message || e))
      })
      .finally(() => setAnulando(false))
  }

  if (!idSucursal) {
    return (
      <p className="text-body-secondary text-center py-4 mb-0">No se encontró la sucursal activa</p>
    )
  }

  const esCompras = pestana === 'compras'

  const listado = (
    <>
      <CRow className="g-2 align-items-center mb-3">
        <CCol xs={12} md={5}>
          <CFormInput
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            placeholder={
              esCompras ? 'Buscar por proveedor o producto...' : 'Buscar por producto o motivo...'
            }
          />
        </CCol>
        {esCompras && (
          <CCol xs={6} md={3}>
            <CFormSelect
              value={filtroEstado}
              onChange={(e) => {
                setFiltroEstado(e.target.value)
                setOffset(0)
              }}
            >
              <option value="">Todos los estados</option>
              <option value="completada">Completadas</option>
              <option value="anulada">Anuladas</option>
            </CFormSelect>
          </CCol>
        )}
        <CCol xs={6} md={4} className="text-md-end text-body-secondary small">
          {!cargando && `${total} ${esCompras ? 'compra' : 'entrada'}${total === 1 ? '' : 's'}`}
        </CCol>
      </CRow>

      {cargando ? (
        <div className="text-center py-5">
          <CSpinner color="primary" />
        </div>
      ) : filas.length === 0 ? (
        <div className="text-center py-5 text-body-secondary">
          <CIcon icon={cilInbox} width={36} className="mb-2 opacity-50" />
          <p className="mb-0">
            {esCompras ? 'No hay compras registradas' : 'No hay entradas registradas'}
          </p>
        </div>
      ) : (
        <>
          <div className="table-responsive">
            <CTable align="middle" className="mb-0">
              <CTableHead>
                <CTableRow>
                  {(esCompras
                    ? ['Fecha', 'Proveedor', 'Usuario', 'Artículos', 'Total', 'Estado']
                    : ['Fecha', 'Producto', 'Cantidad', 'Motivo', 'Usuario', 'Estado']
                  ).map((h) => (
                    <CTableHeaderCell
                      key={h}
                      className="small text-uppercase text-body-secondary border-bottom"
                    >
                      {h}
                    </CTableHeaderCell>
                  ))}
                  {esCompras && (
                    <CTableHeaderCell className="small text-uppercase text-body-secondary border-bottom text-end">
                      Acciones
                    </CTableHeaderCell>
                  )}
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {filas.map((f) =>
                  esCompras ? (
                    <CTableRow key={f.id}>
                      <td className="small">{fechaHora(f.fecha)}</td>
                      <td>{f.proveedor || '—'}</td>
                      <td>{f.usuario || '—'}</td>
                      <td title={resumenItems(f.items)}>{numItems(f.items)}</td>
                      <td className="monto">{formatQ(f.total)}</td>
                      <td>
                        <CBadge color={BADGE_ESTADO[f.estado] || 'secondary'}>{f.estado}</CBadge>
                        {f.sync_status === 'PENDING' && (
                          <CBadge color="warning" className="ms-1">
                            sin sincronizar
                          </CBadge>
                        )}
                        {f.sync_status === 'CONFLICT' && (
                          <CBadge
                            color="danger"
                            className="ms-1"
                            title={f.ultimo_error || 'El servidor rechazó la operación'}
                          >
                            conflicto
                          </CBadge>
                        )}
                      </td>
                      <td className="text-end">
                        <CButton
                          color="secondary"
                          variant="outline"
                          size="sm"
                          onClick={() => setFilaComp(f)}
                          title="Ver comprobante"
                          className="me-1"
                        >
                          <CIcon icon={cilFile} />
                        </CButton>
                        {puedeAnular && f.estado === 'completada' && (
                          <CButton
                            color="danger"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirAnular(f)}
                            disabled={anulando}
                            title="Anular compra"
                          >
                            <CIcon icon={cilBan} />
                          </CButton>
                        )}
                      </td>
                    </CTableRow>
                  ) : (
                    <CTableRow key={f.id}>
                      <td className="small">{fechaHora(f.fecha)}</td>
                      <td>{f.producto || '—'}</td>
                      <td>
                        <CBadge color="success">
                          {f.cantidad > 0 ? `+${f.cantidad}` : f.cantidad}
                        </CBadge>
                      </td>
                      <td className="small">{f.motivo || '—'}</td>
                      <td>{f.usuario || '—'}</td>
                      <td>
                        {f.sync_status === 'PENDING' ? (
                          <CBadge color="warning">sin sincronizar</CBadge>
                        ) : f.sync_status === 'CONFLICT' ? (
                          <CBadge color="danger" title={f.ultimo_error || 'Rechazo del servidor'}>
                            conflicto
                          </CBadge>
                        ) : (
                          <span className="text-body-secondary">—</span>
                        )}
                      </td>
                    </CTableRow>
                  ),
                )}
              </CTableBody>
            </CTable>
          </div>
          {totalPaginas > 1 && (
            <div className="d-flex justify-content-center mt-3">
              <CPagination
                active={paginaActual}
                pages={totalPaginas}
                onActivePageChange={(p) => setOffset((p - 1) * LIMITE)}
              />
            </div>
          )}
        </>
      )}
    </>
  )

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Compras y entradas</h5>
          </CCol>
          <CCol xs={12} md={6} className="text-md-end">
            {pestana === 'compras' ? (
              <CButton
                color="success"
                size="sm"
                onClick={abrirAlta}
                disabled={!puedeCrear}
                className="me-2"
              >
                <CIcon icon={cilPlus} className="me-1" />
                Nueva compra
              </CButton>
            ) : (
              <CButton
                color="success"
                size="sm"
                onClick={abrirEntrada}
                disabled={!puedeCrear}
                className="me-2"
              >
                <CIcon icon={cilPlus} className="me-1" />
                Nueva entrada
              </CButton>
            )}
            <CButton
              color="secondary"
              variant="outline"
              size="sm"
              onClick={recargar}
              title="Recargar listado"
            >
              <CIcon icon={cilReload} />
            </CButton>
          </CCol>
        </CRow>
      </CCardHeader>
      <CCardBody>
        {!enLinea && (
          <CAlert color="warning" className="py-2">
            Sin conexión: estás viendo los registros locales. El alta de compras y entradas sigue
            permitida.
          </CAlert>
        )}
        <CTabs
          activeItemKey={pestana}
          onChange={(k) => {
            setPestana(k)
            setOffset(0)
          }}
        >
          <CTabList className="mb-3">
            <CTab itemKey="compras">Compras</CTab>
            <CTab itemKey="entradas">Entradas</CTab>
          </CTabList>
          <CTabContent>
            <CTabPanel itemKey="compras">{pestana === 'compras' && listado}</CTabPanel>
            <CTabPanel itemKey="entradas">{pestana === 'entradas' && listado}</CTabPanel>
          </CTabContent>
        </CTabs>
      </CCardBody>

      <CModal visible={modalAlta} onClose={cerrarAlta} size="lg">
        <CModalHeader onClose={cerrarAlta}>
          <CModalTitle>Nueva compra</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <label className="form-label small mb-1">Proveedor</label>
          <CFormSelect
            value={idProveedor}
            onChange={(e) => setIdProveedor(e.target.value)}
            className="mb-3"
          >
            <option value="">Seleccione el proveedor...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </CFormSelect>

          {bodegas.length > 1 && (
            <>
              <label className="form-label small mb-1">Bodega destino</label>
              <CFormSelect
                value={idBodega || ''}
                onChange={(e) => setIdBodega(e.target.value)}
                className="mb-3"
                data-testid="selector-bodega-compra"
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    📦 {b.name}
                  </option>
                ))}
              </CFormSelect>
            </>
          )}

          {activarIngredientes && (
            <CRow className="g-2 align-items-end mb-2">
              <CCol md={3}>
                <label className="form-label small mb-1">Tipo de línea</label>
                <CFormSelect value={selTipo} onChange={(e) => setSelTipo(e.target.value)}>
                  <option value="producto">Producto</option>
                  <option value="ingrediente">Ingrediente</option>
                </CFormSelect>
              </CCol>
            </CRow>
          )}

          <CRow className="g-2 align-items-end mb-2">
            <CCol md={presentaciones.length ? 4 : 5}>
              <label className="form-label small mb-1">
                {activarIngredientes && selTipo === 'ingrediente' ? 'Ingrediente' : 'Producto'}
              </label>
              {activarIngredientes && selTipo === 'ingrediente' ? (
                <CFormSelect
                  value={selIngrediente}
                  onChange={(e) => setSelIngrediente(e.target.value)}
                >
                  <option value="">Seleccione...</option>
                  {ingredientesAlta.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.unidad_abrev ? ` (${i.unidad_abrev})` : ''} — stock {i.stock ?? 0}
                    </option>
                  ))}
                </CFormSelect>
              ) : (
                <CFormSelect
                  value={selProducto}
                  onChange={(e) => {
                    setSelProducto(e.target.value)
                    setSelUnidad('')
                  }}
                >
                  <option value="">Seleccione...</option>
                  {productosAlta.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.sku ? ` (${p.sku})` : ''} — stock {p.stock}
                    </option>
                  ))}
                </CFormSelect>
              )}
            </CCol>
            {presentaciones.length > 0 && (
              <CCol md={2}>
                <label className="form-label small mb-1">Unidad</label>
                <CFormSelect value={selUnidad} onChange={(e) => setSelUnidad(e.target.value)}>
                  <option value="">Unidad (×1)</option>
                  {presentaciones.map((t) => (
                    <option key={t.id} value={t.id}>
                      {unidadMap[t.id_unidad_venta] || 'Presentación'} (×{t.factor} und)
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            <CCol md={2}>
              <label className="form-label small mb-1">Cantidad ({nombreUnidad})</label>
              <CFormInput
                type="number"
                min={1}
                step={1}
                value={selCantidad}
                onChange={(e) => setSelCantidad(e.target.value)}
              />
            </CCol>
            <CCol md={3}>
              <label className="form-label small mb-1">
                Precio unit. {tierActivo ? `(${nombreUnidad})` : ''} (Q)
              </label>
              <CFormInput
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={selPrecio}
                onChange={(e) => setSelPrecio(e.target.value)}
              />
            </CCol>
            <CCol md={presentaciones.length ? 1 : 2}>
              <CButton color="primary" variant="outline" onClick={agregarLinea} className="w-100">
                <CIcon icon={cilPlus} className="me-1" />
                Agregar
              </CButton>
            </CCol>
          </CRow>
          {selProducto && presentaciones.length > 0 && (
            <p className="small text-body-secondary mt-0 mb-2">
              {factorActivo > 1
                ? `1 ${nombreUnidad} = ${factorActivo} und. base`
                : 'Unidad base (×1)'}
            </p>
          )}

          {lineas.length === 0 ? (
            <p className="text-body-secondary small">Sin líneas: agrega productos a la compra.</p>
          ) : (
            <div className="table-responsive">
              <CTable size="sm" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <th>Concepto</th>
                    <th className="text-end">Cant.</th>
                    <th className="text-end">P. unit.</th>
                    <th className="text-end">Subtotal</th>
                    <th />
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {lineas.map((l, idx) => (
                    <CTableRow key={`${l.id_producto || l.id_ingrediente}-${idx}`}>
                      <td>
                        {l.name}
                        {l.id_ingrediente && (
                          <CBadge color="warning" className="ms-2">
                            Ingrediente
                          </CBadge>
                        )}
                        {l.factor > 1 && (
                          <CBadge color="info" className="ms-2">
                            {String(l.unidad || 'Presentación').toUpperCase()}
                          </CBadge>
                        )}
                      </td>
                      <td className="text-end">
                        {l.cantidad}
                        {l.factor > 1 && (
                          <span className="text-body-secondary small">
                            {' '}
                            ({l.cantidad * l.factor} und)
                          </span>
                        )}
                      </td>
                      <td className="text-end monto">{formatQ(l.precio)}</td>
                      <td className="text-end monto">{formatQ(l.subtotal)}</td>
                      <td className="text-end">
                        <CButton
                          color="danger"
                          variant="outline"
                          size="sm"
                          onClick={() => quitarLinea(idx)}
                          title="Quitar línea"
                        >
                          <CIcon icon={cilX} />
                        </CButton>
                      </td>
                    </CTableRow>
                  ))}
                </CTableBody>
              </CTable>
            </div>
          )}

          <div className="text-end fw-bold mt-2">Total: {formatQ(totalLineas)}</div>

          <hr className="my-3" />

          <label className="form-label small mb-1">
            Adjunto opcional (imagen o PDF, máx. 4 MB)
          </label>
          <CFormInput type="file" accept="image/*,application/pdf" onChange={onArchivo} />
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Vista previa del adjunto"
              className="img-thumbnail mt-2"
              style={{ maxHeight: 140 }}
            />
          )}
          {!previewUrl && adjunto && (
            <p className="small mt-2 mb-0">
              <CIcon icon={cilFile} className="me-1" />
              {adjunto.name}
            </p>
          )}
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={cerrarAlta} disabled={guardando}>
            Cancelar
          </CButton>
          <CButton color="success" onClick={registrar} disabled={guardando}>
            {guardando ? (
              <CSpinner size="sm" className="me-1" />
            ) : (
              <CIcon icon={cilCheckCircle} className="me-1" />
            )}
            Registrar compra
          </CButton>
        </CModalFooter>
      </CModal>

      <CModal visible={modalEntrada} onClose={cerrarEntrada} size="md">
        <CModalHeader onClose={cerrarEntrada}>
          <CModalTitle>Nueva entrada</CModalTitle>
        </CModalHeader>
        <CModalBody>
          <label className="form-label small mb-1">Producto</label>
          <CFormSelect value={entProducto} onChange={(e) => setEntProducto(e.target.value)}>
            <option value="">Seleccione...</option>
            {productosAlta.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.sku ? ` (${p.sku})` : ''} — stock {p.stock}
              </option>
            ))}
          </CFormSelect>

          {bodegas.length > 1 && (
            <>
              <label className="form-label small mb-1 mt-3">Bodega destino</label>
              <CFormSelect
                value={idBodega || ''}
                onChange={(e) => setIdBodega(e.target.value)}
                data-testid="selector-bodega-entrada"
              >
                {bodegas.map((b) => (
                  <option key={b.id} value={b.id}>
                    📦 {b.name}
                  </option>
                ))}
              </CFormSelect>
            </>
          )}

          {prodEntrada && (
            <CAlert
              color={stockFinal !== null && stockFinal <= prodEntrada.stockMin ? 'danger' : 'info'}
              className="py-2 small mt-3 mb-0"
            >
              Stock actual: <b>{prodEntrada.stock}</b>
              {stockFinal !== null && (
                <>
                  {' '}
                  → quedará <b>{stockFinal}</b>
                </>
              )}
              {stockFinal !== null && stockFinal <= prodEntrada.stockMin && (
                <>
                  {' — '}
                  <CBadge color="danger">Stock bajo</CBadge>
                </>
              )}
            </CAlert>
          )}

          <CRow className="g-2 mt-1">
            <CCol md={4}>
              <label className="form-label small mb-1">Cantidad</label>
              <CFormInput
                type="number"
                min={1}
                step={1}
                value={entCantidad}
                onChange={(e) => setEntCantidad(e.target.value)}
              />
            </CCol>
            <CCol md={8}>
              <label className="form-label small mb-1">Motivo (obligatorio)</label>
              <CFormInput
                value={entMotivo}
                onChange={(e) => setEntMotivo(e.target.value)}
                placeholder="Ej: Reposición de bodega"
              />
            </CCol>
          </CRow>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={cerrarEntrada} disabled={guardandoEntrada}>
            Cancelar
          </CButton>
          <CButton color="success" onClick={registrarEntrada} disabled={guardandoEntrada}>
            {guardandoEntrada ? (
              <CSpinner size="sm" className="me-1" />
            ) : (
              <CIcon icon={cilCheckCircle} className="me-1" />
            )}
            Registrar entrada
          </CButton>
        </CModalFooter>
      </CModal>

      <ConfirmModal
        visible={!!aAnular}
        title="Anular compra"
        message={`¿Anular la compra ${
          aAnular ? aAnular.id.slice(0, 8).toUpperCase() : ''
        } por ${aAnular ? formatQ(aAnular.total) : ''}? El stock se devolverá a la sucursal.`}
        confirmText="Anular compra"
        onConfirm={handleAnular}
        onCancel={() => setAAnular(null)}
      >
        <CFormInput
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de anulación (opcional)"
          className="mt-2"
        />
      </ConfirmModal>

      <ModalComprobanteCompra
        visible={!!filaComp}
        compra={filaComp}
        onClose={() => setFilaComp(null)}
      />
    </CCard>
  )
}

export default ComprasPage
