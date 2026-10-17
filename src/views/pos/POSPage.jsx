import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { CRow, CCol, CBadge, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBasket, cilClipboard, cilGrid } from '@coreui/icons'
import { useBusquedaProductos } from './hooks/useBusquedaProductos'
import { useCarrito } from './hooks/useCarrito'
import { grupoColores, nombreColor } from './colorUtils'
import { disponibilidadCombo, agruparComponentes } from './comboUtils'
import useFlagsSucursal from '../../hooks/useFlagsSucursal'
import BuscadorProducto from './components/BuscadorProducto'
import EstadoVacio from './components/EstadoVacio'
import ProductoDetalle from './components/ProductoDetalle'
import ProductosGrid from './components/ProductosGrid'
import Carrito from './components/Carrito'
import { useToast } from '../../components/common/ToastContext'
import PanelPago from './components/PanelPago'
import CobrarBar from './components/CobrarBar'
import ModalCobrar from './components/ModalCobrar'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import ModalResultadoVenta from './components/ModalResultadoVenta'
import ModalPendientes from './components/ModalPendientes'
import ModalCotizaciones from './components/ModalCotizaciones'
import ModalImpresionCotizacion from './components/ModalImpresionCotizacion'
import ConflictResolverModal from './components/ConflictResolverModal'
import ModalVariantes from './components/ModalVariantes'
import ConfirmModal from '../dashboard/components/common/ConfirmModal'
import { formatQ } from '../../utils/format'
import { hidratarCatalogoParaSucursal, leerStockPorBodega } from '../../services/catalogSyncService'
import { registrarVentaLocal } from '../../services/ventaLocalService'
import { sincronizarEvento } from '../../services/colaSyncService'
import {
  aceptarCambiosServidor,
  eliminarCotizacionOffline,
  guardarCotizacionOffline,
  guardarCotizacionesEnCache,
  leerCotizacionesCache,
  listarCotizacionesOffline,
  sincronizarCotizacionesOffline,
} from '../../services/cotizacionOfflineService'
import {
  crearPendienteLocal,
  leerPendientesLocal,
  eliminarPendienteLocal,
  fusionarPendientes,
} from '../../services/pendienteService'
import { AVISO_FOLIO_SIN_RED, puedeSolicitarFolioOficial } from '../../services/redService'
import { verificarPermisoBotonPos } from '../../services/permisoService'

const POSPage = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursal = currentUser?.id_sucursal
  const showToast = useToast()
  const [modalCobro, setModalCobro] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [errorCobro, setErrorCobro] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [clienteVenta, setClienteVenta] = useState('')
  const [nitClienteVenta, setNitClienteVenta] = useState('')

  // Fase 10: pendientes y cotizaciones
  const [modalPendientes, setModalPendientes] = useState(false)
  const [modalCotizaciones, setModalCotizaciones] = useState(false)
  const [impresionCotizacion, setImpresionCotizacion] = useState(null)
  const [pendientes, setPendientes] = useState([])
  const [cotizaciones, setCotizaciones] = useState([])
  const [cargandoPendientes, setCargandoPendientes] = useState(false)
  const [cargandoCotizaciones, setCargandoCotizaciones] = useState(false)
  const [confirmar, setConfirmar] = useState(null)

  // Task 5 / RF-02: cotización local con conflictos. Ya NO se auto-abre al
  // montar (roba el foco al cajero): se cuentan y se pinta un badge en la
  // cabecera; el modal abre solo al pulsarlo (crítica P1 del critique 2026-10).
  const [cotizacionConflicto, setCotizacionConflicto] = useState(null)
  const [conflictosCount, setConflictosCount] = useState(0)

  // Modal de variantes/subproductos: al tocar un producto con varias opciones
  // (ej. hamburguesa → americana, torito) se elige la variante antes de agregar.
  const [varianteProducto, setVarianteProducto] = useState(null)
  const [modalVariantes, setModalVariantes] = useState(false)

  // pos-ux-permisos RF-P2: el botón "Cotizaciones" del encabezado se oculta
  // solo si el admin desmarcó pos_ver_cotizaciones (default visible)
  const [puedeVerCotizaciones, setPuedeVerCotizaciones] = useState(true)
  useEffect(() => {
    verificarPermisoBotonPos(
      currentUser?.id_rol?.id,
      currentUser?.id_rol?.name,
      'pos_ver_cotizaciones',
    ).then(setPuedeVerCotizaciones)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Multibodega: lista de bodegas de la sucursal + bodega activa del dispositivo
  const [bodegas, setBodegas] = useState([])
  const [bodegaId, setBodegaId] = useState(() => localStorage.getItem('bodegaSeleccionada') || null)
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
          if (activa) {
            setBodegaId(activa.id)
            localStorage.setItem('bodegaSeleccionada', activa.id)
          }
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
  const cambiarBodega = (id) => {
    setBodegaId(id)
    localStorage.setItem('bodegaSeleccionada', id)
  }

  // D6 (stock-bodega-fuente-verdad): stock de la bodega seleccionada para que el
  // POS muestre/venda el mismo número que el Inventario de esa bodega. Con la
  // Principal coincide con el caché de sucursal; con otra bodega, manda su stock.
  const [stockBodega, setStockBodega] = useState(() => new Map())
  const recargarStockBodega = useCallback(() => {
    const fuente = bodegaId ? leerStockPorBodega(bodegaId) : Promise.resolve([])
    return fuente
      .then((filas) => {
        const map = new Map()
        filas.forEach((f) => map.set(f.id_producto, f.stock ?? 0))
        setStockBodega(map)
      })
      .catch((err) => console.warn('No se pudo leer stock_bodega:', err))
  }, [bodegaId])

  useEffect(() => {
    recargarStockBodega()
  }, [recargarStockBodega])

  // Refresca el stock por bodega al sincronizar/volver en línea (mismo patrón
  // que el grid de comida), porque la venta/compra mueve stock_bodega.
  useEffect(() => {
    const refrescar = () => recargarStockBodega()
    window.addEventListener('cola-sincronizada', refrescar)
    window.addEventListener('online', refrescar)
    return () => {
      window.removeEventListener('cola-sincronizada', refrescar)
      window.removeEventListener('online', refrescar)
    }
  }, [recargarStockBodega])

  // impresiones-copias (D3/D4): receta de combos hidratada en Dexie y stock de
  // ingredientes de la sucursal, para derivar la disponibilidad 100% offline.
  const [componentesPorProducto, setComponentesPorProducto] = useState(() => new Map())
  const [ingredientesStock, setIngredientesStock] = useState(() => new Map())

  // Stock del producto en la bodega activa; si la bodega no tiene fila, se cae
  // al caché de sucursal (`producto.stock` con `es_actual`) — spec D6.
  const stockDeProducto = useCallback(
    (p) => {
      const deBodega = stockBodega.get(p.id)
      if (deBodega !== undefined) return deBodega
      return p.stock?.find((s) => s.es_actual)?.stock ?? 0
    },
    [stockBodega],
  )
  const avisadosConflictosRef = useRef(new Set())
  const showToastRef = useRef(showToast)
  useEffect(() => {
    showToastRef.current = showToast
  })

  // Pendiente vinculado al carrito: se elimina solo al completar la venta.
  // Vive en localStorage (igual que el carrito) para sobrevivir recargas y al
  // remapeo de id que hace la sync (Tarea 2.5). Fuente única de verdad.
  const linkKey = `pos_pendiente_${idSucursal || 'default'}`

  const vincularPendiente = (id) => {
    localStorage.setItem(linkKey, id)
  }
  const desvincularPendiente = () => {
    localStorage.removeItem(linkKey)
  }

  const busqueda = useBusquedaProductos(idSucursal)
  const carrito = useCarrito(idSucursal)
  const selected = busqueda.selected

  // Viewport para render condicional del panel de cobro (lg = 992px en
  // Bootstrap/CoreUI): en móvil SOLO vive el del ModalCobrar, no dos.
  const [esDesktop, setEsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 992px)').matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 992px)')
    const alCambiar = (e) => setEsDesktop(e.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [])

  // RF-C5: vista comida (grid con pestañas). `esComida` viene del hook
  // offline-first (lee Dexie primero, default OFF) — evita el flash del botón
  // "Vista comida" que se pintaba con el flag viejo antes de resolver la red.
  const { esComida } = useFlagsSucursal()
  const [vistaComida, setVistaComida] = useState(
    () => localStorage.getItem(`pos_vista_comida_${idSucursal}`) === '1',
  )
  const [productosGrid, setProductosGrid] = useState([])
  const [coloresPorId, setColoresPorId] = useState({})

  const recargarGrid = useCallback(() => {
    if (!idSucursal) return Promise.resolve()
    return db.productos
      .toArray()
      .then((todos) => setProductosGrid(todos))
      .catch((err) => console.warn('No se pudo cargar el grid de comida:', err))
  }, [idSucursal])

  // papel-iris: mapa `id_color → nombre` para agrupar variantes por color.
  const cargarColores = useCallback(() => {
    if (!db.colores) return Promise.resolve()
    return db.colores
      .toArray()
      .then((lista) => setColoresPorId(Object.fromEntries(lista.map((c) => [c.id, c.name]))))
      .catch(() => {})
  }, [])

  // impresiones-copias: receta de combos (id_producto → componentes) y stock de
  // ingredientes de la sucursal activa, ambos desde Dexie (offline-first).
  const cargarComponentes = useCallback(() => {
    if (!db.combo_componentes) return Promise.resolve()
    return db.combo_componentes
      .toArray()
      .then((filas) => setComponentesPorProducto(agruparComponentes(filas)))
      .catch(() => {})
  }, [])

  const cargarIngredientesStock = useCallback(() => {
    if (!idSucursal || !db.ingredientes_sucursal) return Promise.resolve()
    return db.ingredientes_sucursal
      .where('id_sucursal')
      .equals(idSucursal)
      .toArray()
      .then((filas) =>
        setIngredientesStock(new Map(filas.map((f) => [f.id_ingrediente, f.stock ?? 0]))),
      )
      .catch(() => {})
  }, [idSucursal])

  // Refresco del grid de comida al sincronizar/volver en línea (los flags de
  // sucursal los maneja `useFlagsSucursal`).
  useEffect(() => {
    recargarGrid()
    cargarColores()
    cargarComponentes()
    cargarIngredientesStock()
    const refrescar = () => {
      recargarGrid()
      cargarColores()
      cargarComponentes()
      cargarIngredientesStock()
    }
    window.addEventListener('cola-sincronizada', refrescar)
    window.addEventListener('online', refrescar)
    return () => {
      window.removeEventListener('cola-sincronizada', refrescar)
      window.removeEventListener('online', refrescar)
    }
  }, [recargarGrid, cargarColores, cargarComponentes, cargarIngredientesStock])

  // padre/hijo (D4): un producto raíz con hijos es un CONTENEDOR no vendible;
  // al elegirlo se abre la lista de sus variantes (hijos vendibles).
  const hijosPorPadre = useMemo(() => {
    const m = {}
    productosGrid.forEach((p) => {
      if (!p.id_padre) return
      if (!m[p.id_padre]) m[p.id_padre] = []
      m[p.id_padre].push(p)
    })
    return m
  }, [productosGrid])

  const esPadre = useCallback((p) => !!p && (hijosPorPadre[p.id] || []).length > 0, [hijosPorPadre])
  const hijosDe = useCallback((p) => (p ? hijosPorPadre[p.id] || [] : []), [hijosPorPadre])

  // impresiones-copias (D3): mapa de stock de la bodega activa para TODOS los
  // productos del grid (con fallback al caché de sucursal), base del cálculo de
  // disponibilidad de los componentes de un combo.
  const stockEfectivoMap = useMemo(() => {
    const m = new Map()
    productosGrid.forEach((p) => {
      const deBodega = stockBodega.get(p.id)
      m.set(
        p.id,
        deBodega !== undefined ? deBodega : (p.stock?.find((s) => s.es_actual)?.stock ?? 0),
      )
    })
    return m
  }, [productosGrid, stockBodega])

  // RF-IC3: stock EFECTIVO de un producto. Para un combo (`contiene_insumos`) es
  // su disponibilidad derivada (no su stock propio, que es 0); para el resto,
  // el stock de la bodega activa. Todo local (D4).
  const disponibilidadDe = useCallback(
    (p) => {
      if (!p) return 0
      if (p.contiene_insumos) {
        return disponibilidadCombo(p.id, {
          componentesPorProducto,
          stockPorProducto: stockEfectivoMap,
          ingredientesPorId: ingredientesStock,
        })
      }
      return stockDeProducto(p)
    },
    [componentesPorProducto, stockEfectivoMap, ingredientesStock, stockDeProducto],
  )

  // Disponibilidad precalculada por producto para el grid (evita recalcular en
  // cada render y permite sumar la de los hijos de un padre — D5).
  const disponibilidadPorId = useMemo(() => {
    const m = new Map()
    productosGrid.forEach((p) => m.set(p.id, disponibilidadDe(p)))
    return m
  }, [productosGrid, disponibilidadDe])

  // Variantes del producto seleccionado: primero por padre/hijo explícito (mismo
  // `id_padre`; cubre papel-iris, que ya es padre/hijo) y como respaldo la
  // heurística de color por nombre base (productos con color sin padre).
  const hermanosProducto = useMemo(() => {
    const idPadre = selected?.id_padre
    if (idPadre) {
      const hs = hijosPorPadre[idPadre] || []
      if (hs.length >= 2) {
        return hs
          .map((h) => ({
            id: h.id,
            nombre: nombreColor(coloresPorId, h.id_color) || h.name,
            activo: h.id === selected.id,
            stock: disponibilidadDe(h),
            producto: h,
          }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre))
      }
    }
    return grupoColores(selected, productosGrid, coloresPorId, disponibilidadDe)
  }, [selected, productosGrid, coloresPorId, hijosPorPadre, disponibilidadDe])

  // Etiqueta del selector: "Color" si la variante tiene color; "Variante" si no.
  const etiquetaSelectorVariantes = selected?.id_color ? 'Color' : 'Variante'

  const alternarVistaComida = () => {
    const nuevo = !vistaComida
    setVistaComida(nuevo)
    localStorage.setItem(`pos_vista_comida_${idSucursal}`, nuevo ? '1' : '0')
  }

  // Tap del grid: si el producto es un PADRE (tiene variantes/hijos), o tiene
  // varias opciones (precios o combo), se abre el modal para elegir antes de
  // agregar. Si no, se agrega directamente con +1 del tier Auto/NORMAL.
  const agregarDelGrid = (p) => {
    const tieneVariantes =
      esPadre(p) || (p.precios && p.precios.length > 1) || p.contiene_insumos === true
    if (tieneVariantes) {
      setVarianteProducto(p)
      setModalVariantes(true)
    } else {
      carrito.addItem({ ...p, stockActual: disponibilidadDe(p) }, 1, null)
    }
  }

  // Un PADRE (contenedor, sin precio propio) no se vende como línea ni abre un
  // modal: se abre el DETALLE de uno de sus hijos, donde el selector de color
  // cambia entre variantes (papel-iris). Se elige un hijo con stock; si ninguno
  // tiene, el primero.
  const abrirDetalleDePadre = (p) => {
    const hijos = hijosDe(p)
    if (!hijos.length) return false
    const elegido = hijos.find((h) => disponibilidadDe(h) > 0) || hijos[0]
    busqueda.seleccionar(elegido)
    return true
  }

  // Selección desde el buscador: un padre abre el detalle de un hijo (con su
  // selector de color); un hijo/suelto se selecciona normal.
  const seleccionarDesdeBusqueda = (p) => {
    if (esPadre(p) && abrirDetalleDePadre(p)) return
    busqueda.seleccionar(p)
  }

  const agregarVarianteSeleccionada = (variante) => {
    carrito.addItem(
      {
        ...variante,
        stockActual: disponibilidadDe(variante),
      },
      1,
      null,
    )
    setModalVariantes(false)
    setVarianteProducto(null)
  }

  // Sin loader: para la carga inicial del efecto.
  // setState solo dentro de .then (regla react-hooks/set-state-in-effect).
  // Offline-First: la lista se lee de IndexedDB al instante; si hay red se
  // fusiona con el servidor (los locales sin sincronizar se suman).
  const cargarPendientes = useCallback(() => {
    if (!idSucursal) return Promise.resolve()
    return leerPendientesLocal(idSucursal)
      .then((local) => {
        setPendientes(local)
        return supabase
          .rpc('get_ventas_pendientes', { p_id_sucursal: idSucursal })
          .then(({ data, error }) => {
            if (error || !Array.isArray(data)) return
            return fusionarPendientes(idSucursal, local, data).then((fusion) =>
              setPendientes(fusion),
            )
          })
      })
      .catch((err) => console.error('Error cargando pendientes:', err))
  }, [idSucursal])

  const cargarCotizaciones = useCallback(() => {
    if (!idSucursal) return Promise.resolve()
    // Offline-First: borradores locales (`offline_quotes`) + cotizaciones del
    // servidor (red fresca, o espejo `quote_cache` si no hay red).
    // Los borradores `synced` no se listan: ya están en la remota.
    const local = listarCotizacionesOffline(idSucursal)
      .then((qs) =>
        qs
          .filter((q) => q.status !== 'synced')
          .map((q) => ({
            id: q.temp_id,
            fecha: q.fecha,
            total: q.total,
            estado: q.status === 'conflict' ? 'conflicto' : 'borrador',
            items: q.items.length,
            detalle: q.items.map((it) => ({
              cantidad: it.cantidad,
              name: it.name,
              precio_unitario: it.offline_price,
            })),
            local: true,
          })),
      )
      .catch(() => [])

    // Con red: trae frescas y reescribe el espejo. Sin red: `null` = usar cache.
    const remota = supabase
      .rpc('get_cotizaciones', { p_id_sucursal: idSucursal })
      .then(({ data, error }) => {
        if (error || !Array.isArray(data)) return null
        guardarCotizacionesEnCache(idSucursal, data).catch((e) =>
          console.warn('No se pudo escribir quote_cache:', e),
        )
        return data
      })
      .catch((err) => {
        console.warn('get_cotizaciones sin red, usando quote_cache:', err)
        return null
      })

    return Promise.all([local, remota]).then(([locales, remotas]) => {
      if (Array.isArray(remotas)) {
        setCotizaciones([...locales, ...remotas])
        return
      }
      return leerCotizacionesCache(idSucursal)
        .catch((e) => {
          console.warn('No se pudo leer quote_cache:', e)
          return []
        })
        .then((cache) => setCotizaciones([...locales, ...cache]))
    })
  }, [idSucursal])

  // Con loader: para abrir modales y refrescar tras mutaciones
  const refrescarPendientes = useCallback(async () => {
    setCargandoPendientes(true)
    try {
      await cargarPendientes()
    } finally {
      setCargandoPendientes(false)
    }
  }, [cargarPendientes])

  const refrescarCotizaciones = useCallback(async () => {
    setCargandoCotizaciones(true)
    try {
      await cargarCotizaciones()
    } finally {
      setCargandoCotizaciones(false)
    }
  }, [cargarCotizaciones])

  useEffect(() => {
    cargarPendientes()
    cargarCotizaciones()
  }, [cargarPendientes, cargarCotizaciones])

  // F8 (fixes-prod): cuando un evento de `ventas` se sincroniza (p. ej. el
  // DELETE de un pendiente), refrescar la lista para que el contador/lista
  // queden consistentes sin recargar la página.
  useEffect(() => {
    const refrescar = (e) => {
      const t = e?.detail?.tabla
      if (t && t !== 'ventas') return
      cargarPendientes()
    }
    window.addEventListener('cola-sincronizada', refrescar)
    return () => window.removeEventListener('cola-sincronizada', refrescar)
  }, [cargarPendientes])

  // Offline-First: refresca el catálogo local en segundo plano (no bloquea la UI).
  // Si falla o está vacío, la búsqueda usa el RPC como fallback.
  useEffect(() => {
    hidratarCatalogoParaSucursal(idSucursal)
      .then(() => {
        // Tras hidratar, avisar al POS (y a otras vistas) para que vuelvan a leer
        // Dexie y muestren precios/productos actualizados sin refrescar la página.
        window.dispatchEvent(
          new CustomEvent('cola-sincronizada', { detail: { tabla: 'catalogo' } }),
        )
      })
      .catch((err) => console.warn('No se pudo hidratar el catálogo local:', err))
  }, [idSucursal])

  // Tarea 2.6: cuando la sync remapea el id local al del servidor, el modal de
  // resultado/comprobante debe seguirlo (ModalComprobante refetchea por idVenta).
  // Buffer del último remap (crítica 2026-10-12 P2): si el evento llega ANTES
  // de que exista `resultado` (carrera con los awaits del consumo de pendiente),
  // se guarda aquí y se aplica en handleCobrar tras setResultado.
  const ultimoRemapRef = useRef(null)
  useEffect(() => {
    const alRemapear = (e) => {
      const { idViejo, idNuevo } = e.detail || {}
      if (!idViejo || !idNuevo) return
      setResultado((prev) => {
        if (prev && prev.id_venta === idViejo) {
          return { ...prev, id_venta: idNuevo, folioLocal: false }
        }
        // resultado aún no existe o es de otra venta: bufferizar
        ultimoRemapRef.current = { idViejo, idNuevo }
        return prev
      })
    }
    window.addEventListener('id-remapeado', alRemapear)
    return () => window.removeEventListener('id-remapeado', alRemapear)
  }, [])

  // Task 5 / RF-02: al montar y tras cada ronda de sync ('cotizaciones-revisadas'),
  // si hay conflictos se abre el modal de resolución (uno a la vez).
  const revisarConflictos = useCallback(async () => {
    try {
      const lista = await listarCotizacionesOffline(idSucursal)
      const conflictos = lista.filter((q) => q.status === 'conflict')
      setConflictosCount(conflictos.length)
      const primero = conflictos.find((q) => q.valores_servidor) || conflictos[0]
      if (!primero) return
      if (primero.error_servidor && !avisadosConflictosRef.current.has(primero.temp_id)) {
        avisadosConflictosRef.current.add(primero.temp_id)
        showToastRef.current('danger', 'Cotización rechazada', primero.error_servidor)
      }
    } catch (err) {
      console.warn('No se pudieron revisar conflictos de cotizaciones:', err)
    }
  }, [idSucursal])

  // Apertura explícita (badge de la cabecera): una sola vez, sin auto-open.
  const abrirPrimerConflicto = useCallback(async () => {
    try {
      const lista = await listarCotizacionesOffline(idSucursal)
      const conflicto =
        lista.find((q) => q.status === 'conflict' && q.valores_servidor) ||
        lista.find((q) => q.status === 'conflict')
      if (conflicto) setCotizacionConflicto((prev) => prev ?? conflicto)
    } catch (err) {
      console.warn('No se pudo abrir el conflicto de cotización:', err)
    }
  }, [idSucursal])

  useEffect(() => {
    revisarConflictos() // comprobación inicial (solo cuenta, no abre)
    window.addEventListener('cotizaciones-revisadas', revisarConflictos)
    return () => window.removeEventListener('cotizaciones-revisadas', revisarConflictos)
  }, [revisarConflictos])

  // Cobro vía Supabase directo: solo como fallback cuando el catálogo local
  // no tiene un producto del carrito (requiere red, que en ese caso existe).
  const cobrarOnline = async (datos, idCliente) => {
    const params = {
      p_id_sucursal: idSucursal,
      p_id_usuario: currentUser?.id,
      p_id_metodo_pago: datos.idMetodoPago,
      p_efectivo_recibido: datos.efectivoRecibidoCentavos,
      p_items: carrito.items.map((i) => ({
        id_producto: i.idProducto,
        cantidad: i.cantidad,
        id_precio_producto: i.idPrecioSeleccionado,
      })),
    }
    if (idCliente) params.p_id_cliente = idCliente
    // Cliente casual (sin perfil): va como nombre en la fila de la venta
    if (!idCliente && datos.cliente) params.p_cliente_nombre = datos.cliente
    // RF-P3: solo se envía si hay referencia (compat con el RPC viejo sin el param)
    if (datos.referencia) params.p_referencia = datos.referencia
    const { data, error } = await supabase.rpc('registrar_venta', params)
    if (error) throw error
    return data
  }

  const handleCobrar = async (datos) => {
    if (!carrito.items.length || procesando) return

    setProcesando(true)
    setErrorCobro(null)
    try {
      // Cliente opcional en dos modos (spec clientes v2 D6): enlazado →
      // id_cliente (suma historial); casual → solo cliente_nombre en el
      // ticket. NO se espera ningún upsert en el camino crítico (crítica
      // 2026-10-12 P1: con wifi cautiva el await no tiene timeout y rompía
      // ≤2s) — "Registrar cliente nuevo" es un click explícito en PanelPago.
      const nombreCliente = (datos.cliente || '').trim()
      const idCliente = datos.idCliente || null

      let venta
      try {
        // Offline-First: venta atómica en IndexedDB (precios, stock, venta,
        // detalle y evento de cola en una sola transacción; sin red).
        const local = await registrarVentaLocal({
          idSucursal,
          idBodega: bodegaId || null,
          idUsuario: currentUser?.id,
          idMetodoPago: datos.idMetodoPago,
          efectivoRecibido: datos.efectivoRecibidoCentavos,
          idCliente,
          clienteNombre: idCliente ? null : nombreCliente || null,
          descuentoBp: datos.descuentoBp || 0,
          referencia: datos.referencia || null,
          items: carrito.items.map((i) => ({
            id_producto: i.idProducto,
            name: i.name,
            cantidad: i.cantidad,
            id_precio_producto: i.idPrecioSeleccionado,
            precio: i.precio,
          })),
        })
        // El resultado se pinta ANTES del push (crítica 2026-10-12 P2: la
        // carrera id-remapeado vs setResultado dejaba el modal con un id
        // muerto cuando el cobro consumía un pendiente).
        const remap = ultimoRemapRef.current
        if (remap && remap.idViejo === local.idVenta) {
          ultimoRemapRef.current = null
          setResultado({
            id_venta: remap.idNuevo,
            total: local.total,
            cambio: local.cambio,
            folioLocal: false, // el servidor ya confirmó el folio
            imprimir: true,
            // Facturas-SAT: datos del receptor para el atajo de facturación
            idCliente: idCliente || null,
            clienteNombre: nombreCliente || null,
            nitCliente: datos.nitCliente || null,
          })
        } else {
          setResultado({
            id_venta: local.idVenta,
            total: local.total,
            cambio: local.cambio,
            // UUID local sin folio oficial hasta que 'id-remapeado' lo confirme.
            folioLocal: true,
            imprimir: true,
            idCliente: idCliente || null,
            clienteNombre: nombreCliente || null,
            nitCliente: datos.nitCliente || null,
          })
        }
        // Push inmediato en segundo plano: si falla (sin red) la venta local
        // ya está registrada y el evento queda PENDING para el motor de 2.3.
        sincronizarEvento(local.idEvento).catch((e) => console.warn('Push de venta pospuesto:', e))
        venta = { id_venta: local.idVenta, total: local.total, cambio: local.cambio }
      } catch (errLocal) {
        if (errLocal?.code !== 'CATALOGO_LOCAL') throw errLocal
        console.warn('Catálogo local incompleto, cobrando vía Supabase:', errLocal.message)
        venta = await cobrarOnline(datos, idCliente)
      }

      setModalCobro(false) // cierra sheet en móvil
      carrito.clear() // localStorage → []
      busqueda.clear()
      // La venta descontó stock_bodega: refrescar el mapa de la bodega activa.
      recargarStockBodega()
      setClienteVenta('')
      setNitClienteVenta('')

      // Si el carrito traía un pendiente cargado, la venta lo "consume".
      // Se lee el id vigente de localStorage (sobrevive al remapeo de id en sync).
      const idPendiente = localStorage.getItem(linkKey)
      if (idPendiente) {
        try {
          const { idEvento } = await eliminarPendienteLocal(idPendiente, idSucursal)
          if (idEvento) {
            sincronizarEvento(idEvento).catch((e) =>
              console.warn('Push de borrado de pendiente pospuesto:', e),
            )
          }
        } catch (errP) {
          console.error('No se pudo limpiar el pendiente vendido:', errP)
        }
        desvincularPendiente()
        await refrescarPendientes()
      }

      // La rama local ya pintó el resultado arriba; esta línea solo aplica a
      // la rama online (cobrarOnline) o si el setResultado de arriba no corrió.
      setResultado(
        (prev) =>
          prev ?? {
            ...venta,
            imprimir: true,
            idCliente: idCliente || null,
            clienteNombre: nombreCliente || null,
            nitCliente: datos.nitCliente || null,
          },
      )
      showToast('success', 'Venta registrada', 'La venta se guardó correctamente')
    } catch (err) {
      console.error('Error registrando venta:', err)
      setErrorCobro(err.message || 'No se pudo registrar la venta')
      showToast('danger', 'Error', err.message || 'No se pudo registrar la venta')
    } finally {
      setProcesando(false)
    }
  }

  const itemsPayload = () =>
    carrito.items.map((i) => ({
      id_producto: i.idProducto,
      cantidad: i.cantidad,
      id_precio_producto: i.idPrecioSeleccionado,
    }))

  // ===== Fase 10: guardar como pendiente (Offline-First Tarea 2.5) =====
  const handlePendiente = async () => {
    if (!carrito.items.length || procesando) return

    setProcesando(true)
    try {
      const local = await crearPendienteLocal({
        idSucursal,
        idUsuario: currentUser?.id,
        items: carrito.items.map((i) => ({
          id_producto: i.idProducto,
          cantidad: i.cantidad,
          id_precio_producto: i.idPrecioSeleccionado,
          subtotal: i.subtotal,
        })),
        total: carrito.total,
      })
      // Push inmediato en segundo plano: si falla (sin red) el pendiente local
      // ya existe y su evento queda PENDING para el motor de la Tarea 2.3.
      sincronizarEvento(local.idEvento).catch((e) =>
        console.warn('Push de pendiente pospuesto:', e),
      )

      setModalCobro(false)
      carrito.clear()
      busqueda.clear()
      desvincularPendiente() // se guarda un pendiente nuevo: se corta el vínculo anterior
      await refrescarPendientes()
      showToast('success', 'Pendiente guardado', `Venta guardada (${formatQ(local.total)})`)
    } catch (err) {
      console.error('Error guardando pendiente:', err)
      showToast('danger', 'Error', err.message || 'No se pudo guardar el pendiente')
    } finally {
      setProcesando(false)
    }
  }

  // ===== Fase 10: guardar cotización =====
  const handleCotizacion = async () => {
    if (!carrito.items.length || procesando) return

    setProcesando(true)
    try {
      // Task 2 (RF-01): sin red se guarda un borrador local con
      // receipt_status:'pending_network' en vez de pedir folio/cotización al
      // servidor (`puedeSolicitarFolioOficial` es la regla central).
      if (!puedeSolicitarFolioOficial()) {
        const local = await guardarCotizacionOffline({
          idSucursal,
          idUsuario: currentUser?.id,
          items: carrito.items.map((i) => ({
            id_producto: i.idProducto,
            cantidad: i.cantidad,
            id_precio_producto: i.idPrecioSeleccionado,
            precio: i.precio,
            name: i.name,
            sku: i.sku,
          })),
        })

        setModalCobro(false)
        carrito.clear()
        busqueda.clear()
        desvincularPendiente() // cotizar no consume el pendiente cargado
        setResultado({
          id_venta: local.temp_id,
          total: local.total,
          cambio: 0,
          titulo: '¡Cotización guardada localmente!',
          accion: 'Entendido',
          avisoComprobante: true, // RF-03: ModalResultadoVenta muestra el aviso
          // Task 1 offline-suite: snapshot para imprimir sin tocar el servidor
          cotizacion: {
            id: local.temp_id,
            fecha: local.fecha,
            total: local.total,
            detalle: local.items.map((it) => ({
              name: it.name,
              cantidad: it.cantidad,
              precio_unitario: it.offline_price,
            })),
            local: true,
            pendiente: local.status !== 'synced',
          },
        })
        showToast('success', 'Cotización guardada', 'Borrador local — comprobante pendiente de red')
        return
      }

      const { data, error } = await supabase.rpc('registrar_cotizacion', {
        p_id_sucursal: idSucursal,
        p_id_usuario: currentUser?.id,
        p_items: itemsPayload(),
      })

      if (error) throw error

      // Snapshot del ticket antes de limpiar el carrito (impresión sin servidor)
      const detalleCotizacion = carrito.items.map((i) => ({
        name: i.name,
        cantidad: i.cantidad,
        precio_unitario: i.precio,
      }))

      setModalCobro(false)
      carrito.clear()
      busqueda.clear()
      desvincularPendiente() // cotizar no consume el pendiente cargado
      await refrescarCotizaciones()
      setResultado({
        id_venta: data.id_cotizacion,
        total: data.total,
        cambio: 0,
        titulo: '¡Cotización guardada!',
        accion: 'Entendido',
        cotizacion: {
          id: data.id_cotizacion,
          fecha: new Date().toISOString(),
          total: data.total,
          detalle: detalleCotizacion,
          local: false,
          pendiente: false,
        },
      })
    } catch (err) {
      console.error('Error guardando cotización:', err)
      showToast('danger', 'Error', err.message || 'No se pudo guardar la cotización')
    } finally {
      setProcesando(false)
    }
  }

  // ===== Task 5: resolución de conflictos de cotizaciones offline =====
  const itemsConflicto = useMemo(() => {
    const cot = cotizacionConflicto
    if (!cot) return []
    const valores = new Map((cot.valores_servidor || []).map((v) => [v.id_producto, v]))
    return cot.items.map((it) => {
      const vs = valores.get(it.id_producto)
      return {
        id_producto: it.id_producto,
        name: it.name,
        sku: it.sku,
        cantidad: it.cantidad,
        factor: vs?.factor ?? 1,
        offline: { precio: it.offline_price, stock: null },
        servidor: { precio: vs?.precio ?? null, stock: vs?.stock ?? null },
      }
    })
  }, [cotizacionConflicto])

  const sincronizarCotizacionesEnSegundoPlano = () => {
    sincronizarCotizacionesOffline().catch((e) =>
      console.warn('Sincronización de cotizaciones pospuesta:', e),
    )
  }

  const handleAceptarServidorCotizacion = async () => {
    const cot = cotizacionConflicto
    if (!cot) return
    try {
      const res = await aceptarCambiosServidor(cot.temp_id)
      setCotizacionConflicto(null)
      if (res.vacia) {
        showToast('warning', 'Sin artículos', 'La cotización quedó vacía y fue descartada')
      } else {
        showToast('success', 'Conflictos resueltos', 'Se adoptaron los valores del servidor')
        sincronizarCotizacionesEnSegundoPlano()
      }
      abrirPrimerConflicto()
    } catch (err) {
      showToast('danger', 'Error', err.message || 'No se pudieron resolver los conflictos')
    }
  }

  const handleEditarCotizacionOffline = async () => {
    const cot = cotizacionConflicto
    if (!cot) return
    try {
      const prods = await db.productos.bulkGet(cot.items.map((i) => i.id_producto))
      const stocks = await Promise.all(
        cot.items.map((i) => db.productos_sucursal.get([idSucursal, i.id_producto])),
      )
      carrito.loadItems(
        cot.items.map((it, idx) => ({
          idProducto: it.id_producto,
          name: prods[idx]?.name || it.name,
          sku: prods[idx]?.sku || it.sku,
          precios:
            prods[idx]?.precios?.length > 0
              ? prods[idx].precios
              : [
                  {
                    id: it.id_precio_producto,
                    precio: it.offline_price,
                    tipo: 'NORMAL',
                    min_cantidad: 1,
                  },
                ],
          stock: stocks[idx]?.stock ?? it.cantidad,
          cantidad: it.cantidad,
          id_precio_producto: it.id_precio_producto,
        })),
      )
      await eliminarCotizacionOffline(cot.temp_id)
      setCotizacionConflicto(null)
      showToast('success', 'Cotización cargada', 'Edita en el carrito y vuelve a cotizar')
      abrirPrimerConflicto()
    } catch (err) {
      showToast('danger', 'Error', err.message || 'No se pudo cargar la cotización')
    }
  }

  const handleDescartarCotizacionOffline = () => {
    const cot = cotizacionConflicto
    if (!cot) return
    setConfirmar({
      title: 'Descartar cotización',
      message: `¿Descartar la cotización local de ${formatQ(cot.total)}? Esta acción no se puede deshacer.`,
      confirmText: 'Descartar',
      confirmColor: 'danger',
      onConfirm: async () => {
        try {
          await eliminarCotizacionOffline(cot.temp_id)
          setCotizacionConflicto(null)
          showToast('success', 'Cotización descartada', 'El borrador local fue eliminado')
          abrirPrimerConflicto()
        } catch (err) {
          showToast('danger', 'Error', err.message || 'No se pudo descartar la cotización')
        }
      },
    })
  }

  const handleEmitirComprobanteCotizacion = async () => {
    const cot = cotizacionConflicto
    if (!cot) return
    try {
      await sincronizarCotizacionesOffline()
      const lista = await listarCotizacionesOffline(idSucursal)
      const actual = lista.find((q) => q.temp_id === cot.temp_id)
      if (actual?.status === 'synced' && actual.id_cotizacion) {
        setCotizacionConflicto(actual)
        showToast(
          'success',
          'Comprobante emitido',
          `Folio ${String(actual.id_cotizacion).slice(0, 8).toUpperCase()}`,
        )
      } else if (actual?.status === 'conflict') {
        showToast(
          'warning',
          'No emitido',
          actual.error_servidor || 'Resuelve los conflictos antes de emitir',
        )
      } else {
        showToast('warning', 'Comprobante', AVISO_FOLIO_SIN_RED)
      }
    } catch (err) {
      showToast('danger', 'Error', err.message || 'No se pudo emitir el comprobante')
    }
  }

  // ===== Fase 10: cargar un pendiente al carrito =====
  const handleCargarPendiente = (p) => {
    const cargar = () => {
      carrito.loadItems(
        p.items.map((it) => ({
          idProducto: it.id_producto,
          name: it.name,
          sku: it.sku,
          precios: it.precios,
          stock: it.stock,
          cantidad: it.cantidad,
          id_precio_producto: it.id_precio_producto,
        })),
      )
      vincularPendiente(p.id)
      setModalPendientes(false)
      showToast('success', 'Pendiente cargado', 'El carrito se llenó con la venta guardada')
    }

    if (carrito.items.length) {
      setConfirmar({
        title: 'Reemplazar carrito',
        message:
          'Hay artículos en el carrito actual. Se reemplazarán al cargar el pendiente. ¿Continuar?',
        confirmText: 'Cargar',
        confirmColor: 'primary',
        onConfirm: cargar,
      })
    } else {
      cargar()
    }
  }

  // ===== Fase 10: eliminar pendiente =====
  const handleEliminarPendiente = (p) => {
    setConfirmar({
      title: 'Eliminar pendiente',
      message: `¿Eliminar la venta pendiente de ${formatQ(p.total)} (${
        p.items?.length || 0
      } artículo${(p.items?.length || 0) !== 1 ? 's' : ''})? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      confirmColor: 'danger',
      onConfirm: async () => {
        try {
          const { idEvento } = await eliminarPendienteLocal(p.id, idSucursal)
          if (idEvento) {
            sincronizarEvento(idEvento).catch((e) =>
              console.warn('Push de borrado de pendiente pospuesto:', e),
            )
          }
          showToast('success', 'Eliminado', 'Pendiente eliminado')
          await refrescarPendientes()
        } catch (err) {
          showToast('danger', 'Error', err.message || 'No se pudo eliminar el pendiente')
        }
      },
    })
  }

  // ===== Fase 10: eliminar cotización =====
  const handleEliminarCotizacion = (c) => {
    // Borrador local (offline_quotes): se borra de IndexedDB, sin RPC.
    if (c.local) {
      setConfirmar({
        title: 'Eliminar borrador',
        message: `¿Eliminar el borrador local de ${formatQ(c.total)}? Esta acción no se puede deshacer.`,
        confirmText: 'Eliminar',
        confirmColor: 'danger',
        onConfirm: async () => {
          try {
            await eliminarCotizacionOffline(c.id)
          } catch (err) {
            showToast('danger', 'Error', err?.message || 'No se pudo eliminar el borrador')
            return
          }
          showToast('success', 'Eliminado', 'Borrador local eliminado')
          refrescarCotizaciones().catch((e) =>
            console.warn('No se pudo refrescar la lista de cotizaciones:', e),
          )
        },
      })
      return
    }

    // Fila del servidor/espejo (`quote_cache`): la eliminación vive en Supabase.
    // Sin red el RPC rechaza la promesa (Failed to fetch) → se corta antes.
    if (!puedeSolicitarFolioOficial()) {
      showToast(
        'warning',
        'Sin conexión',
        'Solo puedes eliminar borradores locales; las cotizaciones del servidor requieren conexión.',
      )
      return
    }

    setConfirmar({
      title: 'Eliminar cotización',
      message: `¿Eliminar la cotización de ${formatQ(c.total)}? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      confirmColor: 'danger',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('eliminar_cotizacion', {
            p_id: c.id,
            p_id_sucursal: idSucursal,
          })
          if (error) throw new Error(error.message || 'No se pudo eliminar la cotización')
        } catch (err) {
          showToast('danger', 'Error', err?.message || 'No se pudo eliminar la cotización')
          return
        }
        showToast('success', 'Eliminado', 'Cotización eliminada')
        refrescarCotizaciones().catch((e) =>
          console.warn('No se pudo refrescar la lista de cotizaciones:', e),
        )
      },
    })
  }

  // Task 1 offline-suite: imprimir una cotización (local o del servidor)
  // desde los datos ya cargados — sin RPC ni confirmación del servidor.
  const handleImprimirCotizacion = (c) => {
    setImpresionCotizacion({
      id: c.id,
      fecha: c.fecha,
      total: c.total,
      detalle: c.detalle,
      local: !!c.local,
      pendiente: !!c.local,
    })
  }

  // Borrador con `status:'conflict'` en la lista → abrir el modal de resolución (RF-02)
  const handleResolverCotizacion = async (c) => {
    try {
      const lista = await listarCotizacionesOffline(idSucursal)
      const local = lista.find((q) => q.temp_id === c.id)
      if (local) {
        setModalCotizaciones(false)
        setCotizacionConflicto((prev) => prev ?? local)
      }
    } catch (err) {
      console.warn('No se pudo abrir el conflicto de la cotización:', err)
    }
  }

  const abrirPendientes = () => {
    refrescarPendientes()
    setModalPendientes(true)
  }

  const abrirCotizaciones = () => {
    refrescarCotizaciones()
    setModalCotizaciones(true)
  }

  return (
    <div className="py-3">
      {/* Encabezado */}
      <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
        <h4 className="mb-0 d-flex align-items-center gap-2">
          <CIcon icon={cilBasket} className="text-primary" />
          Punto de Venta
        </h4>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          {/* Multibodega: selector de bodega (default: Principal) */}
          {bodegas.length > 0 && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={bodegaId || ''}
              onChange={(e) => cambiarBodega(e.target.value)}
              data-testid="selector-bodega"
              title="Bodega desde la que se vende"
            >
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.es_principal ? `📦 ${b.name}` : b.name}
                </option>
              ))}
            </select>
          )}
          <CBadge color="success" className="fs-6">
            {currentUser?.sucursalName || 'Sucursal'}
          </CBadge>
          {/* RF-C5: alternar vista comida (grid con pestañas) — solo ON */}
          {esComida && (
            <CButton
              color={vistaComida ? 'primary' : 'secondary'}
              variant={vistaComida ? 'solid' : 'outline'}
              size="sm"
              onClick={alternarVistaComida}
              title={
                vistaComida ? 'Volver a la vista de búsqueda' : 'Grid de productos por categoría'
              }
            >
              <CIcon icon={cilGrid} className="me-1" />
              {vistaComida ? 'Búsqueda' : 'Vista comida'}
            </CButton>
          )}
          {/* Acceso directo: la lista no debe depender de tener ítems en el
              carrito (antes solo existía dentro del modal de cobrar).
              RF-P2: visible salvo que el admin desmarque pos_ver_cotizaciones.
              En modo comida no se usa (se navega por pestañas del grid). */}
          {!esComida && puedeVerCotizaciones && (
            <CButton
              color="primary"
              variant="outline"
              size="sm"
              onClick={abrirCotizaciones}
              title="Ver cotizaciones (también sin conexión)"
            >
              <CIcon icon={cilClipboard} className="me-1" />
              Cotizaciones
            </CButton>
          )}
          {/* Conflicto de cotización: badge en vez de auto-open al montar */}
          {conflictosCount > 0 && (
            <CButton
              color="danger"
              variant="outline"
              size="sm"
              onClick={abrirPrimerConflicto}
              title="Cotizaciones con conflicto pendientes de resolver"
              data-testid="badge-conflictos"
            >
              ⚠ Conflictos ({conflictosCount})
            </CButton>
          )}
        </div>
      </div>

      <CRow>
        {/* ===== Izquierda: búsqueda + detalle + carrito ===== */}
        <CCol lg={7} className="mb-3">
          {/* RF-C5: en vista comida el buscador se oculta (la navegación es por pestañas) */}
          {!vistaComida && (
            <BuscadorProducto
              query={busqueda.query}
              setQuery={busqueda.setQuery}
              results={busqueda.results}
              loading={busqueda.loading}
              coloresPorId={coloresPorId}
              esPadre={esPadre}
              hijosDe={hijosDe}
              stockDe={disponibilidadDe}
              onSelect={seleccionarDesdeBusqueda}
              seleccionarPorCodigo={busqueda.seleccionarPorCodigo}
              onEscape={busqueda.clear}
            />
          )}

          {vistaComida ? (
            <ProductosGrid
              productos={productosGrid}
              stockPorProducto={disponibilidadPorId}
              onAgregar={agregarDelGrid}
            />
          ) : selected ? (
            <div className="mt-3">
              <ProductoDetalle
                key={selected.id}
                producto={selected}
                stockBodega={disponibilidadDe(selected)}
                idSucursalActual={idSucursal}
                colores={hermanosProducto}
                etiquetaSelector={etiquetaSelectorVariantes}
                onCambiarColor={(p) => busqueda.seleccionar(p)}
                onAgregar={(cantidad, override) => {
                  // Stock de la bodega activa (fallback al caché de sucursal — D6)
                  carrito.addItem(
                    { ...selected, stockActual: disponibilidadDe(selected) },
                    cantidad,
                    override,
                  )
                  busqueda.clear()
                  // El detalle se desmonta con el blur del botón: devolver el foco
                  // al buscador para el siguiente escaneo (ciclo scan→agregar).
                  window.dispatchEvent(new Event('pos:focus-buscador'))
                }}
              />
            </div>
          ) : (
            <EstadoVacio />
          )}

          <div className="mt-3">
            <Carrito
              items={carrito.items}
              total={carrito.total}
              onCantidad={carrito.setCantidad}
              onRemove={(id, idUnidad) => {
                // Localizar ANTES de borrar para poder ofrecer "Deshacer"
                const eliminado = carrito.items.find(
                  (i) => i.idProducto === id && (i.id_unidad_venta ?? null) === (idUnidad ?? null),
                )
                // Si el carrito queda vacío se desvincula el pendiente, PERO el
                // id se conserva: si el cajero pulsa "Deshacer" hay que
                // re-vincularlo (si no, el pendiente queda huérfano — crítica
                // 2026-10-12 P2).
                const pendienteAVincular =
                  carrito.items.length === 1 ? localStorage.getItem(linkKey) : null
                carrito.removeItem(id, idUnidad)
                if (pendienteAVincular) desvincularPendiente()
                if (eliminado) {
                  showToast('info', 'Línea eliminada', `${eliminado.name} ×${eliminado.cantidad}`, {
                    label: 'Deshacer',
                    onClick: () => {
                      carrito.restoreItem(eliminado)
                      if (pendienteAVincular) vincularPendiente(pendienteAVincular)
                    },
                  })
                }
              }}
              onClear={() => {
                // Confirmar antes de perder el carrito escaneado (P1 critique)
                if (!carrito.items.length) return
                const n = carrito.items.length
                const totalBorrado = carrito.total
                setConfirmar({
                  title: 'Vaciar carrito',
                  message: `¿Vaciar ${n} artículo${n === 1 ? '' : 's'} por ${formatQ(totalBorrado)}? Esta acción no se puede deshacer.`,
                  confirmText: 'Vaciar',
                  confirmColor: 'danger',
                  onConfirm: async () => {
                    carrito.clear()
                    desvincularPendiente()
                  },
                })
              }}
              onPendiente={handlePendiente}
              onVerPendientes={abrirPendientes}
              pendientesCount={pendientes.length}
            />
          </div>
        </CCol>

        {/* ===== Derecha: panel de cobro (solo desktop) =====
            Render condicional por viewport (crítica 2026-10-12 P2): el
            `d-none d-lg-block` dejaba el PanelPago MONTADO también en móvil
            (solo oculto por CSS) → doble RPC de métodos de pago, doble
            listener de red y ids duplicados junto al ModalCobrar. */}
        {esDesktop && (
          <CCol lg={5} className="mb-3">
            <div style={{ position: 'sticky', top: '4.5rem' }}>
              <PanelPago
                carrito={carrito}
                onCobrar={handleCobrar}
                onPendiente={handlePendiente}
                onCotizacion={handleCotizacion}
                procesando={procesando}
                errorCobro={errorCobro}
                onReintentar={() => setErrorCobro(null)}
                cliente={clienteVenta}
                onClienteChange={setClienteVenta}
                nitCliente={nitClienteVenta}
                onNitChange={setNitClienteVenta}
              />
            </div>
          </CCol>
        )}
      </CRow>

      {/* ===== Móvil: barra + bottom sheet ===== */}
      <CobrarBar
        count={carrito.items.length}
        total={carrito.total}
        onClick={() => setModalCobro(true)}
      />

      <ModalCobrar
        visible={modalCobro}
        onClose={() => setModalCobro(false)}
        carrito={carrito}
        onCobrar={handleCobrar}
        onPendiente={handlePendiente}
        onCotizacion={handleCotizacion}
        procesando={procesando}
        errorCobro={errorCobro}
        onReintentar={() => setErrorCobro(null)}
        cliente={clienteVenta}
        onClienteChange={setClienteVenta}
        nitCliente={nitClienteVenta}
        onNitChange={setNitClienteVenta}
      />
      <ModalResultadoVenta resultado={resultado} onClose={() => setResultado(null)} />

      {/* ===== Fase 10: modales ===== */}
      <ModalPendientes
        visible={modalPendientes}
        onClose={() => setModalPendientes(false)}
        pendientes={pendientes}
        cargando={cargandoPendientes}
        onCargar={handleCargarPendiente}
        onEliminar={handleEliminarPendiente}
      />
      <ModalCotizaciones
        visible={modalCotizaciones}
        onClose={() => setModalCotizaciones(false)}
        cotizaciones={cotizaciones}
        cargando={cargandoCotizaciones}
        onEliminar={handleEliminarCotizacion}
        onResolver={handleResolverCotizacion}
        onImprimir={handleImprimirCotizacion}
      />
      <ModalImpresionCotizacion
        visible={!!impresionCotizacion}
        cotizacion={impresionCotizacion}
        onClose={() => setImpresionCotizacion(null)}
      />
      <ModalVariantes
        key={varianteProducto?.id || 'sin-variante'}
        visible={modalVariantes}
        onClose={() => {
          setModalVariantes(false)
          setVarianteProducto(null)
        }}
        producto={varianteProducto}
        opciones={esPadre(varianteProducto) ? hijosDe(varianteProducto) : null}
        onSeleccionar={agregarVarianteSeleccionada}
      />
      <ConflictResolverModal
        visible={!!cotizacionConflicto}
        onClose={() => setCotizacionConflicto(null)}
        items={itemsConflicto}
        cotizacion={cotizacionConflicto}
        errorServidor={cotizacionConflicto?.error_servidor ?? null}
        onAceptarServidor={handleAceptarServidorCotizacion}
        onEditar={handleEditarCotizacionOffline}
        onDescartar={handleDescartarCotizacionOffline}
        onEmitirComprobante={handleEmitirComprobanteCotizacion}
      />
      <ConfirmModal
        visible={!!confirmar}
        title={confirmar?.title}
        message={confirmar?.message}
        confirmText={confirmar?.confirmText}
        confirmColor={confirmar?.confirmColor}
        onConfirm={async () => {
          const fn = confirmar?.onConfirm
          setConfirmar(null)
          if (fn) await fn()
        }}
        onCancel={() => setConfirmar(null)}
      />

      {/* espacio para que el contenido no quede tapado por la barra + nav */}
      <div className="d-lg-none" style={{ height: '5rem' }} />
    </div>
  )
}

export default POSPage
