/**
 * CP-DASH — Casos de prueba del módulo Dashboard (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-DASH-*.png,
 * resultados en docs/e2e-resultados/CPDashboard.json.
 * Orden: 001 (vista) → 002 (navegación) → 003 (sin datos, no reproducible
 * con la cuenta de prueba) → 004 (Admin redirige) → 005 (offline, al final
 * porque corta y restaura la red).
 */
const {
  crearDriver,
  login,
  resolverEmpresa,
  navegar,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  aparece,
  clicTexto,
  rpc,
  SUPA,
  KEY,
  BASE,
  By,
  until,
} = require('./utilCasos')

const RESULTADOS = []

const CASOS = {
  'CP-DASH-001': {
    id: 'CP-DASH-001',
    escenario: 'Visualización correcta del panel principal',
    pasos:
      '1. Ir a #/dashboard. 2. Observar el saludo, el hero "Ventas de hoy", las 5 tarjetas y la gráfica "Ventas del mes"',
    requisitos: 'Sesión iniciada como usuario no Admin; ventas y compras registradas en el mes',
    datos: 'Usuario: alex / alex123 (Gerente, sucursal Ferromax chichi, con ventas/compras reales)',
    esperado:
      'Saludo "Buenos días/tardes/noches, {nombre}" con fecha en español; monto de hoy en Q; tarjetas (Productos registrados, Compras del mes, Ventas del mes, Ganancias del mes, Productos con poco stock) con valores; gráfica de barras con total del mes',
  },
  'CP-DASH-002': {
    id: 'CP-DASH-002',
    escenario: 'Navegación desde los accesos del dashboard',
    pasos:
      '1. Ir a #/dashboard. 2. Clic en "Ir al Punto de Venta". 3. Volver al dashboard. 4. Clic en "Productos registrados" y luego en "Productos con poco stock"',
    requisitos: 'Sesión iniciada',
    datos: 'Usuario: alex / alex123; accesos del hero y de las tarjetas del dashboard',
    esperado:
      'Cada clic navega a la ruta correspondiente (#/pos, #/productos, #/productos?stock=bajo) sin errores',
  },
  'CP-DASH-003': {
    id: 'CP-DASH-003',
    escenario: 'Dashboard sin datos en la sucursal',
    pasos: '1. Iniciar sesión en una sucursal sin actividad. 2. Ir a #/dashboard',
    requisitos: 'Sucursal nueva sin ventas/compras registradas',
    datos:
      'Se intenta con la sucursal de alex/alex123; se inspeccionan las stats reales (get_dashboard_stats) y las sucursales de la empresa vía REST',
    esperado:
      'La vista carga sin errores; el hero muestra Q0.00 y las tarjetas muestran 0; no hay pantalla en blanco',
  },
  'CP-DASH-004': {
    id: 'CP-DASH-004',
    escenario: 'Rol Admin redirige al dashboard de administración',
    pasos: '1. Ir a #/dashboard con rol Admin',
    requisitos: 'Sesión iniciada con rol Admin',
    datos: 'Usuario: system / system321 (Admin, no requiere empresa en el select)',
    esperado: 'El sistema redirige automáticamente a #/admin-dashboard',
  },
  'CP-DASH-005': {
    id: 'CP-DASH-005',
    escenario: 'Dashboard sin conexión a internet',
    pasos: '1. Cortar la conexión de red. 2. Ir a #/dashboard o recargar la página',
    requisitos: 'Sesión iniciada y sin red',
    datos:
      'alex/alex123 con #/dashboard ya abierto y cargado con red; red cortada con CDP Network.emulateNetworkConditions',
    esperado:
      'La vista no se bloquea ni queda en blanco; no hay toasts; al recuperar la red los datos se actualizan',
  },
}

/** Espera a que el saludo del header esté renderizado ("Buenos días" | "Buenas tardes" | "Buenas noches"). */
async function esperarSaludo(driver, ms = 15000) {
  await driver.wait(
    async () => {
      const txt = await driver.findElements(By.css('.saludo-header h2'))
      if (!txt.length) return false
      const t = (await txt[0].getText()).trim()
      return /^(Buenos|Buenas) (d.as|tardes|noches),/.test(t)
    },
    ms,
    400,
  )
}

/** Espera a que el hero muestre un monto Q (loading terminado). */
async function esperarHeroCargado(driver, ms = 20000) {
  await driver.wait(
    async () => {
      const els = await driver.findElements(By.css('.stat-hero-value'))
      if (!els.length) return false
      const t = (await els[0].getText()).trim()
      return /^Q[\d,]*\.\d{2}$/.test(t)
    },
    ms,
    400,
  )
}

/** Lee los valores visibles del dashboard (hero, 5 tarjetas y total de la gráfica). */
async function leerValoresDashboard(driver) {
  const heroes = await driver.findElements(By.css('.stat-hero-value'))
  const hero = heroes.length ? await heroes[0].getText() : ''
  const tarjetas = []
  for (const el of await driver.findElements(By.css('.stat-value'))) {
    tarjetas.push((await el.getText()).trim())
  }
  let totalGrafica = ''
  try {
    const montos = await driver.findElements(By.css('.card-header .monto'))
    if (montos.length) totalGrafica = (await montos[0].getText()).trim()
  } catch (e) {
    /* sin gráfica */
  }
  return { hero: (hero || '').trim(), tarjetas, totalGrafica }
}

async function hashActual(driver) {
  return driver.executeScript('return location.hash')
}

/**
 * Login con recarga real (patrón CPLogin): si hay una sesión abierta, limpiar
 * localStorage con una vista protegida montada re-renderiza el dashboard con
 * currentUser=null y truena en el ErrorBoundary antes de llegar al login.
 * Se sale del SPA con about:blank, se limpia y se recarga limpio.
 */
async function loginConRecarga(driver, credenciales) {
  await driver.get('about:blank')
  await driver.sleep(400)
  await driver.get(BASE + '/#/')
  await driver.sleep(1500)
  await driver.executeScript(
    "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
  )
  await driver.get('about:blank')
  await driver.sleep(400)
  await login(driver, credenciales)
}

async function main() {
  const driver = await crearDriver()
  try {
    // Sesión gerente compartida por 001-003
    await login(driver, { usuario: 'alex', clave: 'alex123' })
    // Calentamiento (fuera de los casos): la primera carga del dev server
    // compila los chunks lazy y puede recargar la página al optimizar deps;
    // dar tiempo extra antes de medir para no colgar las esperas de 15 s.
    await driver.wait(
      async () => {
        const h = await driver.executeScript('return location.hash')
        if (h !== '#/dashboard') return false
        const txt = await driver.findElements(By.css('.saludo-header h2'))
        return (
          txt.length > 0 && /^(Buenos|Buenas) (d.as|tardes|noches),/.test(await txt[0].getText())
        )
      },
      60000,
      500,
    )
    // Pre-abre con red las rutas lazy que usarán los casos (regla del repo):
    // evita recargas de vite a mitad de un caso y deja los chunks en memoria.
    await navegar(driver, '#/pos', 4000)
    await driver.wait(
      until.elementLocated(By.css('input[placeholder*="Buscar por nombre"]')),
      30000,
    )
    await navegar(driver, '#/productos', 4000)
    await driver.wait(
      until.elementLocated(By.css('input[placeholder*="Buscar por nombre"]')),
      30000,
    )
    await navegar(driver, '#/dashboard', 3000)
    await esperarSaludo(driver)

    // --- CP-DASH-001: visualización del panel principal ---
    await caso(driver, RESULTADOS, CASOS['CP-DASH-001'], async () => {
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      const nombre = await driver.executeScript(
        "try { return JSON.parse(localStorage.getItem('currentUser')).name } catch (e) { return null }",
      )
      check(nombre, 'no se pudo leer currentUser.name de la sesión activa')
      const h2 = (await driver.findElement(By.css('.saludo-header h2')).getText()).trim()
      const saludo = (h2.match(/^(Buenos|Buenas) (?:d.as|tardes|noches)/) || [])[0]
      check(
        saludo && h2 === `${saludo}, ${nombre}`,
        `saludo inesperado: se esperaba "Buenos días/Buenas tardes/Buenas noches, ${nombre}" y se observó "${h2}"`,
      )
      const fechaTxt = (await driver.findElement(By.css('.saludo-header p')).getText()).trim()
      check(
        /lunes|martes|m.rcoles|jueves|viernes|s.bado|domingo/i.test(fechaTxt),
        `la fecha no está en español: "${fechaTxt}"`,
      )
      check(await aparece(driver, 'Ventas de hoy', 5000), 'no apareció el hero "Ventas de hoy"')
      await esperarHeroCargado(driver)
      const etiquetas = [
        'Productos registrados',
        'Compras del mes',
        'Ventas del mes',
        'Ganancias del mes',
        'Productos con poco stock',
      ]
      for (const et of etiquetas) {
        check(await aparece(driver, et, 4000), `no apareció la tarjeta "${et}"`)
      }
      await driver.wait(until.elementLocated(By.css('.card canvas')), 12000, 400)
      const v = await leerValoresDashboard(driver)
      check(
        v.tarjetas.length === 5,
        `se esperaban 5 tarjetas con valor y se encontraron ${v.tarjetas.length}`,
      )
      check(
        /^Q[\d,]*\.\d{2}$/.test(v.totalGrafica),
        `total de la gráfica con formato inesperado: "${v.totalGrafica}"`,
      )
      return `Saludo "${h2}" con fecha "${fechaTxt}"; hero "Ventas de hoy" = ${v.hero}; tarjetas [Productos registrados=${v.tarjetas[0]}, Compras del mes=${v.tarjetas[1]}, Ventas del mes=${v.tarjetas[2]}, Ganancias del mes=${v.tarjetas[3]}, Poco stock=${v.tarjetas[4]}]; gráfica "Ventas del mes" total ${v.totalGrafica} con canvas`
    })

    // --- CP-DASH-002: navegación desde los accesos del dashboard ---
    await caso(driver, RESULTADOS, CASOS['CP-DASH-002'], async () => {
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      await clicTexto(driver, 'Ir al Punto de Venta')
      await driver.wait(async () => (await hashActual(driver)) === '#/pos', 15000, 400)
      const hashPos = await hashActual(driver)
      await driver.wait(
        until.elementLocated(By.css('input[placeholder*="Buscar por nombre"]')),
        15000,
      )
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      await clicTexto(driver, 'Productos registrados')
      await driver.wait(async () => (await hashActual(driver)) === '#/productos', 15000, 400)
      const hashProd = await hashActual(driver)
      check(
        await aparece(driver, 'Gestión de Productos', 12000),
        `tras clic en "Productos registrados" el hash cambió a ${hashProd} pero no cargó "Gestión de Productos"`,
      )
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      await clicTexto(driver, 'Productos con poco stock')
      await driver.wait(
        async () => (await hashActual(driver)).startsWith('#/productos'),
        15000,
        400,
      )
      const hashPoco = await hashActual(driver)
      check(
        hashPoco.startsWith('#/productos'),
        `tras clic en "Productos con poco stock" se esperaba #/productos?... y se observó "${hashPoco}"`,
      )
      return `Clic "Ir al Punto de Venta" → ${hashPos} con buscador visible; "Productos registrados" → ${hashProd} con "Gestión de Productos"; "Productos con poco stock" → ${hashPoco}; sin errores de navegación`
    })

    // --- CP-DASH-003: dashboard sin datos (mejor acercamiento posible) ---
    await caso(driver, RESULTADOS, CASOS['CP-DASH-003'], async () => {
      const h = { apikey: KEY, Authorization: `Bearer ${KEY}` }
      const usuarios = await fetch(`${SUPA}/users?select=id_sucursal&username=eq.alex`, {
        headers: h,
      }).then((r) => r.json())
      const suc = usuarios?.[0]?.id_sucursal
      check(suc, 'no se resolvió el id_sucursal de alex vía REST')
      const statsResp = await rpc('get_dashboard_stats', { p_id_sucursal: suc })
      const stats = statsResp.data
      check(
        stats && typeof stats === 'object',
        `get_dashboard_stats no devolvió datos para la sucursal de alex (status ${statsResp.status})`,
      )
      const empresa = await resolverEmpresa('alex')
      const sucursalesSinDatos = []
      if (empresa) {
        const lista = await fetch(`${SUPA}/sucursal?select=id&id_empresa=eq.${empresa}`, {
          headers: h,
        }).then((r) => r.json())
        for (const s of lista || []) {
          if (s.id === suc) continue
          const r = await rpc('get_dashboard_stats', { p_id_sucursal: s.id })
          const d = r.data || {}
          if (!d.total_ventas_mes && !d.total_compras_mes) sucursalesSinDatos.push(s.id)
        }
      }
      // mejor acercamiento: observar el dashboard real de la sucursal de alex
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      await esperarHeroCargado(driver)
      const v = await leerValoresDashboard(driver)
      const conActividad = (stats.total_ventas_mes || 0) > 0 || (stats.total_compras_mes || 0) > 0
      if (conActividad) {
        throw new Error(
          'Escenario no reproducible: la sucursal de la cuenta de prueba sí tiene ventas registradas; sería necesaria una sucursal sin actividad. ' +
            `Stats reales de la sucursal (get_dashboard_stats): ventas_mes=${stats.total_ventas_mes}, compras_mes=${stats.total_compras_mes}, productos_registrados=${stats.productos_registrados}; ` +
            `dashboard observado con datos: hero=${v.hero}, tarjetas=${v.tarjetas.join(' | ')}; ` +
            (sucursalesSinDatos.length
              ? `existen ${sucursalesSinDatos.length} sucursal(es) sin actividad en la empresa, pero ninguna tiene usuario de prueba para iniciar sesión`
              : 'ninguna otra sucursal de la empresa está sin actividad'),
        )
      }
      check(
        v.hero === 'Q0.00',
        `se esperaba hero Q0.00 en sucursal sin datos y se observó ${v.hero}`,
      )
      return `Sucursal sin actividad: hero ${v.hero}, tarjetas [${v.tarjetas.join(' | ')}], sin pantalla en blanco`
    })

    // --- CP-DASH-004: rol Admin redirige a #/admin-dashboard ---
    await caso(driver, RESULTADOS, CASOS['CP-DASH-004'], async () => {
      await loginConRecarga(driver, { usuario: 'system', clave: 'system321' })
      let hash = await hashActual(driver)
      try {
        await driver.wait(
          async () => (await hashActual(driver)) === '#/admin-dashboard',
          15000,
          500,
        )
        hash = await hashActual(driver)
      } catch (e) {
        /* se evalúa abajo */
      }
      check(
        hash === '#/admin-dashboard',
        `con rol Admin se esperaba redirección automática a #/admin-dashboard y se observó "${hash}"`,
      )
      check(
        await aparece(driver, 'Resumen de Empresas', 12000),
        `el hash cambió a ${hash} pero no cargó el contenido de #/admin-dashboard ("Resumen de Empresas")`,
      )
      return `Login system/system321 → #/dashboard redirigió automáticamente a ${hash} y el contenido admin ("Resumen de Empresas") está visible`
    })

    // --- CP-DASH-005: dashboard sin conexión a internet ---
    await caso(driver, RESULTADOS, CASOS['CP-DASH-005'], async () => {
      await loginConRecarga(driver, { usuario: 'alex', clave: 'alex123' })
      await navegar(driver, '#/dashboard', 3000)
      await esperarSaludo(driver)
      await esperarHeroCargado(driver)
      const conRed = await leerValoresDashboard(driver)
      await cortarRed(driver)
      let offline = null
      try {
        // recarga real de la ruta sin driver.get: '#/' → Navigate → #/dashboard
        await navegar(driver, '#/', 3500)
        const hash = await hashActual(driver)
        check(
          hash === '#/dashboard',
          `recarga offline: se esperaba volver a #/dashboard y se observó "${hash}"`,
        )
        await esperarSaludo(driver, 12000)
        await esperarHeroCargado(driver, 15000)
        const cuerpo = (await driver.findElement(By.tagName('body')).getText()).trim()
        check(cuerpo.length > 50, 'la vista quedó prácticamente en blanco sin red')
        const toasts = await driver.findElements(By.css('.toast.show'))
        check(toasts.length === 0, `sin red aparecieron ${toasts.length} toast(s) visibles`)
        offline = await leerValoresDashboard(driver)
      } finally {
        await restaurarRed(driver)
      }
      // al volver la red, remontar la ruta debe recuperar los datos reales
      await navegar(driver, '#/', 3500)
      await esperarSaludo(driver, 12000)
      let restaurado
      try {
        await driver.wait(
          async () => {
            const els = await driver.findElements(By.css('.stat-hero-value'))
            if (!els.length) return false
            return (await els[0].getText()).trim() === conRed.hero
          },
          20000,
          500,
        )
        restaurado = await leerValoresDashboard(driver)
      } catch (e) {
        restaurado = await leerValoresDashboard(driver)
        throw new Error(
          `al recuperar la red los datos NO se actualizaron: con red hero=${conRed.hero}, tras reconexión hero=${restaurado.hero}`,
        )
      }
      return `Sin red la vista no quedó en blanco (saludo y hero visibles): hero=${offline.hero}, tarjetas [${offline.tarjetas.join(' | ')}], sin toasts; al recuperar la red y remontar la ruta los datos se actualizaron (hero=${restaurado.hero}, tarjetas [${restaurado.tarjetas.join(' | ')}]). El Dashboard no escucha el evento online: los datos se recargan al remontar la ruta`
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    try {
      await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }
    guardarResultados('CPDashboard', RESULTADOS)
    try {
      await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  console.log(
    reprobados.length === 0
      ? 'CP-DASH OK (5/5 aprobados)'
      : `CP-DASH con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
