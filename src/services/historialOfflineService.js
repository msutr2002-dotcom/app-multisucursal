import { db } from '../lib/db'

/**
 * Historial Offline (Task 2, specs/offline-suite.md RF-03).
 * Lee ventas y cotizaciones de IndexedDB cuando no hay red, produciendo
 * filas compatibles con la tabla de HistorialPage.
 */

/** Leyenda de marca de agua para el comprobante impreso sin red (RF-03 + Task 2). */
export const LEYENDA_SIN_RED = 'PENDIENTE DE SINCRONIZACIÓN FISCAL'

/** Datos del usuario en sesión (respaldo local del campo `usuario` del servidor). */
function usuarioLocal() {
  try {
    return JSON.parse(localStorage.getItem('currentUser'))
  } catch {
    return null
  }
}

/**
 * Etiqueta legible del estado de un borrador de cotización (`offline_quotes`),
 * compartida por la lista y el detalle del Historial.
 * @param {string} status - 'pending_sync' | 'conflict' | 'synced'
 * @returns {string}
 */
export function estadoCotizacion(status) {
  return (
    {
      pending_sync: 'borrador',
      conflict: 'conflicto',
      synced: 'sincronizada',
    }[status] || status
  )
}

/**
 * Ids de las ventas locales cuyo evento de la cola sigue PENDING (aún no
 * llegaron al servidor). Con red existen en las dos fuentes y se muestran una
 * sola vez (ver `fusionarFilasHistorial`).
 * @returns {Promise<Set<string>>}
 */
export async function leerVentasPendientesSync() {
  const eventos = await db.cola_sincronizacion
    .where('sync_status')
    .equals('PENDING')
    .filter((e) => e.tabla === 'ventas' && e.id_registro)
    .toArray()
  return new Set(eventos.map((e) => e.id_registro))
}

/**
 * Lee las ventas locales de una sucursal y las devuelve como filas de tabla
 * compatibles con el Historial. Cada fila lleva `tipo:'venta'` y `esLocal:true`.
 * @param {string} idSucursal
 * @returns {Promise<Array>}
 */
export async function leerVentasLocales(idSucursal) {
  if (!idSucursal) return []

  const currentUser = usuarioLocal()
  const pendientes = await leerVentasPendientesSync()

  const ventas = await db.ventas.where('id_sucursal').equals(idSucursal).reverse().sortBy('fecha')

  if (!ventas.length) return []

  // Un solo recorrido del detalle (evita N consultas para el conteo de ítems)
  const ids = ventas.map((v) => v.id)
  const detalles = await db.detalle_venta.where('id_venta').anyOf(ids).toArray()
  const conteo = new Map()
  detalles.forEach((d) => conteo.set(d.id_venta, (conteo.get(d.id_venta) || 0) + 1))

  return ventas.map((v) => ({
    id: v.id,
    fecha: v.fecha,
    usuario: currentUser?.name || 'Local',
    id_metodo_pago: v.id_metodo_pago,
    items: conteo.get(v.id) || 0,
    total: v.total,
    estado: v.estado,
    tipo: 'venta',
    esLocal: true,
    pendienteSync: pendientes.has(v.id),
  }))
}

/**
 * Lee las cotizaciones locales de una sucursal (excluyendo synced porque
 * esas ya viven en el servidor). Devuelve filas de tabla con `tipo:'cotizacion'`.
 * `esLocal:true` salvo las ya sincronizadas (que aparecen vía quote_cache).
 * @param {string} idSucursal
 * @returns {Promise<Array>}
 */
export async function leerCotizacionesLocales(idSucursal) {
  if (!idSucursal) return []

  const currentUser = usuarioLocal()

  const quotes = await db.offline_quotes.where('id_sucursal').equals(idSucursal).toArray()

  return quotes
    .filter((q) => q.status !== 'synced')
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .map((q) => ({
      id: q.temp_id,
      fecha: q.fecha,
      usuario: currentUser?.name || 'Local',
      id_metodo_pago: null,
      items: (q.items || []).length,
      total: q.total,
      estado: estadoCotizacion(q.status),
      tipo: 'cotizacion',
      esLocal: true,
      pendienteSync: true,
      impresoOffline: !!q.printed_offline,
    }))
}

/**
 * Normaliza las filas que devuelve `get_ventas_historial` al mismo contrato que
 * las locales, para poder mostrarlas en la misma tabla.
 * @param {Array} remotas
 * @returns {Array}
 */
export function normalizarVentasRemotas(remotas) {
  return (remotas || []).map((v) => ({
    ...v,
    tipo: 'venta',
    esLocal: false,
    pendienteSync: false,
  }))
}

/**
 * Aplica en memoria los mismos filtros que el RPC `get_ventas_historial`
 * (estado, rango de fechas y búsqueda por folio/usuario) más el filtro de tipo
 * de la vista. Se usa cuando la lista se lee de IndexedDB (sin red), donde no
 * hay paginación del servidor.
 * @param {Array} filas
 * @param {{estado?: string, desde?: string|null, hasta?: string|null, busqueda?: string, tipo?: string}} filtros
 *   `desde`/`hasta` en ISO (mismo criterio que el RPC: `hasta` es exclusivo).
 * @returns {Array}
 */
export function filtrarFilasLocales(filas, { estado, desde, hasta, busqueda, tipo } = {}) {
  const q = String(busqueda || '')
    .trim()
    .toLowerCase()

  return (filas || []).filter((f) => {
    if (tipo && (f.tipo || 'venta') !== tipo) return false
    if (estado && f.estado !== estado) return false
    if (desde && f.fecha && String(f.fecha) < desde) return false
    if (hasta && f.fecha && String(f.fecha) >= hasta) return false
    if (q) {
      const folio = String(f.id || '')
        .slice(0, 8)
        .toUpperCase()
      const coincideFolio = folio.includes(q.toUpperCase())
      const coincideUsuario = String(f.usuario || '')
        .toLowerCase()
        .includes(q)
      if (!coincideFolio && !coincideUsuario) return false
    }
    return true
  })
}

/**
 * Detalle (items + cliente) de varias ventas locales en pocas consultas.
 * Se usa para el RESUMEN de Reportes: una pasada por todo el listado en vez
 * de una ronda de consultas por venta. Cada item lleva `tipo` resuelto desde
 * `producto.precios` cuando el renglón tiene `id_precio_producto` (los
 * renglones remotos no lo traen: el RPC `get_venta_detalle` no lo expone).
 * @param {string[]} idsVentas
 * @returns {Promise<Object>} `{ [idVenta]: { items, cliente } }`
 */
export async function leerDetallesVentaLocal(idsVentas) {
  const out = {}
  const ids = [...new Set((idsVentas || []).filter(Boolean))]
  if (!ids.length) return out

  const [filas, ventas] = await Promise.all([
    db.detalle_venta.where('id_venta').anyOf(ids).toArray(),
    db.ventas.bulkGet(ids),
  ])

  const idProductos = [...new Set(filas.map((d) => d.id_producto))]
  const productos = await db.productos.bulkGet(idProductos)
  const prodMap = new Map(productos.filter(Boolean).map((p) => [p.id, p]))

  const idClientes = [
    ...new Set(
      ventas
        .filter(Boolean)
        .map((v) => v.id_cliente)
        .filter(Boolean),
    ),
  ]
  const clientes = idClientes.length ? await db.clientes.bulkGet(idClientes) : []
  const cliMap = new Map(clientes.filter(Boolean).map((c) => [c.id, c]))

  const porVenta = new Map(ids.map((id) => [id, { items: [], cliente: null }]))

  for (const d of filas) {
    const grupo = porVenta.get(d.id_venta)
    if (!grupo) continue
    const p = prodMap.get(d.id_producto) || {}
    const tier = (p.precios || []).find((x) => x.id === d.id_precio_producto)
    grupo.items.push({
      producto: p.name || d.id_producto,
      sku: p.sku || '',
      cantidad: d.cantidad,
      unitario: Math.round(d.subtotal / d.cantidad),
      subtotal: d.subtotal,
      tipo: tier?.tipo || null,
    })
  }

  ventas.forEach((v, i) => {
    if (!v) return
    const grupo = porVenta.get(ids[i])
    if (grupo && v.id_cliente) grupo.cliente = cliMap.get(v.id_cliente)?.name || null
  })

  porVenta.forEach((valor, id) => {
    out[id] = valor
  })
  return out
}

/**
 * Arma el detalle completo de una venta local para el modal de Historial,
 * con la misma forma que devuelve el RPC `get_venta_detalle`.
 * @param {string} idVenta
 * @returns {Promise<object|null>}
 */
export async function leerDetalleVentaLocal(idVenta) {
  if (!idVenta) return null
  const venta = await db.ventas.get(idVenta)
  if (!venta) return null

  const currentUser = usuarioLocal()
  const det = await leerDetallesVentaLocal([idVenta])
  const pendientes = await leerVentasPendientesSync()

  return {
    id: venta.id,
    fecha: venta.fecha,
    usuario: currentUser?.name || 'Local',
    id_metodo_pago: venta.id_metodo_pago,
    estado: venta.estado,
    cliente: det[idVenta]?.cliente ?? null,
    total: venta.total,
    descuento_bp: venta.descuento_bp || 0,
    descuento_monto: venta.descuento_monto || 0,
    items: det[idVenta]?.items || [],
    esLocal: true,
    pendienteSync: pendientes.has(venta.id),
  }
}

/**
 * Lee el detalle de una cotización local para mostrarla en el modal.
 * Forma compatible con el detalle que espera HistorialPage.
 * @param {string} tempId
 * @returns {Promise<object|null>}
 */
export async function leerDetalleCotizacionLocal(tempId) {
  if (!tempId) return null
  const q = await db.offline_quotes.get(tempId)
  if (!q) return null

  const currentUser = usuarioLocal()

  const items = (q.items || []).map((it) => ({
    producto: it.name || it.id_producto,
    sku: it.sku || '',
    cantidad: it.cantidad,
    unitario: it.offline_price,
    subtotal: it.cantidad * it.offline_price,
  }))

  return {
    id: q.temp_id,
    fecha: q.fecha,
    usuario: currentUser?.name || 'Local',
    id_metodo_pago: null,
    estado: estadoCotizacion(q.status),
    status: q.status,
    cliente: null,
    total: q.total,
    items,
    esLocal: true,
    pendienteSync: q.status !== 'synced',
    impresoOffline: !!q.printed_offline,
    tipoCotizacion: true,
  }
}
