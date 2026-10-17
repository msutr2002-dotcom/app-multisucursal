import { supabase } from '../lib/supabase'
import { db } from '../lib/db'

/**
 * Hidratación del catálogo local (Tarea 1.3, Offline-First Fase 1).
 * Descarga productos + precios + stock por sucursal de la empresa y los guarda
 * en IndexedDB como copia de lectura para que el POS busque sin conexión.
 * El stock lleva `es_actual` precalculado para la sucursal del dispositivo.
 */
export async function hidratarCatalogo(idEmpresa, idSucursal) {
  const { data, error } = await supabase.rpc('get_productos_admin', { p_id_empresa: idEmpresa })
  if (error) throw error

  let productos = (data?.productos || []).map((p) => ({
    ...p,
    id_empresa: idEmpresa,
    stock: (p.stock || []).map((s) => ({ ...s, es_actual: s.id_sucursal === idSucursal })),
  }))

  let stockSucursales = productos.flatMap((p) =>
    (p.stock || []).map((s) => ({
      id_sucursal: s.id_sucursal,
      id_producto: p.id,
      stock: s.stock,
      stock_minimo: s.stock_minimo,
    })),
  )

  // Catálogos inline: get_productos_admin ya trae categorias/marcas/proveedores/unidades
  const cats = (data?.categorias || []).map((c) => ({ ...c, id_empresa: idEmpresa }))
  const marcas = (data?.marcas || []).map((m) => ({ ...m, id_empresa: idEmpresa }))
  const proveedores = (data?.proveedores || []).map((p) => ({ ...p, id_empresa: idEmpresa }))
  const unidades = (data?.unidades || []).map((u) => ({ ...u, id_empresa: idEmpresa }))

  // Métodos de pago (catálogo chico): se cachean para poder cobrar sin red
  let metodos = []
  try {
    const { data: dataMetodos, error: errMetodos } = await supabase.rpc('get_metodos_pago')
    if (!errMetodos && Array.isArray(dataMetodos)) metodos = dataMetodos
  } catch (errMetodos) {
    console.warn('No se pudieron cachear los métodos de pago:', errMetodos)
  }

  // Tipos de precio y colores: vienen de get_catalogos (RPC separado)
  let tiposPrecio = []
  let colores = []
  try {
    const { data: dataTP } = await supabase.rpc('get_catalogos', { p_id_empresa: idEmpresa })
    if (dataTP?.tipos_precio) {
      tiposPrecio = dataTP.tipos_precio.map((t) => ({ ...t, id_empresa: idEmpresa }))
    }
    if (dataTP?.colores) {
      colores = dataTP.colores.map((c) => ({ ...c, id_empresa: idEmpresa }))
    }
  } catch (e) {
    console.warn('No se pudieron cachear tipos de precio/colores:', e)
  }

  // Recetas de combos (impresiones-copias): `get_productos_admin` ya devuelve
  // `componentes` por producto (con `factor` denormalizado). Se aplanan a filas
  // de `combo_componentes` para calcular la disponibilidad derivada offline.
  const componentes = productos.flatMap((p) =>
    (p.componentes || []).map((c) => ({
      id: c.id,
      id_producto: p.id,
      id_producto_componente: c.id_producto_componente || null,
      id_ingrediente: c.id_ingrediente || null,
      cantidad: c.cantidad,
      id_precio_producto: c.id_precio_producto || null,
      factor: c.factor ?? 1,
    })),
  )

  await db.transaction(
    'rw',
    db.productos,
    db.productos_sucursal,
    db.cola_sincronizacion,
    db.metodos_pago,
    db.categorias,
    db.marcas,
    db.unidades,
    db.tipos_precio,
    db.proveedores,
    db.colores,
    db.combo_componentes,
    async () => {
      // Guard en tiempo de commit: si hay eventos PENDING (ventas locales aún sin
      // sincronizar), el stock del servidor está desactualizado. Se conserva el
      // stock local en ambos stores para no perder los descuentos de esas ventas.
      const pendientes = await db.cola_sincronizacion.where('sync_status').equals('PENDING').count()
      if (pendientes > 0) {
        const locales = await db.productos_sucursal.toArray()
        const stockLocal = new Map(locales.map((f) => [f.id_producto, f.stock]))
        productos = productos.map((p) => {
          const local = stockLocal.get(p.id)
          if (local === undefined) return p
          return {
            ...p,
            stock: (p.stock || []).map((s) =>
              s.id_sucursal === idSucursal ? { ...s, stock: local } : s,
            ),
          }
        })
        stockSucursales = stockSucursales.map((s) =>
          s.id_sucursal === idSucursal && stockLocal.has(s.id_producto)
            ? { ...s, stock: stockLocal.get(s.id_producto) }
            : s,
        )
      }

      await db.productos.clear()
      await db.productos_sucursal.clear()
      if (cats.length) await db.categorias.clear()
      if (marcas.length) await db.marcas.clear()
      if (unidades.length) await db.unidades.clear()
      if (tiposPrecio.length) await db.tipos_precio.clear()
      if (proveedores.length) await db.proveedores.clear()
      if (colores.length) await db.colores.clear()
      if (componentes.length) await db.combo_componentes.clear()

      await db.productos.bulkPut(productos)
      await db.productos_sucursal.bulkPut(stockSucursales)
      if (cats.length) await db.categorias.bulkPut(cats)
      if (marcas.length) await db.marcas.bulkPut(marcas)
      if (unidades.length) await db.unidades.bulkPut(unidades)
      if (tiposPrecio.length) await db.tipos_precio.bulkPut(tiposPrecio)
      if (proveedores.length) await db.proveedores.bulkPut(proveedores)
      if (colores.length) await db.colores.bulkPut(colores)
      if (componentes.length) await db.combo_componentes.bulkPut(componentes)
      if (metodos.length) await db.metodos_pago.bulkPut(metodos)
    },
  )

  return productos.length
}

/**
 * Cachea solo tipos de precio y métodos de pagos desde Supabase.
 * El resto de catálogos (categorías, marcas, unidades, proveedores) se cachean
 * inline dentro de `hidratarCatalogo` porque vienen embebidos en la respuesta
 * de `get_productos_admin`, no en `get_catalogos`.
 * @param {string} idEmpresa
 * @returns {Promise<{tipos_precio: number, metodos: number, colores: number}>}
 */
export async function sincronizarCatalogosSecundarios(idEmpresa) {
  if (!idEmpresa) return { tipos_precio: 0, metodos: 0, colores: 0 }

  const [resCatalogos, resMetodos] = await Promise.all([
    Promise.resolve(supabase.rpc('get_catalogos', { p_id_empresa: idEmpresa })).catch(() => ({
      data: null,
    })),
    Promise.resolve(supabase.rpc('get_metodos_pago')).catch(() => ({ data: null })),
  ])

  const tiposPrecio = (resCatalogos?.data?.tipos_precio || []).map((t) => ({
    ...t,
    id_empresa: idEmpresa,
  }))
  const colores = (resCatalogos?.data?.colores || []).map((c) => ({
    ...c,
    id_empresa: idEmpresa,
  }))
  const metodosArr = resMetodos?.data || []

  await db.transaction('rw', db.tipos_precio, db.metodos_pago, db.colores, async () => {
    if (tiposPrecio.length) await db.tipos_precio.clear()
    if (metodosArr.length) await db.metodos_pago.clear()
    if (colores.length) await db.colores.clear()
    if (tiposPrecio.length) await db.tipos_precio.bulkPut(tiposPrecio)
    if (metodosArr.length) await db.metodos_pago.bulkPut(metodosArr)
    if (colores.length) await db.colores.bulkPut(colores)
  })

  return { tipos_precio: tiposPrecio.length, metodos: metodosArr.length, colores: colores.length }
}

/**
 * Lee los catálogos secundarios de IndexedDB para una empresa y los devuelve
 * en el mismo formato que `get_catalogos` RPC. Usado offline (Task 4).
 * @param {string} idEmpresa
 * @returns {Promise<{categorias: Array, marcas: Array, unidades: Array, proveedores: Array, tipos_precio: Array}>}
 */
export async function leerCatalogosLocales(idEmpresa) {
  if (!idEmpresa) {
    return {
      categorias: [],
      marcas: [],
      unidades: [],
      proveedores: [],
      tipos_precio: [],
      colores: [],
    }
  }

  const [categorias, marcas, unidades, proveedores, tipos_precio, colores] = await Promise.all([
    db.categorias.where('id_empresa').equals(idEmpresa).toArray(),
    db.marcas.where('id_empresa').equals(idEmpresa).toArray(),
    db.unidades.where('id_empresa').equals(idEmpresa).toArray(),
    db.proveedores.where('id_empresa').equals(idEmpresa).toArray(),
    db.tipos_precio.where('id_empresa').equals(idEmpresa).toArray(),
    db.colores.where('id_empresa').equals(idEmpresa).toArray(),
  ])

  return { categorias, marcas, unidades, proveedores, tipos_precio, colores }
}

/**
 * Reconstruye el formato de `get_productos_admin` desde IndexedDB para la
 * vista offline de Productos. Combina productos, stock y precios locales.
 * @param {string} idEmpresa
 * @param {string} idSucursal
 * @returns {Promise<{productos: Array, categorias: Array, marcas: Array, unidades: Array, proveedores: Array}>}
 */
export async function leerProductosAdminLocal(idEmpresa, idSucursal) {
  if (!idEmpresa) {
    return { productos: [], categorias: [], marcas: [], unidades: [], proveedores: [] }
  }

  const [productos, stocks, precios, catalogos] = await Promise.all([
    db.productos.where('id_empresa').equals(idEmpresa).toArray(),
    db.productos_sucursal.toArray(),
    db.precio_producto.toArray(),
    leerCatalogosLocales(idEmpresa),
  ])

  const stockMap = new Map()
  stocks.forEach((s) => {
    if (!stockMap.has(s.id_producto)) stockMap.set(s.id_producto, [])
    stockMap.get(s.id_producto).push(s)
  })

  const precioMap = new Map()
  precios.forEach((p) => {
    if (!precioMap.has(p.id_producto)) precioMap.set(p.id_producto, [])
    precioMap.get(p.id_producto).push(p)
  })

  const resolved = productos.map((p) => ({
    ...p,
    stock: (stockMap.get(p.id) || []).map((s) => ({
      id_sucursal: s.id_sucursal,
      stock: s.stock,
      stock_minimo: s.stock_minimo,
      es_actual: s.id_sucursal === idSucursal,
    })),
    // los precios anidados del catálogo hidratado traen todos los campos
    // (id, min_cantidad, id_unidad_venta, factor); el store plano es fallback
    precios: (p.precios && p.precios.length ? p.precios : precioMap.get(p.id)) || [],
  }))

  return {
    productos: resolved,
    ...catalogos,
  }
}

/**
 * Hidrata ingredientes + stock por sucursal desde el servidor (Task 4).
 * Se guarda en Dexie (`ingredientes`, `ingredientes_sucursal`) para que el
 * CRUD y el RecetaForm funcionen sin red. Fire-and-forget desde las vistas.
 * @param {string} idEmpresa
 * @returns {Promise<number>} cantidad de ingredientes hidratados
 */
export async function hidratarIngredientes(idEmpresa) {
  if (!idEmpresa) return 0
  const { data, error } = await supabase.rpc('get_ingredientes_admin', {
    p_id_empresa: idEmpresa,
  })
  if (error) throw error

  const ingredientes = (data?.ingredientes || []).map((i) => ({ ...i, id_empresa: idEmpresa }))
  const stock = data?.stock || []

  await db.transaction('rw', db.ingredientes, db.ingredientes_sucursal, async () => {
    await db.ingredientes.clear()
    await db.ingredientes_sucursal.clear()
    if (ingredientes.length) await db.ingredientes.bulkPut(ingredientes)
    if (stock.length) await db.ingredientes_sucursal.bulkPut(stock)
  })

  return ingredientes.length
}

/**
 * Lee ingredientes de IndexedDB para una empresa, uniendo el stock de la
 * sucursal activa. Formato equivalente a lo que consume el CRUD/RecetaForm.
 * @param {string} idEmpresa
 * @param {string} idSucursal
 * @returns {Promise<Array>} ingredientes con `stock` (sucursal activa)
 */
export async function leerIngredientesLocal(idEmpresa, idSucursal) {
  if (!idEmpresa) return []
  const [ingredientes, stocks] = await Promise.all([
    db.ingredientes.where('id_empresa').equals(idEmpresa).toArray(),
    idSucursal
      ? db.ingredientes_sucursal.where('id_sucursal').equals(idSucursal).toArray()
      : Promise.resolve([]),
  ])
  const stockMap = new Map(stocks.map((s) => [s.id_ingrediente, s.stock ?? 0]))
  return ingredientes.map((i) => ({ ...i, stock: stockMap.get(i.id) ?? 0 }))
}

/**
 * Hidrata los clientes de la sucursal (modelo por sucursal, clientes Task 3 v2)
 * desde `get_clientes` hacia Dexie `clientes`: la lista de la sucursal activa
 * MÁS los heredados (`id_sucursal NULL`, solo para el datalist del POS).
 * Fire-and-forget desde login/vistas; nunca lanza.
 * @param {string} idEmpresa
 * @param {string} idSucursal - sucursal del dispositivo (aislamiento)
 * @returns {Promise<number>} clientes hidratados
 */
export async function hidratarClientes(idEmpresa, idSucursal) {
  if (!idEmpresa || !idSucursal) return 0
  const { data, error } = await supabase.rpc('get_clientes', {
    p_id_sucursal: idSucursal,
    p_busqueda: null,
    p_incluir_inactivos: true,
    p_incluir_heredados: true,
    p_limite: 1000,
    p_offset: 0,
  })
  if (error) throw error

  const filas = data?.clientes || []
  await db.transaction('rw', db.clientes, async () => {
    if (filas.length) {
      await db.clientes.bulkPut(
        filas.map((c) => ({
          id: c.id,
          id_empresa: idEmpresa,
          id_sucursal: c.id_sucursal ?? null,
          name: c.name,
          nombre: c.nombre ?? null,
          apellido: c.apellido ?? null,
          nit: c.nit ?? null,
          telefono: c.telefono ?? null,
          direccion: c.direccion ?? null,
          activo: c.activo !== false,
          descuento_bp: c.descuento_bp ?? 0,
        })),
      )
    }
  })
  return filas.length
}

/**
 * Lee clientes del espejo local (búsqueda en memoria: nombre/NIT), para la
 * lista offline de ClientesPage y el datalist del POS.
 * Filtro por sucursal (modelo v2): solo filas de `idSucursal`; si `heredados`
 * también las de `id_sucursal NULL` (Opción B: solo datalist POS, nunca CRUD).
 * @param {string} idEmpresa
 * @param {string} idSucursal
 * @param {{heredados?: boolean, busqueda?: string, incluirInactivos?: boolean}} [opciones]
 * @returns {Promise<Array>}
 */
export async function leerClientesLocal(
  idEmpresa,
  idSucursal,
  { heredados = false, busqueda, incluirInactivos } = {},
) {
  if (!idEmpresa) return []
  const filas = await db.clientes.where('id_empresa').equals(idEmpresa).toArray()
  const texto = String(busqueda || '')
    .toLowerCase()
    .trim()
  return filas
    .filter((c) => {
      const propia = idSucursal ? c.id_sucursal === idSucursal : false
      const heredado = c.id_sucursal == null
      if (!propia && !(heredados && heredado)) return false
      if (!incluirInactivos && c.activo === false) return false
      if (!texto) return true
      return `${c.name || ''} ${c.nit || ''}`.toLowerCase().includes(texto)
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
}

/**
 * Hidrata los flags de la sucursal activa (vender_sin_stock y
 * activar_ingredientes) en Dexie para que el POS y el admin decidan el modo
 * sin red. Fire-and-forget desde las vistas.
 * @param {string} idSucursal
 */
export async function hidratarFlagsSucursal(idSucursal) {
  if (!idSucursal) return
  const { data, error } = await supabase.rpc('get_sucursal_flags', { p_id: idSucursal })
  if (error || !data) return
  await db.sucursales.put({
    id: data.id || idSucursal,
    name: data.name || '',
    vender_sin_stock: !!data.vender_sin_stock,
    activar_ingredientes: !!data.activar_ingredientes,
  })
}

/**
 * Lee los flags de la sucursal activa desde Dexie. Devuelve null si la
 * sucursal no está cacheada (el llamador decide el default: OFF).
 * @param {string} idSucursal
 * @returns {Promise<{vender_sin_stock: boolean, activar_ingredientes: boolean}|null>}
 */
export async function leerFlagsSucursal(idSucursal) {
  if (!idSucursal) return null
  const s = await db.sucursales.get(idSucursal)
  if (!s) return null
  return {
    vender_sin_stock: !!s.vender_sin_stock,
    activar_ingredientes: !!s.activar_ingredientes,
  }
}

/**
 * Métodos de pago desde el espejo local (`metodos_pago`, Dexie v2) para las
 * vistas que deben pintar la columna "Método" sin red (Historial, comprobante
 * offline). Devuelve el mapa `{ id: name }` que usan ambas pantallas.
 * @returns {Promise<Record<string, string>>}
 */
export async function leerMetodosPagoLocales() {
  const metodos = await db.metodos_pago.toArray()
  const mapa = {}
  metodos.forEach((m) => {
    mapa[m.id] = m.name
  })
  return mapa
}

/**
 * Hidrata el catálogo para la sucursal activa del dispositivo resolviendo su
 * empresa (contexto `empresaSeleccionada` o lookup en la tabla `sucursal`).
 * Nunca debe bloquear la UI: los llamadores la usan en fire-and-forget.
 */
export async function hidratarCatalogoParaSucursal(idSucursal) {
  if (!idSucursal) return 0

  let idEmpresa = localStorage.getItem('empresaSeleccionada')
  if (!idEmpresa) {
    const { data } = await supabase
      .from('sucursal')
      .select('id_empresa')
      .eq('id', idSucursal)
      .maybeSingle()
    idEmpresa = data?.id_empresa
  }
  if (!idEmpresa) return 0

  const n = await hidratarCatalogo(idEmpresa, idSucursal)
  // Multibodega: fire-and-forget (no bloquea la UI ni el retorno)
  hidratarBodegas(idSucursal).catch(() => {})
  return n
}

/**
 * Multibodega: hidrata las bodegas de la sucursal y su stock en IndexedDB.
 * Se ejecuta en login y en la rehidratación del POS (fire-and-forget).
 * Sin red no hace nada (los datos previos en Dexie siguen vigentes).
 */
export async function hidratarBodegas(idSucursal) {
  if (!idSucursal) return 0
  try {
    // Cerrar y reabrir para garantizar la migración v10 (bodegas/stock_bodega).
    // El cierre es seguro: Dexie reabre con la versión más alta definida.
    if (db.isOpen()) db.close()
    await db.open()
    const { data: bodegas, error } = await supabase.rpc('get_bodegas', {
      p_id_sucursal: idSucursal,
    })
    if (error) throw error
    const lista = Array.isArray(bodegas) ? bodegas : []
    if (!lista.length) return 0

    // Stock de cada bodega en paralelo
    const stocks = await Promise.all(
      lista.map(async (b) => {
        const { data, error: errStock } = await supabase.rpc('get_stock_bodega', {
          p_id_bodega: b.id,
        })
        if (errStock) return []
        return (Array.isArray(data) ? data : []).map((s) => ({
          id_bodega: b.id,
          id_producto: s.id_producto,
          stock: s.stock,
          stock_minimo: s.stock_minimo,
        }))
      }),
    )
    const todoStock = stocks.flat()

    // Guardar sin transacción explícita (más resiliente al upgrade de versión)
    const pendientes = await db.cola_sincronizacion.where('sync_status').equals('PENDING').count()
    if (pendientes > 0) {
      const localMap = new Map()
      const previos = await db.stock_bodega.toArray()
      previos.forEach((f) => localMap.set(`${f.id_bodega}|${f.id_producto}`, f.stock))
      const serverKeys = new Set(todoStock.map((s) => `${s.id_bodega}|${s.id_producto}`))
      const conservados = previos.filter((f) => !serverKeys.has(`${f.id_bodega}|${f.id_producto}`))
      const fusion = todoStock.map((s) => ({
        ...s,
        stock: localMap.get(`${s.id_bodega}|${s.id_producto}`) ?? s.stock,
      }))
      await db.stock_bodega.clear()
      await db.stock_bodega.bulkPut([...fusion, ...conservados])
    } else {
      await db.stock_bodega.clear()
      await db.stock_bodega.bulkPut(todoStock)
    }

    await db.bodegas.clear()
    await db.bodegas.bulkPut(lista)

    // F7 (fixes-prod): avisar que `stock_bodega` ya está fresco. Sin este evento,
    // el POS (que llama a `hidratarCatalogoParaSucursal` sin esperar a que
    // `hidratarBodegas` termine) lee un stock viejo y no se actualiza hasta
    // refrescar la página.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('cola-sincronizada', { detail: { tabla: 'stock_bodega' } }),
      )
    }
    return lista.length
  } catch (err) {
    console.warn('No se pudieron hidratar bodegas:', err?.message || err)
    return 0
  }
}

/**
 * Devuelve la bodega seleccionada del dispositivo (localStorage) o la Principal.
 */
export async function obtenerBodegaSeleccionada(idSucursal) {
  const guardada = localStorage.getItem('bodegaSeleccionada')
  if (guardada) {
    const b = await db.bodegas.get(guardada)
    if (b && b.id_sucursal === idSucursal && b.activa) return b
  }
  const principal = await db.bodegas
    .where('id_sucursal')
    .equals(idSucursal)
    .filter((b) => b.es_principal && b.activa)
    .first()
  if (principal) localStorage.setItem('bodegaSeleccionada', principal.id)
  return principal || null
}

/**
 * Lee el stock de un producto en una bodega específica.
 */
export async function leerStockBodega(idBodega, idProducto) {
  const fila = await db.stock_bodega.get({ id_bodega: idBodega, id_producto: idProducto })
  return fila || null
}

/**
 * Lee todo el stock de una bodega (para el inventario y el POS).
 */
export async function leerStockPorBodega(idBodega) {
  return db.stock_bodega.where('id_bodega').equals(idBodega).toArray()
}
