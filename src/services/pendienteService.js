import { db } from '../lib/db'
import { encolarOperacion } from './colaSyncService'

/**
 * Pendientes de venta Offline-First (Tarea 2.5).
 * Un pendiente es una venta con estado='pendiente': misma store `ventas`,
 * mismos índices y misma `detalle_venta` que en Supabase. Guardar, listar,
 * eliminar y consumir un pendiente funcionan 100% local; la sincronización
 * hacia los RPC `registrar_pendiente`/`eliminar_venta_pendiente` la hace la
 * cola (push inmediato + motor de la Tarea 2.3).
 */

const nuevoUuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })

/**
 * Guarda el carrito como pendiente en IndexedDB (atómico con su evento).
 * @param {object} p
 * @param {string} p.idSucursal
 * @param {string} [p.idUsuario]
 * @param {Array} p.items - [{id_producto, cantidad, id_precio_producto, subtotal}]
 * @param {number} p.total - centavos enteros
 * @returns {Promise<{id: string, total: number, idEvento: number}>}
 */
export async function crearPendienteLocal({ idSucursal, idUsuario, items, total }) {
  if (!idSucursal) throw new Error('crearPendienteLocal: idSucursal es obligatorio')
  if (!Array.isArray(items) || !items.length) throw new Error('El pendiente no tiene artículos')

  const id = nuevoUuid()
  let idEvento

  await db.transaction('rw', db.ventas, db.detalle_venta, db.cola_sincronizacion, async () => {
    await db.ventas.add({
      id,
      id_sucursal: idSucursal,
      id_usuario: idUsuario ?? null,
      id_metodo_pago: null,
      id_cliente: null,
      fecha: new Date().toISOString(),
      total,
      cambio: 0,
      estado: 'pendiente',
    })

    await db.detalle_venta.bulkAdd(
      items.map((it) => ({
        id: nuevoUuid(),
        id_venta: id,
        id_producto: it.id_producto,
        cantidad: it.cantidad,
        subtotal: it.subtotal,
        id_precio_producto: it.id_precio_producto,
      })),
    )

    idEvento = await encolarOperacion({
      tabla: 'ventas',
      operacion: 'INSERT',
      id,
      idSucursal,
      datos: {
        rpc: 'registrar_pendiente',
        params: {
          p_id_sucursal: idSucursal,
          p_id_usuario: idUsuario ?? null,
          p_items: items.map((it) => ({
            id_producto: it.id_producto,
            cantidad: it.cantidad,
            id_precio_producto: it.id_precio_producto,
          })),
        },
      },
    })
  })

  return { id, total, idEvento }
}

/**
 * Lista local de pendientes con la MISMA forma que el RPC `get_ventas_pendientes`
 * (verificada con probe): {id, fecha, total, items[{id_producto, name, sku,
 * cantidad, id_precio_producto, subtotal, stock, precios[]}]}.
 * @param {string} idSucursal
 */
export async function leerPendientesLocal(idSucursal) {
  if (!idSucursal) return []
  const ventas = await db.ventas
    .where('[id_sucursal+estado]')
    .equals([idSucursal, 'pendiente'])
    .toArray()

  const lista = await Promise.all(
    ventas.map(async (v) => {
      const dets = await db.detalle_venta.where('id_venta').equals(v.id).toArray()
      const prods = await db.productos.bulkGet(dets.map((d) => d.id_producto))
      const stocks = await Promise.all(
        dets.map((d) => db.productos_sucursal.get([idSucursal, d.id_producto])),
      )
      return {
        id: v.id,
        fecha: v.fecha,
        total: v.total,
        items: dets.map((d, i) => ({
          id_producto: d.id_producto,
          name: prods[i]?.name || 'Producto',
          sku: prods[i]?.sku || '',
          cantidad: d.cantidad,
          id_precio_producto: d.id_precio_producto,
          subtotal: d.subtotal,
          stock: stocks[i]?.stock ?? 0,
          precios: prods[i]?.precios || [],
        })),
      }
    }),
  )

  return lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
}

/**
 * Elimina un pendiente local y resuelve su evento de cola:
 * - Evento INSERT aún sin SYNCED → se cancela (borrado) porque el servidor
 *   nunca lo vio; si está en vuelo se marca `cancelar` para resolverlo tras
 *   confirmar la creación.
 * - Si el pendiente sí existe (o pudo llegar a existir) en el servidor →
 *   se encola un evento DELETE para `eliminar_venta_pendiente`.
 * @returns {Promise<{idEvento?: number}>} evento DELETE a empujar (si existe)
 */
export async function eliminarPendienteLocal(id, idSucursal) {
  if (!id) throw new Error('eliminarPendienteLocal: id es obligatorio')

  let idEvento
  await db.transaction('rw', db.ventas, db.detalle_venta, db.cola_sincronizacion, async () => {
    const ev = await db.cola_sincronizacion
      .where('tabla')
      .equals('ventas')
      .filter((e) => e.operacion === 'INSERT' && e.id_registro === id)
      .first()

    const fila = await db.ventas.get(id)
    if (fila) {
      await db.ventas.delete(id)
      await db.detalle_venta.where('id_venta').equals(id).delete()
    }

    if (ev && ev.sync_status !== 'SYNCED') {
      const enVuelo = ev.en_vuelo && Date.now() - ev.en_vuelo < 30000
      if (ev.sync_status === 'PENDING' && enVuelo) {
        await db.cola_sincronizacion.update(ev.id, { cancelar: true })
      } else {
        await db.cola_sincronizacion.delete(ev.id)
      }
      return
    }

    idEvento = await encolarOperacion({
      tabla: 'ventas',
      operacion: 'DELETE',
      id,
      idSucursal,
      datos: {
        rpc: 'eliminar_venta_pendiente',
        params: { p_id: id, p_id_sucursal: idSucursal },
      },
    })
  })

  return { idEvento }
}

/**
 * Fusiona la lista del servidor con los pendientes locales aún sin sincronizar
 * y limpia huérfanos (locales SYNCED que el servidor ya no conoce: ids viejos
 * o borrados en otra sesión). El servidor manda para lo sincronizado.
 * @returns {Promise<Array>} lista para el modal
 */
export async function fusionarPendientes(idSucursal, local, servidor) {
  const eventos = await db.cola_sincronizacion
    .where('tabla')
    .equals('ventas')
    .filter((e) => e.operacion === 'INSERT')
    .toArray()
  const sinSync = new Set(
    eventos.filter((e) => e.sync_status !== 'SYNCED').map((e) => e.id_registro),
  )
  const serverIds = new Set(servidor.map((p) => p.id))

  const localesOk = local.filter((l) => sinSync.has(l.id) && !serverIds.has(l.id))
  const huerfanos = local.filter((l) => !sinSync.has(l.id) && !serverIds.has(l.id))

  if (huerfanos.length) {
    await db.transaction('rw', db.ventas, db.detalle_venta, async () => {
      await db.ventas.bulkDelete(huerfanos.map((h) => h.id))
      for (const h of huerfanos) {
        await db.detalle_venta.where('id_venta').equals(h.id).delete()
      }
    })
  }

  return [...localesOk, ...servidor]
}
