import { db } from '../lib/db'
import { supabase } from '../lib/supabase'

/**
 * Cola de sincronización (Offline-First Fase 2, Tarea 2.1).
 * Toda operación local que DEBE llegar al servidor (venta, ajuste de stock, …)
 * deja aquí su evento con sync_status='PENDING' como parte de la misma transacción
 * que escribe el registro. La hidratación del catálogo NO se encola: es una copia
 * de lectura que el servidor ya posee.
 */

/**
 * Registra un evento pendiente de sincronizar.
 * Pensado para llamarse DENTRO de la db.transaction que hace el cambio local,
 * así el registro y su evento se confirman (o revierten) juntos.
 *
 * @param {object} p
 * @param {string} p.tabla - tabla destino en Supabase ('ventas', 'productos_sucursal', …)
 * @param {string} p.operacion - 'INSERT' | 'UPDATE' | 'DELETE'
 * @param {string} p.id - id del registro afectado
 * @param {string} p.idSucursal - sucursal de origen (aislamiento multisucursal)
 * @param {object} [p.datos] - payload para reproducir la operación al sincronizar
 * @returns {Promise<number>} clave autoincremental del evento en la cola
 */
export async function encolarOperacion({ tabla, operacion, id, idSucursal, datos = null }) {
  if (!tabla || !operacion || !idSucursal) {
    throw new Error('encolarOperacion: tabla, operacion e idSucursal son obligatorios')
  }

  return db.cola_sincronizacion.add({
    tabla,
    operacion,
    id_registro: id ?? null,
    id_sucursal: idSucursal,
    datos,
    sync_status: 'PENDING',
    intentos: 0,
    timestamp: Date.now(),
  })
}

/** Cantidad de eventos con sync_status='PENDING' (indicador de UI + motor de sync). */
export function contarPendientes() {
  return db.cola_sincronizacion.where('sync_status').equals('PENDING').count()
}

/**
 * Clasifica un fallo de sincronización (Tarea 2.3).
 * - 'red': error de transporte (sin internet, timeout, 5xx) → se reintenta.
 * - 'negocio': el servidor rechazó la operación (RPC/stock/FK/permisos) → CONFLICT.
 * Exportado para que otras sincronizaciones (cotizaciones offline) usen la misma regla.
 */
export function clasificarFallo(err) {
  const msg = String(err?.message || err || '')
  if (
    err instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed|timeout|timed out|err_internet|err_connection/i.test(
      msg,
    )
  ) {
    return 'red'
  }
  const status = Number(err?.status)
  if (Number.isFinite(status) && status >= 500) return 'red'
  return 'negocio'
}

/**
 * Task 6 / RF-C4: la venta emitida en el servidor deja su fila en `comprobante`
 * (tipo `nota_venta`, estado `emitido`, `numero` = folio que muestra la UI).
 * Se llama recién cuando el RPC de venta ya respondió, así el FK al servidor es
 * válido. Fire-and-forget: un fallo aquí jamás afecta a la venta.
 * @param {string} idVenta - id que generó el servidor
 * @param {string} idSucursal
 */
function guardarComprobanteVentaServidor(idVenta, idSucursal) {
  const numero = String(idVenta).slice(0, 8).toUpperCase()
  Promise.resolve(
    supabase.rpc('guardar_comprobante', {
      p_id_venta: idVenta,
      p_id_sucursal: idSucursal || null,
      p_tipo: 'nota_venta',
      p_numero: numero,
      p_estado: 'emitido',
    }),
  )
    .then((r) => {
      if (r?.error) {
        console.warn('No se registró el comprobante de la venta:', r.error.message)
        return
      }
      // `comprobante` tiene RLS (anon no puede leerlo): el evento es la única
      // evidencia observable del registro (mismo patrón que `id-remapeado`).
      try {
        window.dispatchEvent(
          new CustomEvent('comprobante-registrado', {
            detail: {
              id_venta: r?.data?.id_venta ?? idVenta,
              id_comprobante: r?.data?.id_comprobante ?? null,
              estado: r?.data?.estado ?? 'emitido',
              numero,
            },
          }),
        )
      } catch {
        // sin window (entorno no-DOM) no hay UI que notificar
      }
    })
    .catch((e) => console.warn('No se registró el comprobante de la venta:', e))
}

/**
 * Reemplaza el id local de una venta/pendiente por el id que generó el servidor
 * (los RPCs `registrar_venta`/`registrar_pendiente` crean su propio id).
 * Actualiza la fila local, sus detalles y el vínculo `pos_pendiente_*` si lo había.
 */
async function remapearIdLocal(idViejo, idNuevo, idSucursal) {
  if (!idViejo || !idNuevo || idViejo === idNuevo) return
  await db.transaction('rw', db.ventas, db.detalle_venta, async () => {
    const v = await db.ventas.get(idViejo)
    if (!v) return // el registro fue consumido/eliminado mientras sync-eaba
    await db.ventas.delete(idViejo)
    await db.ventas.put({ ...v, id: idNuevo })
    const dets = await db.detalle_venta.where('id_venta').equals(idViejo).toArray()
    if (dets.length) {
      await db.detalle_venta.bulkPut(dets.map((d) => ({ ...d, id_venta: idNuevo })))
    }
  })
  try {
    const key = `pos_pendiente_${idSucursal || 'default'}`
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) === idViejo) {
      localStorage.setItem(key, idNuevo)
    }
  } catch {
    // localStorage no disponible (no bloquea la sync)
  }
}

/**
 * Reemplaza el id local de una compra por el id que generó el servidor
 * (`registrar_compra` crea su propio id) y deja su fila `SYNCED`: el detalle
 * y el comprobante espejo acompañan al nuevo id (el FK del servidor exige el
 * id real). Sin rekey solo marca la fila como sincronizada.
 */
async function remapearCompraLocal(idViejo, idNuevo) {
  const destino = idNuevo || idViejo
  const rekey = destino !== idViejo
  await db.transaction('rw', db.compras, db.detalle_compra, db.comprobante_cache, async () => {
    if (rekey) {
      const c = await db.compras.get(idViejo)
      if (c) {
        await db.compras.delete(idViejo)
        await db.compras.put({ ...c, id: destino, sync_status: 'SYNCED' })
      }
      const dets = await db.detalle_compra.where('id_compra').equals(idViejo).toArray()
      if (dets.length) {
        await db.detalle_compra.bulkPut(dets.map((d) => ({ ...d, id_compra: destino })))
      }
      const comps = await db.comprobante_cache.where('id_compra').equals(idViejo).toArray()
      if (comps.length) {
        await db.comprobante_cache.bulkPut(comps.map((m) => ({ ...m, id_compra: destino })))
      }
    } else {
      await db.compras.update(idViejo, { sync_status: 'SYNCED' })
    }
  })
}

/**
 * Reemplaza el id local de una entrada por el id que generó el servidor
 * (`registrar_entrada` crea su propio id) y deja su fila `SYNCED`.
 */
async function remapearEntradaLocal(idViejo, idNuevo) {
  const destino = idNuevo || idViejo
  if (destino === idViejo) {
    await db.entradas.update(idViejo, { sync_status: 'SYNCED' })
    return
  }
  await db.transaction('rw', db.entradas, async () => {
    const e = await db.entradas.get(idViejo)
    if (!e) return // la entrada fue consumida/eliminada mientras sync-eaba
    await db.entradas.delete(idViejo)
    await db.entradas.put({ ...e, id: destino, sync_status: 'SYNCED' })
  })
}

/**
 * Reemplaza el id local de un traslado por el id del servidor (`registrar_traslado`
 * crea su propio id) y deja su fila SYNCED; el detalle acompaña a la cabecera.
 * Si el id no cambia (`aceptar_traslado`/`anular_traslado`) solo marca SYNCED.
 */
async function remapearTrasladoLocal(idViejo, idNuevo) {
  const destino = idNuevo || idViejo
  const rekey = destino !== idViejo
  await db.transaction('rw', db.traslados, db.detalle_traslado, async () => {
    const t = await db.traslados.get(idViejo)
    if (t && rekey) {
      await db.traslados.delete(idViejo)
      await db.traslados.put({ ...t, id: destino, sync_status: 'SYNCED' })
      const dets = await db.detalle_traslado.where('id_traslado').equals(idViejo).toArray()
      if (dets.length) {
        await db.detalle_traslado.bulkPut(dets.map((d) => ({ ...d, id_traslado: destino })))
      }
    } else if (t) {
      await db.traslados.update(idViejo, { sync_status: 'SYNCED' })
    } else {
      // la cabecera local ya no existe: igual deja SYNCED la fila remapeada
      await db.traslados.update(destino, { sync_status: 'SYNCED' })
    }
  })
}

/**
 * Tras remapear un traslado, re-apunta los eventos PENDING posteriores de
 * `tabla='traslados'` que referencien el id local (cabecera o
 * `params.p_id_traslado`) al id del servidor. Sin esto, `aceptar_traslado`
 * se enviaría con un id inexistente → rechazo de negocio → CONFLICT falso
 * (diseño anticipado en specs/traslados-movimientos.md §4, nota Task 8).
 */
async function reapuntarEventosTraslados(idEventoOrigen, idViejo, idNuevo) {
  if (!idViejo || !idNuevo || idViejo === idNuevo) return
  const eventos = await db.cola_sincronizacion
    .where('tabla')
    .equals('traslados')
    .filter((e) => e.id !== idEventoOrigen && e.sync_status === 'PENDING')
    .toArray()
  for (const e of eventos) {
    const coincide =
      e.id_registro === idViejo || (e.datos && e.datos.params?.p_id_traslado === idViejo)
    if (!coincide) continue
    const datos = { ...(e.datos || {}) }
    if (datos.params && datos.params.p_id_traslado === idViejo) {
      datos.params = { ...datos.params, p_id_traslado: idNuevo }
    }
    await db.cola_sincronizacion.update(e.id, {
      id_registro: e.id_registro === idViejo ? idNuevo : e.id_registro,
      datos,
    })
  }
}

/** RPCs que este motor sabe reproducir, agrupados por tabla destino (Task 7). */
/** La lista de Compras/Entradas se refresca cuando un evento de su tabla cambia. */
function avisarLista(tabla) {
  try {
    window.dispatchEvent(new CustomEvent('cola-sincronizada', { detail: { tabla } }))
  } catch {
    // sin window (entorno no-DOM) no hay UI que notificar
  }
}

const RPCS_POR_TABLA = {
  ventas: ['registrar_venta', 'registrar_pendiente', 'eliminar_venta_pendiente'],
  compras: ['registrar_compra'],
  entradas: ['registrar_entrada'],
  traslados: ['registrar_traslado', 'aceptar_traslado', 'anular_traslado'],
}

/**
 * Push inmediato de un evento recién encolado (Tarea 2.2) y replay que usa el
 * motor de sincronización (Tarea 2.3). Reproduce el payload en Supabase
 * despachando por `datos.rpc` (default 'registrar_venta' para eventos 2.2).
 * - Éxito → 'SYNCED' + remapeo del id local al id del servidor.
 * - Fallo de red → sigue 'PENDING' con intentos/ultimo_error (reintento futuro).
 * - Rechazo de negocio del RPC → 'CONFLICT' (reintentar no lo arregla).
 * Nunca lanza: es fire-and-forget.
 *
 * @param {number} idEvento - clave del evento en la cola
 * @returns {Promise<{ok: boolean, motivo?: string, data?: object}>}
 *   motivo: 'no-pendiente' | 'no-soportado' | 'en-vuelo' | 'sin-red' | 'conflict'
 */
export async function sincronizarEvento(idEvento) {
  const ev = await db.cola_sincronizacion.get(idEvento)
  if (!ev || ev.sync_status !== 'PENDING') return { ok: false, motivo: 'no-pendiente' }
  const datos = ev.datos || {}
  const rpc = datos.rpc || 'registrar_venta'
  if (!RPCS_POR_TABLA[ev.tabla]?.includes(rpc)) {
    return { ok: false, motivo: 'no-soportado' }
  }
  if (rpc === 'registrar_venta' && ev.operacion !== 'INSERT') {
    return { ok: false, motivo: 'no-soportado' }
  }
  // Guarda contra doble envío (push inmediato + motor 2.3 en paralelo)
  if (ev.en_vuelo && Date.now() - ev.en_vuelo < 30000) return { ok: false, motivo: 'en-vuelo' }
  await db.cola_sincronizacion.update(ev.id, { en_vuelo: Date.now() })

  try {
    let data

    if (rpc === 'registrar_venta') {
      // compat con eventos de la Tarea 2.2
      const params = { ...(datos.params || {}) }

      // Compat con eventos viejos (antes del modelo por sucursal v2): el
      // nombre casual viajaba en datos.cliente_nombre. NUNCA se hace upsert
      // aquí (el upsert a ciegas por nombre mezclaba homónimos de toda la
      // empresa): el nombre viaja como p_cliente_nombre en la misma venta.
      if (!params.p_cliente_nombre && datos.cliente_nombre) {
        params.p_cliente_nombre = datos.cliente_nombre
      }

      const { data: rData, error } = await supabase.rpc('registrar_venta', params)
      if (error) throw error
      data = rData
    } else {
      // registrar_pendiente | eliminar_venta_pendiente | registrar_compra |
      // registrar_entrada: los params ya vienen armados en el evento (Task 3)
      const { data: rData, error } = await supabase.rpc(rpc, { ...(datos.params || {}) })
      if (error) throw error
      data = rData
    }

    // El RPC genera su id (probe: {id_traslado|id_venta|id_compra|id_entrada, …}):
    // el espejo local lo adopta y su fila queda SYNCED (para que la lista con red
    // no duplique)
    const idServidor =
      data?.id_traslado ?? data?.id_venta ?? data?.id_compra ?? data?.id_entrada ?? data?.id ?? null
    if (ev.tabla === 'compras') {
      await remapearCompraLocal(ev.id_registro, idServidor)
    } else if (ev.tabla === 'entradas') {
      await remapearEntradaLocal(ev.id_registro, idServidor)
    } else if (ev.tabla === 'traslados') {
      if (idServidor && idServidor !== ev.id_registro) {
        // creación remapeada: la cabecera + detalle toman el id del servidor y
        // los eventos PENDING posteriores (aceptar/anular) se re-apuntan
        await remapearTrasladoLocal(ev.id_registro, idServidor)
        await reapuntarEventosTraslados(ev.id, ev.id_registro, idServidor)
      } else {
        // aceptación/anulación (mismo id): solo deja la fila SYNCED
        await db.traslados.update(ev.id_registro, { sync_status: 'SYNCED' })
      }
    } else if (idServidor && idServidor !== ev.id_registro) {
      await remapearIdLocal(ev.id_registro, idServidor, ev.id_sucursal)
      // La UI (modal de resultado/comprobante) puede seguir el id viejo (Tarea 2.6)
      try {
        window.dispatchEvent(
          new CustomEvent('id-remapeado', {
            detail: { idViejo: ev.id_registro, idNuevo: idServidor, id_sucursal: ev.id_sucursal },
          }),
        )
      } catch {
        // sin window (entorno no-DOM) no hay UI que notificar
      }
    }

    await db.cola_sincronizacion.update(ev.id, {
      sync_status: 'SYNCED',
      intentos: ev.intentos + 1,
      respuesta: data || null,
      sincronizado_en: Date.now(),
      en_vuelo: null,
      // limpiar el fallo de red anterior: en un evento SYNCED solo confunde
      ultimo_error: null,
      id_registro: idServidor || ev.id_registro,
    })

    // Task 7/8: la lista de Compras/Entradas/Traslados refresca al confirmarse
    // su fila (UI escucha `cola-sincronizada`)
    if (ev.tabla === 'compras' || ev.tabla === 'entradas' || ev.tabla === 'traslados') {
      avisarLista(ev.tabla)
    }

    // Task 6 / RF-C4: con la venta confirmada en el servidor se registra su
    // comprobante (también cubre ventas offline que sincronizan después vía
    // el motor de la Tarea 2.3, que reutiliza esta misma función).
    if (rpc === 'registrar_venta' && idServidor) {
      guardarComprobanteVentaServidor(idServidor, ev.id_sucursal)
    }

    // El pendiente fue eliminado mientras su creación estaba en vuelo:
    // confirmada la creación, se borra en servidor lo recién creado.
    if (rpc === 'registrar_pendiente') {
      const post = await db.cola_sincronizacion.get(ev.id)
      if (post?.cancelar) {
        const idCreado = idServidor || ev.id_registro
        try {
          const { error: errD } = await supabase.rpc('eliminar_venta_pendiente', {
            p_id: idCreado,
            p_id_sucursal: ev.id_sucursal,
          })
          if (errD) throw errD
          await db.cola_sincronizacion.update(ev.id, { cancelado: true })
        } catch {
          // No pudo borrarse ahora: deja un DELETE reintentable por el motor
          await encolarOperacion({
            tabla: 'ventas',
            operacion: 'DELETE',
            id: idCreado,
            idSucursal: ev.id_sucursal,
            datos: {
              rpc: 'eliminar_venta_pendiente',
              params: { p_id: idCreado, p_id_sucursal: ev.id_sucursal },
            },
          })
        }
      }
    }

    return { ok: true, data }
  } catch (err) {
    const motivo = String(err?.message || err)
    const esRed = clasificarFallo(err) === 'red'
    await db.cola_sincronizacion
      .update(ev.id, {
        // Red: sigue PENDING y se reintenta. Negocio: CONFLICT terminal.
        sync_status: esRed ? 'PENDING' : 'CONFLICT',
        intentos: ev.intentos + 1,
        ultimo_error: motivo,
        en_vuelo: null,
      })
      .catch(() => {})
    // Task 7 / RF-C3 / RF-T2: el rechazo de negocio también se refleja en la
    // fila local (la lista con red la muestra como conflicto en vez de
    // duplicarla u ocultarla)
    if (!esRed) {
      const store =
        ev.tabla === 'compras'
          ? db.compras
          : ev.tabla === 'entradas'
            ? db.entradas
            : ev.tabla === 'traslados'
              ? db.traslados
              : null
      if (store) {
        await store.update(ev.id_registro, { sync_status: 'CONFLICT', ultimo_error: motivo })
        // y la lista refresca también aquí: si el CONFLICT es el último evento
        // de la ronda, sin este aviso la UI se quedaría con el estado previo
        if (ev.tabla === 'compras' || ev.tabla === 'entradas' || ev.tabla === 'traslados') {
          avisarLista(ev.tabla)
        }
      }
    }
    return { ok: false, motivo: esRed ? 'sin-red' : 'conflict' }
  }
}
