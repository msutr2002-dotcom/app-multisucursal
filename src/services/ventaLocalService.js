import { db } from '../lib/db'
import { encolarOperacion } from './colaSyncService'

/**
 * Venta local atómica (Offline-First Fase 2, Tarea 2.2).
 * Registra la venta completa en IndexedDB dentro de UNA transacción: precios
 * releídos del catálogo local, stock validado y descontado, venta + detalle y
 * el evento de la cola de sincronización — todo sin depender de la red (<2 s).
 * El servidor sigue siendo la fuente de verdad: `sincronizarEvento` reproduce
 * el mismo payload con registrar_venta apenas termina (push inmediato).
 * Si un producto no está en el catálogo local se lanza error con
 * code='CATALOGO_LOCAL' para que el llamador caiga al RPC (solo posible con
 * red, porque sin hidratación tampoco habría búsqueda local).
 */

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

/**
 * RF-P4: mensaje de stock insuficiente con ambas unidades cuando se vende una
 * presentación ("solo tiene 5 und; vendes 1 Caja (12 und)"). Con factor 1
 * conserva el mensaje clásico (regresión intacta RF-P5).
 */
async function mensajeStockInsuficiente(producto, tier, stock, it, factor, unidades) {
  if (factor === 1) return `Stock insuficiente para ${producto.name}`
  let unidad = null
  if (tier?.id_unidad_venta) {
    unidad = (await db.unidades.get(tier.id_unidad_venta))?.name || null
  }
  return `Stock insuficiente para ${producto.name}: solo tiene ${stock} und; vendes ${it.cantidad} ${unidad || 'unidad'} (${unidades} und)`
}

/**
 * @param {object} p
 * @param {string} p.idSucursal - sucursal del dispositivo (aislamiento)
 * @param {string} p.idUsuario - usuario que cobra
 * @param {string} p.idMetodoPago - método de pago (efectivo, transferencia, …)
 * @param {number|null} p.efectivoRecibido - centavos recibidos (null si no es efectivo)
 * @param {string|null} p.idCliente - id de clientes ya registrado en el servidor (modo enlazado)
 * @param {string|null} p.clienteNombre - nombre casual (modo casual: sin perfil, solo ticket)
 * @param {number} p.descuentoBp - mayoreo: bp del cliente enlazado (0 si casual); se aplica al total
 * @param {string|null} p.referencia - RF-P3: número de referencia de transferencia
 * @param {Array} p.items - renglones del carrito ({id_producto, name, cantidad, id_precio_producto, precio})
 * @returns {Promise<{idVenta: string, total: number, cambio: number, idEvento: number}>}
 */
export async function registrarVentaLocal({
  idSucursal,
  idBodega,
  idUsuario,
  idMetodoPago,
  efectivoRecibido,
  idCliente,
  clienteNombre,
  descuentoBp = 0,
  referencia,
  items,
}) {
  if (!Array.isArray(items) || !items.length) throw new Error('El carrito está vacío')
  if (!idSucursal || !idMetodoPago) throw new Error('Método de pago inválido')

  const tablas = [
    db.productos,
    db.productos_sucursal,
    db.unidades,
    db.ventas,
    db.detalle_venta,
    db.cola_sincronizacion,
  ]
  if (idBodega) tablas.push(db.stock_bodega)

  return db.transaction('rw', tablas, async () => {
    const renglones = []
    const stockRows = new Map()
    const consumo = new Map()
    let total = 0

    for (const it of items) {
      const producto = await db.productos.get(it.id_producto)
      if (!producto) {
        throw errorCatalogo(`Producto ${it.name || it.id_producto} no está en el catálogo local`)
      }

      // Fuente de verdad local para el precio: tier vigente en el catálogo hidratado
      const tier = (producto.precios || []).find((p) => p.id === it.id_precio_producto)
      const crudo = tier?.precio ?? it.precio
      const precio = typeof crudo === 'number' ? crudo : Number(crudo)
      if (crudo == null || !Number.isInteger(precio) || precio < 0) {
        throw new Error(`Precio inválido para ${producto.name}`)
      }

      // RF-P4: el stock se cuenta y descuenta en unidades BASE (cantidad × factor);
      // `detalle_venta.cantidad` sigue en la unidad del tier (sin cambios de forma).
      const factor = Number.isInteger(tier?.factor) && tier.factor > 1 ? tier.factor : 1
      const unidades = it.cantidad * factor

      // Multibodega: con idBodega se lee stock_bodega; sin él, productos_sucursal
      const k = idBodega ? `${idBodega}|${it.id_producto}` : `${idSucursal}|${it.id_producto}`
      let stockRow = stockRows.get(k)
      if (!stockRow) {
        if (idBodega) {
          const dbRow = await db.stock_bodega.get({
            id_bodega: idBodega,
            id_producto: it.id_producto,
          })
          stockRow = dbRow || {
            id_bodega: idBodega,
            id_producto: it.id_producto,
            stock: 0,
            stock_minimo: 0,
          }
        } else {
          const dbRow = await db.productos_sucursal.get([idSucursal, it.id_producto])
          stockRow = dbRow || {
            id_sucursal: idSucursal,
            id_producto: it.id_producto,
            stock: 0,
            stock_minimo: 0,
          }
        }
        stockRows.set(k, stockRow)
      }
      const yaUsado = consumo.get(k) || 0
      if (stockRow.stock < yaUsado + unidades) {
        throw new Error(
          await mensajeStockInsuficiente(producto, tier, stockRow.stock, it, factor, unidades),
        )
      }
      consumo.set(k, yaUsado + unidades)

      const subtotal = precio * it.cantidad
      total += subtotal
      renglones.push({
        it,
        k,
        idProducto: it.id_producto,
        idColor: producto.id_color ?? null,
        subtotal,
      })
    }

    // Mayoreo (RF-MY5): un solo redondeo por venta, igual que el servidor
    // (round half-up en centavos). Los renglones siguen a precio full.
    const totalFull = total
    const bpMayoreo = Number.isInteger(descuentoBp) && descuentoBp > 0 ? descuentoBp : 0
    const descuentoMonto =
      bpMayoreo > 0 ? Math.min(totalFull, Math.round((totalFull * bpMayoreo) / 10000)) : 0
    total = totalFull - descuentoMonto

    const efectivo = typeof efectivoRecibido === 'number' ? efectivoRecibido : null
    if (efectivo !== null && efectivo < total) {
      throw new Error('Efectivo recibido menor al total')
    }
    const cambio = efectivo !== null ? Math.max(0, efectivo - total) : 0

    const idVenta = nuevoUuid()

    await db.ventas.add({
      id: idVenta,
      id_sucursal: idSucursal,
      id_bodega: idBodega || null,
      id_usuario: idUsuario ?? null,
      id_metodo_pago: idMetodoPago,
      id_cliente: idCliente ?? null,
      fecha: new Date().toISOString(),
      total,
      cambio,
      estado: 'completada',
      referencia: referencia || null,
      cliente_nombre: clienteNombre || null,
      descuento_bp: bpMayoreo,
      descuento_monto: descuentoMonto,
    })

    await db.detalle_venta.bulkAdd(
      renglones.map((r) => ({
        id: nuevoUuid(),
        id_venta: idVenta,
        id_producto: r.idProducto,
        cantidad: r.it.cantidad,
        subtotal: r.subtotal,
        id_precio_producto: r.it.id_precio_producto,
        id_color: r.idColor,
      })),
    )

    for (const [k, cantidad] of consumo) {
      const row = stockRows.get(k)
      if (idBodega) {
        // Multibodega: descuenta de stock_bodega + actualiza caché productos_sucursal
        await db.stock_bodega.put({ ...row, stock: row.stock - cantidad })
        const cacheKey = [idSucursal, row.id_producto]
        const cache = await db.productos_sucursal.get(cacheKey)
        if (cache) {
          await db.productos_sucursal.put({ ...cache, stock: Math.max(0, cache.stock - cantidad) })
        }
      } else {
        await db.productos_sucursal.put({ ...row, stock: row.stock - cantidad })
      }
    }

    const idEvento = await encolarOperacion({
      tabla: 'ventas',
      operacion: 'INSERT',
      id: idVenta,
      idSucursal,
      datos: {
        // Payload listo para reproducir el cobro con los mismos RPC del POS
        params: {
          p_id_sucursal: idSucursal,
          p_id_usuario: idUsuario ?? null,
          p_id_metodo_pago: idMetodoPago,
          p_efectivo_recibido: efectivo,
          p_items: renglones.map((r) => ({
            id_producto: r.idProducto,
            cantidad: r.it.cantidad,
            id_precio_producto: r.it.id_precio_producto,
          })),
          ...(idCliente ? { p_id_cliente: idCliente } : {}),
          // Cliente casual (sin perfil): se imprime en el ticket (v2)
          ...(clienteNombre ? { p_cliente_nombre: clienteNombre } : {}),
          // RF-P3: solo si hay referencia (compat con el RPC viejo sin el param)
          ...(referencia ? { p_referencia: referencia } : {}),
        },
      },
    })

    return { idVenta, total, cambio, idEvento }
  })
}
