/**
 * E2E de UI del módulo Traslados — Task 5 (pestaña Movimientos: verificación
 * y aceptación). Requiere el dev server en :3000 (`npm start`).
 * Por defecto corre como **alex / Ferromax** (permisos `traslados` 4/4):
 * USUARIO=... CLAVE=... lo sobreescribe.
 * Flujo: login con red (ruta + pestaña Movimientos renderizadas) → CDP offline →
 * armado de un traslado ENTRANTE en el espejo (origen falso + 2 líneas, patrón
 * del E2E de servicio) → modal de verificación (defaults = enviada, guard de
 * cantidad > enviada, "no llegó" = 0, resumen llega X de Y) → aceptación
 * parcial con ConfirmModal → stocks destino/origen, estado `recibido_parcial`,
 * evento cola PENDING → consola → restaurar red → limpieza.
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

/**
 * Como `aparece` pero contra el texto COMPLETO del nodo (normalize-space):
 * sirve para textos partidos en varios nodos, p. ej. `Llega {3} de {9} unidades`.
 */
async function apareceTexto(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[normalize-space(.)='${texto}']`)), ms)
    return true
  } catch (e) {
    return false
  }
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

/** Clic en la pestaña (button[role=tab]) cuyo texto contiene `texto`. */
async function clicPestana(driver, texto) {
  const tabs = await driver.findElements(By.css('[role="tablist"] [role="tab"], [role="tab"]'))
  for (const t of tabs) {
    if ((await t.getText()).includes(texto)) {
      await t.click()
      return true
    }
  }
  return false
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

async function main() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run'))
    .build()

  // Sucursales/productos falsos para el armado (limpiables, prefijo fa/da)
  const FAKOR = 'fa11ed00-0000-4000-8000-000000000002' // sucursal origen falsa
  const FAKP = 'fa11ed00-0000-4000-8000-000000000005' // producto fixture
  const TID = 'da11ed00-0000-4000-8000-000000000001' // traslado entrante armado

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
      return u ? { id: u.id, sucursal: u.id_sucursal } : null
    `)
    marca(!!sesion && !!sesion.sucursal, `sesion sucursal=${sesion && sesion.sucursal}`)

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

    // --- con red: ruta + pestaña Movimientos renderizadas (precarga de chunk) ---
    await driver.executeScript("window.location.hash='#/traslados'")
    marca(await aparece(driver, 'Traslados entre sucursales', 15000), 'ruta #/traslados renderiza')
    marca(await clicPestana(driver, 'Movimientos'), 'clic en pestaña Movimientos (con red)')
    marca(
      await driver.wait(until.elementLocated(By.css('[data-testid="buscar-traslado"]')), 10000),
      'listado de Movimientos renderizado',
    )
    await esperarToasts(driver)

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

    // --- armado del traslado ENTRANTE en el espejo local (offline) ---
    const armado = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       await db.productos.put({ id: ${JSON.stringify(FAKP)}, name: 'Producto de prueba Mov', sku: 'MOVP', estado: 'disponible', tipo: 'bien' })
       await db.productos_sucursal.put({ id_sucursal: suc, id_producto: ${JSON.stringify(FAKP)}, stock: 8, stock_minimo: 0 })
       await db.traslados.put({ id: ${JSON.stringify(TID)}, id_sucursal_origen: ${JSON.stringify(FAKOR)}, id_sucursal_destino: suc, id_usuario: null, fecha: new Date().toISOString(), estado: 'enviado', sync_status: 'SYNCED', origen: 'Origen de prueba' })
       await db.detalle_traslado.bulkPut([
         { id: 'da11ed00-0000-4000-8000-0000000000d1', id_traslado: ${JSON.stringify(TID)}, id_producto: ${JSON.stringify(baseline.id)}, cantidad_enviada: 5, cantidad_recibida: null },
         { id: 'da11ed00-0000-4000-8000-0000000000d2', id_traslado: ${JSON.stringify(TID)}, id_producto: ${JSON.stringify(FAKP)}, cantidad_enviada: 4, cantidad_recibida: null },
       ])
       await db.productos_sucursal.put({ id_sucursal: ${JSON.stringify(FAKOR)}, id_producto: ${JSON.stringify(baseline.id)}, stock: 10, stock_minimo: 0 })
       await db.productos_sucursal.put({ id_sucursal: ${JSON.stringify(FAKOR)}, id_producto: ${JSON.stringify(FAKP)}, stock: 10, stock_minimo: 0 })
       return true`,
    )
    marca(!armado.error, `traslado entrante armado en el espejo ${armado.error || ''}`)

    // --- sin red: regla 4 (pasar por otra ruta) y volver a Movimientos ---
    await driver.executeScript("window.location.hash='#/dashboard'")
    await driver.sleep(1500)
    await driver.executeScript("window.location.hash='#/traslados'")
    marca(
      await aparece(driver, 'estás viendo los registros locales', 15000),
      'alerta de sin conexión visible',
    )
    marca(await clicPestana(driver, 'Movimientos'), 'clic en pestaña Movimientos (offline)')

    // --- la fila entrante aparece con botón Verificar/Aceptar ---
    const btnsVerificar = await driver.wait(
      until.elementLocated(By.css('[data-testid="btn-verificar"]')),
      10000,
    )
    marca(!!btnsVerificar, 'fila entrante con botón Verificar/Aceptar')
    marca(await aparece(driver, 'enviado', 3000), 'badge estado enviado')

    // --- modal de verificación ---
    await btnsVerificar.click()
    marca(await aparece(driver, 'Verificar recepción', 8000), 'modal de verificación abre')
    marca(
      await apareceTexto(driver, 'Llega 9 de 9 unidades', 6000),
      'default: recibida = enviada (Llega 9 de 9)',
    )

    const inputs = await driver.findElements(By.css('[data-testid^="inp-recibida-"]'))
    marca(inputs.length === 2, `modal con 2 líneas (${inputs.length})`)

    // localizar cada input por su aria-label ("Recibida de <producto>"): estable
    // aunque el modal siga animando (getText devolvería '')
    let inpBase = null
    let inpFixture = null
    let btnNoLlegoBase = null
    const nombresFilas = []
    for (const inp of inputs) {
      const etiqueta = (await inp.getAttribute('aria-label')) || ''
      const nombre = etiqueta.replace(/^Recibida de\s+/, '')
      nombresFilas.push(nombre)
      const tid = await inp.getAttribute('data-testid')
      const idx = tid.replace('inp-recibida-', '')
      if (nombre === baseline.name) {
        inpBase = inp
        btnNoLlegoBase = await driver.findElement(By.css(`[data-testid="btn-no-llego-${idx}"]`))
      } else {
        inpFixture = inp
      }
    }
    marca(
      !!inpBase && !!inpFixture && !!btnNoLlegoBase,
      `inputs identificados por producto (base="${baseline.name}" filas=${JSON.stringify(nombresFilas)})`,
    )
    if (!inpBase || !inpFixture || !btnNoLlegoBase)
      throw new Error('inputs del modal no identificados')

    // --- guard: recibida > enviada → toast y NO abre ConfirmModal ---
    await inpFixture.clear()
    await inpFixture.sendKeys('99')
    await esperarToasts(driver)
    await driver.findElement(By.css('[data-testid="btn-aceptar"]')).click()
    marca(await aparece(driver, 'Cantidades inválidas', 6000), 'guard recibida > enviada → toast')
    marca(
      await noExiste(driver, 'Confirmar recepción'),
      'ConfirmModal NO se abre con cantidad inválida',
    )
    await esperarToasts(driver)

    // --- aceptación parcial: base = 0 (no llegó), fixture = 3 de 4 ---
    await btnNoLlegoBase.click()
    await inpFixture.clear()
    await inpFixture.sendKeys('3')
    marca(
      await apareceTexto(driver, 'Llega 3 de 9 unidades', 6000),
      'resumen: Llega 3 de 9 unidades',
    )
    marca(
      await apareceTexto(driver, 'estado: recibido_parcial', 3000),
      'estado previsto recibido_parcial',
    )

    // --- aceptar con ConfirmModal ---
    await esperarToasts(driver)
    await driver.findElement(By.css('[data-testid="btn-aceptar"]')).click()
    const btnConfirmar = await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space()='Confirmar recepción']")),
      8000,
    )
    marca(!!btnConfirmar, 'ConfirmModal de aceptación abre')
    await btnConfirmar.click()
    marca(await aparece(driver, 'Traslado aceptado', 10000), 'aceptación → toast éxito')

    // --- aserciones post-aceptación (espejo local) ---
    await driver.sleep(1500)
    const post = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = ${JSON.stringify(sesion.sucursal)}
       const g = async (s, p) => { const r = await db.productos_sucursal.get([s, p]); return r && r.stock }
       const t = await db.traslados.get(${JSON.stringify(TID)})
       const evs = (await db.cola_sincronizacion.where('tabla').equals('traslados').toArray())
         .filter((e) => e.datos && e.datos.rpc === 'aceptar_traslado' && e.sync_status === 'PENDING')
       return {
         destBase: await g(suc, ${JSON.stringify(baseline.id)}),
         destFix: await g(suc, ${JSON.stringify(FAKP)}),
         orgBase: await g(${JSON.stringify(FAKOR)}, ${JSON.stringify(baseline.id)}),
         orgFix: await g(${JSON.stringify(FAKOR)}, ${JSON.stringify(FAKP)}),
         estado: t && t.estado,
         evs: evs.length,
       }`,
    )
    marca(
      !post.error && post.destBase === baseline.stock,
      `stock destino base sin cambio (no llegó): ${baseline.stock} → ${post.destBase}`,
    )
    marca(post.destFix === 11, `stock destino solo lo recibido: 8 → ${post.destFix} (+3)`)
    marca(post.orgBase === 15, `stock origen recupera no llegado: 10 → ${post.orgBase} (+5)`)
    marca(post.orgFix === 11, `stock origen recupera diferencia: 10 → ${post.orgFix} (+1)`)
    marca(post.estado === 'recibido_parcial', `estado recibido_parcial (${post.estado})`)
    marca(post.evs === 1, `evento aceptar_traslado PENDING=1 (${post.evs})`)

    // --- la UI deja de ofrecer verificación (histórico solo lectura) ---
    const verificarTras = await driver.findElements(By.css('[data-testid="btn-verificar"]'))
    marca(verificarTras.length === 0, 'histórico: sin botón Verificar/Aceptar')
    const badgeHist = await driver
      .wait(
        until.elementLocated(
          By.xpath(
            "//table//span[contains(@class,'badge') and normalize-space()='recibido_parcial']",
          ),
        ),
        8000,
      )
      .catch(() => null)
    marca(!!badgeHist, 'badge recibido_parcial en la lista (tras recargar)')

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
    // --- limpieza: red y filas fixture del módulo ---
    try {
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      const clean = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const out = { borrados: 0, restaurados: 0 }
         const TID = ${JSON.stringify(TID)}
         const FAKP = ${JSON.stringify(FAKP)}
         const FAKOR = ${JSON.stringify(FAKOR)}
         const base = ${JSON.stringify(baseline)}
         const evs = await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()
         for (const e of evs) { await db.cola_sincronizacion.delete(e.id); out.borrados++ }
         const dets = await db.detalle_traslado.where('id_traslado').equals(TID).toArray()
         for (const d of dets) { await db.detalle_traslado.delete(d.id); out.borrados++ }
         if (await db.traslados.get(TID)) { await db.traslados.delete(TID); out.borrados++ }
         for (const [s, p] of [[base.suc, FAKP], [FAKOR, base.id], [FAKOR, FAKP]]) {
           if (await db.productos_sucursal.get([s, p])) { await db.productos_sucursal.delete([s, p]); out.borrados++ }
         }
         if (await db.productos.get(FAKP)) { await db.productos.delete(FAKP); out.borrados++ }
         if (base) {
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
      ? 'TRASLADOS MOVIMIENTOS E2E OK'
      : `TRASLADOS MOVIMIENTOS E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
