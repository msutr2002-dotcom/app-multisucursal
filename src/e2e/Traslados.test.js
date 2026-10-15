/**
 * E2E del módulo Traslados y Movimientos — Task 3 (trasladoService offline).
 * Requiere el dev server en :3000 (`npm start`) y perfil Edge por defecto.
 * Flujo: login → hidratación → stores Dexie v70 → red cortada (CDP) →
 * registrar/aceptar/anular/listar local con aserciones → restaurar red → limpieza.
 * Uso:  npm run test:traslados
 *       USUARIO=alex CLAVE=alex123 npm run test:traslados   (Ferromax, 2 sucursales)
 * Salida: líneas  OK/FALLA por aserción + código de salida 0/1.
 */
const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')
const { Select } = require('selenium-webdriver/lib/select')

const BASE = 'http://localhost:3000'
const SUPA = 'https://qgsiysbslwurjyjocfii.supabase.co/rest/v1'
const KEY = 'sb_publishable_UzTuJoa-XqBWNg_mYztY4g_sACMQlCY'
const USUARIO = process.env.USUARIO || 'system'
const CLAVE = process.env.CLAVE || 'system321'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const fallos = []
let baseline = null // {suc, p1, s1, p2, s2, p2Fixture} para la limpieza
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

/** Resolve la empresa del usuario (el login de no-admin exige elegirla en el form). */
async function resolverEmpresa() {
  try {
    const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
    const usuarios = await fetch(`${SUPA}/users?select=id_sucursal&username=eq.${USUARIO}`, {
      headers: h,
    }).then((r) => r.json())
    if (!usuarios?.[0]?.id_sucursal) return null
    const suc = await fetch(`${SUPA}/sucursal?select=id_empresa&id=eq.${usuarios[0].id_sucursal}`, {
      headers: h,
    }).then((r) => r.json())
    return suc?.[0]?.id_empresa || null
  } catch (e) {
    return null
  }
}

async function main() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run'))
    .build()

  try {
    await driver.manage().setTimeouts({ script: 40000 })

    // --- login determinista: sesión fresca + empresa si el rol la requiere ---
    await driver.get(BASE + '/#/')
    await driver.sleep(1500)
    await driver.executeScript(
      "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
    )
    await driver.get(BASE + '/#/')
    await driver.wait(until.elementLocated(By.id('email')), 15000)
    const empresaId = await resolverEmpresa()
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
      console.log(`  · empresa seleccionada: ${empresaId}`)
    }
    await driver.findElement(By.css('[data-testid="btn-login"]')).click()
    console.log(`  · sesión iniciada como ${USUARIO}`)
    await driver.sleep(5000)

    // --- stores Dexie: versión 70 + traslados/detalle_traslado ---
    const dbs = await driver.executeScript('return indexedDB.databases()')
    const pos = (dbs || []).find((d) => d.name === 'PosLibreriaDB')
    marca(!!pos && pos.version >= 70, `IDB PosLibreriaDB v${pos && pos.version} (>=70)`)
    const stores = await script(
      driver,
      `const req = indexedDB.open('PosLibreriaDB')
       return await new Promise((res) => {
         req.onsuccess = () => {
           const n = Array.from(req.result.objectStoreNames)
           req.result.close()
           res({ stores: n })
         }
         req.onerror = () => res({ error: String(req.error) })
       })`,
    )
    marca(
      stores.stores &&
        stores.stores.includes('traslados') &&
        stores.stores.includes('detalle_traslado'),
      `stores nuevos: traslados=${!!(stores.stores || []).includes('traslados')} detalle_traslado=${!!(stores.stores || []).includes('detalle_traslado')}`,
    )

    // --- sesión + hidratación (espera stock de la sucursal del dispositivo) ---
    const sesion = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return u ? { id: u.id, sucursal: u.id_sucursal } : null
    `)
    marca(!!sesion && !!sesion.sucursal, `sesion sucursal=${sesion && sesion.sucursal}`)

    let hidratado = false
    for (let i = 0; i < 40 && !hidratado; i++) {
      const c = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const suc = ${JSON.stringify(sesion && sesion.sucursal)}
         const n = await db.productos_sucursal.where('id_sucursal').equals(suc).count()
         const p = await db.productos.count()
         return { n, p }`,
      )
      if (c.n > 0 && c.p > 0) {
        hidratado = true
        marca(true, `hidratación: ${c.n} filas de stock, ${c.p} productos`)
      }
      await sleep(2000)
    }
    if (!hidratado) marca(false, 'hidratación del catálogo (timeout)')

    // --- pre-importa el servicio CON red: sin esto, el import dinámico bajo
    // CDP-offline falla con "Failed to fetch dynamically imported module" ---
    const pre = await script(
      driver,
      `const m = await import('/src/services/trasladoService.js')
       return { ok: typeof m.registrarTrasladoLocal === 'function' }`,
    )
    marca(!!pre.ok, 'pre-import de trasladoService con red')

    // --- productos de prueba (si el catálogo solo tiene 1, el 2do es fixture) ---
    const FAKP = 'fa11ed00-0000-4000-8000-000000000003' // producto fixture (limpiable)
    const base = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion && sesion.sucursal)}
       const rows = (await db.productos_sucursal.where('id_sucursal').equals(suc).toArray())
         .filter((r) => r.stock >= 6)
       if (!rows.length) return { error: 'se necesita 1 producto con stock >= 6' }
       return { p1: rows[0].id_producto, s1: rows[0].stock,
                p2: rows[1] ? rows[1].id_producto : null, s2: rows[1] ? rows[1].stock : null }`,
    )
    let p2Fixture = false
    if (!base.error && !base.p2) {
      base.p2 = FAKP
      base.s2 = 8
      p2Fixture = true
    }
    marca(
      !base.error,
      `productos de prueba p1=${(base.p1 || '').slice(0, 8)} s1=${base.s1} p2=${(base.p2 || '').slice(0, 8)} s2=${base.s2}${p2Fixture ? ' (fixture)' : ''} ${base.error || ''}`,
    )
    if (!base.error)
      baseline = {
        suc: sesion.sucursal,
        p1: base.p1,
        s1: base.s1,
        p2: base.p2,
        s2: base.s2,
        p2Fixture,
      }

    const FAKTO = 'fa11ed00-0000-4000-8000-000000000001' // sucursal destino falsa (limpiable)
    const FAKOR = 'fa11ed00-0000-4000-8000-000000000002' // sucursal origen falsa (limpiable)

    // --- red cortada (CDP: enable antes de emulate) ---
    await driver.sendDevToolsCommand('Network.enable', {})
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await driver.sleep(700)
    marca(true, 'red cortada con CDP')

    // --- T1: registrarTrasladoLocal (<2 s, stock baja, cola PENDING) ---
    const t0 = Date.now()
    const reg = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       const { idTraslado, idEvento } = await svc.registrarTrasladoLocal({
         idSucursalOrigen: ${JSON.stringify(sesion.sucursal)},
         idSucursalDestino: ${JSON.stringify(FAKTO)},
         idUsuario: ${JSON.stringify(sesion.id || null)},
         items: [{ id_producto: ${JSON.stringify(base.p1)}, cantidad: 3 }],
         nombreDestino: 'Destino de prueba',
       })
       return { idTraslado, idEvento }`,
    )
    const dtReg = Date.now() - t0
    marca(!reg.error && dtReg < 2000, `T1 registrar <2 s (${dtReg} ms) ${reg.error || ''}`)

    const despuesReg = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       const row = await db.productos_sucursal.get([suc, ${JSON.stringify(base.p1)}])
       const t = ${JSON.stringify(reg.idTraslado)} ? await db.traslados.get(${JSON.stringify(reg.idTraslado)}) : null
       const dets = await db.detalle_traslado.where('id_traslado').equals(${JSON.stringify(reg.idTraslado)}).toArray()
       const evs = (await db.cola_sincronizacion.where('tabla').equals('traslados').toArray())
         .filter((e) => e.datos && e.datos.rpc === 'registrar_traslado' && e.sync_status === 'PENDING')
       return { stock: row && row.stock, estado: t && t.estado, sync: t && t.sync_status, dets: dets.length, pendientes: evs.length }`,
    )
    marca(
      despuesReg.stock === base.s1 - 3,
      `T1 stock origen baja ${base.s1} → ${despuesReg.stock} (−3)`,
    )
    marca(
      despuesReg.estado === 'enviado' && despuesReg.sync === 'PENDING',
      `T1 fila estado=${despuesReg.estado} sync=${despuesReg.sync}`,
    )
    marca(
      despuesReg.dets === 1 && despuesReg.pendientes === 1,
      `T1 detalle=${despuesReg.dets} evento PENDING=${despuesReg.pendientes}`,
    )

    // --- T2: guards de registro ---
    const g1 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.registrarTrasladoLocal({ idSucursalOrigen: ${JSON.stringify(sesion.sucursal)}, idSucursalDestino: ${JSON.stringify(sesion.sucursal)}, items: [{ id_producto: ${JSON.stringify(base.p1)}, cantidad: 1 }] })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g1.ok && /distinta/i.test(g1.msg), `T2 guard origen=destino → "${g1.msg}"`)
    const g2 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.registrarTrasladoLocal({ idSucursalOrigen: ${JSON.stringify(sesion.sucursal)}, idSucursalDestino: ${JSON.stringify(FAKTO)}, items: [{ id_producto: ${JSON.stringify(base.p1)}, cantidad: 99999 }] })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g2.ok && /Stock insuficiente/i.test(g2.msg), `T2 guard stock → "${g2.msg}"`)
    const g3 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.registrarTrasladoLocal({ idSucursalOrigen: ${JSON.stringify(sesion.sucursal)}, idSucursalDestino: ${JSON.stringify(FAKTO)}, items: [{ id_producto: '00000000-0000-4000-8000-000000000999', cantidad: 1 }] })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message), code: e.code } }`,
    )
    marca(!g3.ok && g3.code === 'CATALOGO_LOCAL', `T2 guard catálogo → "${g3.msg}"`)

    // --- T3: entrada entrante armada en espejo (servidor simulado) + aceptación parcial ---
    const tid = 'ca11ed00-0000-4000-8000-0000000000aa'
    const armado = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       if (${p2Fixture}) {
         await db.productos.put({ id: ${JSON.stringify(FAKP)}, name: 'Producto de prueba T3', sku: 'T3PRUEBA', estado: 'disponible', tipo: 'bien' })
         await db.productos_sucursal.put({ id_sucursal: suc, id_producto: ${JSON.stringify(FAKP)}, stock: 8, stock_minimo: 0 })
       }
       await db.traslados.put({ id: ${JSON.stringify(tid)}, id_sucursal_origen: ${JSON.stringify(FAKOR)}, id_sucursal_destino: suc, id_usuario: null, fecha: new Date().toISOString(), estado: 'enviado', sync_status: 'SYNCED', origen: 'Origen de prueba' })
       await db.detalle_traslado.bulkPut([
         { id: 'ca11ed00-0000-4000-8000-0000000000d1', id_traslado: ${JSON.stringify(tid)}, id_producto: ${JSON.stringify(base.p1)}, cantidad_enviada: 5, cantidad_recibida: null },
         { id: 'ca11ed00-0000-4000-8000-0000000000d2', id_traslado: ${JSON.stringify(tid)}, id_producto: ${JSON.stringify(base.p2)}, cantidad_enviada: 4, cantidad_recibida: null },
       ])
       await db.productos_sucursal.put({ id_sucursal: ${JSON.stringify(FAKOR)}, id_producto: ${JSON.stringify(base.p1)}, stock: 10, stock_minimo: 0 })
       await db.productos_sucursal.put({ id_sucursal: ${JSON.stringify(FAKOR)}, id_producto: ${JSON.stringify(base.p2)}, stock: 10, stock_minimo: 0 })
       const pend = await (await import('/src/services/trasladoService.js')).contarTrasladosPendientes(suc)
       return { pend }`,
    )
    marca(armado.pend === 1, `T3 campanita: 1 traslado pendiente antes de aceptar (${armado.pend})`)

    const t1 = Date.now()
    const acep = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         const r = await svc.aceptarTrasladoLocal({
           idTraslado: ${JSON.stringify(tid)},
           idSucursal: ${JSON.stringify(sesion.sucursal)},
           idUsuario: ${JSON.stringify(sesion.id || null)},
           lineas: [
             { id_producto: ${JSON.stringify(base.p1)}, cantidad_recibida: 3 },
             { id_producto: ${JSON.stringify(base.p2)}, cantidad_recibida: 0 },
           ],
         })
         return { r }
       } catch (e) { return { error: String(e.message) } }`,
    )
    const dtAcep = Date.now() - t1
    marca(!acep.error && dtAcep < 2000, `T3 aceptar <2 s (${dtAcep} ms) ${acep.error || ''}`)
    marca(
      acep.r && acep.r.estado === 'recibido_parcial',
      `T3 estado recibido_parcial (${acep.r && acep.r.estado})`,
    )

    const stocks = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       const m1 = await db.productos_sucursal.get([suc, ${JSON.stringify(base.p1)}])
       const m2 = await db.productos_sucursal.get([suc, ${JSON.stringify(base.p2)}])
       const o1 = await db.productos_sucursal.get([${JSON.stringify(FAKOR)}, ${JSON.stringify(base.p1)}])
       const o2 = await db.productos_sucursal.get([${JSON.stringify(FAKOR)}, ${JSON.stringify(base.p2)}])
       const t = await db.traslados.get(${JSON.stringify(tid)})
       const dets = await db.detalle_traslado.where('id_traslado').equals(${JSON.stringify(tid)}).toArray()
       const evs = (await db.cola_sincronizacion.where('tabla').equals('traslados').toArray())
         .filter((e) => e.datos && e.datos.rpc === 'aceptar_traslado' && e.sync_status === 'PENDING')
       return { m1: m1.stock, m2: m2.stock, o1: o1.stock, o2: o2.stock, sync: t.sync_status,
                recibidas: dets.map((d) => d.cantidad_recibida).sort(), pendientes: evs.length }`,
    )
    // destino: p1 solo lo recibido (s1−3+3 = s1), p2 sin cambio (s2−0); origen: 10+2 y 10+4
    marca(
      stocks.m1 === base.s1 && stocks.m2 === base.s2,
      `T3 stock destino: p1 ${base.s1}→${stocks.m1}, p2 ${base.s2}→${stocks.m2}`,
    )
    marca(
      stocks.o1 === 12 && stocks.o2 === 14,
      `T3 stock origen recupera no llegado: p1→${stocks.o1} (12), p2→${stocks.o2} (14)`,
    )
    marca(
      stocks.recibidas.join(',') === '0,3',
      `T3 cantidades recibidas [${stocks.recibidas}] (esperado 0,3)`,
    )
    marca(
      stocks.sync === 'PENDING' && stocks.pendientes === 1,
      `T3 fila sync=${stocks.sync}, evento aceptar PENDING=${stocks.pendientes}`,
    )

    const pendTras = await script(
      driver,
      `return await (await import('/src/services/trasladoService.js')).contarTrasladosPendientes(${JSON.stringify(sesion.sucursal)})`,
    )
    marca(pendTras === 0, `T3 campanita en 0 tras aceptar (${pendTras})`)

    // --- T4: guards de aceptación ---
    const g4 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.aceptarTrasladoLocal({ idTraslado: ${JSON.stringify(tid)}, idSucursal: ${JSON.stringify(sesion.sucursal)}, lineas: [{ id_producto: ${JSON.stringify(base.p1)}, cantidad_recibida: 99 }] })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g4.ok && /ya fue recibido_parcial/i.test(g4.msg), `T4 doble aceptación → "${g4.msg}"`)
    const g5 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.aceptarTrasladoLocal({ idTraslado: ${JSON.stringify(tid)}, idSucursal: ${JSON.stringify(FAKOR)}, lineas: [] })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g5.ok && /no es la destino/i.test(g5.msg), `T4 sucursal que no es destino → "${g5.msg}"`)

    // --- T5: guards de anulación ---
    const g6 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.anularTrasladoLocal({ idTraslado: ${JSON.stringify(reg.idTraslado)}, idSucursal: ${JSON.stringify(sesion.sucursal)}, motivo: 'prueba' })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g6.ok && /aún no existe en el servidor/i.test(g6.msg), `T5 anular PENDING → "${g6.msg}"`)
    const g7 = await script(
      driver,
      `const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.anularTrasladoLocal({ idTraslado: ${JSON.stringify(tid)}, idSucursal: ${JSON.stringify(sesion.sucursal)}, motivo: 'prueba' })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g7.ok && /solo la sucursal origen/i.test(g7.msg), `T5 anular no-origen → "${g7.msg}"`)
    const g8 = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       await db.traslados.put({ id: 'ca11ed00-0000-4000-8000-0000000000bb', id_sucursal_origen: ${JSON.stringify(sesion.sucursal)}, id_sucursal_destino: ${JSON.stringify(FAKTO)}, id_usuario: null, fecha: new Date().toISOString(), estado: 'enviado', sync_status: 'SYNCED' })
       const svc = await import('/src/services/trasladoService.js')
       try {
         await svc.anularTrasladoLocal({ idTraslado: 'ca11ed00-0000-4000-8000-0000000000bb', idSucursal: ${JSON.stringify(sesion.sucursal)}, motivo: 'prueba' })
         return { ok: true }
       } catch (e) { return { ok: false, msg: String(e.message) } }`,
    )
    marca(!g8.ok && /conexión/i.test(g8.msg), `T5 anular sin red → "${g8.msg}"`)

    // --- T6: listados locales ---
    const listas = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       await db.traslados.delete('ca11ed00-0000-4000-8000-0000000000bb') // artefacto del guard g8
       const svc = await import('/src/services/trasladoService.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       const enviados = await svc.listarTrasladosLocal({ idSucursal: suc, direccion: 'enviados' })
       const recibidos = await svc.listarTrasladosLocal({ idSucursal: suc, direccion: 'recibidos' })
       const recibidosEnviados = await svc.listarTrasladosLocal({ idSucursal: suc, direccion: 'recibidos', estado: 'enviado' })
       const linea = (enviados.traslados[0] && enviados.traslados[0].lineas[0]) || null
       return { e: enviados.total, r: recibidos.total, rv: recibidosEnviados.total,
                lineaOk: !!(linea && linea.producto && linea.cantidad_enviada === 3) }`,
    )
    marca(
      listas.e === 1 && listas.r === 1 && listas.rv === 0,
      `T6 listados enviados=${listas.e} recibidos=${listas.r} recibidos-enviados=${listas.rv}`,
    )
    marca(listas.lineaOk, 'T6 línea con nombre de producto y cantidad_enviada=3')

    // --- T7: refrescarTraslados sin red no rompe ---
    const ref = await script(
      driver,
      `try {
         const r = await (await import('/src/services/trasladoService.js')).refrescarTraslados({ idSucursal: ${JSON.stringify(sesion.sucursal)} })
         return { r }
       } catch (e) { return { error: String(e.message) } }`,
    )
    marca(
      !ref.error && ref.r && ref.r.enviados === 0,
      `T7 refrescar offline → ${JSON.stringify(ref.r || ref.error)}`,
    )

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
    // --- limpieza: con la red AÚN cortada se borran eventos/filas locales
    // (el motor no debe subir nada al restaurar → cero basura en el servidor);
    // recién después vuelve la red ---
    try {
      const clean = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const out = { borrados: 0, restaurados: 0 }
         const base = ${JSON.stringify(baseline)}
         // eventos y filas de prueba (todo lo del módulo, es nuevo)
         const evs = await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()
         for (const e of evs) { await db.cola_sincronizacion.delete(e.id); out.borrados++ }
         const ts = await db.traslados.toArray()
         for (const t of ts) {
           const dets = await db.detalle_traslado.where('id_traslado').equals(t.id).toArray()
           for (const d of dets) { await db.detalle_traslado.delete(d.id); out.borrados++ }
           await db.traslados.delete(t.id); out.borrados++
         }
         const restos = await db.detalle_traslado.toArray()
         for (const d of restos) { await db.detalle_traslado.delete(d.id); out.borrados++ }
         // filas de sucursal falsa
         for (const fake of ['fa11ed00-0000-4000-8000-000000000001','fa11ed00-0000-4000-8000-000000000002']) {
           const rows = await db.productos_sucursal.where('id_sucursal').equals(fake).toArray()
           for (const r of rows) { await db.productos_sucursal.delete([r.id_sucursal, r.id_producto]); out.borrados++ }
         }
         // restaurar stock original exacto de los productos tocados
         if (base) {
           const r1 = await db.productos_sucursal.get([base.suc, base.p1])
           if (r1 && r1.stock !== base.s1) { await db.productos_sucursal.put({ ...r1, stock: base.s1 }); out.restaurados++ }
           if (base.p2Fixture) {
             await db.productos_sucursal.delete([base.suc, base.p2])
             await db.productos.delete(base.p2)
             out.borrados += 2
           } else {
             const r2 = await db.productos_sucursal.get([base.suc, base.p2])
             if (r2 && r2.stock !== base.s2) { await db.productos_sucursal.put({ ...r2, stock: base.s2 }); out.restaurados++ }
           }
         }
         return out`,
      )
      // purga la DB basura 'PosLibreraDB' que un nombre malo pudo crear (si existe)
      const junk = await script(
        driver,
        `const dbs = await indexedDB.databases()
         if (!dbs.some((d) => d.name === 'PosLibreraDB')) return { borrada: false }
         return await new Promise((res) => {
           const r = indexedDB.deleteDatabase('PosLibreraDB')
           r.onsuccess = () => res({ borrada: true })
           r.onerror = () => res({ borrada: false, error: String(r.error) })
           r.onblocked = () => res({ borrada: false, blocked: true })
         })`,
      )
      console.log('  · limpieza:', JSON.stringify(clean), '| DB basura:', JSON.stringify(junk))
    } catch (e) {
      console.log('  · limpieza falló:', String(e).slice(0, 120))
    }
    try {
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    } catch (e) {}
    try {
      await driver.quit()
    } catch (e) {}
  }
  console.log(
    fallos.length === 0 ? 'TRASLADOS E2E OK' : `TRASLADOS E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
