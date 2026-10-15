/**
 * E2E de la campanita de Traslados — Task 6 (RF-T5). Requiere el dev server en
 * :3000 (`npm start`). Por defecto corre como **alex / Ferromax** (traslados
 * `ver` = true): USUARIO=... CLAVE=... lo sobreescribe (con Admin el segmento de
 * permiso se omite, porque Admin es siempre true).
 * Flujo: login → heal de `traslados/ver` + refresh → limpieza del espejo →
 * menú «Sin notificaciones» → armado de 2 traslados ENTRANTEs (`PENDING`) →
 * punto rojo con conteo 2 → offline: el conteo sobrevive (lectura local) →
 * clic en la campanita muestra «2 traslados pendientes por aprobar» SIN
 * navegar (hash intacto) → clic en el AVISO navega a ?tab=movimientos con las
 * 2 filas → aceptación #1 por servicio → mensaje singular y aviso con mismo
 * hash se mantiene en Movimientos → aceptación #2 → el punto rojo desaparece y
 * el menú queda vacío → revoke + refresh → campanita oculta → restore +
 * refresh → visible y ruta accesible → consola → restaurar permiso/red +
 * limpieza.
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
let baseline = null // {suc, id, name, stock} del producto base
let rolId = null
let esAdmin = false

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

/** True si aparece un nodo con el texto dado dentro de `ms`. */
async function aparece(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'${texto}')]`)), ms)
    return true
  } catch (e) {
    return false
  }
}

/** True si existe el nodo del selector (búsqueda inmediata). */
async function presente(driver, css) {
  const els = await driver.findElements(By.css(css))
  return els.length > 0
}

/** True si NO existe ningún nodo con el texto dado (búsqueda inmediata). */
async function noExiste(driver, texto) {
  const els = await driver.findElements(By.xpath(`//*[contains(text(),'${texto}')]`))
  return els.length === 0
}

/** Espera a que se oculten los toasts (autohide 5 s, tapan botones en top-end). */
async function esperarToasts(driver, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const visibles = await driver.findElements(By.css('.toast.show'))
    if (!visibles.length) return
    await sleep(300)
  }
}

/** Poll: el texto del selector es exactamente `esperado`. */
async function textoIgual(driver, css, esperado, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const els = await driver.findElements(By.css(css))
    if (els.length) {
      const t = (await els[0].getText()).trim()
      if (t === esperado) return true
    }
    await sleep(250)
  }
  return false
}

/** Poll: el selector desaparece (2 lecturas seguidas, tolera el flash inicial). */
async function ausente(driver, css, ms = 10000) {
  const fin = Date.now() + ms
  let seguidas = 0
  while (Date.now() < fin) {
    const els = await driver.findElements(By.css(css))
    if (!els.length) {
      seguidas++
      if (seguidas >= 2) return true
      await sleep(350)
    } else {
      seguidas = 0
      await sleep(250)
    }
  }
  return false
}

/** ¿La pestaña con ese texto está aria-selected=true? (lectura única) */
async function pestanaSeleccionada(driver, texto) {
  const sel = await driver.executeScript(`
    const tabs = [...document.querySelectorAll('[role="tab"]')]
    const t = tabs.find((x) => (x.textContent || '').includes(${JSON.stringify(texto)}))
    return t ? t.getAttribute('aria-selected') : null
  `)
  return sel === 'true'
}

/** Poll: la pestaña con ese texto queda aria-selected=true (tolera render lazy). */
async function pestanaActiva(driver, texto, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    if (await pestanaSeleccionada(driver, texto)) return true
    await sleep(250)
  }
  return false
}

/** Poll: hay exactamente `n` botones de verificación. */
async function esperarBotones(driver, n, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const els = await driver.findElements(By.css('[data-testid="btn-verificar"]'))
    if (els.length === n) return true
    await sleep(250)
  }
  return false
}

/** Abre (o cierra) el menú de notificaciones con un clic en la campanita. */
async function clicCampana(driver) {
  await driver.findElement(By.css('[data-testid="campana-traslados"]')).click()
}

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

/** RPC con la anon key. `upsert_permiso` responde vacío → null (se valida aparte). */
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

/** Concede o revoca SOLO `traslados/ver` (las otras 3 acciones quedan en true). */
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

/** Acepta un traslado armado vía servicio (evento → la campanita reconta). */
async function aceptar(driver, tid, idProducto, idSucursal) {
  return script(
    driver,
    `const { aceptarTrasladoLocal } = await import('/src/services/trasladoService.js')
     return aceptarTrasladoLocal({
       idTraslado: ${JSON.stringify(tid)},
       idSucursal: ${JSON.stringify(idSucursal)},
       idUsuario: null,
       lineas: [{ id_producto: ${JSON.stringify(idProducto)}, cantidad_recibida: 1 }],
     })`,
  )
}

async function main() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run'))
    .build()

  // Sucursal origen falsa para el armado (limpiable, prefijo fa/da)
  const FAKOR = 'fa12ed00-0000-4000-8000-000000000002'
  const TID1 = 'da12ed00-0000-4000-8000-000000000001'
  const TID2 = 'da12ed00-0000-4000-8000-000000000002'
  const CAMPA = '[data-testid="campana-traslados"]'
  const CONTEO = '[data-testid="campana-conteo"]'

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
    }
    await driver.findElement(By.css('[data-testid="btn-login"]')).click()
    console.log(`  · sesión iniciada como ${USUARIO}`)
    await driver.sleep(5000)

    const sesion = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return u
        ? { sucursal: u.id_sucursal, rolId: (u.id_rol && u.id_rol.id) || null,
            rolNombre: (u.id_rol && u.id_rol.name) || '' }
        : null
    `)
    marca(!!sesion && !!sesion.sucursal, `sesion sucursal=${sesion && sesion.sucursal}`)
    rolId = sesion && sesion.rolId
    esAdmin = !!(sesion && sesion.rolNombre === 'Admin')

    // --- hidratación del catálogo local (espera stock de la sucursal) ---
    let baseProd = null
    for (let i = 0; i < 30 && !baseProd; i++) {
      const c = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const suc = ${JSON.stringify(sesion && sesion.sucursal)}
         const rows = await db.productos_sucursal.where('id_sucursal').equals(suc).toArray()
         if (!rows.length) return null
         const p = await db.productos.get(rows[0].id_producto)
         return { id: rows[0].id_producto, name: p && p.name, stock: rows[0].stock }`,
      )
      if (c && !c.error && c.id) baseProd = c
      else await sleep(2000)
    }
    marca(
      !!baseProd,
      `producto base del catálogo: ${baseProd ? baseProd.id.slice(0, 8) : 'ninguno'} (${
        baseProd && baseProd.name
      }) stock=${baseProd && baseProd.stock}`,
    )
    baseline = baseProd ? { suc: sesion.sucursal, ...baseProd } : null
    if (!baseline) throw new Error('sin catálogo hidratado: abortando')

    // --- heal de traslados/ver (un run anterior pudo dejarlo revocado) ---
    if (!esAdmin && rolId) {
      await setPermisoVer(true)
      marca((await permisoVer()) === true, 'heal: traslados/ver = true en servidor')
      await driver.navigate().refresh()
      await driver.sleep(2500)
    } else {
      marca(true, `heal omitido (rol ${sesion.rolNombre || '?'}${rolId ? '' : ', sin id_rol'})`)
    }

    marca(await presente(driver, CAMPA), 'campanita visible con traslados/ver')

    // --- limpieza del espejo → menú de notificaciones vacío ---
    const limpio = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       let n = 0
       for (const t of await db.traslados.toArray()) { await db.traslados.delete(t.id); n++ }
       for (const d of await db.detalle_traslado.toArray()) { await db.detalle_traslado.delete(d.id); n++ }
       for (const e of await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()) {
         await db.cola_sincronizacion.delete(e.id); n++
       }
       window.dispatchEvent(new CustomEvent('traslados-actualizados'))
       return n`,
    )
    marca(!limpio.error, `espejo limpio (${limpio.error || `${limpio} filas borradas`})`)
    marca(await ausente(driver, CONTEO, 8000), 'conteo 0: sin punto rojo sin entrantes')

    await esperarToasts(driver)
    await clicCampana(driver)
    marca(await presente(driver, '[data-testid="notif-vacio"]'), 'menú abierto con vacío')
    marca(
      await aparece(driver, 'Sin notificaciones pendientes', 5000),
      'mensaje: Sin notificaciones pendientes',
    )
    await clicCampana(driver) // cierra

    // --- armado de 2 traslados ENTRANTEs (PENDING: visibles en el fuse online) ---
    const armado = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       const base = ${JSON.stringify(baseline.id)}
       const FAKOR = ${JSON.stringify(FAKOR)}
       const mk = async (tid, det, dias) => {
         await db.traslados.put({ id: tid, id_sucursal_origen: FAKOR, id_sucursal_destino: suc,
           id_usuario: null, fecha: new Date(Date.now() - dias * 86400000).toISOString(),
           estado: 'enviado', sync_status: 'PENDING', origen: 'Origen de prueba' })
         await db.detalle_traslado.put({ id: det, id_traslado: tid, id_producto: base,
           cantidad_enviada: 1, cantidad_recibida: null })
       }
       await mk(${JSON.stringify(TID1)}, 'da12ed00-0000-4000-8000-0000000000d1', 1)
       await mk(${JSON.stringify(TID2)}, 'da12ed00-0000-4000-8000-0000000000d2', 2)
       window.dispatchEvent(new CustomEvent('traslados-actualizados'))
       return true`,
    )
    marca(!armado.error, `2 traslados entrantes armados ${armado.error || ''}`)
    marca(await textoIgual(driver, CONTEO, '2', 8000), 'punto rojo con conteo = 2')

    // --- sin red: la cuenta es local (RF-T5) ---
    await driver.sendDevToolsCommand('Network.enable', {})
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await driver.sleep(700)
    marca(await textoIgual(driver, CONTEO, '2', 3000), 'conteo 2 sin red (lectura local)')
    marca(await presente(driver, CAMPA), 'campanita visible sin red')
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
    await driver.sleep(700)
    marca(true, 'red restaurada tras el corte')

    // --- clic: muestra el mensaje y NO navega ---
    await esperarToasts(driver)
    const hashAntes = await driver.executeScript('return window.location.hash')
    await clicCampana(driver)
    marca(
      await aparece(driver, '2 traslados pendientes por aprobar', 6000),
      'mensaje: 2 traslados pendientes por aprobar',
    )
    marca(
      await presente(driver, '[data-testid="notif-traslados-pendientes"]'),
      'aviso de traslados en el menú de notificaciones',
    )
    const hashDespues = await driver.executeScript('return window.location.hash')
    marca(
      hashDespues === hashAntes && !hashDespues.includes('/traslados'),
      `el clic NO navega (hash ${hashDespues || '(vacío)'})`,
    )

    // --- clic en el AVISO: dirige al módulo en Movimientos ---
    await driver.findElement(By.css('[data-testid="notif-traslados-pendientes"]')).click()
    const hashModulo = await driver.executeScript('return window.location.hash')
    marca(hashModulo === '#/traslados?tab=movimientos', `aviso navega al módulo (${hashModulo})`)
    marca(
      await aparece(driver, 'Traslados entre sucursales', 15000),
      'módulo #/traslados renderiza',
    )
    marca(await pestanaActiva(driver, 'Movimientos'), 'pestaña Movimientos activa tras el aviso')
    marca(await esperarBotones(driver, 2, 10000), '2 filas pendientes listas para aprobar')

    // --- aceptación #1 por servicio → mensaje singular ---
    const acep1 = await aceptar(driver, TID1, baseline.id, sesion.sucursal)
    marca(
      !acep1.error && acep1.estado === 'recibido',
      `aceptación #1 por servicio (${acep1.error || acep1.estado})`,
    )
    marca(await textoIgual(driver, CONTEO, '1', 8000), 'conteo baja a 1 tras aceptar #1')
    marca(await esperarBotones(driver, 1, 8000), 'queda 1 fila con Verificar/Aceptar')
    await esperarToasts(driver)
    await clicCampana(driver)
    marca(
      await aparece(driver, '1 traslado pendiente por aprobar', 6000),
      'mensaje singular: 1 traslado pendiente por aprobar',
    )

    // aviso con el MISMO hash: sin navegación, el evento mantiene Movimientos
    await driver.findElement(By.css('[data-testid="notif-traslados-pendientes"]')).click()
    marca(await pestanaActiva(driver, 'Movimientos'), 'mismo hash → evento mantiene Movimientos')
    marca(await esperarBotones(driver, 1, 8000), '1 fila tras el clic del aviso')
    const hashTrasAviso = await driver.executeScript('return window.location.hash')
    marca(
      hashTrasAviso === '#/traslados?tab=movimientos',
      `mismo hash tras el aviso (${hashTrasAviso})`,
    )

    // --- aceptación #2 → el punto rojo desaparece y el menú queda vacío ---
    const acep2 = await aceptar(driver, TID2, baseline.id, sesion.sucursal)
    marca(
      !acep2.error && acep2.estado === 'recibido',
      `aceptación #2 por servicio (${acep2.error || acep2.estado})`,
    )
    marca(await ausente(driver, CONTEO, 8000), 'punto rojo desaparece al aceptar todo')
    marca(await presente(driver, CAMPA), 'campanita sigue visible con 0 pendientes')
    await esperarToasts(driver)
    await clicCampana(driver)
    marca(
      await aparece(driver, 'Sin notificaciones pendientes', 5000),
      'menú vacío tras aceptar todo',
    )
    marca(await noExiste(driver, 'por aprobar'), 'sin mensajes «pendientes por aprobar»')
    await clicCampana(driver) // cierra

    // --- oculto sin permiso / visible tras restaurar ---
    if (!esAdmin && rolId) {
      await setPermisoVer(false)
      marca((await permisoVer()) === false, 'traslados/ver revocado en servidor')
      await driver.navigate().refresh()
      await driver.wait(until.elementLocated(By.css('[aria-label="Sincronizar ahora"]')), 15000)
      marca(await ausente(driver, CAMPA, 12000), 'campanita oculta sin traslados/ver')

      await setPermisoVer(true)
      marca((await permisoVer()) === true, 'traslados/ver restaurado en servidor')
      await driver.navigate().refresh()
      await driver.wait(until.elementLocated(By.css('[aria-label="Sincronizar ahora"]')), 15000)
      marca(await presente(driver, CAMPA), 'campanita visible tras restaurar permiso')

      await driver.executeScript("window.location.hash='#/traslados'")
      marca(
        await aparece(driver, 'Traslados entre sucursales', 15000),
        'ruta accesible tras restaurar permiso',
      )
    } else {
      marca(true, `segmento de permiso omitido (rol ${sesion.rolNombre || 'Admin'} es Admin)`)
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
    // --- siempre: red, permiso y espejo a su estado inicial ---
    try {
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    } catch (e) {}
    if (!esAdmin && rolId) {
      try {
        await setPermisoVer(true)
        console.log('  · permiso traslados/ver restaurado a true')
      } catch (e) {
        console.log('  · no se pudo restaurar el permiso:', String(e).slice(0, 120))
      }
    }
    try {
      const clean = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const out = { borrados: 0, restaurados: 0 }
         const base = ${JSON.stringify(baseline)}
         const FAKOR = ${JSON.stringify(FAKOR)}
         for (const t of await db.traslados.toArray()) { await db.traslados.delete(t.id); out.borrados++ }
         for (const d of await db.detalle_traslado.toArray()) { await db.detalle_traslado.delete(d.id); out.borrados++ }
         for (const e of await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()) {
           await db.cola_sincronizacion.delete(e.id); out.borrados++
         }
         if (base) {
           if (await db.productos_sucursal.get([FAKOR, base.id])) {
             await db.productos_sucursal.delete([FAKOR, base.id]); out.borrados++
           }
           const row = await db.productos_sucursal.get([base.suc, base.id])
           if (row && row.stock !== base.stock) {
             await db.productos_sucursal.put({ ...row, stock: base.stock })
             out.restaurados++
           }
         }
         return out`,
      )
      console.log('  · limpieza:', JSON.stringify(clean))
    } catch (e) {
      console.log('  · limpieza falló:', String(e).slice(0, 120))
    }
    try {
      await driver.quit()
    } catch (e) {}
  }
  console.log(
    fallos.length === 0
      ? 'TRASLADOS CAMPANA E2E OK'
      : `TRASLADOS CAMPANA E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
