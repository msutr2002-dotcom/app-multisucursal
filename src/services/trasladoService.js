import { db } from '../lib/db'
import { supabase } from '../lib/supabase'
import { encolarOperacion } from './colaSyncService'
import { hayRed } from './redService'

/**
 * Traslados entre sucursales y Movimientos Offline-First
 * (specs/traslados-movimientos.md, Task 3; specs/traslados-unidades.md).
 * Todo se escribe primero en IndexedDB dentro de UNA transacción — fila + detalle +
 * stock (origen baja al enviar, destino suma lo recibido al aceptar) + evento de
 * cola `PENDING` — y la UI nunca espera a Supabase (Art. II). El módulo no maneja
 * dinero: cantidades enteras; con unidades/presentaciones la cantidad es de la
 * unidad del tier y el stock se mueve en base (cantidad × factor del tier).
 * Los eventos se encolan con `datos.rpc` listo para que la Task 8 los suba a
 * `registrar_traslado`/`aceptar_traslado` (ya soportados por `colaSyncService`
 * con remapeo de id y re-apuntado de eventos posteriores). Único punto con
 * servidor directo: `anularTrasladoLocal` (exige red + fila `SYNCED`, patrón
 * ComprasPage).
 */

const nuevoUuid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })

/** Notifica a la UI (campanita, listas) que el espejo local cambió. */
function avisarTraslados() {
  try {
    window.dispatchEvent(new CustomEvent('traslados-actualizados'))
  } catch {
    // sin window (entorno no-DOM) no hay UI que notificar
  }
}

/**
 * Clave única de una línea de traslado: producto + presentación (unidad).
 * 2 CAJA + 3 UNIDAD del mismo producto son DOS líneas distintas (D3).
 */
export const claveLinea = (l) => `${l.id_producto}|${l.id_precio_producto ?? ''}`

/**
 * Resuelve el tier de presentación de un producto por su `id_precio_producto`
 * (specs/traslados-unidades.md, compras-unidades RF-UC3 reutiliza este helper).
 * Los tiers viven anidados en el producto hidratado (`precios`); si no, se
 * intenta el store `precio_producto`.
 * @returns {{factor: number}|null} null si no hay id (unidad base) o no existe el tier
 */
export async function resolverTierLocal(producto, idPrecioProducto) {
  if (!idPrecioProducto) return { factor: 1 }
  const anidado = (producto.precios || []).find((t) => t.id === idPrecioProducto)
  if (anidado) return anidado
  const fila = await db.precio_producto.get(idPrecioProducto).catch(() => null)
  if (fila && fila.id_producto === producto.id) return fila
  return undefined // tier inexistente o de otro producto
}

/**
 * Traslado local atómico (RF-T1): cabecera + detalle + descuento de stock en la
 * sucursal origen + evento de cola, todo en UNA transacción y sin red (<2 s).
 * El destino se valida en el selector (misma empresa) y en el servidor al sincronizar.
 *
 * @param {object} p
 * @param {string} p.idSucursalOrigen - sucursal del dispositivo (aislamiento, Art. II)
 * @param {string} p.idSucursalDestino - otra sucursal de la misma empresa
 * @param {string|null} [p.idUsuario]
 * @param {Array} p.items - líneas ({id_producto, cantidad en la unidad del tier,
 *   id_precio_producto?} cantidad entera > 0; sin tier = unidad base, factor 1)
 * @param {string|null} [p.nombreDestino] - snapshot del nombre para listar sin red
 * @param {'entre_sucursales'|'interno'} [p.tipo] - modo del traslado (default entre_sucursales)
 * @param {string|null} [p.idBodegaOrigen] - bodega origen (interno obligatorio; entre sucursales opcional)
 * @param {string|null} [p.idBodegaDestino] - bodega destino (solo modo interno)
 * @param {string|null} [p.nombreBodegaOrigen] - snapshot nombre bodega origen
 * @param {string|null} [p.nombreBodegaDestino] - snapshot nombre bodega destino
 * @returns {Promise<{idTraslado: string, idEvento: number|null}>}
 */
export async function registrarTrasladoLocal({
  idSucursalOrigen,
  idSucursalDestino,
  idUsuario,
  items,
  nombreDestino = null,
  tipo = 'entre_sucursales',
  idBodegaOrigen = null,
  idBodegaDestino = null,
  nombreBodegaOrigen = null,
  nombreBodegaDestino = null,
}) {
  const esInterno = tipo === 'interno'

  if (!idSucursalOrigen) throw new Error('Sucursal origen inválida')
  if (!Array.isArray(items) || !items.length) throw new Error('El traslado no incluye productos')

  if (esInterno) {
    if (idSucursalDestino && idSucursalDestino !== idSucursalOrigen) {
      throw new Error('Un traslado interno debe ser dentro de la misma sucursal')
    }
    if (!idBodegaOrigen || !idBodegaDestino) {
      throw new Error('Selecciona las bodegas de origen y destino')
    }
    if (idBodegaOrigen === idBodegaDestino) {
      throw new Error('La bodega destino debe ser distinta a la de origen')
    }
  } else {
    if (!idSucursalDestino) throw new Error('Sucursal destino inválida')
    if (idSucursalOrigen === idSucursalDestino) {
      throw new Error('La sucursal destino debe ser distinta a la de origen')
    }
  }

  const tablas = [
    db.productos,
    db.productos_sucursal,
    db.traslados,
    db.detalle_traslado,
    db.cola_sincronizacion,
  ]
  // multibodega: stock_bodega si el stock se maneja por bodega (interno, o
  // entre sucursales con bodega origen especificada)
  if (esInterno || idBodegaOrigen) tablas.push(db.stock_bodega)

  return db.transaction('rw', tablas, async () => {
    const consumos = new Map()
    const renglones = []

    for (const it of items) {
      const producto = await db.productos.get(it.id_producto)
      if (!producto) {
        const e = new Error(`Producto ${it.id_producto} no está en el catálogo local`)
        e.code = 'CATALOGO_LOCAL'
        throw e
      }
      if (!Number.isInteger(it.cantidad) || it.cantidad <= 0) {
        throw new Error(`Cantidad inválida para ${producto.name}`)
      }
      if (consumos.has(claveLinea(it))) {
        throw new Error(`Producto duplicado en la misma unidad: ${producto.name}`)
      }
      const tier = await resolverTierLocal(producto, it.id_precio_producto)
      if (tier === undefined) {
        throw new Error(`Presentación inválida para ${producto.name}`)
      }
      const factor = tier.factor || 1
      consumos.set(claveLinea(it), { cantidad: it.cantidad, factor })
      renglones.push({
        id_producto: it.id_producto,
        cantidad: it.cantidad,
        id_precio_producto: it.id_precio_producto ?? null,
        factor,
      })
    }

    // guard de stock + descuento en el ORIGEN en unidades base (cantidad ×
    // factor), acumulado por producto: mismo producto en dos unidades se
    // valida contra el stock restante, no contra el stock original de cada
    // línea. El servidor repite este check al sincronizar con el factor
    // resuelto (nunca confiar en el cliente).
    // multibodega: si hay bodega origen (interno o entre sucursales), el
    // stock se descuenta de stock_bodega; si no, de productos_sucursal.
    const usarBodegaOrigen = esInterno || !!idBodegaOrigen
    for (const r of renglones) {
      const base = r.cantidad * r.factor
      if (usarBodegaOrigen) {
        const stockRow = await db.stock_bodega.get({
          id_bodega: idBodegaOrigen,
          id_producto: r.id_producto,
        })
        if (!stockRow) {
          throw new Error(`El producto ${r.id_producto} no tiene stock en la bodega origen`)
        }
        if (stockRow.stock < base) {
          const producto = await db.productos.get(r.id_producto)
          throw new Error(
            `Stock insuficiente: ${producto?.name || r.id_producto} solo tiene ${stockRow.stock} unidades base en la bodega origen (necesitas ${base})`,
          )
        }
        await db.stock_bodega.put({ ...stockRow, stock: stockRow.stock - base })
        // interno: el destino es otra bodega de la MISMA sucursal y no hay paso
        // de recepción (D8, operación 100% local) → el stock llega al instante
        // (auto-aceptado), si no queda "en tránsito" sin forma de aceptarlo.
        if (esInterno) {
          const destRow = await db.stock_bodega.get({
            id_bodega: idBodegaDestino,
            id_producto: r.id_producto,
          })
          if (destRow) {
            await db.stock_bodega.put({ ...destRow, stock: destRow.stock + base })
          } else {
            await db.stock_bodega.add({
              id_bodega: idBodegaDestino,
              id_producto: r.id_producto,
              stock: base,
            })
          }
        }
      } else {
        const stockRow = await db.productos_sucursal.get([idSucursalOrigen, r.id_producto])
        if (!stockRow) {
          throw new Error(`El producto ${r.id_producto} no está habilitado en esta sucursal`)
        }
        if (stockRow.stock < base) {
          const producto = await db.productos.get(r.id_producto)
          throw new Error(
            `Stock insuficiente: ${producto?.name || r.id_producto} solo tiene ${stockRow.stock} unidades base (necesitas ${base})`,
          )
        }
        await db.productos_sucursal.put({ ...stockRow, stock: stockRow.stock - base })
      }
    }

    const idTraslado = nuevoUuid()

    await db.traslados.add({
      id: idTraslado,
      tipo,
      id_sucursal_origen: idSucursalOrigen,
      id_sucursal_destino: idSucursalDestino,
      id_bodega_origen: idBodegaOrigen,
      id_bodega_destino: idBodegaDestino,
      id_usuario: idUsuario ?? null,
      fecha: new Date().toISOString(),
      // los internos se aplican de una sola vez (stock ya en la bodega destino)
      // → nacen 'recibido' (D8, sin paso de recepción en la misma sucursal).
      estado: esInterno ? 'recibido' : 'enviado',
      id_usuario_receptor: esInterno ? (idUsuario ?? null) : null,
      fecha_recepcion: esInterno ? new Date().toISOString() : null,
      // los internos son 100% locales (spec D8: sin red requerida): no se
      // encolan y se marcan SYNCED para no mostrar el badge "sin sincronizar"
      sync_status: esInterno ? 'SYNCED' : 'PENDING',
      destino: esInterno ? (nombreBodegaDestino ?? null) : (nombreDestino ?? null),
      origen_bodega: esInterno ? (nombreBodegaOrigen ?? null) : null,
    })

    await db.detalle_traslado.bulkAdd(
      renglones.map((r) => ({
        id: nuevoUuid(),
        id_traslado: idTraslado,
        id_producto: r.id_producto,
        cantidad_enviada: r.cantidad,
        // interno auto-aceptado: lo enviado ya llegó (no hay recepción aparte)
        cantidad_recibida: esInterno ? r.cantidad : null,
        id_precio_producto: r.id_precio_producto,
        factor: r.factor,
      })),
    )

    // el servidor resuelve el factor desde precio_producto (nunca confiar en el
    // cliente): solo viaja id_precio_producto cuando existe tier.
    // multibodega Task 8: los traslados internos NO se encolan (100% locales).
    let idEvento = null
    if (!esInterno) {
      idEvento = await encolarOperacion({
        tabla: 'traslados',
        operacion: 'INSERT',
        id: idTraslado,
        idSucursal: idSucursalOrigen,
        datos: {
          rpc: 'registrar_traslado',
          params: {
            p_id_sucursal_origen: idSucursalOrigen,
            p_id_sucursal_destino: idSucursalDestino,
            p_id_usuario: idUsuario ?? null,
            p_lineas: renglones.map((r) => ({
              id_producto: r.id_producto,
              cantidad: r.cantidad,
              ...(r.id_precio_producto ? { id_precio_producto: r.id_precio_producto } : {}),
            })),
          },
        },
      })
    }

    avisarTraslados()
    return { idTraslado, idEvento }
  })
}

/**
 * Aceptación local atómica (RF-T3): la sucursal destino verifica lo que llegó.
 * `lineas` lleva la cantidad REAL recibida por producto (0 = no llegó); lo que no
 * viaje en `lineas` cuenta como 0 (misma regla que el RPC). El stock destino suma
 * solo lo recibido y el origen recupera `enviada - recibida`. Todo en UNA
 * transacción + evento `PENDING` (se acepta también sin red, Art. II).
 *
 * @param {object} p
 * @param {string} p.idTraslado
 * @param {string} p.idSucursal - debe ser la sucursal DESTINO del traslado
 * @param {string|null} [p.idUsuario]
 * @param {Array} p.lineas - ({id_producto, id_precio_producto?, cantidad_recibida})
 *   entero ≥ 0, en la unidad de la línea enviada; el stock destino suma
 *   recibida × factor. Se empareja por (id_producto, id_precio_producto):
 *   mismo producto en dos unidades son dos líneas distintas.
 * @returns {Promise<{idTraslado: string, estado: 'recibido'|'recibido_parcial'}>}
 */
export async function aceptarTrasladoLocal({ idTraslado, idSucursal, idUsuario, lineas }) {
  if (!idTraslado) throw new Error('Traslado inválido')
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (!Array.isArray(lineas)) throw new Error('Las líneas a recibir son obligatorias')

  // Pre-leer para saber si es interno (define tablas del tx)
  const preTraslado = await db.traslados.get(idTraslado)
  if (!preTraslado) throw new Error('Traslado no encontrado')
  const esInterno = preTraslado.tipo === 'interno'

  const tablas = [
    db.productos,
    db.productos_sucursal,
    db.traslados,
    db.detalle_traslado,
    db.cola_sincronizacion,
  ]
  // multibodega: stock_bodega si la transferencia maneja stock por bodega
  if (esInterno || preTraslado.id_bodega_origen || preTraslado.id_bodega_destino) {
    tablas.push(db.stock_bodega)
  }

  return db.transaction('rw', tablas, async () => {
    const traslado = await db.traslados.get(idTraslado)
    if (!traslado) throw new Error('Traslado no encontrado')
    if (traslado.id_sucursal_destino !== idSucursal) {
      throw new Error('Esta sucursal no es la destino del traslado')
    }
    if (traslado.estado !== 'enviado') {
      throw new Error(`El traslado ya fue ${traslado.estado}`)
    }

    const recibidas = new Map()
    for (const l of lineas) {
      if (!Number.isInteger(l.cantidad_recibida) || l.cantidad_recibida < 0) {
        throw new Error('Cantidad recibida inválida')
      }
      recibidas.set(claveLinea(l), l.cantidad_recibida)
    }

    const detalles = await db.detalle_traslado.where('id_traslado').equals(idTraslado).toArray()
    if (!detalles.length) throw new Error('El traslado no tiene líneas')

    let faltantes = 0

    for (const d of detalles) {
      const factor = d.factor || 1
      const recibida = recibidas.get(claveLinea(d)) ?? 0
      if (recibida > d.cantidad_enviada) {
        const producto = await db.productos.get(d.id_producto)
        throw new Error(
          `La cantidad recibida (${recibida}) no puede superar la enviada (${d.cantidad_enviada}) de ${producto?.name || d.id_producto}`,
        )
      }

      await db.detalle_traslado.update(d.id, { cantidad_recibida: recibida })

      // stock destino: solo lo que llegó, convertido a base (× factor del tier)
      // multibodega Task 8: en interno se mueve stock_bodega, no productos_sucursal
      if (recibida > 0) {
        if (esInterno) {
          const rowDestino = await db.stock_bodega.get({
            id_bodega: traslado.id_bodega_destino,
            id_producto: d.id_producto,
          })
          if (rowDestino) {
            await db.stock_bodega.put({
              ...rowDestino,
              stock: rowDestino.stock + recibida * factor,
            })
          } else {
            await db.stock_bodega.add({
              id_bodega: traslado.id_bodega_destino,
              id_producto: d.id_producto,
              stock: recibida * factor,
            })
          }
        } else {
          const rowDestino = await db.productos_sucursal.get([
            traslado.id_sucursal_destino,
            d.id_producto,
          ])
          if (!rowDestino) {
            throw new Error(
              `El producto ${d.id_producto} no está habilitado en la sucursal destino`,
            )
          }
          await db.productos_sucursal.put({
            ...rowDestino,
            stock: rowDestino.stock + recibida * factor,
          })
        }
      }

      // origen recupera lo que no llegó (si su fila no existe se omite, como en el RPC).
      // multibodega: si la transferencia tiene bodega origen, se devuelve a stock_bodega.
      const diferencia = d.cantidad_enviada - recibida
      if (diferencia > 0) {
        if (traslado.id_bodega_origen) {
          const rowOrigen = await db.stock_bodega.get({
            id_bodega: traslado.id_bodega_origen,
            id_producto: d.id_producto,
          })
          if (rowOrigen) {
            await db.stock_bodega.put({
              ...rowOrigen,
              stock: rowOrigen.stock + diferencia * factor,
            })
          }
        } else {
          const rowOrigen = await db.productos_sucursal.get([
            traslado.id_sucursal_origen,
            d.id_producto,
          ])
          if (rowOrigen) {
            await db.productos_sucursal.put({
              ...rowOrigen,
              stock: rowOrigen.stock + diferencia * factor,
            })
          }
        }
      }

      if (recibida < d.cantidad_enviada) faltantes++
    }

    const estado = faltantes === 0 ? 'recibido' : 'recibido_parcial'

    await db.traslados.update(idTraslado, {
      estado,
      id_usuario_receptor: idUsuario ?? null,
      fecha_recepcion: new Date().toISOString(),
      sync_status: esInterno ? 'SYNCED' : 'PENDING',
    })

    // el RPC recibe TODAS las líneas con su recibida final (las omitidas = 0),
    // emparejadas por (id_producto, id_precio_producto) como en el detalle.
    // multibodega Task 8: los internos NO se encolan (100% locales).
    let idEvento = null
    if (!esInterno) {
      const parametros = detalles.map((d) => ({
        id_producto: d.id_producto,
        cantidad_recibida: recibidas.get(claveLinea(d)) ?? 0,
        ...(d.id_precio_producto ? { id_precio_producto: d.id_precio_producto } : {}),
      }))

      idEvento = await encolarOperacion({
        tabla: 'traslados',
        operacion: 'UPDATE',
        id: idTraslado,
        idSucursal,
        datos: {
          rpc: 'aceptar_traslado',
          params: {
            p_id_traslado: idTraslado,
            p_id_sucursal: idSucursal,
            p_id_usuario: idUsuario ?? null,
            p_lineas: parametros,
          },
        },
      })
    }

    avisarTraslados()
    return { idTraslado, estado, idEvento }
  })
}

/**
 * Anulación (RF-T2/T4): solo la sucursal origen, solo estado `enviado`, solo con
 * red y fila `SYNCED` (patrón ComprasPage: un traslado aún `PENDING` no existe en
 * el servidor). Llama al RPC directamente y revierte el stock local en la misma
 * transacción que cambia el estado.
 *
 * @param {object} p
 * @param {string} p.idTraslado
 * @param {string} p.idSucursal - debe ser la sucursal ORIGEN del traslado
 * @param {string|null} [p.idUsuario]
 * @param {string} p.motivo
 * @returns {Promise<{idTraslado: string, estado: 'anulado'}>}
 */
export async function anularTrasladoLocal({ idTraslado, idSucursal, idUsuario, motivo }) {
  if (!idTraslado) throw new Error('Traslado inválido')
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (!motivo || !String(motivo).trim()) throw new Error('El motivo es obligatorio')

  const traslado = await db.traslados.get(idTraslado)
  if (!traslado) throw new Error('Traslado no encontrado')
  if (traslado.id_sucursal_origen !== idSucursal) {
    throw new Error('Solo la sucursal origen puede anular el traslado')
  }
  // multibodega Task 8/13: los traslados internos se anulan 100% local (sin red,
  // sin RPC). Se aplican al instante (auto-aceptados: nacen 'recibido'), por lo
  // que la anulación revierte AMBOS lados —origen recupera lo enviado y destino
  // pierde lo recibido— en la misma transacción.
  if (traslado.tipo === 'interno') {
    if (traslado.estado === 'anulado') {
      throw new Error('El traslado ya está anulado')
    }
    await db.transaction('rw', [db.stock_bodega, db.traslados, db.detalle_traslado], async () => {
      const detalles = await db.detalle_traslado.where('id_traslado').equals(idTraslado).toArray()
      for (const d of detalles) {
        const factor = d.factor || 1
        const rowOrigen = await db.stock_bodega.get({
          id_bodega: traslado.id_bodega_origen,
          id_producto: d.id_producto,
        })
        if (rowOrigen) {
          await db.stock_bodega.put({
            ...rowOrigen,
            stock: rowOrigen.stock + d.cantidad_enviada * factor,
          })
        }
        const recibida = (d.cantidad_recibida ?? 0) * factor
        if (recibida > 0) {
          const rowDestino = await db.stock_bodega.get({
            id_bodega: traslado.id_bodega_destino,
            id_producto: d.id_producto,
          })
          if (rowDestino) {
            await db.stock_bodega.put({
              ...rowDestino,
              stock: Math.max(0, rowDestino.stock - recibida),
            })
          }
        }
      }
      await db.traslados.update(idTraslado, {
        estado: 'anulado',
        motivo_anulacion: String(motivo).trim(),
        id_usuario_anula: idUsuario ?? null,
        fecha_anulacion: new Date().toISOString(),
      })
    })
    avisarTraslados()
    return { idTraslado, estado: 'anulado' }
  }

  if (traslado.estado !== 'enviado') {
    throw new Error(`El traslado ya fue ${traslado.estado} y no puede anularse`)
  }

  if (traslado.sync_status !== 'SYNCED') {
    throw new Error('El traslado aún no existe en el servidor, no puede anularse')
  }
  if (!hayRed()) throw new Error('Se requiere conexión para anular un traslado')

  const { error } = await supabase.rpc('anular_traslado', {
    p_id_traslado: idTraslado,
    p_id_sucursal: idSucursal,
    p_id_usuario: idUsuario ?? null,
    p_motivo: String(motivo).trim(),
  })
  if (error) throw new Error(error.message || String(error))

  await db.transaction(
    'rw',
    [db.productos_sucursal, db.traslados, db.detalle_traslado],
    async () => {
      const detalles = await db.detalle_traslado.where('id_traslado').equals(idTraslado).toArray()
      for (const d of detalles) {
        const row = await db.productos_sucursal.get([traslado.id_sucursal_origen, d.id_producto])
        if (row) {
          await db.productos_sucursal.put({
            ...row,
            stock: row.stock + d.cantidad_enviada * (d.factor || 1),
          })
        }
      }
      await db.traslados.update(idTraslado, {
        estado: 'anulado',
        motivo_anulacion: String(motivo).trim(),
        id_usuario_anula: idUsuario ?? null,
        fecha_anulacion: new Date().toISOString(),
      })
    },
  )

  avisarTraslados()
  return { idTraslado, estado: 'anulado' }
}

/**
 * Listado local (RF-T6): espejo de la forma {traslados, total} de `get_traslados`,
 * filtrado por sucursal y dirección, con las líneas enlazadas al catálogo local.
 *
 * @param {object} p
 * @param {string} p.idSucursal
 * @param {'enviados'|'recibidos'} p.direccion
 * @param {string} [p.busqueda]
 * @param {string} [p.estado]
 * @param {number} [p.limite]
 * @param {number} [p.offset]
 * @returns {Promise<{traslados: Array, total: number}>}
 */
export async function listarTrasladosLocal({
  idSucursal,
  direccion,
  busqueda,
  estado,
  limite = 50,
  offset = 0,
} = {}) {
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (direccion !== 'enviados' && direccion !== 'recibidos') {
    throw new Error("La dirección debe ser 'enviados' o 'recibidos'")
  }

  const indice = direccion === 'enviados' ? 'id_sucursal_origen' : 'id_sucursal_destino'
  // multibodega Task 8: los internos tienen origen = destino = mi sucursal,
  // por lo que en "recibidos" se excluirían (solo aparecen en "enviados").
  const filas = (await db.traslados.where(indice).equals(idSucursal).toArray()).filter(
    (f) => direccion === 'enviados' || f.tipo !== 'interno',
  )

  const ids = filas.map((f) => f.id)
  const detalles = ids.length
    ? await db.detalle_traslado.where('id_traslado').anyOf(ids).toArray()
    : []
  const idsProductos = [...new Set(detalles.map((d) => d.id_producto))]
  const productos = idsProductos.length ? await db.productos.bulkGet(idsProductos) : []
  const productoMap = new Map(productos.filter(Boolean).map((p) => [p.id, p]))
  const nombres = new Map(productos.filter(Boolean).map((p) => [p.id, p.name]))
  const unidades = await db.unidades.toArray()
  const unidadMap = new Map(unidades.map((u) => [u.id, u.name]))
  const texto = String(busqueda || '')
    .toLowerCase()
    .trim()

  const filtradas = filas
    .filter((f) => {
      if (estado && f.estado !== estado) return false
      if (texto) {
        const lineas = detalles
          .filter((d) => d.id_traslado === f.id)
          .map((d) => nombres.get(d.id_producto) || '')
          .join(' ')
        const contexto = `${f.origen || ''} ${f.destino || ''} ${f.usuario || ''} ${lineas}`
        if (!contexto.toLowerCase().includes(texto)) return false
      }
      return true
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))

  const desde = Math.max(0, offset)
  const tam = Math.max(1, limite)

  return {
    traslados: filtradas.slice(desde, desde + tam).map((f) => ({
      ...f,
      lineas: detalles
        .filter((d) => d.id_traslado === f.id)
        .map((d) => {
          const producto = productoMap.get(d.id_producto)
          const tier = (producto?.precios || []).find((t) => t.id === d.id_precio_producto)
          const factor = d.factor ?? tier?.factor ?? 1
          const unidad =
            d.unidad ?? (tier?.id_unidad_venta ? unidadMap.get(tier.id_unidad_venta) : null) ?? null
          return {
            ...d,
            factor,
            unidad,
            producto: nombres.get(d.id_producto) || null,
          }
        })
        .sort((a, b) => String(a.producto).localeCompare(String(b.producto))),
    })),
    total: filtradas.length,
  }
}

/**
 * Refresca el espejo local desde el servidor (RF-T6): `get_traslados` en ambas
 * direcciones. Solo con red (guard `hayRed()`); lo que quede `PENDING`/`CONFLICT`
 * local NO se pisa (la cola aún debe subirlo, mismo criterio de fusión de Compras).
 * Actualiza cabeceras y líneas de las filas servidoriales; nunca borra filas locales.
 *
 * @param {{idSucursal: string}} p
 * @returns {Promise<{enviados: number, recibidos: number}>}
 */
export async function refrescarTraslados({ idSucursal }) {
  if (!idSucursal) throw new Error('Sucursal inválida')
  if (!hayRed()) return { enviados: 0, recibidos: 0 }

  const resultado = { enviados: 0, recibidos: 0 }

  for (const direccion of ['enviados', 'recibidos']) {
    const { data, error } = await supabase.rpc('get_traslados', {
      p_id_sucursal: idSucursal,
      p_direccion: direccion,
      p_busqueda: null,
      p_limite: 200,
      p_offset: 0,
    })
    if (error) throw new Error(error.message || String(error))

    const filas = data?.traslados || []
    resultado[direccion] = filas.length

    await db.transaction('rw', [db.traslados, db.detalle_traslado], async () => {
      for (const fila of filas) {
        const local = await db.traslados.get(fila.id)
        if (local && (local.sync_status === 'PENDING' || local.sync_status === 'CONFLICT')) {
          continue // la cola aún debe subir este cambio local: no pisar
        }
        await db.traslados.put({
          ...(local || {}),
          ...fila,
          sync_status: 'SYNCED',
        })
        const locales = await db.detalle_traslado.where('id_traslado').equals(fila.id).toArray()
        if (locales.length) await db.detalle_traslado.bulkDelete(locales.map((d) => d.id))
        await db.detalle_traslado.bulkAdd(
          (fila.lineas || []).map((l) => ({
            id: l.id,
            id_traslado: fila.id,
            id_producto: l.id_producto,
            cantidad_enviada: l.cantidad_enviada,
            cantidad_recibida: l.cantidad_recibida ?? null,
            id_precio_producto: l.id_precio_producto ?? null,
            factor: l.factor ?? 1,
            unidad: l.unidad ?? null,
          })),
        )
      }
    })
  }

  avisarTraslados()
  return resultado
}

/**
 * Campanita (RF-T5): traslados recibidos aún en estado `enviado` para la sucursal
 * del dispositivo, leídos del espejo local (funciona sin red).
 *
 * @param {string} idSucursal
 * @returns {Promise<number>}
 */
export async function contarTrasladosPendientes(idSucursal) {
  if (!idSucursal) return 0
  return db.traslados
    .where('id_sucursal_destino')
    .equals(idSucursal)
    .and((f) => f.estado === 'enviado' && f.tipo !== 'interno')
    .count()
}

let monitorTrasladosIniciado = false

/**
 * Monitor del espejo (RF-T5, Task 6): patrón `iniciarGestorCotizacionesOffline`
 * — refresco al iniciar + listener `online`. Idempotente. Cada refresco termina
 * emitiendo `traslados-actualizados` (lo que reconta la campanita). Al arrancar
 * la app la primera pantalla es el login y aún no hay sesión: en ese caso no se
 * hace nada y la propia campanita refresca al montar (solo existe con sesión).
 */
export function iniciarMonitorTraslados() {
  if (monitorTrasladosIniciado) return
  monitorTrasladosIniciado = true

  const refrescar = () => {
    try {
      const usuario = JSON.parse(localStorage.getItem('currentUser') || 'null')
      if (!usuario?.id_sucursal) return // sin sesión todavía
      refrescarTraslados({ idSucursal: usuario.id_sucursal }).catch((err) =>
        console.warn('Refresco de traslados pospuesto:', err),
      )
    } catch {
      // sin localStorage (entorno no-DOM) no hay espejo que refrescar
    }
  }

  refrescar()
  window.addEventListener('online', refrescar)
}
