/**
 * E2E de navegación y permisos de Traslados — Task 7 (RF-T7). Requiere el dev
 * server en :3000 (`npm start`). Corre en 2 sesiones:
 *   A) alex / Gerente (default; USUARIO=... CLAVE=... lo sobreescribe):
 *      MobileNav con Traslados a 390px → sidebar → clic → /traslados renderiza →
 *      revoke `traslados/ver` → sidebar oculta → redirect a #/dashboard + cache
 *      `perm_<rol>_traslados_ver = '0'` → offline: el redirect sigue resolviendo
 *      con la cache → restore → sidebar vuelve.
 *   B) system / Admin: /roles → badge de Gerente `traslados: ver, crear, editar,
 *      eliminar` → Permisos → ModalPermisos con la fila `traslados` y sus
 *      4 checkboxes marcados → consola → restaurar permiso/red.
 * Si A se corre como Admin los segmentos de permiso se omiten (Admin = true).
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

const SID = '.sidebar a[href="#/traslados"]'
const SID_MARCA = '.sidebar a[href="#/compras"]'
const MOB = '.mobile-nav a[href="#/traslados"]'

const fallos = []
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

async function aparece(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'${texto}')]`)), ms)
    return true
  } catch (e) {
    return false
  }
}

/** True si un nodo contiene el texto completo con espacios normalizados (JSX partido). */
async function apareceTexto(driver, texto, ms = 8000) {
  try {
    await driver.wait(
      until.elementLocated(By.xpath(`//*[contains(normalize-space(.), ${JSON.stringify(texto)})]`)),
      ms,
    )
    return true
  } catch (e) {
    return false
  }
}

async function presente(driver, css) {
  const els = await driver.findElements(By.css(css))
  return els.length > 0
}

/** Poll: el selector aparece (2 lecturas seguidas; tolera el flash del primer render). */
async function presentePoll(driver, css, ms = 12000) {
  const fin = Date.now() + ms
  let seguidas = 0
  while (Date.now() < fin) {
    const els = await driver.findElements(By.css(css))
    if (els.length) {
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

/** Poll: el selector desaparece (2 lecturas seguidas). */
async function ausente(driver, css, ms = 12000) {
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

async function esperarToasts(driver, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const visibles = await driver.findElements(By.css('.toast.show'))
    if (!visibles.length) return
    await sleep(300)
  }
}

async function hashActual(driver) {
  return driver.executeScript('return window.location.hash')
}

/** Espera el header del POS (marcador de app lista tras cada refresh). */
async function appLista(driver) {
  await driver.wait(until.elementLocated(By.css('[aria-label="Sincronizar ahora"]')), 15000)
}

async function resolverEmpresa(usuario) {
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

/** Login determinista reutilizable (sesión fresca + empresa si el rol la requiere). */
async function login(driver, usuario, clave) {
  const url = await driver.getCurrentUrl()
  if (!url.startsWith(BASE)) await driver.get(BASE + '/#/')
  // limpiar y recargar (con el MISMO hash `get` no navega: hay que refrescar)
  await driver.executeScript(
    "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
  )
  await driver.navigate().refresh()
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
  console.log(`  · sesión iniciada como ${usuario}`)
  await driver.sleep(5000)
}

async function main() {
  const driver = await new Builder()
    .forBrowser('MicrosoftEdge')
    .setEdgeOptions(new edge.Options().addArguments('--no-first-run'))
    .build()

  try {
    await driver.manage().setTimeouts({ script: 40000 })

    // ================= A) alex / Gerente =================
    await login(driver, USUARIO, CLAVE)
    const sesion = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return u
        ? { rolId: (u.id_rol && u.id_rol.id) || null, rolNombre: (u.id_rol && u.id_rol.name) || '' }
        : null
    `)
    marca(!!sesion && !!sesion.rolId, `sesion rol=${sesion && sesion.rolNombre}`)
    rolId = sesion && sesion.rolId
    esAdmin = !!(sesion && sesion.rolNombre === 'Admin')

    if (!esAdmin && rolId) {
      // heal: un run anterior pudo dejar el permiso revocado
      await setPermisoVer(true)
      marca((await permisoVer()) === true, 'heal: traslados/ver = true en servidor')
      await driver.navigate().refresh()
      await appLista(driver)
    } else {
      marca(true, `segmento de permiso requiere no-Admin (rol ${sesion.rolNombre || '?'})`)
    }

    // --- MobileNav (viewport móvil) ---
    await driver.manage().window().setRect({ x: 0, y: 0, width: 390, height: 844 })
    await driver.sleep(700)
    let movOk = presente(driver, MOB)
    if (movOk) {
      const el = await driver.findElement(By.css(MOB))
      movOk = await el.isDisplayed()
    }
    marca(movOk, 'MobileNav con enlace Traslados (390px)')
    await driver.manage().window().setRect({ x: 0, y: 0, width: 1440, height: 900 })
    await driver.sleep(500)

    // --- sidebar → Traslados renderiza /traslados ---
    marca(await presentePoll(driver, SID_MARCA), 'sidebar lista (marca Compras)')
    marca(await presentePoll(driver, SID), 'sidebar con link Traslados')
    await esperarToasts(driver)
    await driver.findElement(By.css(SID)).click()
    const hMod = await hashActual(driver)
    marca(hMod === '#/traslados', `clic sidebar → hash ${hMod}`)
    marca(await aparece(driver, 'Traslados entre sucursales', 15000), '/traslados renderiza')

    if (!esAdmin && rolId) {
      // --- revoke → oculta en el nav + redirect + cache '0' ---
      await setPermisoVer(false)
      marca((await permisoVer()) === false, 'traslados/ver revocado en servidor')
      await driver.navigate().refresh()
      await appLista(driver)
      marca(await presentePoll(driver, SID_MARCA), 'sidebar lista tras revoke')
      marca(await ausente(driver, SID), 'sidebar oculta sin traslados/ver')

      await driver.executeScript("window.location.hash='#/traslados'")
      await sleep(1800)
      marca(
        (await hashActual(driver)) === '#/dashboard',
        'redirect sin permiso (con red) → #/dashboard',
      )

      const claveCache = `perm_${rolId}_traslados_ver`
      const cache = await driver.executeScript(
        `return localStorage.getItem(${JSON.stringify(claveCache)})`,
      )
      marca(cache === '0', `cache ${claveCache} = '${cache}'`)

      // --- offline: la cache '0' sigue redirigiendo ---
      await driver.sendDevToolsCommand('Network.enable', {})
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      })
      await driver.sleep(700)
      await driver.executeScript("window.location.hash='#/traslados'")
      await sleep(2000)
      marca((await hashActual(driver)) === '#/dashboard', 'redirect sin permiso OFFLINE (cache 0)')
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      await driver.sleep(700)
      marca(true, 'red restaurada tras el corte')

      // --- restore → el sidebar vuelve ---
      await setPermisoVer(true)
      marca((await permisoVer()) === true, 'traslados/ver restaurado en servidor')
      await driver.navigate().refresh()
      await appLista(driver)
      marca(await presentePoll(driver, SID), 'sidebar visible tras restaurar permiso')
    } else {
      marca(true, 'segmentos de revoke/redirect omitidos (Admin)')
    }

    // ================= B) system / Admin → ModalPermisos =================
    if (!esAdmin) await login(driver, 'system', 'system321')
    const admin = await driver.executeScript(`
      const u = JSON.parse(localStorage.getItem('currentUser') || 'null')
      return (u && u.id_rol && u.id_rol.name) || ''
    `)
    marca(admin === 'Admin', `segundo inicio como Admin (${admin})`)

    await driver.executeScript("window.location.hash='#/roles'")
    marca(await aparece(driver, 'Gestión de Roles y Permisos', 15000), '/roles renderiza')
    marca(
      await apareceTexto(driver, 'traslados: ver, crear, editar, eliminar', 10000),
      'badge Gerente: traslados ver, crear, editar, eliminar',
    )

    // Permisos de la tarjeta de Gerente
    const btnPermisos = await driver.wait(
      until.elementLocated(
        By.xpath(
          `//h6[normalize-space(.)='Gerente']/ancestor::div[contains(concat(' ',normalize-space(@class),' '),' card ')][1]//button[normalize-space(.)='Permisos']`,
        ),
      ),
      15000,
    )
    await driver.wait(until.elementIsVisible(btnPermisos), 5000)
    await btnPermisos.click()
    marca(true, 'ModalPermisos abierto (fila Permisos de Gerente)')

    await driver.wait(until.elementLocated(By.xpath(`//td[normalize-space(.)='traslados']`)), 15000)
    marca(true, 'fila «traslados» en ModalPermisos')

    // los checkboxes se marcan cuando resuelve get_permisos_by_rol → poll
    let checks = []
    let marcados = 0
    const fin = Date.now() + 12000
    while (Date.now() < fin && marcados < 4) {
      checks = await driver.findElements(
        By.xpath(`//td[normalize-space(.)='traslados']/parent::tr//input[@type='checkbox']`),
      )
      marcados = 0
      for (const c of checks) {
        try {
          if (await c.isSelected()) marcados++
        } catch (e) {}
      }
      if (marcados < 4) await sleep(300)
    }
    marca(checks.length === 4, `la fila tiene ${checks.length} checkboxes (esperados 4)`)
    marca(marcados === 4, `${marcados}/4 checkboxes marcados (Gerente 4/4)`)

    // cerrar el modal sin guardar
    const cancelar = await driver.findElements(By.xpath(`//button[normalize-space(.)='Cancelar']`))
    for (const b of cancelar) {
      if (await b.isDisplayed()) {
        await b.click()
        break
      }
    }
    await sleep(600)

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
    // --- siempre: red, permiso y viewport a su estado inicial ---
    try {
      await driver.sendDevToolsCommand('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
    } catch (e) {}
    try {
      await driver.manage().window().setRect({ x: 0, y: 0, width: 1440, height: 900 })
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
      await driver.quit()
    } catch (e) {}
  }
  console.log(
    fallos.length === 0 ? 'TRASLADOS NAV E2E OK' : `TRASLADOS NAV E2E FALLA: ${fallos.join(' | ')}`,
  )
  process.exit(fallos.length === 0 ? 0 : 1)
}

main()
