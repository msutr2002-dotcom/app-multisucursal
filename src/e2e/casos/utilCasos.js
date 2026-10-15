/**
 * Utilidades E2E para la suite de casos de prueba CP-* (Selenium + Edge).
 *
 * Requiere el dev server en :3000 (`npm start`). Cada suite:
 *  - define sus metadatos (escenario, pasos, requisitos, datos, esperado)
 *  - ejecuta los pasos con `await caso(driver, RESULTADOS, meta, async () => {...})`
 *  - `caso` SIEMPRE toma captura en `docs/capturas/<ID>.png` (pase o falle)
 *  - `guardarResultados('Suite', RESULTADOS)` escribe
 *    `docs/e2e-resultados/<Suite>.json` con el formato estándar completo
 *
 * El informe final se genera con `node src/e2e/casos/generarInforme.js`.
 */
const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')
const { Select } = require('selenium-webdriver/lib/select')
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..', '..', '..')
const BASE = process.env.BASE || 'http://localhost:3000'
const SUPA = 'https://qgsiysbslwurjyjocfii.supabase.co/rest/v1'
const KEY = 'sb_publishable_UzTuJoa-XqBWNg_mYztY4g_sACMQlCY'
const USUARIO = process.env.USUARIO || 'alex'
const CLAVE = process.env.CLAVE || 'alex123'
const ROL_GERENTE = '3cf414b4-156f-40d2-a6a2-715ad8113283'
const ROL_VENDEDOR = 'ac790fe3-b862-4ad8-8155-414d276f5ca3'

const CAPTURAS = path.join(RAIZ, 'docs', 'capturas')
const RESULTADOS = path.join(RAIZ, 'docs', 'e2e-resultados')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function crearDriver() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run', '--window-size=1440,900'))
    .build()
  await driver.manage().setTimeouts({ script: 40000 })
  return driver
}

async function resolverEmpresa(usuario = USUARIO) {
  try {
    const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
    const usuarios = await fetch(`${SUPA}/users?select=id_sucursal&username=eq.${usuario}`, {
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

/** Login con sesión fresca (limpia localStorage y elige empresa si aplica). */
async function login(driver, { usuario = USUARIO, clave = CLAVE } = {}) {
  await driver.get(BASE + '/#/')
  await driver.sleep(1200)
  await driver.executeScript(
    "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
  )
  await driver.get(BASE + '/#/')
  await driver.wait(until.elementLocated(By.id('email')), 15000)
  const empresaId = await resolverEmpresa(usuario)
  await (await driver.findElement(By.id('email'))).clear()
  await (await driver.findElement(By.id('email'))).sendKeys(usuario)
  await (await driver.findElement(By.id('password'))).clear()
  await (await driver.findElement(By.id('password'))).sendKeys(clave)
  if (empresaId) {
    await driver.wait(until.elementLocated(By.css(`#empresa option[value="${empresaId}"]`)), 10000)
    await new Select(await driver.findElement(By.id('empresa'))).selectByValue(empresaId)
  }
  await driver.findElement(By.css('[data-testid="btn-login"]')).click()
  await driver.sleep(4000)
}

/** Ejecuta JS asíncrono en la página (import dinámico de Dexie, etc.). */
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

/** Igual que `aparece` pero contra el texto COMPLETO del nodo (normalize-space). */
async function apareceTexto(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[normalize-space(.)='${texto}']`)), ms)
    return true
  } catch (e) {
    return false
  }
}

/** Búsqueda inmediata (sin esperar): True si NO existe el nodo con el texto. */
async function noExiste(driver, texto) {
  const els = await driver.findElements(By.xpath(`//*[contains(text(),'${texto}')]`))
  return els.length === 0
}

/** True si el nodo con el texto existe en este momento. */
async function existe(driver, texto) {
  const els = await driver.findElements(By.xpath(`//*[contains(text(),'${texto}')]`))
  return els.length > 0
}

/** Clic en el primer elemento (botón/enlace) cuyo texto contiene `texto`. */
async function clicTexto(driver, texto, ms = 7000) {
  const el = await driver.wait(
    until.elementLocated(By.xpath(`//button[contains(., '${texto}') or .//span[contains(., '${texto}')]] | //a[contains(., '${texto}')]`)),
    ms,
  )
  await driver.wait(until.elementIsVisible(el), 3000)
  await el.click()
  return true
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

/** Espera a que se oculten los toasts (autohide 5 s, tapan botones en top-end). */
async function esperarToasts(driver, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const visibles = await driver.findElements(By.css('.toast.show'))
    if (!visibles.length) return
    await sleep(300)
  }
}

/**
 * Navega por hash respetando la regla del repo: re-setear el MISMO hash no
 * dispara navegación, así que si ya estás ahí pasa por #/dashboard primero.
 */
async function navegar(driver, ruta, esperaMs = 2500) {
  const destino = ruta.startsWith('#') ? ruta : '#' + ruta
  const actual = await driver.executeScript('return location.hash')
  if (actual === destino) {
    await driver.executeScript("window.location.hash = '#/dashboard'")
    await driver.sleep(700)
  }
  await driver.executeScript(`window.location.hash = ${JSON.stringify(destino)}`)
  await driver.sleep(esperaMs)
}

/** Carga completa por URL (solo con red; con lazy chunks en dev sin red revienta). */
async function abrirRuta(driver, ruta, esperaMs = 3000) {
  await driver.get(BASE + '/#' + ruta)
  await driver.sleep(esperaMs)
}

async function cortarRed(driver) {
  await driver.sendDevToolsCommand('Network.enable', {})
  await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  })
  await driver.sleep(700)
}

async function restaurarRed(driver) {
  try {
    await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
    await driver.sleep(700)
  } catch (e) {
    /* driver ya cerrado */
  }
}

/** Captura de pantalla SIEMPRE disponible para cada caso. */
async function captura(driver, id) {
  fs.mkdirSync(CAPTURAS, { recursive: true })
  const b64 = await driver.takeScreenshot()
  const rel = path.join('docs', 'capturas', `${id}.png`).split(path.sep).join('/')
  fs.writeFileSync(path.join(RAIZ, rel), Buffer.from(b64, 'base64'))
  return rel
}

/**
 * Ejecuta un caso de prueba del formato estándar.
 * `fn` devuelve el TEXTO del resultado real observado; si lanza, el mensaje
 * del error queda como resultado real y el estado pasa a Reprobado.
 * La captura se toma siempre (pase o falle).
 */
async function caso(driver, resultados, meta, fn) {
  let real = ''
  let estado = 'Aprobado'
  try {
    const r = await fn()
    real = r || 'Se ejecutó sin observar desviaciones de lo esperado'
  } catch (e) {
    estado = 'Reprobado'
    real = String((e && e.message) || e).split('\n').slice(0, 6).join(' ')
  }
  let capt = ''
  try {
    capt = await captura(driver, meta.id)
  } catch (e) {
    capt = '(sin captura: ' + String(e).slice(0, 80) + ')'
  }
  const item = { ...meta, real, estado, captura: capt }
  resultados.push(item)
  console.log(
    `${estado === 'Aprobado' ? 'APROBADO ' : 'REPROBADO'} ${meta.id} :: ${real.slice(0, 140)}`,
  )
  return item
}

/** Escribe los resultados de la suite en docs/e2e-resultados/<nombre>.json. */
function guardarResultados(nombre, resultados) {
  fs.mkdirSync(RESULTADOS, { recursive: true })
  const ordenados = [...resultados].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const archivo = path.join(RESULTADOS, `${nombre}.json`)
  fs.writeFileSync(archivo, JSON.stringify(ordenados, null, 2), 'utf8')
  console.log(`  · resultados: ${path.relative(RAIZ, archivo)} (${ordenados.length} casos)`)
  return archivo
}

/** Lanza Error si la condición no se cumple (mensaje = resultado real fallido). */
function check(cond, mensaje) {
  if (!cond) throw new Error(mensaje)
  return true
}

// ---------- permisos (upsert_permiso con clave publicable) ----------

async function rpc(nombre, cuerpo = {}) {
  const r = await fetch(`${SUPA}/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  const txt = await r.text()
  try {
    return { status: r.status, data: txt ? JSON.parse(txt) : null }
  } catch (e) {
    return { status: r.status, data: txt }
  }
}

async function leerPermiso(idRol, modulo) {
  const { data } = await rpc('get_permisos_by_rol', { p_id_rol: idRol })
  const fila = Array.isArray(data) ? data.find((x) => x.modulo === modulo) : null
  if (!fila) return null
  return {
    ver: fila.puede_ver,
    crear: fila.puede_crear,
    editar: fila.puede_editar,
    eliminar: fila.puede_eliminar,
  }
}

async function ponerPermiso(idRol, modulo, p) {
  const prev = (await leerPermiso(idRol, modulo)) || {}
  const { status, data } = await rpc('upsert_permiso', {
    p_id_rol: idRol,
    p_modulo: modulo,
    p_puede_ver: p.ver ?? prev.ver ?? false,
    p_puede_crear: p.crear ?? prev.crear ?? false,
    p_puede_editar: p.editar ?? prev.editar ?? false,
    p_puede_eliminar: p.eliminar ?? prev.eliminar ?? false,
  })
  if (status !== 204 && status !== 200) throw new Error(`upsert_permiso ${status}: ${data}`)
  return true
}

/**
 * Aplica permisos temporales sobre `idRol`, ejecuta `fn` y RESTAURA el estado
 * previo en el finally (nunca deja el rol tocado si el caso revienta).
 */
async function permisoTemporal(idRol, modulo, cambios, fn) {
  const prev = await leerPermiso(idRol, modulo)
  if (!prev) throw new Error(`no existe permiso de ${modulo} para el rol`)
  await ponerPermiso(idRol, modulo, cambios)
  try {
    return await fn()
  } finally {
    await ponerPermiso(idRol, modulo, prev)
  }
}

module.exports = {
  RAIZ,
  BASE,
  SUPA,
  KEY,
  USUARIO,
  CLAVE,
  ROL_GERENTE,
  ROL_VENDEDOR,
  Builder,
  By,
  until,
  Select,
  sleep,
  crearDriver,
  resolverEmpresa,
  login,
  script,
  aparece,
  apareceTexto,
  noExiste,
  existe,
  clicTexto,
  clicPestana,
  esperarToasts,
  navegar,
  abrirRuta,
  cortarRed,
  restaurarRed,
  captura,
  caso,
  guardarResultados,
  check,
  rpc,
  leerPermiso,
  ponerPermiso,
  permisoTemporal,
}
