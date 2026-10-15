/**
 * E2E de sincronización de Traslados — Task 8 (RF-T2 + §4 de la spec). Requiere
 * el dev server en :3000 (`npm start`). Corre como **alex / Ferromax** (USUARIO=
 * ... CLAVE=... lo sobreescribe). Flujo:
 *  A) envío OFFLINE (`registrarTrasladoLocal`) → red → `procesarCola()` → evento
 *     SYNCED, fila con id remapeado al del servidor, detalle repuntado, 1 fila
 *     nueva en servidor y 0 duplicados en el espejo tras el fuse.
 *  B) creación OFFLINE + evento `aceptar_traslado` OFFLINE con el MISMO id local
 *     (dos eventos en cola) → sync → el segundo se RE-APUNTA al id del servidor
 *     (diseño §4): ambos SYNCED, estado `recibido` en servidor, 0 CONFLICT falso.
 *  C) creación OFFLINE con el evento parcheado a 99999 unidades (stock del
 *     servidor insuficiente) → rechazo de negocio → evento y fila en CONFLICT
 *     con motivo, badge «conflicto» visible en la UI.
 * finally: anula el envío (revierte stock), borra filas/eventos de la prueba y
 * restaura el stock local a la línea base (contando solo sus propios cambios).
 * Los polls se hacen SIEMPRE por id de evento (autoincrement, estable): los ids
 * de traslado viejos desaparecen al remapear.
 */
const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')
const { Select } = require('selenium-webdriver/lib/select')

const BASE = 'http://localhost:3000'
const SUPA = 'https://qgsiysbslwurjyjocfii.supabase.co/rest/v1'
const KEY = 'sb_publishable_UzTuJoa-XqBWNg_mYztY4g_sACMQlCY'
const USUARIO = process.env.USUARIO || 'alex'
const CLAVE = process.env.CLAVE || 'alex123'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fallos = []
let rolId = null
let esAdmin = false
let suc = null
let usuario = null
let empresa = null
let prod = null
let destino = null
let destinoNombre = null
let stockBase = 0

let id1 = null // envío (acá: id actual, remapeado tras el sync)
let id2 = null // envío + aceptación
let id3 = null // conflicto por stock (nunca se remapea)
let creados1 = false
let creados2 = false
let creados3 = false
let anuladoOk = false

const marca = (ok, nombre) => {
  console.log(`${ok ? '  OK ' : 'FALLA'} ${nombre}`)
  if (!ok) fallos.push(nombre)
}

async function script(driver, codigo, ...args) {
  return driver.executeAsyncScript(
    `const cb = arguments[arguments.length - 1]\n;(async () => {\n  try {\n    const r = await (async () => { ${codigo} })()\n    cb(r)\n  } catch (e) { cb({ error: String((e && e.message) || e) }) }\n})()`,
    ...args,
  )
}

async function aparece(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'${texto}')]`)), ms)
    return true
  } catch (e) {
    return false
  }
}

/** Poll en el navegador: `codigo` devuelve {ok:…, …}; hasta que ok sea true. */
async function esperar(driver, codigo, ms = 30000) {
  const fin = Date.now() + ms
  let ultimo = null
  while (Date.now() < fin) {
    const r = await script(driver, codigo)
    if (r && !r.error && r.ok) return r
    ultimo = r
    await sleep(500)
  }
  return ultimo
}

async function appLista(driver) {
  await driver.wait(until.elementLocated(By.css('[aria-label="Sincronizar ahora"]')), 15000)
}

/** Pre-carga los módulos con red (import() bajo CDP-offline no sirve chunks). */
async function calentar(driver) {
  return script(
    driver,
    `await import('/src/lib/db.js')
     await import('/src/services/trasladoService.js')
     await import('/src/services/colaSyncService.js')
     await import('/src/services/syncEngineService.js')
     return true`,
  )
}

async function corteRed(driver, offline) {
  await driver.sendDevToolsCommand('Network.enable', {})
  await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  })
  await driver.sleep(700)
}

/** Drena la cola de forma explícita (el auto-ronda de `online` puede ir solo). */
async function drenar(driver) {
  return script(
    driver,
    `const { procesarCola } = await import('/src/services/syncEngineService.js')
     return await procesarCola()`,
  )
}

/** Fuse servidor → espejo (solo con red). */
async function refrescar(driver) {
  return script(
    driver,
    `const { refrescarTraslados } = await import('/src/services/trasladoService.js')
     try {
       const r = await refrescarTraslados({ idSucursal: ${JSON.stringify(suc)} })
       return { ok: true, ...r }
     } catch (e) { return { error: String((e && e.message) || e) } }`,
  )
}

async function resolverEmpresa(usuario) {
  try {
    const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
    const usuarios = await fetch(`${SUPA}/users?select=id_sucursal&username=eq.${usuario}`, {
      headers: h,
    }).then((r) => r.json())
    if (!usuarios?.[0]?.id_sucursal) return null
    const s = await fetch(`${SUPA}/sucursal?select=id_empresa&id=eq.${usuarios[0].id_sucursal}`, {
      headers: h,
    }).then((r) => r.json())
    return s?.[0]?.id_empresa || null
  } catch (e) {
    return null
  }
}

async function rpc(nombre, cuerpo) {
  const r = await fetch(`${SUPA}/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  if (!r.ok) throw new Error(`${nombre} HTTP ${r.status}`)
  const txt = await r.text()
  if (!txt) return null
  try {
    return JSON.parse(txt)
  } catch (e) {
    return txt
  }
}

async function setPermisoVer(ver) {
  return rpc('upsert_permiso', {
    p_id_rol: rolId,
    p_modulo: 'traslados',
    p_puede_ver: ver,
    p_puede_crear: true,
    p_puede_editar: true,
    p_puede_eliminar: true,
  })
}

async function permisoVer() {
  return rpc('has_permission', { p_id_rol: rolId, p_modulo: 'traslados', p_accion: 'ver' })
}

/** Traslados ENVIADOS en servidor para mi sucursal. */
function servidorEnviados(idSucursal) {
  return rpc('get_traslados', {
    p_id_sucursal: idSucursal,
    p_direccion: 'enviados',
    p_busqueda: null,
    p_limite: 200,
    p_offset: 0,
  }).then((d) => d?.traslados || [])
}

async function main() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run'))
    .build()

  try {
    await driver.manage().setTimeouts({ script: 40000 })

    // --- login determinista (sesión fresca + empresa si el rol la requiere) ---
    await driver.get(BASE + '/#/')
    await driver.sleep(1500)
    await driver.executeScript(
      "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
    )
    await driver.get(BASE + '/#/')
    await driver.wait(until.elementLocated(By.id('email')), 15000)
    const empresaId = await resolverEmpresa(USUARIO)
    await (await driver.findElement(By.id('email'))).clear()
    await (await driver.findElement(By.id('email'))).sendKeys(USUARIO)
    await (await driver.findElement(By.id('password'))).clear()
    await (await driver.findElement(By.id('password'))).sendKeys(CLAVE)
    if (empresaId) {
      await driver.wait(
        until.elementLocated(By.css(`#empresa option[value="${empresaId}"]`)),
        10000,
      )
      await new Select(await driver.findElement(By.id('empresa'))).selectByValue(empresaId)
    }
    await driver.findElement(By.css('[data-testid="btn-login"]')).click()
    console.log(`  · sesión iniciada como ${USUARIO}`)
    await driver.sleep(5000)

    const sesion = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return u
        ? { id: u.id || null, sucursal: u.id_sucursal, rolId: (u.id_rol && u.id_rol.id) || null,
            rolNombre: (u.id_rol && u.id_rol.name) || '' }
        : null
    `)
    marca(!!sesion && !!sesion.sucursal, `sesion sucursal=${sesion && sesion.sucursal}`)
    suc = sesion.sucursal
    usuario = sesion.id
    rolId = sesion.rolId
    esAdmin = sesion.rolNombre === 'Admin'
    empresa = empresaId
    // los 3 RPCs exigen p_id_usuario NO nulo (SQL Task 1b): nada de null
    marca(!!usuario, `usuario de la sesión: ${usuario || 'FALTA'}`)
    if (!usuario) throw new Error('sesión sin id de usuario: abortando')

    // destino = otra sucursal activa de mi empresa (capa cliente)
    const dest = await fetch(
      `${SUPA}/sucursal?select=id,name&id=neq.${suc}&id_empresa=eq.${empresa}&activo=eq.true&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } },
    ).then((r) => r.json())
    destino = dest?.[0]?.id || null
    destinoNombre = dest?.[0]?.name || null
    marca(!!destino, `destino de la prueba: ${destinoNombre || 'ninguno'}`)

    // heal de traslados/ver (la UI de badge lo requiere)
    if (!esAdmin && rolId) {
      await setPermisoVer(true)
      marca((await permisoVer()) === true, 'heal: traslados/ver = true')
      await driver.navigate().refresh()
      await appLista(driver)
    } else {
      marca(true, `segmento de permiso omitido (rol ${sesion.rolNombre || 'Admin'})`)
    }

    const warm = await calentar(driver)
    marca(!!warm && !warm.error, `módulos calentados ${warm.error || ''}`)

    // drenaje inicial: eventos de corridas anteriores no deben colarse en la línea base
    const drenaje = await drenar(driver)
    marca(
      typeof drenaje === 'number' || !!drenaje.ok,
      `drenaje inicial (${JSON.stringify(drenaje)})`,
    )

    // línea base: stock local + filas de servidor
    let base = null
    for (let i = 0; i < 30 && !base; i++) {
      const c = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const rows = await db.productos_sucursal.where('id_sucursal').equals(${JSON.stringify(suc)}).toArray()
         if (!rows.length) return null
         const p = await db.productos.get(rows[0].id_producto)
         return { id: rows[0].id_producto, stock: rows[0].stock, name: p && p.name }`,
      )
      if (c && !c.error && c.id) base = c
      else await sleep(2000)
    }
    marca(!!base, `producto base: ${base ? base.name : 'ninguno'} stock=${base && base.stock}`)
    if (!base) throw new Error('sin catálogo hidratado: abortando')
    prod = base.id
    stockBase = base.stock
    if (stockBase < 5) throw new Error(`stock base ${stockBase} < 5: abortando`)

    const serverAntes = await servidorEnviados(suc)
    const serverIds = new Set(serverAntes.map((t) => t.id))
    marca(true, `servidor: ${serverAntes.length} traslados enviados previos`)

    // ================= A) envío offline → sync sin duplicados =================
    await corteRed(driver, true)
    const a1 = await script(
      driver,
      `const { registrarTrasladoLocal } = await import('/src/services/trasladoService.js')
       return registrarTrasladoLocal({
         idSucursalOrigen: ${JSON.stringify(suc)},
         idSucursalDestino: ${JSON.stringify(destino)},
         idUsuario: ${JSON.stringify(usuario)},
         items: [{ id_producto: ${JSON.stringify(prod)}, cantidad: 2 }],
         nombreDestino: ${JSON.stringify(destinoNombre)},
       })`,
    )
    creados1 = !a1.error
    marca(!a1.error && !!a1.idTraslado, `alta offline #1 ${a1.error || a1.idTraslado}`)
    id1 = a1.idTraslado
    const estado1 = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const t = await db.traslados.get(${JSON.stringify(id1)})
       const row = await db.productos_sucursal.get([${JSON.stringify(suc)}, ${JSON.stringify(prod)}])
       const ev = await db.cola_sincronizacion.get(${JSON.stringify(a1.idEvento)})
       return { estado: t && t.sync_status, stock: row && row.stock, rpc: ev && ev.datos && ev.datos.rpc }`,
    )
    marca(estado1.estado === 'PENDING', `fila #1 PENDING (${estado1.estado})`)
    marca(
      estado1.stock === stockBase - 2 && estado1.rpc === 'registrar_traslado',
      `stock local ${stockBase}→${estado1.stock} y evento registrar_traslado`,
    )

    await corteRed(driver, false)
    await drenar(driver)
    marca(true, 'red restaurada tras el alta')

    const rA = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const ev = await db.cola_sincronizacion.get(${JSON.stringify(a1.idEvento)})
       return { ok: !!ev && ev.sync_status === 'SYNCED', resp: ev && ev.respuesta }`,
    )
    marca(!!(rA && rA.ok), 'evento #1 SYNCED en la cola')
    const id1Viejo = id1
    if (rA && rA.resp && rA.resp.id_traslado) id1 = rA.resp.id_traslado
    marca(!!id1 && id1 !== id1Viejo, `id remapeado ${String(id1).slice(0, 8)}`)

    const filaA = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const t = await db.traslados.get(${JSON.stringify(id1)})
       const viejo = await db.traslados.get(${JSON.stringify(id1Viejo)})
       const dets = await db.detalle_traslado.where('id_traslado').equals(${JSON.stringify(id1)}).toArray()
       return { ok: !!t && t.sync_status === 'SYNCED' && !viejo && dets.length === 1 }`,
    )
    marca(!!(filaA && filaA.ok), 'fila #1 SYNCED con el id del servidor y detalle repuntado')

    await refrescar(driver)

    // sin duplicados: servidor + espejo
    const server1 = await servidorEnviados(suc)
    const nuevos = server1.filter((t) => !serverIds.has(t.id))
    marca(
      server1.length === serverAntes.length + 1 && nuevos.length === 1 && nuevos[0].id === id1,
      `servidor: exactamente 1 fila nueva (${nuevos.length}) con el id remapeado`,
    )
    const fuse1 = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const viejo = await db.traslados.get(${JSON.stringify(id1Viejo)})
       const nuevo = await db.traslados.get(${JSON.stringify(id1)})
       return { ok: !viejo && !!nuevo }`,
    )
    marca(!!(fuse1 && fuse1.ok), 'espejo sin duplicados tras el fuse (id viejo borrado)')

    // ============ B) creación + aceptación offline, mismo id local ============
    await corteRed(driver, true)
    const a2 = await script(
      driver,
      `const { registrarTrasladoLocal } = await import('/src/services/trasladoService.js')
       return registrarTrasladoLocal({
         idSucursalOrigen: ${JSON.stringify(suc)},
         idSucursalDestino: ${JSON.stringify(destino)},
         idUsuario: ${JSON.stringify(usuario)},
         items: [{ id_producto: ${JSON.stringify(prod)}, cantidad: 1 }],
         nombreDestino: ${JSON.stringify(destinoNombre)},
       })`,
    )
    creados2 = !a2.error
    marca(!a2.error && !!a2.idTraslado, `alta offline #2 ${a2.error || a2.idTraslado}`)
    id2 = a2.idTraslado
    await sleep(25) // timestamps distintos → FIFO seguro entre los 2 eventos
    const a2b = await script(
      driver,
      `const { encolarOperacion } = await import('/src/services/colaSyncService.js')
       const n = await encolarOperacion({
         tabla: 'traslados',
         operacion: 'UPDATE',
         id: ${JSON.stringify(id2)},
         idSucursal: ${JSON.stringify(destino)},
         datos: {
           rpc: 'aceptar_traslado',
           params: {
             p_id_traslado: ${JSON.stringify(id2)},
             p_id_sucursal: ${JSON.stringify(destino)},
             p_id_usuario: ${JSON.stringify(usuario)},
             p_lineas: [{ id_producto: ${JSON.stringify(prod)}, cantidad_recibida: 1 }],
           },
         },
       })
       return { idEvento: n }`,
    )
    marca(
      !a2b.error && typeof a2b.idEvento === 'number',
      `evento aceptar_traslado encolado ${a2b.error || ''}`,
    )
    const dosEventos = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const a = await db.cola_sincronizacion.get(${JSON.stringify(a2.idEvento)})
       const b = await db.cola_sincronizacion.get(${JSON.stringify(a2b.idEvento)})
       return { ok: !!a && !!b && a.sync_status === 'PENDING' && b.sync_status === 'PENDING'
         && a.id_registro === ${JSON.stringify(id2)} && b.id_registro === ${JSON.stringify(id2)} }`,
    )
    marca(!!(dosEventos && dosEventos.ok), '2 eventos PENDING con el mismo id local')

    await corteRed(driver, false)
    await drenar(driver)
    marca(true, 'red restaurada tras crear+aceptar offline')

    const id2Viejo = id2
    const rB = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const evR = await db.cola_sincronizacion.get(${JSON.stringify(a2.idEvento)})
       const evA = await db.cola_sincronizacion.get(${JSON.stringify(a2b.idEvento)})
       const nuevo = evR && evR.respuesta && evR.respuesta.id_traslado
       const fila = nuevo ? await db.traslados.get(nuevo) : null
       const ok = !!evR && evR.sync_status === 'SYNCED'
         && !!evA && evA.sync_status === 'SYNCED'
         && !!fila && fila.sync_status === 'SYNCED'
       return { ok, nuevoId: ok ? nuevo : null,
                estadoA: evA && evA.respuesta && evA.respuesta.estado,
                motivoA: evA && evA.ultimo_error }`,
    )
    marca(
      !!(rB && rB.ok && rB.nuevoId),
      `creación y aceptación SYNCED${rB && rB.motivoA ? ` (motivo: ${rB.motivoA})` : ''}`,
    )
    marca(
      !!(rB && rB.nuevoId && rB.nuevoId !== id2Viejo),
      're-apuntado: aceptar_traslado corrió con el id del servidor (0 CONFLICT falso)',
    )
    if (rB && rB.nuevoId) id2 = rB.nuevoId

    await refrescar(driver)
    const fuse2 = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const t = await db.traslados.get(${JSON.stringify(id2)})
       return { ok: !!t && t.estado === 'recibido' && t.sync_status === 'SYNCED' }`,
    )
    marca(!!(fuse2 && fuse2.ok), 'espejo fusiona el estado recibido del servidor')

    const server2 = await servidorEnviados(suc)
    const fila2 = server2.find((t) => t.id === id2)
    marca(
      !!(fila2 && fila2.estado === 'recibido'),
      `servidor: aceptación aplicada (estado ${fila2 ? fila2.estado : 'no encontrada'})`,
    )
    marca(
      !!(fila2 && fila2.lineas && fila2.lineas[0] && fila2.lineas[0].cantidad_recibida === 1),
      'servidor: cantidad_recibida = 1 en la línea',
    )

    // ================= C) rechazo de stock → CONFLICT =================
    await corteRed(driver, true)
    const a3 = await script(
      driver,
      `const { registrarTrasladoLocal } = await import('/src/services/trasladoService.js')
       return registrarTrasladoLocal({
         idSucursalOrigen: ${JSON.stringify(suc)},
         idSucursalDestino: ${JSON.stringify(destino)},
         idUsuario: ${JSON.stringify(usuario)},
         items: [{ id_producto: ${JSON.stringify(prod)}, cantidad: 2 }],
         nombreDestino: ${JSON.stringify(destinoNombre)},
       })`,
    )
    creados3 = !a3.error
    marca(!a3.error && !!a3.idTraslado, `alta offline #3 ${a3.error || a3.idTraslado}`)
    id3 = a3.idTraslado
    const parche = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const ev = await db.cola_sincronizacion.get(${JSON.stringify(a3.idEvento)})
       if (!ev) return { error: 'evento no encontrado' }
       ev.datos.params.p_lineas[0].cantidad = 99999
       await db.cola_sincronizacion.update(ev.id, { datos: ev.datos })
       return true`,
    )
    marca(!parche.error, `evento #3 parcheado a 99999 und ${parche.error || ''}`)

    await corteRed(driver, false)
    await drenar(driver)
    const cSync = await esperar(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const ev = await db.cola_sincronizacion.get(${JSON.stringify(a3.idEvento)})
       const t = await db.traslados.get(${JSON.stringify(id3)})
       return { ok: !!ev && ev.sync_status === 'CONFLICT' && !!t && t.sync_status === 'CONFLICT',
                motivo: t && t.ultimo_error, evMotivo: ev && ev.ultimo_error }`,
    )
    marca(!!(cSync && cSync.ok), 'fila y evento en CONFLICT tras el rechazo de stock')
    marca(
      !!(cSync && cSync.motivo),
      `motivo visible: ${String((cSync && cSync.motivo) || '').slice(0, 70)}`,
    )
    const server3 = await servidorEnviados(suc)
    marca(
      server3.length === server2.length,
      `servidor no creó la fila rechazada (${server3.length} = ${server2.length})`,
    )

    // --- badge «conflicto» en la UI (con red) ---
    await driver.executeScript("window.location.hash='#/traslados'")
    marca(await aparece(driver, 'Traslados entre sucursales', 15000), '/traslados renderiza')
    let badge = null
    try {
      badge = await driver.wait(
        until.elementLocated(By.xpath(`//*[normalize-space(.)='conflicto']`)),
        15000,
      )
    } catch (e) {}
    marca(!!badge, 'badge «conflicto» visible en la lista')
    if (badge) {
      const title = await badge.getAttribute('title')
      marca(!!title, `tooltip con el motivo (${String(title).slice(0, 60)})`)
    }

    // --- consola (filtra ruido de la new tab de Edge) ---
    const logs = await driver.manage().logs().get('browser')
    const ruido = /ntp\.msn\.com|assets\.msn\.com|microsoft\.[a-f0-9]+\.js|vendors\.[a-f0-9]+\.js/
    const malos = logs.filter(
      (l) =>
        l.level.name === 'SEVERE' &&
        !ruido.test(l.message) &&
        /Uncaught|is not a function|TypeError|Failed to fetch dynamically|ErrorBoundary/i.test(
          l.message,
        ),
    )
    marca(
      malos.length === 0,
      `consola sin errores de la app (${malos.map((m) => m.message.slice(0, 100)).join(' | ')})`,
    )
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
    fallos.push('excepción')
  } finally {
    // --- red primero: la anulación de la limpieza la necesita ---
    try {
      await corteRed(driver, false)
    } catch (e) {}

    // 1) anular el envío #1 (revierte stock local y de servidor)
    if (id1 && suc && creados1) {
      try {
        const an = await script(
          driver,
          `const { anularTrasladoLocal } = await import('/src/services/trasladoService.js')
           const r = await anularTrasladoLocal({
             idTraslado: ${JSON.stringify(id1)},
             idSucursal: ${JSON.stringify(suc)},
             idUsuario: ${JSON.stringify(usuario)},
             motivo: 'limpieza E2E TrasladosSync',
           })
           return r`,
        )
        anuladoOk = !an.error && an.estado === 'anulado'
        console.log(`  · anulación #1: ${anuladoOk ? 'anulado' : String(an.error).slice(0, 80)}`)
      } catch (e) {
        console.log('  · anulación #1 falló:', String(e).slice(0, 80))
      }
    }

    // 2) borrar filas, detalle y eventos locales de la prueba
    try {
      const ids = [id1, id2, id3].filter(Boolean)
      const clean = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const ids = ${JSON.stringify(ids)}
         const out = { filas: 0, dets: 0, evs: 0 }
         for (const id of ids) {
           for (const d of await db.detalle_traslado.where('id_traslado').equals(id).toArray()) {
             await db.detalle_traslado.delete(d.id); out.dets++
           }
           if (await db.traslados.get(id)) { await db.traslados.delete(id); out.filas++ }
         }
         const evs = await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()
         for (const e of evs) {
           const enIds = ids.includes(e.id_registro)
             || (e.datos && e.datos.params && ids.includes(e.datos.params.p_id_traslado))
           if (enIds) { await db.cola_sincronizacion.delete(e.id); out.evs++ }
         }
         return out`,
      )
      console.log(`  · limpieza local: ${JSON.stringify(clean)}`)
    } catch (e) {
      console.log('  · limpieza local falló:', String(e).slice(0, 100))
    }
    // 3) stock final con verdad de servidor: solo se queda el descuento de los
    //    envíos que REALMENTE subieron (D1 se revierte con la anulación; D3 y
    //    cualquier rechazo nunca tocaron el servidor). Sin servidor disponible
    //    se cae a los flags locales de la corrida (best effort).
    try {
      let enServidor1 = creados1
      let enServidor2 = creados2
      try {
        const s = await servidorEnviados(suc)
        enServidor1 = !!id1 && s.some((t) => t.id === id1)
        enServidor2 = !!id2 && s.some((t) => t.id === id2)
      } catch (e) {
        console.log('  · sin servidor para el stock, usando flags locales')
      }
      const stockFinal = stockBase - (enServidor1 && !anuladoOk ? 2 : 0) - (enServidor2 ? 1 : 0)
      const r = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const row = await db.productos_sucursal.get([${JSON.stringify(suc)}, ${JSON.stringify(prod)}])
         if (!row) return { error: 'sin fila de stock' }
         if (row.stock !== ${stockFinal}) {
           await db.productos_sucursal.put({ ...row, stock: ${stockFinal} })
         }
         return { antes: row.stock, ahora: ${stockFinal} }`,
      )
      console.log(`  · stock: ${JSON.stringify(r)}`)
    } catch (e) {
      console.log('  · stock falló:', String(e).slice(0, 100))
    }

    if (!esAdmin && rolId) {
      try {
        await setPermisoVer(true)
        console.log('  · permiso traslados/ver restaurado a true')
      } catch (e) {}
    }
    try {
      await driver.quit()
    } catch (e) {}
  }
  console.log(
    fallos.length === 0
      ? 'TRASLADOS SYNC E2E OK'
      : `TRASLADOS SYNC E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
