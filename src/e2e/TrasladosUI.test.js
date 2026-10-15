/**
 * E2E de UI del módulo Traslados — Task 4 (pestaña Traslados + ruta).
 * Requiere el dev server en :3000 (`npm start`).
 * Por defecto corre como **alex / Ferromax** (tiene sucursal hermana para el
 * destino y permisos `traslados` 4/4):  USUARIO=... CLAVE=... lo sobreescribe.
 * Flujo: login → #/traslados con red (lista, modal, guards) → CDP offline
 * antes del alta (fila PENDING determinista: badge + bloqueo de anulación;
 * Task 8 hizo que con red la cola suba sola) → pestaña Movimientos → alta
 * desde caché de destinos + lista espejo → limpieza con red aún cortada →
 * restaurar red al final.
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
let baseline = null // {suc, producto, stock} para restaurar en la limpieza
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
 * Igual que `aparece` pero contra el texto COMPLETO del nodo (normalize-space):
 * sirve para textos partidos en varios nodos, p. ej. `Total: {2} unidades`.
 */
async function apareceTexto(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[normalize-space(.)='${texto}']`)), ms)
    return true
  } catch (e) {
    return false
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

    // --- hidratación del catálogo local (espera stock de la sucursal) ---
    const sesion = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return u ? { id: u.id, sucursal: u.id_sucursal } : null
    `)
    marca(!!sesion && !!sesion.sucursal, `sesion sucursal=${sesion && sesion.sucursal}`)

    let baseProd = null
    for (let i = 0; i < 30 && !baseProd; i++) {
      const c = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const suc = ${JSON.stringify(sesion && sesion.sucursal)}
         const rows = await db.productos_sucursal.where('id_sucursal').equals(suc).toArray()
         if (!rows.length) return null
         const prods = await db.productos.toArray()
         const pMap = new Map(prods.map(p => [p.id, p]))
         const conNombre = rows
           .filter(s => pMap.has(s.id_producto))
           .map(s => ({ id: s.id_producto, stock: s.stock, name: pMap.get(s.id_producto).name }))
           .sort((a, b) => String(a.name).localeCompare(String(b.name)))
         return conNombre.length ? { ...conNombre[0], fuente: 'productos_sucursal' } : null`,
      )
      if (c && !c.error && c.id) baseProd = c
      else await sleep(2000)
    }
    marca(
      !!baseProd,
      `producto base del catálogo: ${baseProd ? baseProd.id.slice(0, 8) : 'ninguno'} stock=${baseProd && baseProd.stock} (${baseProd && baseProd.fuente})`,
    )
    baseline = baseProd ? { suc: sesion.sucursal, ...baseProd } : null

    // --- navegar a #/traslados (con red: carga el chunk de la ruta) ---
    await driver.executeScript("window.location.hash = '#/traslados'")
    marca(await aparece(driver, 'Traslados entre sucursales', 15000), 'ruta #/traslados renderiza')
    marca(
      (await driver.findElements(By.xpath("//*[contains(text(),'Movimientos')]"))).length > 0,
      'pestañas Traslados/Movimientos presentes',
    )

    // --- con red: lista cargada + destinos disponibles ---
    await driver.sleep(2500)
    marca(
      (await driver.findElements(By.css('table tbody tr')).length) > 0 ||
        (await noExiste(driver, 'Cargando')),
      'listado de enviados renderizado',
    )

    await driver.findElement(By.css('[data-testid="btn-nuevo-traslado"]')).click()
    marca(await aparece(driver, 'Nuevo traslado', 5000), 'modal Nuevo traslado abre')
    const opcionesDestino = await driver.findElements(By.css('[data-testid="sel-destino"] option'))
    marca(
      opcionesDestino.length > 1,
      `selector de destino con ${opcionesDestino.length - 1} sucursales hermanas`,
    )

    // --- guards del alta ---
    // Leer el primer producto real del modal para usar como baseline
    const primerProd = await script(
      driver,
      `const sel = document.querySelector('[data-testid="sel-producto"]')
       const opts = Array.from(sel.options).filter(o => o.value)
       return opts.length ? { id: opts[0].value, text: opts[0].textContent } : null`,
    )
    marca(!!primerProd, `primer producto del modal: ${primerProd && primerProd.text}`)
    if (primerProd) {
      // actualizar baseline al producto realmente visible en el modal
      const stockModal = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const suc = ${JSON.stringify(baseline.suc)}
         const row2 = await db.productos_sucursal.get([suc, ${JSON.stringify(primerProd.id)}])
         return { stock: row2 ? row2.stock : 0 }`,
      )
      baseline = {
        ...baseline,
        id: primerProd.id,
        stock: stockModal ? stockModal.stock : baseline.stock,
      }
      console.log(
        `  · baseline ajustado al modal: id=${primerProd.id.slice(0, 8)} stock=${baseline.stock}`,
      )
    }
    await driver.findElement(By.css('[data-testid="btn-agregar-linea"]')).click()
    marca(await aparece(driver, 'Falta el producto'), 'guard sin producto')
    await esperarToasts(driver)

    await new Select(
      await driver.findElement(By.css('[data-testid="sel-producto"]')),
    ).selectByValue(baseline.id)
    const inpCant = await driver.findElement(By.css('[data-testid="inp-cantidad"]'))
    await inpCant.clear()
    await inpCant.sendKeys('0')
    await driver.findElement(By.css('[data-testid="btn-agregar-linea"]')).click()
    marca(await aparece(driver, 'Cantidad inválida'), 'guard cantidad <= 0')
    await esperarToasts(driver)

    await inpCant.clear()
    await inpCant.sendKeys(String((baseline ? baseline.stock : 5) + 3))
    await driver.findElement(By.css('[data-testid="btn-agregar-linea"]')).click()
    marca(await aparece(driver, 'Stock insuficiente'), 'guard stock > disponible')
    await esperarToasts(driver)

    // --- alta válida (2 unidades) ---
    // Task 8: con red la cola sube los traslados sola (RF-T2), así que el badge
    // «sin sincronizar» y el bloqueo de anulación de fila PENDING serían una
    // carrera con el motor. Se corta la red antes del alta para que la fila
    // quede PENDING de forma determinista (el título del toast es el mismo
    // con o sin red; ver TrasladosPage.registrar).
    // El espejo ya hidrata el histórico del servidor: se mide la base antes.
    const filasBase = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       return (await db.traslados.where('id_sucursal_origen').equals(${JSON.stringify(baseline.suc)}).toArray()).length`,
    )
    marca(
      typeof filasBase === 'number',
      `espejo base antes de las altas: ${filasBase} filas de sucursal`,
    )
    await driver.sendDevToolsCommand('Network.enable', {})
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await driver.sleep(700)
    marca(true, 'red cortada antes del alta (PENDING determinista)')
    await new Select(await driver.findElement(By.css('[data-testid="sel-destino"]'))).selectByIndex(
      1,
    )
    const nombreDestino = await (
      await driver.findElement(By.css('[data-testid="sel-destino"] option:checked'))
    ).getText()
    await inpCant.clear()
    await inpCant.sendKeys('2')
    await driver.findElement(By.css('[data-testid="btn-agregar-linea"]')).click()
    marca(await apareceTexto(driver, 'Total: 2 unidades', 5000), 'línea agregada: Total 2 unidades')
    await driver.findElement(By.css('[data-testid="btn-registrar"]')).click()
    marca(await aparece(driver, 'Traslado registrado', 8000), 'alta → toast éxito (local-first)')
    console.log('  · destino elegido:', JSON.stringify(nombreDestino))
    const filaDestino = await driver
      .wait(
        until.elementLocated(
          By.xpath(`//td[contains(., ${JSON.stringify(nombreDestino.trim())})]`),
        ),
        10000,
      )
      .catch(() => null)
    marca(!!filaDestino, 'fila del traslado visible en la tabla')
    const badgePend = await driver
      .wait(until.elementLocated(By.xpath("//*[contains(text(),'sin sincronizar')]")), 8000)
      .catch(() => null)
    marca(!!badgePend, 'badge sin sincronizar (PENDING) visible')

    const stock1 = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       // leer el último traslado para saber si usó bodega
       const ts = await db.traslados.where('id_sucursal_origen').equals(${JSON.stringify(baseline.suc)}).toArray()
       const ultimo = ts[ts.length - 1]
       const usaBodega = ultimo && ultimo.id_bodega_origen
       if (usaBodega) {
         const row = await db.stock_bodega.get([ultimo.id_bodega_origen, ${JSON.stringify(baseline.id)}])
         return { fuente: 'stock_bodega', stock: row && row.stock, bodega: ultimo.id_bodega_origen.slice(0, 8) }
       }
       const row2 = await db.productos_sucursal.get([${JSON.stringify(baseline.suc)}, ${JSON.stringify(baseline.id)}])
       return { fuente: 'productos_sucursal', stock: row2 && row2.stock }`,
    )
    marca(
      stock1 && stock1.stock === baseline.stock - 2,
      `stock descontado en el alta: ${baseline.stock} → ${stock1 && stock1.stock} (${stock1 && stock1.fuente}, −2)`,
    )

    // --- bloqueo de anulación de fila PENDING ---
    await esperarToasts(driver)
    const btnAnular = await driver.findElements(By.css('[data-testid="btn-anular"]'))
    marca(btnAnular.length > 0, 'botón anular presente en la fila enviada')
    if (btnAnular.length) {
      await btnAnular[0].click()
      marca(
        await aparece(driver, 'local sin sincronizar', 5000),
        'anular PENDING → aviso de bloqueo',
      )
      marca(await noExiste(driver, 'Anular traslado'), 'ConfirmModal NO se abre para fila PENDING')
    }

    // --- pestaña Movimientos (solo lectura por ahora) ---
    await esperarToasts(driver)
    marca(await clicPestana(driver, 'Movimientos'), 'clic en pestaña Movimientos')
    marca(
      await aparece(driver, 'No hay movimientos recibidos', 6000),
      'pestaña Movimientos renderiza (vacía)',
    )

    // ================= sin red (CDP) =================
    await driver.sendDevToolsCommand('Network.enable', {})
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    })
    await driver.sleep(700)
    marca(true, 'red cortada con CDP (se mantiene desde el alta)')

    // regla 4: hash ≠ mismo valor → pasar por otra ruta antes de volver
    await driver.executeScript("window.location.hash = '#/dashboard'")
    await driver.sleep(1500)
    await driver.executeScript("window.location.hash = '#/traslados'")
    marca(
      await aparece(driver, 'Traslados entre sucursales', 15000),
      'navegación sin red a #/traslados',
    )
    marca(
      await aparece(driver, 'estás viendo los registros locales', 6000),
      'alerta de sin conexión visible',
    )
    const filaEspejo = await driver
      .wait(
        until.elementLocated(
          By.xpath(`//td[contains(., ${JSON.stringify(nombreDestino.trim())})]`),
        ),
        12000,
      )
      .catch(() => null)
    marca(!!filaEspejo, 'lista espejo muestra la fila PENDING sin red')

    // --- alta sin red (destino desde caché) ---
    await driver.findElement(By.css('[data-testid="btn-nuevo-traslado"]')).click()
    marca(await aparece(driver, 'Nuevo traslado', 5000), 'modal abre sin red')
    const opcionesOffline = await driver.findElements(By.css('[data-testid="sel-destino"] option'))
    marca(
      opcionesOffline.length > 1,
      `destinos desde caché sin red (${opcionesOffline.length - 1} opciones)`,
    )
    await new Select(await driver.findElement(By.css('[data-testid="sel-destino"]'))).selectByIndex(
      1,
    )
    await new Select(
      await driver.findElement(By.css('[data-testid="sel-producto"]')),
    ).selectByValue(baseline.id)
    const inpCant2 = await driver.findElement(By.css('[data-testid="inp-cantidad"]'))
    await inpCant2.clear()
    await inpCant2.sendKeys('1')
    await driver.findElement(By.css('[data-testid="btn-agregar-linea"]')).click()
    await driver.findElement(By.css('[data-testid="btn-registrar"]')).click()
    marca(
      await aparece(driver, 'Sin conexión: guardado en este dispositivo', 8000),
      'alta sin red → toast cola PENDING',
    )
    await driver.sleep(1500)

    const stock2 = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const ts = await db.traslados.where('id_sucursal_origen').equals(${JSON.stringify(baseline.suc)}).toArray()
       const ultimo = ts[ts.length - 1]
       const usaBodega = ultimo && ultimo.id_bodega_origen
       if (usaBodega) {
         const row = await db.stock_bodega.get([ultimo.id_bodega_origen, ${JSON.stringify(baseline.id)}])
         return { fuente: 'stock_bodega', stock: row && row.stock }
       }
       const row2 = await db.productos_sucursal.get([${JSON.stringify(baseline.suc)}, ${JSON.stringify(baseline.id)}])
       return { fuente: 'productos_sucursal', stock: row2 && row2.stock }`,
    )
    marca(
      stock2 && stock2.stock === baseline.stock - 3,
      `stock descontado sin red: ${baseline.stock} → ${stock2 && stock2.stock} (${stock2 && stock2.fuente}, −3 acumulado)`,
    )
    const filasTras = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       return (await db.traslados.where('id_sucursal_origen').equals(${JSON.stringify(baseline.suc)}).toArray()).length`,
    )
    marca(
      filasTras === (filasBase || 0) + 2,
      `2 altas sumadas al espejo local: base ${filasBase} → ${filasTras}`,
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
    // --- limpieza: con la red AÚN cortada se borran eventos y filas locales
    // para que el motor no suba nada al restaurar (deja cero basura en el
    // servidor); recién después vuelve la red ---
    try {
      const clean = await script(
        driver,
        `const { db } = await import('/src/lib/db.js')
         const out = { borrados: 0, restaurados: 0 }
         const base = ${JSON.stringify(baseline)}
         const evs = await db.cola_sincronizacion.where('tabla').equals('traslados').toArray()
         for (const e of evs) { await db.cola_sincronizacion.delete(e.id); out.borrados++ }
         const ts = await db.traslados.toArray()
         for (const t of ts) {
           const dets = await db.detalle_traslado.where('id_traslado').equals(t.id).toArray()
           for (const d of dets) { await db.detalle_traslado.delete(d.id); out.borrados++ }
           await db.traslados.delete(t.id); out.borrados++
         }
          if (base) {
            // multibodega: restaurar stock_bodega si el baseline venía de ahí
            const bod = await db.bodegas.where('id_sucursal').equals(base.suc).filter((b) => b.es_principal).first()
            if (bod && base.fuente === 'stock_bodega') {
              const rowB = await db.stock_bodega.get([bod.id, base.id])
              if (rowB && rowB.stock !== base.stock) {
                await db.stock_bodega.put({ ...rowB, stock: base.stock })
                out.restaurados++
              }
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
    fallos.length === 0 ? 'TRASLADOS UI E2E OK' : `TRASLADOS UI E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
