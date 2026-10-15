import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { encolarOperacion, clasificarFallo } from './colaSyncService'
import { hayRed } from './redService'
import { resolverTierLocal } from './trasladoService'

/**
 * Compras, entradas y comprobantes Offline-First (specs/compras-entradas.md, Task 3).
 * Todo se escribe primero en IndexedDB dentro de UNA transacción — fila + stock +
 * evento de cola `PENDING` — y la UI nunca espera a Supabase (Art. II). El dinero
 * viaja siempre en centavos enteros (Art. III).
 * Los eventos se encolan con `datos.rpc` listo para que la Task 7 los suba a
 * `registrar_compra`/`registrar_entrada`; el motor de sync actual los salta
 * (`no-soportado`) hasta entonces. Único punto que toca el servidor:
 * `guardarComprobanteLocal`, siempre tras su guard `hayRed()` (redService).
 */

/** Límite del adjunto de comprobante (tamaño del archivo original, en bytes). */
export const LIMITE_COMPROBANTE_BYTES = 4 * 1024 * 1024

const TIPOS_COMPROBANTE = ['factura', 'nota_venta', 'recibo']
const ESTADOS_COMPROBANTE = ['emitido', 'pendiente', 'anulado']

const nuevoUuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })

function errorCatalogo(mensaje) {
  const e = new Error(mensaje)
  e.code = 'CATALOGO_LOCAL'
  return e
}

function archivoABase64(archivo) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('No se pudo leer el archivo adjunto'))
    fr.readAsDataURL(archivo)
  })
}

/** Rango de fechas en memoria. Acepta 'YYYY-MM-DD' (día completo en hora local). */
function parseFecha(valor, finDeDia) {
  const m = typeof valor === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null
  if (m) {
    return new Date(
      +m[1],
      +m[2] - 1,
      +m[3],
      finDeDia ? 23 : 0,
      finDeDia ? 59 : 0,
      finDeDia ? 59 : 0,
      finDeDia ? 999 : 0,
    )
  }
  return new Date(valor)
}

function pasaFecha(fecha, desde, hasta) {
  if (!desde && !hasta) return true
  const t = new Date(fecha).getTime()
  if (desde && t < parseFecha(desde, false).getTime()) return false
  if (hasta && t > parseFecha(hasta, true).getTime()) return false
  return true
}

/** `true` si la creación del registro aún no llegó al servidor (Task 7 la sube). */
async function padrePendiente(tabla, id) {
  const eventos = await db.cola_sincronizacion.where('tabla').equals(tabla).toArray()
  return eventos.some((e) => e.id_registro === id && e.sync_status === 'PENDING')
}

/**
 * Compra local atómica (RF-C1 + compras-unidades RF-UC2): compra + snapshot de
 * líneas + detalle + incremento de stock + evento de cola, todo en UNA
 * transacción y sin red (<2 s). El total se recalcula aquí igual que en el
 * servidor (centavos enteros).
 *
 * @param {object} p
 * @param {string} p.idSucursal - sucursal del dispositivo (aislamiento, Art. II)
 * @param {string} p.idProveedor - proveedor del catálogo local (obligatorio)
 * @param {string|null} [p.idUsuario] - usuario que registra
 * @param {Array} p.items - líneas ({id_producto, cantidad en la unidad elegida,
 *   precio_unitario en centavos, id_precio_producto?} sin tier = unidad base)
 * @param {string|null} [p.idBodega] - bodega destino (multibodega Task 7)
 * @returns {Promise<{idCompra: string, total: number, idEvento: number}>}
 */
export async function registrarCompraLocal({
  idSucursal,
  idProveedor,
  idUsuario,
  items,
  idBodega,
}) {
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (!idProveedor) throw new Error('El proveedor es obligatorio')
  if (!Array.isArray(items) || !items.length) throw new Error('La compra no incluye productos')

  // multibodega Task 7: stock_bodega solo si hay bodega seleccionada
  const tablas = [
    db.productos,
    db.productos_sucursal,
    db.ingredientes,
    db.ingredientes_sucursal,
    db.compras,
    db.detalle_compra,
    db.cola_sincronizacion,
  ]
  if (idBodega) tablas.push(db.stock_bodega)

  return db.transaction(
    'rw',
    // db.productos va incluido porque dentro del tx se lee para el snapshot de
    // nombres (mismo motivo por el que ventaLocalService lo lista). Task 4: se
    // agregan ingredientes para el modo dual (comida).
    tablas,
    async () => {
      const renglones = []
      const consumosProd = new Map() // clave producto|unidad → {cantidad, factor}
      const consumosIng = new Map()
      let total = 0

      for (const it of items) {
        const esIngrediente = !!it.id_ingrediente
        let nombre

        if (esIngrediente) {
          const ing = await db.ingredientes.get(it.id_ingrediente)
          if (!ing) {
            throw errorCatalogo(`Ingrediente ${it.id_ingrediente} no está en el catálogo local`)
          }
          nombre = ing.name
          if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
            throw new Error(`Cantidad inválida para ${nombre}`)
          }
          if (!Number.isInteger(it.precio_unitario) || it.precio_unitario < 0) {
            throw new Error(`Precio inválido para ${nombre}`)
          }
          const subTotal = it.precio_unitario * it.cantidad
          total += subTotal
          consumosIng.set(
            it.id_ingrediente,
            (consumosIng.get(it.id_ingrediente) || 0) + it.cantidad,
          )
          renglones.push({
            id_ingrediente: it.id_ingrediente,
            name: nombre,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            sub_total: subTotal,
          })
        } else {
          const producto = await db.productos.get(it.id_producto)
          if (!producto) {
            throw errorCatalogo(`Producto ${it.id_producto} no está en el catálogo local`)
          }
          nombre = producto.name
          if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
            throw new Error(`Cantidad inválida para ${nombre}`)
          }
          if (!Number.isInteger(it.precio_unitario) || it.precio_unitario < 0) {
            throw new Error(`Precio inválido para ${nombre}`)
          }

          const stockRow = await db.productos_sucursal.get([idSucursal, it.id_producto])
          if (!stockRow) {
            throw new Error(`El producto ${nombre} no está habilitado en esta sucursal`)
          }

          // compras-unidades RF-UC2/D2: factor resuelto LOCALMENTE (misma fuente
          // que traslados); el servidor lo re-resuelve al recibir el evento.
          const tier = await resolverTierLocal(producto, it.id_precio_producto)
          if (tier === undefined) {
            throw new Error(`Presentación inválida para ${nombre}`)
          }
          const factor = tier.factor || 1
          const clave = `${it.id_producto}|${it.id_precio_producto ?? ''}`
          if (consumosProd.has(clave)) {
            throw new Error(`Producto duplicado en la misma unidad: ${nombre}`)
          }
          consumosProd.set(clave, {
            idProducto: it.id_producto,
            idPrecio: it.id_precio_producto ?? null,
            cantidad: it.cantidad,
            factor,
          })

          const subTotal = it.precio_unitario * it.cantidad
          total += subTotal
          renglones.push({
            id_producto: it.id_producto,
            id_precio_producto: it.id_precio_producto ?? null,
            factor,
            name: nombre,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            sub_total: subTotal,
          })
        }
      }

      const idCompra = nuevoUuid()

      await db.compras.add({
        id: idCompra,
        id_sucursal: idSucursal,
        id_proveedor: idProveedor,
        id_usuario: idUsuario ?? null,
        id_bodega: idBodega || null,
        fecha: new Date().toISOString(),
        total,
        estado: 'completada',
        sync_status: 'PENDING',
        // Snapshot de líneas para el ticket sin red (spec §3, no indexado)
        items: renglones,
      })

      await db.detalle_compra.bulkAdd(
        renglones.map((r) => ({
          id: nuevoUuid(),
          id_compra: idCompra,
          id_producto: r.id_producto ?? null,
          id_ingrediente: r.id_ingrediente ?? null,
          cantidad: r.cantidad,
          precio_unitario: r.precio_unitario,
          sub_total: r.sub_total,
          id_precio_producto: r.id_precio_producto ?? null,
          factor: r.factor ?? 1,
        })),
      )

      // Stock optimista local: productos SUMAN cantidad × factor (unidades
      // base) en productos_sucursal; ingredientes suman cantidad simple en
      // ingredientes_sucursal (espejo del RPC dual Bloque 17).
      // multibodega Task 7: si hay bodega, también se suma en stock_bodega.
      for (const { idProducto, cantidad, factor } of consumosProd.values()) {
        const row = await db.productos_sucursal.get([idSucursal, idProducto])
        await db.productos_sucursal.put({ ...row, stock: row.stock + cantidad * factor })
        if (idBodega) {
          const stockRow = await db.stock_bodega.get({
            id_bodega: idBodega,
            id_producto: idProducto,
          })
          if (stockRow) {
            await db.stock_bodega.put({ ...stockRow, stock: stockRow.stock + cantidad * factor })
          } else {
            await db.stock_bodega.add({
              id_bodega: idBodega,
              id_producto: idProducto,
              stock: cantidad * factor,
            })
          }
        }
      }
      for (const [idIngrediente, cantidad] of consumosIng) {
        const key = [idIngrediente, idSucursal]
        const row = await db.ingredientes_sucursal.get(key)
        if (row) {
          await db.ingredientes_sucursal.put({ ...row, stock: row.stock + cantidad })
        } else {
          await db.ingredientes_sucursal.add({
            id_ingrediente: idIngrediente,
            id_sucursal: idSucursal,
            stock: cantidad,
          })
        }
      }

      const idEvento = await encolarOperacion({
        tabla: 'compras',
        operacion: 'INSERT',
        id: idCompra,
        idSucursal,
        datos: {
          rpc: 'registrar_compra',
          params: {
            p_id_sucursal: idSucursal,
            p_id_proveedor: idProveedor,
            p_id_usuario: idUsuario ?? null,
            p_total: total,
            p_items: renglones.map((r) => ({
              ...(r.id_ingrediente
                ? { id_ingrediente: r.id_ingrediente }
                : { id_producto: r.id_producto }),
              cantidad: r.cantidad,
              precio_unitario: r.precio_unitario,
              // compras-unidades RF-UC4: el servidor resuelve el factor (D2)
              ...(r.id_precio_producto ? { id_precio_producto: r.id_precio_producto } : {}),
            })),
          },
        },
      })

      return { idCompra, total, idEvento }
    },
  )
}

/**
 * Entrada de inventario local atómica (RF-C2): ajuste con signo + fila de
 * auditoría + evento de cola en UNA transacción. Mismo guard de stock negativo
 * que el RPC `registrar_entrada` (el motivo es obligatorio).
 *
 * @param {object} p
 * @param {string} p.idSucursal
 * @param {string} p.idProducto
 * @param {number} p.cantidad - entero con signo (≠ 0)
 * @param {string} p.motivo
 * @param {string} p.idUsuario
 * @param {string|null} [p.idBodega] - bodega destino (multibodega Task 7)
 * @returns {Promise<{idEntrada: string, stock: number, idEvento: number}>}
 */
export async function registrarEntradaLocal({
  idSucursal,
  idProducto,
  cantidad,
  motivo,
  idUsuario,
  idBodega,
}) {
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (!idProducto) throw new Error('Producto inválido')
  if (!Number.isInteger(cantidad) || cantidad === 0)
    throw new Error('La cantidad no puede ser cero')
  if (!motivo || !String(motivo).trim()) throw new Error('El motivo es obligatorio')
  if (!idUsuario) throw new Error('El usuario es obligatorio')

  const motivoLimpio = String(motivo).trim()

  // multibodega Task 7: stock_bodega solo si hay bodega seleccionada
  const tablas = [db.entradas, db.productos_sucursal, db.cola_sincronizacion]
  if (idBodega) tablas.push(db.stock_bodega)

  return db.transaction('rw', tablas, async () => {
    const stockRow = await db.productos_sucursal.get([idSucursal, idProducto])
    if (!stockRow) {
      throw new Error(`El producto ${idProducto} no está habilitado en esta sucursal`)
    }

    const nuevoStock = stockRow.stock + cantidad
    if (nuevoStock < 0) {
      throw new Error(`El ajuste dejaría el stock en negativo (${nuevoStock})`)
    }

    // Guard de negativo por bodega si hay bodega seleccionada
    if (idBodega) {
      const stockBod = await db.stock_bodega.get({ id_bodega: idBodega, id_producto: idProducto })
      if (stockBod && stockBod.stock + cantidad < 0) {
        throw new Error(
          `El ajuste dejaría el stock de la bodega en negativo (${stockBod.stock + cantidad})`,
        )
      }
    }

    const idEntrada = nuevoUuid()

    await db.entradas.add({
      id: idEntrada,
      id_producto: idProducto,
      cantidad,
      motivo: motivoLimpio,
      id_usuario: idUsuario,
      id_sucursal: idSucursal,
      id_bodega: idBodega || null,
      fecha: new Date().toISOString(),
      sync_status: 'PENDING',
    })

    await db.productos_sucursal.put({ ...stockRow, stock: nuevoStock })

    if (idBodega) {
      const stockBod = await db.stock_bodega.get({ id_bodega: idBodega, id_producto: idProducto })
      if (stockBod) {
        await db.stock_bodega.put({ ...stockBod, stock: stockBod.stock + cantidad })
      } else {
        await db.stock_bodega.add({ id_bodega: idBodega, id_producto: idProducto, stock: cantidad })
      }
    }

    const idEvento = await encolarOperacion({
      tabla: 'entradas',
      operacion: 'INSERT',
      id: idEntrada,
      idSucursal,
      datos: {
        rpc: 'registrar_entrada',
        params: {
          p_id_sucursal: idSucursal,
          p_id_producto: idProducto,
          p_cantidad: cantidad,
          p_motivo: motivoLimpio,
          p_id_usuario: idUsuario,
        },
      },
    })

    return { idEntrada, stock: nuevoStock, idEvento }
  })
}

/**
 * Listado local de compras de la sucursal (lectura en memoria: filtros +
 * paginación, espejo de la forma {compras, total} de `get_compras`).
 */
export async function listarComprasLocal({
  idSucursal,
  busqueda,
  estado,
  desde,
  hasta,
  limite = 50,
  offset = 0,
} = {}) {
  if (!idSucursal) throw new Error('Sucursal inválida')

  const filas = await db.compras.where('id_sucursal').equals(idSucursal).toArray()

  const idsProveedores = [...new Set(filas.map((f) => f.id_proveedor).filter(Boolean))]
  const proveedores = idsProveedores.length ? await db.proveedores.bulkGet(idsProveedores) : []
  const nombres = new Map(proveedores.filter(Boolean).map((p) => [p.id, p.name]))
  const texto = String(busqueda || '')
    .toLowerCase()
    .trim()

  const filtradas = filas
    .filter((f) => {
      if (estado && f.estado !== estado) return false
      if (!pasaFecha(f.fecha, desde, hasta)) return false
      if (texto) {
        const proveedor = nombres.get(f.id_proveedor) || ''
        const productos = (f.items || []).map((i) => i.name || '').join(' ')
        if (!`${proveedor} ${productos}`.toLowerCase().includes(texto)) return false
      }
      return true
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  const desde_ = Math.max(0, offset)
  const limite_ = Math.max(1, limite)

  return {
    compras: filtradas
      .slice(desde_, desde_ + limite_)
      .map((f) => ({ ...f, proveedor: nombres.get(f.id_proveedor) || null })),
    total: filtradas.length,
  }
}

/**
 * Listado local de entradas de la sucursal (espejo de la forma {entradas, total}
 * de `get_entradas`; el nombre del producto se enlaza desde el catálogo local).
 */
export async function listarEntradasLocal({
  idSucursal,
  busqueda,
  desde,
  hasta,
  limite = 50,
  offset = 0,
} = {}) {
  if (!idSucursal) throw new Error('Sucursal inválida')

  const filas = await db.entradas.where('id_sucursal').equals(idSucursal).toArray()

  const idsProductos = [...new Set(filas.map((f) => f.id_producto).filter(Boolean))]
  const productos = idsProductos.length ? await db.productos.bulkGet(idsProductos) : []
  const nombres = new Map(productos.filter(Boolean).map((p) => [p.id, p.name]))
  const texto = String(busqueda || '')
    .toLowerCase()
    .trim()

  const filtradas = filas
    .filter((f) => {
      if (!pasaFecha(f.fecha, desde, hasta)) return false
      if (texto) {
        const producto = nombres.get(f.id_producto) || ''
        if (!`${producto} ${f.motivo || ''}`.toLowerCase().includes(texto)) return false
      }
      return true
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  const desde_ = Math.max(0, offset)
  const limite_ = Math.max(1, limite)

  return {
    entradas: filtradas
      .slice(desde_, desde_ + limite_)
      .map((f) => ({ ...f, producto: nombres.get(f.id_producto) || null })),
    total: filtradas.length,
  }
}

/**
 * Upsert local del comprobante (RF-C4/C5): acepta un `File` (imagen o PDF ≤ 4 MB,
 * convertido con FileReader a data URL en base64) o un `contenido` ya convertido.
 * La fila queda `PENDING` y SOLO se intenta subir al servidor si hay red
 * (`hayRed()`) y su venta/compra madre ya está sincronizada (el FK de `comprobante`
 * fallaría con ids locales); el push jamás lanza: lo que quede pendiente lo
 * sube la Task 7.
 *
 * @param {object} p
 * @param {string|null} [p.idVenta]
 * @param {string|null} [p.idCompra]
 * @param {string|null} [p.idSucursal]
 * @param {'factura'|'nota_venta'|'recibo'} p.tipo
 * @param {string|null} [p.numero]
 * @param {'emitido'|'pendiente'|'anulado'} [p.estado]
 * @param {File|null} [p.archivo] - adjunto (image/* o application/pdf)
 * @param {string|null} [p.contenido] - data URL ya convertida (alternativa a archivo)
 * @returns {Promise<{comprobante: object, envio: 'sin-red'|'padre-pendiente'|'subido'|'conflict'}>}
 */
export async function guardarComprobanteLocal({
  idVenta,
  idCompra,
  idSucursal,
  tipo,
  numero = null,
  estado = 'emitido',
  archivo = null,
  contenido = null,
}) {
  if (!idVenta && !idCompra) throw new Error('Se requiere idVenta o idCompra')
  if (!TIPOS_COMPROBANTE.includes(tipo)) {
    throw new Error(`Tipo inválido: ${tipo} (permitidos: ${TIPOS_COMPROBANTE.join(', ')})`)
  }
  if (!ESTADOS_COMPROBANTE.includes(estado)) {
    throw new Error(`Estado inválido: ${estado} (permitidos: ${ESTADOS_COMPROBANTE.join(', ')})`)
  }

  let contenidoFinal = contenido
  if (archivo) {
    const esImagen = /^image\//.test(archivo.type || '')
    const esPdf = archivo.type === 'application/pdf'
    if (!esImagen && !esPdf) {
      throw new Error('Tipo de archivo no permitido (solo imagen o PDF)')
    }
    if (archivo.size > LIMITE_COMPROBANTE_BYTES) {
      throw new Error(
        `El archivo no puede superar ${Math.round(LIMITE_COMPROBANTE_BYTES / 1024 / 1024)} MB`,
      )
    }
    contenidoFinal = await archivoABase64(archivo)
  } else if (contenidoFinal) {
    const maxCaracteres = Math.ceil(LIMITE_COMPROBANTE_BYTES / 3) * 4
    if (String(contenidoFinal).length > maxCaracteres) {
      throw new Error(
        `El archivo no puede superar ${Math.round(LIMITE_COMPROBANTE_BYTES / 1024 / 1024)} MB`,
      )
    }
  } else {
    throw new Error('Falta el archivo adjunto o su contenido')
  }

  const existente = idVenta
    ? await db.comprobante_cache.where('id_venta').equals(idVenta).first()
    : await db.comprobante_cache.where('id_compra').equals(idCompra).first()

  let fila = {
    ...(existente || { id: nuevoUuid(), fecha_emision: new Date().toISOString() }),
    id_venta: idVenta ?? existente?.id_venta ?? null,
    id_compra: idCompra ?? existente?.id_compra ?? null,
    id_sucursal: idSucursal ?? existente?.id_sucursal ?? null,
    tipo,
    numero: numero ?? existente?.numero ?? null,
    estado,
    contenido: contenidoFinal,
    sync_status: 'PENDING',
  }
  await db.comprobante_cache.put(fila)

  // Único punto con servidor del módulo: guard de red obligatorio (redService)
  if (!hayRed()) return { comprobante: fila, envio: 'sin-red' }

  const tablaPadre = idVenta ? 'ventas' : 'compras'
  if (await padrePendiente(tablaPadre, idVenta ?? idCompra)) {
    return { comprobante: fila, envio: 'padre-pendiente' }
  }

  try {
    const { data, error } = await supabase.rpc('guardar_comprobante', {
      p_id_venta: fila.id_venta,
      p_id_compra: fila.id_compra,
      p_id_sucursal: fila.id_sucursal,
      p_tipo: fila.tipo,
      p_numero: fila.numero,
      p_estado: fila.estado,
      p_contenido: fila.contenido,
    })
    if (error) throw error

    fila = await confirmarComprobanteSubido(fila, data?.id_comprobante)
    return { comprobante: fila, envio: 'subido' }
  } catch (err) {
    const esRed = clasificarFallo(err) === 'red'
    if (!esRed) {
      await db.comprobante_cache
        .update(fila.id, { sync_status: 'CONFLICT', ultimo_error: String(err?.message || err) })
        .catch(() => {})
    }
    return { comprobante: fila, envio: esRed ? 'sin-red' : 'conflict' }
  }
}

/** Marca la fila del espejo como `SYNCED`, adoptando el id que generó el servidor. */
async function confirmarComprobanteSubido(fila, idServidor) {
  if (idServidor && idServidor !== fila.id) {
    await db.transaction('rw', db.comprobante_cache, async () => {
      await db.comprobante_cache.delete(fila.id)
      await db.comprobante_cache.put({ ...fila, id: idServidor, sync_status: 'SYNCED' })
    })
    return { ...fila, id: idServidor, sync_status: 'SYNCED' }
  }
  await db.comprobante_cache.update(fila.id, { sync_status: 'SYNCED' })
  return { ...fila, sync_status: 'SYNCED' }
}

/**
 * Task 7 / RF-C3: sube los comprobantes locales aún `PENDING` (adjunto de una
 * compra) cuando su madre ya quedó `SYNCED` en el servidor — el FK de
 * `comprobante` fallaría con ids locales aún no remapeados. El motor la invoca
 * DESPUÉS de drenar la cola, así el padre ya fue remapeado en esta misma ronda.
 * Nunca lanza: red → se corta la pasada y sigue `PENDING`; negocio → `CONFLICT`.
 *
 * @returns {Promise<number>} comprobantes subidos en esta pasada
 */
export async function subirComprobantesPendientes() {
  const filas = await db.comprobante_cache.filter((f) => f.sync_status === 'PENDING').toArray()
  if (!filas.length) return 0

  let subidos = 0
  for (const fila of filas) {
    const idPadre = fila.id_venta ?? fila.id_compra
    if (!idPadre) continue
    const tablaPadre = fila.id_venta ? 'ventas' : 'compras'
    // El padre aún no llegó: esta ronda lo sube (FIFO), la siguiente al comprobante
    if (await padrePendiente(tablaPadre, idPadre)) continue

    try {
      const { data, error } = await supabase.rpc('guardar_comprobante', {
        p_id_venta: fila.id_venta,
        p_id_compra: fila.id_compra,
        p_id_sucursal: fila.id_sucursal,
        p_tipo: fila.tipo,
        p_numero: fila.numero,
        p_estado: fila.estado,
        p_contenido: fila.contenido,
      })
      if (error) throw error
      await confirmarComprobanteSubido(fila, data?.id_comprobante)
      subidos++
    } catch (err) {
      if (clasificarFallo(err) === 'red') break // sin red el resto fallaría igual
      await db.comprobante_cache
        .update(fila.id, { sync_status: 'CONFLICT', ultimo_error: String(err?.message || err) })
        .catch(() => {})
    }
  }
  return subidos
}

/**
 * Lee el comprobante espejo local para previsualizarlo/imprimirlo sin red (RF-C5).
 * @param {{idVenta?: string, idCompra?: string}} p
 * @returns {Promise<object|null>}
 */
export async function leerComprobanteLocal({ idVenta, idCompra } = {}) {
  if (idVenta) return db.comprobante_cache.where('id_venta').equals(idVenta).first()
  if (idCompra) return db.comprobante_cache.where('id_compra').equals(idCompra).first()
  throw new Error('Se requiere idVenta o idCompra')
}
