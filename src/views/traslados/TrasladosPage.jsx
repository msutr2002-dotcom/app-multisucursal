import { useState, useEffect, useRef } from 'react'
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
import { cilPlus, cilReload, cilBan, cilX, cilCheckCircle, cilInbox } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { useToast } from '../../components/common/ToastContext'
import usePermission from '../../hooks/usePermission'
import useEstadoRed from '../../hooks/useEstadoRed'
import ConfirmModal from '../dashboard/components/common/ConfirmModal'
import {
  registrarTrasladoLocal,
  listarTrasladosLocal,
  anularTrasladoLocal,
  aceptarTrasladoLocal,
  claveLinea,
} from '../../services/trasladoService'
import { hayRed } from '../../services/redService'

const LIMITE = 50

// Cache del selector de destinos (sucursales de mi empresa ≠ mía): la primera
// carga necesita red; después el alta de traslados funciona sin conexión.
const CACHE_DESTINOS = 'sucursales_traslado_destinos'

const BADGE_ESTADO = {
  enviado: 'primary',
  recibido: 'success',
  recibido_parcial: 'warning',
  anulado: 'secondary',
}

// Enums crudos → etiqueta legible ("recibido_parcial" → "Recibido parcial")
const etiquetaEstado = (estado) => {
  const t = String(estado || '')
    .replace(/_/g, ' ')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '—'
}

const fechaHora = (f) =>
  new Date(f).toLocaleString('es-GT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

// Total de la línea en unidades base (cantidad de la unidad × factor del tier)
const unidades = (lineas) =>
  (Array.isArray(lineas) ? lineas : []).reduce(
    (s, l) => s + (Number(l.cantidad_enviada) || 0) * (Number(l.factor) || 1),
    0,
  )

// Filas locales que la cola todavía no subió (PENDING) o que el servidor
// rechazó (CONFLICT): se suman a la lista servidorial solo en la primera página.
const esPendienteLocal = (f) => f.sync_status === 'PENDING' || f.sync_status === 'CONFLICT'

const TrasladosPage = () => {
  const showToast = useToast()
  const puedeCrear = usePermission('traslados', 'crear')
  const puedeAnular = usePermission('traslados', 'eliminar')
  const puedeAceptar = usePermission('traslados', 'editar')
  const enLinea = useEstadoRed()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const idSucursal = currentUser?.id_sucursal
  const empresaId = localStorage.getItem('empresaSeleccionada')

  // El aviso de la campanita lleva al módulo con ?tab=movimientos: el hash
  // fija la pestaña al montar; si la ruta ya está montada (misma ruta) el hash
  // no remonta la vista, así que el evento del header la fuerza.
  const [pestana, setPestana] = useState(() =>
    typeof window !== 'undefined' && window.location.hash.includes('tab=movimientos')
      ? 'movimientos'
      : 'traslados',
  )
  const [filas, setFilas] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [tick, setTick] = useState(0)
  const [cargando, setCargando] = useState(!!idSucursal)
  const [busquedaInput, setBusquedaInput] = useState('')
  const [busqueda, setBusqueda] = useState('')

  // Alta de traslado (RF-T1)
  const [modalAlta, setModalAlta] = useState(false)
  // Caché del selector de destinos: se pinta al instante desde localStorage
  const [destinos, setDestinos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CACHE_DESTINOS) || '[]')
    } catch {
      return []
    }
  })
  const [productos, setProductos] = useState([])
  const [unidadMap, setUnidadMap] = useState({})
  const [idDestino, setIdDestino] = useState('')
  const [selProducto, setSelProducto] = useState('')
  const [selUnidad, setSelUnidad] = useState('') // '' = unidad base (factor 1)
  const [selCantidad, setSelCantidad] = useState('1')
  const [lineas, setLineas] = useState([])
  const [guardando, setGuardando] = useState(false)
  // Validación inline del alta (P1 critique): error bajo el campo, no solo toast
  const [erroresAlta, setErroresAlta] = useState({})

  // Multibodega Task 8: modo de traslado + bodegas para el modo interno
  const [modoTraslado, setModoTraslado] = useState('entre_sucursales')
  const [bodegas, setBodegas] = useState([])
  const [idBodegaOrigen, setIdBodegaOrigen] = useState(null)
  const [idBodegaDestino, setIdBodegaDestino] = useState('')

  // Anulación (RF-T2: solo origen, solo SYNCED, solo con red)
  const [aAnular, setAAnular] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [anulando, setAnulando] = useState(false)

  // Verificación y aceptación (RF-T3): cantidades recibidas por producto
  // (default = enviada; 0 = no llegó) y confirmación en dos pasos.
  const [aVerificar, setAVerificar] = useState(null)
  const [recibidas, setRecibidas] = useState({})
  const [confirmandoAceptacion, setConfirmandoAceptacion] = useState(false)
  const [aceptando, setAceptando] = useState(false)

  const direccion = pestana === 'traslados' ? 'enviados' : 'recibidos'

  // Búsqueda con debounce (mismo patrón que ComprasPage)
  useEffect(() => {
    const t = setTimeout(() => {
      setBusqueda(busquedaInput)
      setOffset(0)
    }, 350)
    return () => clearTimeout(t)
  }, [busquedaInput])

  // Destinos: caché para pintar al instante + revalidación con red
  useEffect(() => {
    if (!idSucursal) return
    ;(async () => {
      if (!hayRed()) return
      try {
        let emp = empresaId
        if (!emp) {
          const { data: suc } = await supabase
            .from('sucursal')
            .select('id_empresa')
            .eq('id', idSucursal)
            .maybeSingle()
          emp = suc?.id_empresa
        }
        if (!emp) return
        const { data, error } = await supabase
          .from('sucursal')
          .select('id, name')
          .eq('id_empresa', emp)
          .eq('activo', true)
          .neq('id', idSucursal)
        if (!error && data) {
          setDestinos(data)
          localStorage.setItem(CACHE_DESTINOS, JSON.stringify(data))
        }
      } catch {
        // sin red o sin respuesta: se conserva la caché
      }
    })()
  }, [idSucursal, empresaId])

  // Multibodega Task 8: cargar bodegas de la sucursal (reintento si Dexie aún no hizo upgrade)
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

  // Multibodega: auto-seleccionar bodega Principal solo en modo interno
  useEffect(() => {
    if (modoTraslado !== 'interno' || bodegas.length === 0) return
    const guardada = localStorage.getItem('bodegaSeleccionada')
    const activa = bodegas.find((b) => b.id === guardada) || bodegas.find((b) => b.es_principal)
    if (activa) Promise.resolve().then(() => setIdBodegaOrigen(activa.id))
  }, [modoTraslado, bodegas])

  // Catálogos del alta: todo local (productos con stock de MI sucursal + tiers
  // de presentación para el selector de unidad, specs/traslados-unidades.md).
  // multibodega: si hay bodega origen (cualquier modo) el stock se lee de
  // stock_bodega; si no, de productos_sucursal.
  useEffect(() => {
    if (!idSucursal) return
    if (modoTraslado === 'interno' && !idBodegaOrigen) return
    ;(async () => {
      try {
        const usarBodega = !!idBodegaOrigen
        const [prods, stocks, unidadesCat] = await Promise.all([
          db.productos.toArray(),
          usarBodega
            ? db.stock_bodega
                .where('id_bodega')
                .equals(idBodegaOrigen)
                .toArray()
                .catch(() => [])
            : db.productos_sucursal
                .where('[id_sucursal+id_producto]')
                .between([idSucursal, ''], [idSucursal, '\uffff'])
                .toArray(),
          db.unidades.toArray(),
        ])
        const stockMap = new Map(stocks.map((s) => [s.id_producto, s]))
        setUnidadMap(Object.fromEntries(unidadesCat.map((u) => [u.id, u.name])))
        setProductos(
          prods
            .filter((p) => stockMap.has(p.id))
            .map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              stock: stockMap.get(p.id)?.stock ?? 0,
              precios: p.precios || [],
            }))
            .sort((a, b) => String(a.name).localeCompare(String(b.name))),
        )
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, tick, modoTraslado, idBodegaOrigen])

  // Listado: local primero; con red el servidor manda y se suman los pendientes
  // secuenciaLista: si dos refrescos se solapan (avisos de la cola en vuelo),
  // la respuesta vieja no puede pisar a la nueva (sino el badge de CONFLICT
  // se perdía cuando el fetch anterior terminaba después).
  const secuenciaLista = useRef(0)
  useEffect(() => {
    if (!idSucursal) return
    const sec = ++secuenciaLista.current
    ;(async () => {
      try {
        const local = await listarTrasladosLocal({
          idSucursal,
          direccion,
          busqueda,
          limite: LIMITE,
          offset,
        })
        if (sec !== secuenciaLista.current) return
        if (!enLinea) {
          setFilas(local.traslados)
          setTotal(local.total)
          return
        }
        const { data, error } = await supabase.rpc('get_traslados', {
          p_id_sucursal: idSucursal,
          p_direccion: direccion,
          p_busqueda: busqueda || null,
          p_limite: LIMITE,
          p_offset: offset,
        })
        if (sec !== secuenciaLista.current) return
        if (error) {
          showToast('warning', 'Sin respuesta del servidor', error.message)
          setFilas(local.traslados)
          setTotal(local.total)
          return
        }
        // Las filas del servidor no traen sync_status: ya están confirmadas
        const remotas = (data?.traslados || []).map((r) => ({ ...r, sync_status: 'SYNCED' }))
        const idsRemotos = new Set(remotas.map((r) => r.id))
        const pendientes =
          offset === 0
            ? local.traslados.filter((f) => esPendienteLocal(f) && !idsRemotos.has(f.id))
            : []
        setTotal((data?.total ?? 0) + pendientes.length)
        setFilas(offset > 0 ? [...remotas] : [...remotas, ...pendientes])
      } catch (e) {
        if (sec === secuenciaLista.current) showToast('danger', 'Error', String(e?.message || e))
      } finally {
        if (sec === secuenciaLista.current) setCargando(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idSucursal, direccion, busqueda, offset, tick, enLinea])

  const recargar = () => {
    setCargando(true)
    setOffset(0)
    setTick((t) => t + 1)
  }

  // El espejo cambió (alta/anulación/sync en otro lado) → refrescar
  useEffect(() => {
    const refrescar = () => recargar()
    window.addEventListener('cola-sincronizada', refrescar)
    window.addEventListener('traslados-actualizados', refrescar)
    return () => {
      window.removeEventListener('cola-sincronizada', refrescar)
      window.removeEventListener('traslados-actualizados', refrescar)
    }
  }, [])

  // El aviso de la campanita navega a esta ruta con ?tab=movimientos; si ya
  // estamos montados el hash puede no cambiar, así que el evento fuerza la
  // pestaña (mismo reset que hace CTabs onChange).
  useEffect(() => {
    const irAMovimientos = () => {
      setPestana('movimientos')
      setOffset(0)
      setBusquedaInput('')
    }
    window.addEventListener('traslados-ir-movimientos', irAMovimientos)
    return () => window.removeEventListener('traslados-ir-movimientos', irAMovimientos)
  }, [])

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE))
  const paginaActual = Math.floor(offset / LIMITE) + 1

  // Unidad activa del formulario (specs/traslados-unidades.md): tiers con
  // factor > 1 del producto elegido; sin tiers el flujo es el de siempre.
  const productoActivo = productos.find((p) => p.id === selProducto) || null
  const presentaciones = (productoActivo?.precios || []).filter((t) => (Number(t.factor) || 1) > 1)
  const tierActivo = presentaciones.find((t) => t.id === selUnidad) || null
  const factorActivo = Number(tierActivo?.factor) || 1
  const nombreUnidad = tierActivo
    ? unidadMap[tierActivo.id_unidad_venta] || 'Presentación'
    : 'Unidad'
  const baseUsada = lineas
    .filter((l) => l.id_producto === selProducto)
    .reduce((s, l) => s + l.cantidad * (l.factor || 1), 0)
  const stockDisponible = productoActivo ? productoActivo.stock - baseUsada : 0
  const maxEnUnidad = Math.max(0, Math.floor(stockDisponible / factorActivo))

  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad * (l.factor || 1), 0)

  const abrirAlta = () => {
    if (!puedeCrear) return
    setModoTraslado('entre_sucursales')
    setIdBodegaDestino('')
    setIdDestino('')
    setSelProducto('')
    setSelUnidad('')
    setSelCantidad('1')
    setLineas([])
    setErroresAlta({})
    setModalAlta(true)
  }

  const cerrarAlta = () => {
    if (guardando) return
    setModalAlta(false)
  }

  const agregarLinea = () => {
    const producto = productoActivo
    if (!producto) {
      setErroresAlta({ producto: 'Selecciona un producto de la lista' })
      showToast('warning', 'Falta el producto', 'Selecciona un producto de la lista')
      return
    }
    const cantidad = Number.parseInt(selCantidad, 10)
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      setErroresAlta((e) => ({ ...e, cantidad: 'Usa un entero mayor a cero' }))
      showToast('warning', 'Cantidad inválida', 'Usa un entero mayor a cero')
      return
    }
    if (cantidad > maxEnUnidad) {
      const msg =
        factorActivo > 1
          ? `Solo alcanza para ${maxEnUnidad} ${nombreUnidad} (${stockDisponible} unidades base)`
          : `Solo hay ${stockDisponible} unidades disponibles en esta sucursal`
      setErroresAlta((e) => ({ ...e, cantidad: msg }))
      showToast('warning', 'Stock insuficiente', msg)
      return
    }
    const idPrecio = tierActivo?.id ?? null
    setErroresAlta({}) // limpiar errores del formulario al agregar exitosamente
    setLineas((ls) => {
      const existe = ls.find(
        (l) => l.id_producto === producto.id && (l.id_precio_producto ?? null) === idPrecio,
      )
      if (existe) {
        return ls.map((l) =>
          l.id_producto === producto.id && (l.id_precio_producto ?? null) === idPrecio
            ? { ...l, cantidad: l.cantidad + cantidad }
            : l,
        )
      }
      return [
        ...ls,
        {
          id_producto: producto.id,
          name: producto.name,
          cantidad,
          id_precio_producto: idPrecio,
          factor: factorActivo,
          unidad: nombreUnidad,
        },
      ]
    })
    setSelProducto('')
    setSelUnidad('')
    setSelCantidad('1')
  }

  const quitarLinea = (idx) => setLineas((ls) => ls.filter((_, i) => i !== idx))

  const registrar = async () => {
    if (guardando) return
    const esInterno = modoTraslado === 'interno'
    if (esInterno) {
      if (!idBodegaOrigen || !idBodegaDestino) {
        setErroresAlta({ destino: 'Selecciona las bodegas de origen y destino' })
        showToast('warning', 'Faltan bodegas', 'Selecciona las bodegas de origen y destino')
        return
      }
      if (idBodegaOrigen === idBodegaDestino) {
        setErroresAlta({ destino: 'La bodega destino debe ser distinta a la de origen' })
        showToast(
          'warning',
          'Bodegas iguales',
          'La bodega destino debe ser distinta a la de origen',
        )
        return
      }
    } else if (!idDestino) {
      setErroresAlta({ destino: 'Selecciona la sucursal de destino' })
      showToast('warning', 'Falta el destino', 'Selecciona la sucursal de destino')
      return
    }
    if (!lineas.length) {
      showToast('warning', 'Sin productos', 'Agrega al menos una línea al traslado')
      return
    }
    setGuardando(true)
    try {
      await registrarTrasladoLocal({
        idSucursalOrigen: idSucursal,
        idSucursalDestino: esInterno ? idSucursal : idDestino,
        idUsuario: currentUser?.id ?? null,
        items: lineas.map((l) => ({
          id_producto: l.id_producto,
          cantidad: l.cantidad,
          ...(l.id_precio_producto ? { id_precio_producto: l.id_precio_producto } : {}),
        })),
        nombreDestino: esInterno ? null : (destinos.find((d) => d.id === idDestino)?.name ?? null),
        tipo: esInterno ? 'interno' : 'entre_sucursales',
        // multibodega Task 9: la bodega origen aplica en ambos modos; la
        // destino solo en interno (el receptor no puede elegirla a distancia)
        idBodegaOrigen: idBodegaOrigen || null,
        idBodegaDestino: esInterno ? idBodegaDestino : null,
        nombreBodegaOrigen: idBodegaOrigen
          ? (bodegas.find((b) => b.id === idBodegaOrigen)?.name ?? null)
          : null,
        nombreBodegaDestino: esInterno
          ? (bodegas.find((b) => b.id === idBodegaDestino)?.name ?? null)
          : null,
      })
      // El stock del selector baja al instante (en unidades base: × factor)
      setProductos((ps) =>
        ps.map((p) => {
          const l = lineas.find((x) => x.id_producto === p.id)
          return l ? { ...p, stock: p.stock - l.cantidad * (l.factor || 1) } : p
        }),
      )
      showToast(
        'success',
        'Traslado registrado',
        esInterno
          ? 'Traslado interno guardado en este dispositivo'
          : enLinea
            ? 'Guardado en el dispositivo y en cola de sincronización'
            : 'Sin conexión: guardado en este dispositivo, se enviará al volver la red',
      )
      setModalAlta(false)
      recargar()
    } catch (e) {
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      setGuardando(false)
    }
  }

  const abrirAnular = (fila) => {
    if (fila.sync_status !== 'SYNCED') {
      showToast(
        'warning',
        fila.sync_status === 'CONFLICT'
          ? 'Traslado con error de sincronización'
          : 'Traslado local sin sincronizar',
        fila.sync_status === 'CONFLICT'
          ? 'El servidor rechazó su sincronización: revísalo antes de anularlo.'
          : 'Todavía no existe en el servidor: la anulación estará disponible cuando se sincronice.',
      )
      return
    }
    setMotivo('')
    setAAnular(fila)
  }

  const handleAnular = () => {
    if (anulando) return
    if (!motivo.trim()) {
      showToast('warning', 'Falta el motivo', 'El motivo de anulación es obligatorio')
      return
    }
    // los traslados internos se anulan 100% local (sin red); los entre
    // sucursales necesitan servidor (RF-T2)
    if (aAnular.tipo !== 'interno' && !hayRed()) {
      setAAnular(null)
      showToast(
        'warning',
        'Sin conexión',
        'La anulación se registra en el servidor: inténtalo de nuevo al recuperar la red.',
      )
      return
    }
    const fila = aAnular
    const motivoEnvio = motivo.trim()
    setAnulando(true)
    anularTrasladoLocal({
      idTraslado: fila.id,
      idSucursal,
      idUsuario: currentUser?.id ?? null,
      motivo: motivoEnvio,
    })
      .then(() => {
        showToast('success', 'Traslado anulado', 'El stock fue devuelto a la sucursal origen')
        setAAnular(null)
        setMotivo('')
        recargar()
      })
      .catch((e) => {
        showToast('danger', 'Error', String(e?.message || e))
      })
      .finally(() => setAnulando(false))
  }

  // --- Verificación y aceptación (RF-T3) ---

  const nombreLinea = (l) => l.producto || l.name || String(l.id_producto).slice(0, 8)

  const abrirVerificar = (fila) => {
    if (!puedeAceptar) return
    if (fila.estado !== 'enviado') {
      showToast('warning', 'No verificable', `El traslado ya fue ${fila.estado}`)
      return
    }
    if (!(fila.lineas || []).length) {
      showToast('warning', 'Sin líneas', 'El traslado no tiene productos que verificar')
      return
    }
    // clave por (producto, unidad): mismo producto en dos unidades son dos filas
    setRecibidas(
      Object.fromEntries(fila.lineas.map((l) => [claveLinea(l), String(l.cantidad_enviada)])),
    )
    setConfirmandoAceptacion(false)
    setAVerificar(fila)
  }

  const cerrarVerificar = () => {
    if (aceptando) return
    setAVerificar(null)
    setConfirmandoAceptacion(false)
    setRecibidas({})
  }

  // Las cantidades de recepción son en la unidad de la línea (Caja, Paquete…);
  // los totales del resumen se muestran en unidades base (× factor).
  const lineasVerificacion = aVerificar?.lineas || []
  const enviadaTotal = lineasVerificacion.reduce(
    (s, l) => s + (Number(l.cantidad_enviada) || 0) * (Number(l.factor) || 1),
    0,
  )
  const recibidaTotal = lineasVerificacion.reduce((s, l) => {
    const v = Number.parseInt(recibidas[claveLinea(l)], 10)
    return s + (Number.isInteger(v) && v > 0 ? v * (Number(l.factor) || 1) : 0)
  }, 0)
  const lineasInvalidas = lineasVerificacion.filter((l) => {
    const v = Number.parseInt(recibidas[claveLinea(l)], 10)
    return !Number.isInteger(v) || v < 0 || v > Number(l.cantidad_enviada)
  })
  const estadoPrevisto =
    lineasVerificacion.length > 0 &&
    lineasVerificacion.every(
      (l) => Number.parseInt(recibidas[claveLinea(l)], 10) === Number(l.cantidad_enviada),
    )
      ? 'recibido'
      : 'recibido_parcial'

  const setRecibida = (clave, valor) => setRecibidas((r) => ({ ...r, [clave]: valor }))

  const noLlego = (clave) => setRecibida(clave, '0')

  const pedirConfirmacion = () => {
    if (!aVerificar || aceptando) return
    if (lineasInvalidas.length) {
      showToast(
        'warning',
        'Cantidades inválidas',
        'Cada recibida debe ser un entero entre 0 y la cantidad enviada.',
      )
      return
    }
    setConfirmandoAceptacion(true)
  }

  const handleAceptar = async () => {
    if (aceptando) return
    setAceptando(true)
    try {
      const r = await aceptarTrasladoLocal({
        idTraslado: aVerificar.id,
        idSucursal,
        idUsuario: currentUser?.id ?? null,
        lineas: lineasVerificacion.map((l) => ({
          id_producto: l.id_producto,
          cantidad_recibida: Number.parseInt(recibidas[claveLinea(l)], 10),
          ...(l.id_precio_producto ? { id_precio_producto: l.id_precio_producto } : {}),
        })),
      })
      showToast(
        'success',
        'Traslado aceptado',
        `Llegaron ${recibidaTotal} de ${enviadaTotal} unidades base — estado ${etiquetaEstado(r.estado)}`,
      )
      setConfirmandoAceptacion(false)
      setAVerificar(null)
      setRecibidas({})
      recargar()
    } catch (e) {
      showToast('danger', 'Error', String(e?.message || e))
    } finally {
      setAceptando(false)
    }
  }

  if (!idSucursal) {
    return (
      <p className="text-body-secondary text-center py-4 mb-0">No se encontró la sucursal activa</p>
    )
  }

  const esEnviados = pestana === 'traslados'

  const listado = (
    <>
      <CRow className="g-2 align-items-center mb-3">
        <CCol xs={12} md={5}>
          <CFormInput
            value={busquedaInput}
            onChange={(e) => setBusquedaInput(e.target.value)}
            placeholder={
              esEnviados ? 'Buscar por sucursal, usuario o producto...' : 'Buscar por sucursal...'
            }
            data-testid="buscar-traslado"
          />
        </CCol>
        <CCol xs={6} md={4} className="text-md-end text-body-secondary small">
          {!cargando && `${total} traslado${total === 1 ? '' : 's'}`}
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
            {esEnviados ? 'No hay traslados enviados' : 'No hay movimientos recibidos'}
          </p>
        </div>
      ) : (
        <div className="table-responsive">
          <CTable align="middle" className="mb-0">
            <CTableHead>
              <CTableRow>
                {['Fecha', esEnviados ? 'Destino' : 'Origen', 'Ítems', 'Unidades', 'Estado'].map(
                  (h) => (
                    <CTableHeaderCell
                      key={h}
                      className="small text-uppercase text-body-secondary border-bottom"
                    >
                      {h}
                    </CTableHeaderCell>
                  ),
                )}
                <CTableHeaderCell className="small text-uppercase text-body-secondary border-bottom text-end">
                  Acciones
                </CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {filas.map((f) => (
                <CTableRow key={f.id}>
                  <td className="small">{fechaHora(f.fecha)}</td>
                  <td>{(esEnviados ? f.destino : f.origen) || '—'}</td>
                  <td>{(f.lineas || []).length}</td>
                  <td>{unidades(f.lineas)}</td>
                  <td>
                    <CBadge color={BADGE_ESTADO[f.estado] || 'secondary'}>
                      {etiquetaEstado(f.estado)}
                    </CBadge>
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
                    {esEnviados
                      ? puedeAnular &&
                        f.estado === 'enviado' && (
                          <CButton
                            color="danger"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirAnular(f)}
                            disabled={anulando}
                            title="Anular traslado"
                            data-testid="btn-anular"
                          >
                            <CIcon icon={cilBan} />
                          </CButton>
                        )
                      : puedeAceptar &&
                        f.estado === 'enviado' && (
                          <CButton
                            color="success"
                            variant="outline"
                            size="sm"
                            onClick={() => abrirVerificar(f)}
                            title="Verificar y aceptar traslado"
                            data-testid="btn-verificar"
                          >
                            <CIcon icon={cilCheckCircle} className="me-1" />
                            Verificar/Aceptar
                          </CButton>
                        )}
                  </td>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
          {totalPaginas > 1 && (
            <div className="d-flex justify-content-center mt-3">
              <CPagination
                active={paginaActual}
                pages={totalPaginas}
                onActivePageChange={(p) => setOffset((p - 1) * LIMITE)}
              />
            </div>
          )}
        </div>
      )}
    </>
  )

  return (
    <CCard>
      <CCardHeader>
        <CRow className="align-items-center">
          <CCol xs={12} md={6}>
            <h5 className="mb-0">Traslados entre sucursales</h5>
          </CCol>
          <CCol xs={12} md={6} className="text-md-end">
            {esEnviados && (
              <CButton
                color="success"
                size="sm"
                onClick={abrirAlta}
                disabled={!puedeCrear}
                className="me-2"
                data-testid="btn-nuevo-traslado"
              >
                <CIcon icon={cilPlus} className="me-1" />
                Nuevo traslado
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
            Sin conexión: estás viendo los registros locales. El envío de traslados sigue permitido.
          </CAlert>
        )}
        <CTabs
          activeItemKey={pestana}
          onChange={(k) => {
            setPestana(k)
            setOffset(0)
            setBusquedaInput('')
          }}
        >
          <CTabList className="mb-3">
            <CTab itemKey="traslados">Traslados</CTab>
            <CTab itemKey="movimientos">Movimientos</CTab>
          </CTabList>
          <CTabContent>
            <CTabPanel itemKey="traslados">{esEnviados && listado}</CTabPanel>
            <CTabPanel itemKey="movimientos">{!esEnviados && listado}</CTabPanel>
          </CTabContent>
        </CTabs>
      </CCardBody>

      <CModal visible={modalAlta} onClose={cerrarAlta} size="lg" data-testid="modal-nuevo">
        <CModalHeader onClose={cerrarAlta}>
          <CModalTitle>Nuevo traslado</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {/* Multibodega Task 8: selector de modo (entre sucursales / interno) */}
          <div className="d-flex gap-2 mb-3">
            <CButton
              color={modoTraslado === 'entre_sucursales' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => {
                setModoTraslado('entre_sucursales')
                setIdBodegaDestino('')
                setErroresAlta({})
              }}
              data-testid="modo-entre-sucursales"
            >
              Entre sucursales
            </CButton>
            <CButton
              color={modoTraslado === 'interno' ? 'primary' : 'outline-primary'}
              size="sm"
              onClick={() => {
                setModoTraslado('interno')
                setIdDestino('')
                setErroresAlta({})
              }}
              data-testid="modo-interno"
            >
              Interno (bodega → bodega)
            </CButton>
          </div>

          {modoTraslado === 'entre_sucursales' ? (
            <>
              <label className="form-label small mb-1">Sucursal destino (misma empresa)</label>
              <CFormSelect
                value={idDestino}
                onChange={(e) => {
                  setIdDestino(e.target.value)
                  setErroresAlta((er) => {
                    const { destino: _d, ...resto } = er
                    return resto
                  })
                }}
                invalid={!!erroresAlta.destino}
                aria-describedby={erroresAlta.destino ? 'err-destino' : undefined}
                data-testid="sel-destino"
              >
                <option value="">Seleccione el destino...</option>
                {destinos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </CFormSelect>
              {erroresAlta.destino && (
                <div id="err-destino" className="text-danger small mt-1">
                  {erroresAlta.destino}
                </div>
              )}
              {destinos.length === 0 && (
                <CAlert color="info" className="py-2 small mt-2 mb-0">
                  No hay sucursales de destino disponibles: se requiere conexión una vez para cargar
                  el listado.
                </CAlert>
              )}
              {/* Multibodega Task 9: bodega origen opcional (default Principal) */}
              {bodegas.length > 1 && (
                <div className="mt-2">
                  <label className="form-label small mb-1">Bodega origen</label>
                  <CFormSelect
                    value={idBodegaOrigen || ''}
                    onChange={(e) => setIdBodegaOrigen(e.target.value || null)}
                    data-testid="selector-bodega-origen-cross"
                  >
                    <option value="">Todas las bodegas (stock de sucursal)</option>
                    {bodegas.map((b) => (
                      <option key={b.id} value={b.id}>
                        📦 {b.name}
                      </option>
                    ))}
                  </CFormSelect>
                </div>
              )}
            </>
          ) : (
            <CRow className="g-2">
              <CCol md={6}>
                <label className="form-label small mb-1">Bodega origen</label>
                <CFormSelect
                  value={idBodegaOrigen || ''}
                  onChange={(e) => setIdBodegaOrigen(e.target.value)}
                  data-testid="selector-bodega-origen"
                >
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      📦 {b.name}
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
              <CCol md={6}>
                <label className="form-label small mb-1">Bodega destino</label>
                <CFormSelect
                  value={idBodegaDestino}
                  onChange={(e) => {
                    setIdBodegaDestino(e.target.value)
                    setErroresAlta((er) => {
                      const { destino: _d, ...resto } = er
                      return resto
                    })
                  }}
                  invalid={!!erroresAlta.destino}
                  data-testid="selector-bodega-destino"
                >
                  <option value="">Seleccione...</option>
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      📦 {b.name}
                    </option>
                  ))}
                </CFormSelect>
                {erroresAlta.destino && (
                  <div className="text-danger small mt-1">{erroresAlta.destino}</div>
                )}
              </CCol>
            </CRow>
          )}

          <CRow className="g-2 align-items-end mb-1 mt-1">
            <CCol md={presentaciones.length ? 4 : 6}>
              <label className="form-label small mb-1">
                {modoTraslado === 'interno'
                  ? 'Producto (stock de la bodega origen)'
                  : 'Producto (stock de esta sucursal)'}
              </label>
              <CFormSelect
                value={selProducto}
                onChange={(e) => {
                  setSelProducto(e.target.value)
                  setSelUnidad('')
                  setErroresAlta((er) => {
                    const { producto: _p, ...resto } = er
                    return resto
                  })
                }}
                invalid={!!erroresAlta.producto}
                aria-describedby={erroresAlta.producto ? 'err-producto' : undefined}
                data-testid="sel-producto"
              >
                <option value="">Seleccione...</option>
                {productos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.sku ? ` (${p.sku})` : ''} — stock {p.stock}
                  </option>
                ))}
              </CFormSelect>
              {erroresAlta.producto && (
                <div id="err-producto" className="text-danger small mt-1">
                  {erroresAlta.producto}
                </div>
              )}
            </CCol>
            {presentaciones.length > 0 && (
              <CCol md={2}>
                <label className="form-label small mb-1">Unidad</label>
                <CFormSelect
                  value={selUnidad}
                  onChange={(e) => setSelUnidad(e.target.value)}
                  disabled={!selProducto}
                  data-testid="sel-unidad"
                >
                  <option value="">Unidad (×1)</option>
                  {presentaciones.map((t) => (
                    <option key={t.id} value={t.id}>
                      {unidadMap[t.id_unidad_venta] || 'Presentación'} (×{t.factor} und)
                    </option>
                  ))}
                </CFormSelect>
              </CCol>
            )}
            <CCol md={3}>
              <label className="form-label small mb-1">Cantidad ({nombreUnidad})</label>
              <CFormInput
                type="number"
                min={1}
                step={1}
                max={maxEnUnidad > 0 ? maxEnUnidad : undefined}
                value={selCantidad}
                onChange={(e) => {
                  setSelCantidad(e.target.value)
                  setErroresAlta((er) => {
                    const { cantidad: _c, ...resto } = er
                    return resto
                  })
                }}
                invalid={!!erroresAlta.cantidad}
                aria-describedby={erroresAlta.cantidad ? 'err-cantidad' : undefined}
                data-testid="inp-cantidad"
              />
              {erroresAlta.cantidad && (
                <div id="err-cantidad" className="text-danger small mt-1">
                  {erroresAlta.cantidad}
                </div>
              )}
            </CCol>
            <CCol md={3}>
              <CButton
                color="primary"
                variant="outline"
                onClick={agregarLinea}
                className="w-100"
                data-testid="btn-agregar-linea"
              >
                <CIcon icon={cilPlus} className="me-1" />
                Agregar
              </CButton>
            </CCol>
          </CRow>
          {selProducto && (
            <p className="small text-body-secondary mt-0 mb-2" data-testid="hint-unidad">
              {factorActivo > 1
                ? `1 ${nombreUnidad} = ${factorActivo} und · Máx: ${maxEnUnidad} ${nombreUnidad}`
                : `Disponible: ${stockDisponible} und`}
            </p>
          )}

          {lineas.length === 0 ? (
            <p className="text-body-secondary small">Sin líneas: agrega productos al traslado.</p>
          ) : (
            <div className="table-responsive">
              <CTable size="sm" className="mb-0">
                <CTableHead>
                  <CTableRow>
                    <th>Producto</th>
                    <th className="text-end">Cant.</th>
                    <th className="text-end">Unidades base</th>
                    <th />
                  </CTableRow>
                </CTableHead>
                <CTableBody>
                  {lineas.map((l, idx) => (
                    <CTableRow key={`${l.id_producto}-${l.id_precio_producto || 'base'}-${idx}`}>
                      <td>{l.name}</td>
                      <td className="text-end">
                        {l.cantidad} {l.factor > 1 ? l.unidad : ''}
                      </td>
                      <td className="text-end">{l.cantidad * (l.factor || 1)}</td>
                      <td className="text-end">
                        <CButton
                          color="danger"
                          variant="outline"
                          size="sm"
                          onClick={() => quitarLinea(idx)}
                          title="Quitar línea"
                          aria-label="Quitar línea"
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

          <div className="text-end fw-bold mt-2">Total: {totalUnidades} unidades</div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={cerrarAlta} disabled={guardando}>
            Cancelar
          </CButton>
          <CButton
            color="success"
            onClick={registrar}
            disabled={guardando}
            data-testid="btn-registrar"
          >
            {guardando ? (
              <CSpinner size="sm" className="me-1" />
            ) : (
              <CIcon icon={cilCheckCircle} className="me-1" />
            )}
            Registrar traslado
          </CButton>
        </CModalFooter>
      </CModal>

      <CModal
        visible={!!aVerificar}
        onClose={cerrarVerificar}
        size="lg"
        data-testid="modal-verificar"
      >
        <CModalHeader onClose={cerrarVerificar}>
          <CModalTitle>
            Verificar recepción {aVerificar ? aVerificar.id.slice(0, 8).toUpperCase() : ''}
          </CModalTitle>
        </CModalHeader>
        <CModalBody>
          <p className="small text-body-secondary mb-2">
            Origen: {aVerificar?.origen || '—'} · Enviado:{' '}
            {aVerificar ? fechaHora(aVerificar.fecha) : ''} · Ajusta las cantidades que
            <strong> realmente llegaron</strong> (0 = no llegó; el faltante vuelve al stock de la
            sucursal origen).
          </p>
          <div className="table-responsive">
            <CTable size="sm" className="mb-0">
              <CTableHead>
                <CTableRow>
                  <th>Producto</th>
                  <th className="text-end">Enviada</th>
                  <th className="text-end" style={{ width: '8.5rem' }}>
                    Recibida
                  </th>
                  <th style={{ width: '3rem' }} />
                </CTableRow>
              </CTableHead>
              <CTableBody>
                {lineasVerificacion.map((l, idx) => {
                  const enviada = Number(l.cantidad_enviada) || 0
                  const factor = Number(l.factor) || 1
                  const clave = claveLinea(l)
                  const bruto = recibidas[clave] ?? ''
                  const v = Number.parseInt(bruto, 10)
                  const invalida = !Number.isInteger(v) || v < 0 || v > enviada
                  return (
                    <CTableRow key={clave}>
                      <td>{nombreLinea(l)}</td>
                      <td className="text-end">
                        {factor > 1
                          ? `${enviada} ${l.unidad || ''} (${enviada * factor} und)`
                          : enviada}
                      </td>
                      <td className="text-end">
                        <CFormInput
                          type="number"
                          min={0}
                          max={enviada}
                          step={1}
                          value={bruto}
                          className={`text-end ${invalida ? 'is-invalid' : ''}`}
                          onChange={(e) => setRecibida(clave, e.target.value)}
                          aria-label={`Recibida de ${nombreLinea(l)}`}
                          data-testid={`inp-recibida-${idx}`}
                        />
                      </td>
                      <td className="text-end">
                        <CButton
                          color="secondary"
                          variant="outline"
                          size="sm"
                          onClick={() => noLlego(clave)}
                          title="Marcar como no llegó (0)"
                          aria-label="Marcar como no llegó (0)"
                          data-testid={`btn-no-llego-${idx}`}
                        >
                          <CIcon icon={cilX} />
                        </CButton>
                      </td>
                    </CTableRow>
                  )
                })}
              </CTableBody>
            </CTable>
          </div>
          <div className="d-flex justify-content-between align-items-center mt-3">
            <CBadge color={BADGE_ESTADO[estadoPrevisto]}>
              estado: {etiquetaEstado(estadoPrevisto)}
            </CBadge>
            <div className="fw-bold" data-testid="resumen-verificacion">
              Llegan {recibidaTotal} de {enviadaTotal} unidades base
            </div>
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" onClick={cerrarVerificar} disabled={aceptando}>
            Cancelar
          </CButton>
          <CButton
            color="success"
            onClick={pedirConfirmacion}
            disabled={aceptando}
            data-testid="btn-aceptar"
          >
            {aceptando ? (
              <CSpinner size="sm" className="me-1" />
            ) : (
              <CIcon icon={cilCheckCircle} className="me-1" />
            )}
            Aceptar traslado
          </CButton>
        </CModalFooter>
      </CModal>

      <ConfirmModal
        visible={confirmandoAceptacion}
        title="Aceptar traslado"
        message={`¿Aceptar ${lineasVerificacion.length} línea(s) con ${recibidaTotal} de ${enviadaTotal} unidades base? El stock se acreditará en esta sucursal y lo no recibido se devolverá al origen.`}
        confirmText="Confirmar recepción"
        confirmColor="success"
        onConfirm={handleAceptar}
        onCancel={() => setConfirmandoAceptacion(false)}
      />

      <ConfirmModal
        visible={!!aAnular}
        title="Anular traslado"
        message={`¿Anular el traslado ${
          aAnular ? aAnular.id.slice(0, 8).toUpperCase() : ''
        } hacia "${aAnular ? aAnular.destino || '' : ''}"? El stock se devolverá a la sucursal.`}
        confirmText="Anular traslado"
        onConfirm={handleAnular}
        onCancel={() => setAAnular(null)}
      >
        <CFormInput
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo de anulación (obligatorio)"
          className="mt-2"
          data-testid="inp-motivo"
        />
      </ConfirmModal>
    </CCard>
  )
}

export default TrasladosPage
