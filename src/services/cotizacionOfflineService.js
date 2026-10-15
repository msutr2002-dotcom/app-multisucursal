import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { clasificarFallo } from './colaSyncService'
import { hidratarCatalogoParaSucursal } from './catalogSyncService'

/**
 * Cotizaciones Offline-First (Tasks 1 y 3, specs/offline-cotizaciones.md).
 * Colección local `offline_quotes` (RF-01): se guarda con `status:'pending_sync'`
 * y `receipt_status:'pending_network'` cuando no hay red. `syncOfflineQuotes`
 * (Task 3) verifica precio/stock contra Supabase y marca `conflict`; el envío
 * de las cotizaciones sanas y la emisión del folio oficial son la Task 5.
 * Nota: el `branch_id` del spec = `id_sucursal` (convención del repo).
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
 * RF-03: aviso exacto de la limitación documentada. Se muestra en la UI cuando
 * una cotización se guarda sin red (borrador `receipt_status:'pending_network'`).
 */
export const AVISO_COMPROBANTE_SIN_RED =
  "Cotización guardada localmente. El comprobante oficial no puede ser emitido sin red y quedará en estado 'Pendiente de emisión' hasta recuperar la conexión."

/**
 * Anota cada producto con sus discrepancias vs. el servidor (RF-02, Task 3).
 * Criterios de aceptación: precio con diferencia >= Q0.01 (1 centavo) o stock
 * del servidor menor a la cantidad cotizada **convertida a unidades base**
 * (`cantidad × factor`, RF-P4). Función pura compartida por
 * `syncOfflineQuotes` y `ConflictResolverModal` (Task 4).
 * @param {Array} items - [{id_producto, cantidad, factor?, offline: {precio, stock}, servidor: {precio, stock}}]
 * @returns los items anotados con `conflictos: { precio, stock, diferenciaPrecio }`
 */
export function detectarConflictos(items = []) {
  return items.map((it) => {
    const offline = it.offline || {}
    const servidor = it.servidor || {}
    const ambosNumeros = typeof offline.precio === 'number' && typeof servidor.precio === 'number'
    const diferenciaPrecio = ambosNumeros ? Math.abs(servidor.precio - offline.precio) : 0
    const factor = Number.isInteger(it.factor) && it.factor > 1 ? it.factor : 1
    return {
      ...it,
      conflictos: {
        precio: diferenciaPrecio >= 1,
        stock: typeof servidor.stock === 'number' && servidor.stock < (it.cantidad || 0) * factor,
        diferenciaPrecio,
      },
    }
  })
}

/**
 * Guarda una cotización como borrador local con `status:'pending_sync'`.
 * @param {object} p
 * @param {string} p.idSucursal
 * @param {string} [p.idUsuario]
 * @param {Array} p.items - [{id_producto, cantidad, id_precio_producto, precio, name, sku}]
 * @returns {Promise<{temp_id: string, total: number}>}
 */
export async function guardarCotizacionOffline({ idSucursal, idUsuario, items }) {
  if (!idSucursal) throw new Error('guardarCotizacionOffline: idSucursal es obligatorio')
  if (!Array.isArray(items) || !items.length) throw new Error('La cotización no tiene artículos')

  const registro = {
    temp_id: nuevoUuid(),
    id_sucursal: idSucursal,
    id_usuario: idUsuario ?? null,
    items: items.map((it) => ({
      id_producto: it.id_producto,
      cantidad: it.cantidad,
      id_precio_producto: it.id_precio_producto ?? null,
      offline_price: it.precio ?? 0,
      name: it.name ?? '',
      sku: it.sku ?? '',
    })),
    status: 'pending_sync',
    receipt_status: 'pending_network',
    fecha: new Date().toISOString(),
    total: items.reduce((suma, it) => suma + (it.cantidad || 0) * (it.precio || 0), 0),
  }

  await db.offline_quotes.add(registro)
  return { ...registro }
}

/**
 * Lista las cotizaciones locales de una sucursal, más recientes primero.
 * @param {string} idSucursal
 * @returns {Promise<Array>}
 */
export async function listarCotizacionesOffline(idSucursal) {
  if (!idSucursal) return []
  const lista = await db.offline_quotes.where('id_sucursal').equals(idSucursal).toArray()
  return lista.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}

/**
 * Actualiza campos de una cotización local (p. ej. `status` a 'conflict'/'synced'
 * o `receipt_status` a 'issued').
 * @param {string} tempId
 * @param {object} cambios
 * @returns {Promise<number>} número de claves actualizadas
 */
export async function actualizarCotizacionOffline(tempId, cambios) {
  const claves = await db.offline_quotes.update(tempId, cambios)
  if (!claves) throw new Error('Cotización local no encontrada')
  return claves
}

/**
 * Elimina un borrador local (acción "Descartar").
 * @param {string} tempId
 */
export async function eliminarCotizacionOffline(tempId) {
  await db.offline_quotes.delete(tempId)
}

/**
 * Marca el borrador como impreso sin red (campo `printed_offline` del spec
 * offline-suite). No está indexado: no requiere bump de versión de Dexie.
 * @param {string} tempId
 */
export async function marcarCotizacionImpresa(tempId) {
  if (!tempId) return
  await db.offline_quotes.update(tempId, { printed_offline: true })
}

/**
 * Reescribe el espejo `quote_cache` de una sucursal con la respuesta fresca
 * de `get_cotizaciones` (solo-lectura, sin estado de sincronización).
 * Se llama en cada carga CON red; sin red solo se lee.
 * @param {string} idSucursal
 * @param {Array} rows
 */
export async function guardarCotizacionesEnCache(idSucursal, rows) {
  if (!idSucursal || !Array.isArray(rows)) return
  await db.transaction('rw', db.quote_cache, async () => {
    await db.quote_cache.where('id_sucursal').equals(idSucursal).delete()
    if (rows.length) {
      await db.quote_cache.bulkPut(rows.map((r) => ({ ...r, id_sucursal: idSucursal })))
    }
  })
}

/**
 * Lee el espejo de cotizaciones del servidor (fallback offline), más
 * recientes primero. No incluye borradores: esos van con `listarCotizacionesOffline`.
 * @param {string} idSucursal
 * @returns {Promise<Array>}
 */
export async function leerCotizacionesCache(idSucursal) {
  if (!idSucursal) return []
  const rows = await db.quote_cache.where('id_sucursal').equals(idSucursal).toArray()
  return rows.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
}

/**
 * Task 5 / RF-02 ("Aceptar precio/stock del servidor"): adopta `valores_servidor`
 * en los items, recorta la cantidad al stock disponible (>=1) y devuelve la
 * cotización a `status:'pending_sync'` para que la siguiente ronda la envíe.
 * @param {string} tempId
 * @returns {Promise<{vacia: boolean}>} `vacia:true` si no quedaron artículos
 */
export async function aceptarCambiosServidor(tempId) {
  const cot = await db.offline_quotes.get(tempId)
  if (!cot) throw new Error('Cotización local no encontrada')

  const valores = new Map((cot.valores_servidor || []).map((v) => [v.id_producto, v]))
  const items = cot.items
    .map((it) => {
      const v = valores.get(it.id_producto)
      if (!v) return it
      let cantidad = it.cantidad
      // RF-P4: recorte al stock convertido con floor(stock / factor), mín. 1
      const factor = Number.isInteger(v.factor) && v.factor > 1 ? v.factor : 1
      if (typeof v.stock === 'number' && v.stock < cantidad * factor) {
        cantidad = Math.max(Math.floor(v.stock / factor), 1)
      }
      return {
        ...it,
        cantidad,
        offline_price: typeof v.precio === 'number' ? v.precio : it.offline_price,
      }
    })
    .filter((it) => it.cantidad > 0)

  if (!items.length) {
    await eliminarCotizacionOffline(tempId)
    return { vacia: true }
  }

  const total = items.reduce((suma, it) => suma + it.cantidad * it.offline_price, 0)
  await db.offline_quotes.update(tempId, { items, total, status: 'pending_sync' })
  return { vacia: false }
}

/**
 * Task 3 (`syncOfflineQuotes`): verifica el precio y el stock actuales de
 * Supabase contra cada cotización `pending_sync`. Refresca el catálogo desde
 * el RPC `get_productos_admin` (vía `hidratarCatalogoParaSucursal`) y compara
 * con `detectarConflictos` (>= Q0.01 de diferencia o stock < cantidad).
 * Si hay discrepancias marca la cotización con `status:'conflict'` y guarda
 * `valores_servidor` (para el `ConflictResolverModal`), interrumpiendo así el
 * guardado directo: las Task 5 solo envían `pending_sync`.
 * Sin red no se marca nada: la red caída no es un conflicto.
 * @returns {Promise<{revisadas: number, conflictos: number}>}
 */
export async function syncOfflineQuotes() {
  const pendientes = await db.offline_quotes.where('status').equals('pending_sync').toArray()
  if (!pendientes.length) return { revisadas: 0, conflictos: 0 }

  try {
    const descargados = await hidratarCatalogoParaSucursal(pendientes[0].id_sucursal)
    if (!descargados) {
      console.warn('syncOfflineQuotes: catálogo no disponible, se omite la detección')
      return { revisadas: 0, conflictos: 0 }
    }
  } catch (err) {
    console.warn(
      'syncOfflineQuotes: sin catálogo fresco, se omite la detección:',
      err?.message || err,
    )
    return { revisadas: 0, conflictos: 0 }
  }

  let conflictos = 0
  for (const cotizacion of pendientes) {
    const productos = await db.productos.bulkGet(cotizacion.items.map((i) => i.id_producto))
    const stocks = await Promise.all(
      cotizacion.items.map((i) =>
        db.productos_sucursal.get([cotizacion.id_sucursal, i.id_producto]),
      ),
    )

    const comparacion = detectarConflictos(
      cotizacion.items.map((it, idx) => {
        const tier = productos[idx]?.precios?.find((p) => p.id === it.id_precio_producto)
        const factor = Number.isInteger(tier?.factor) && tier.factor > 1 ? tier.factor : 1
        return {
          id_producto: it.id_producto,
          cantidad: it.cantidad,
          factor,
          offline: { precio: it.offline_price, stock: null },
          servidor: {
            precio: tier?.precio ?? null,
            stock: stocks[idx]?.stock ?? null,
          },
        }
      }),
    )

    const conDiferencias = comparacion.filter((c) => c.conflictos.precio || c.conflictos.stock)
    if (!conDiferencias.length) continue

    await actualizarCotizacionOffline(cotizacion.temp_id, {
      status: 'conflict',
      valores_servidor: comparacion.map((c) => ({
        id_producto: c.id_producto,
        precio: c.servidor.precio,
        stock: c.servidor.stock,
        factor: c.factor,
      })),
    })
    conflictos += 1
  }

  return { revisadas: pendientes.length, conflictos }
}

/**
 * Task 5: envía a Supabase las cotizaciones `pending_sync` con RPC
 * `registrar_cotizacion` (sin cambios de backend), guarda el folio oficial
 * (`id_cotizacion`) y las marca `status:'synced'` + `receipt_status:'issued'`.
 * Clasificación de fallos (regla Fase 2, mismo `clasificarFallo` de la cola):
 * - 'red' → se corta la ronda y siguen pendientes (la red caída no es conflicto).
 * - 'negocio' → `status:'conflict'` terminal con `error_servidor` (no reintentar).
 * @returns {Promise<{sincronizadas: number, conflictos: number}>}
 */
export async function enviarCotizacionesPendientes() {
  const pendientes = await db.offline_quotes.where('status').equals('pending_sync').toArray()
  let sincronizadas = 0
  let conflictos = 0

  for (const cot of pendientes) {
    try {
      const { data, error } = await supabase.rpc('registrar_cotizacion', {
        p_id_sucursal: cot.id_sucursal,
        p_id_usuario: cot.id_usuario ?? undefined,
        p_items: cot.items.map((i) => ({
          id_producto: i.id_producto,
          cantidad: i.cantidad,
          id_precio_producto: i.id_precio_producto,
        })),
      })
      if (error) throw error

      await actualizarCotizacionOffline(cot.temp_id, {
        status: 'synced',
        id_cotizacion: data?.id_cotizacion ?? null,
        receipt_status: 'issued', // folio oficial obtenido: RF-03 superada
      })
      sincronizadas += 1
    } catch (err) {
      if (clasificarFallo(err) === 'red') {
        console.warn(
          'enviarCotizacionesPendientes: sin red, se pospone el envío:',
          err?.message || err,
        )
        break
      }
      await actualizarCotizacionOffline(cot.temp_id, {
        status: 'conflict',
        error_servidor: String(err?.message || err),
      })
      conflictos += 1
    }
  }

  return { sincronizadas, conflictos }
}

/**
 * Ronda completa de sincronización de cotizaciones: primero la detección de
 * conflictos (Task 3, `syncOfflineQuotes`) y luego el envío de las sanas
 * (Task 5, `enviarCotizacionesPendientes`). Al terminar despacha el evento
 * `cotizaciones-revisadas` para que la UI (POSPage) abra el modal de
 * resolución si apareció algún conflicto (RF-02).
 * La llama el listener `online` (Task 1) y los manejadores de resolución.
 * @returns {Promise<{pendientes: number, sincronizadas: number, conflictos: number}>}
 */
export async function sincronizarCotizacionesOffline() {
  const deteccion = await syncOfflineQuotes()
  const envio = await enviarCotizacionesPendientes()
  const pendientes = await db.offline_quotes.where('status').equals('pending_sync').count()
  const resumen = {
    pendientes,
    sincronizadas: envio.sincronizadas,
    conflictos: deteccion.conflictos + envio.conflictos,
  }
  window.dispatchEvent(new CustomEvent('cotizaciones-revisadas', { detail: resumen }))
  return resumen
}

let gestorIniciado = false

/**
 * Listener `online` (Task 1): al volver la red dispara la sincronización de
 * las cotizaciones guardadas sin conexión. Idempotente, igual que
 * `iniciarMotorSync` (Tarea 2.3).
 */
export function iniciarGestorCotizacionesOffline() {
  if (gestorIniciado) return
  gestorIniciado = true
  window.addEventListener('online', () => {
    sincronizarCotizacionesOffline().catch((err) =>
      console.warn('Sincronización de cotizaciones pospuesta:', err),
    )
  })
}
