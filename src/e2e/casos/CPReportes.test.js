/**
 * CP-REP — Casos de prueba del módulo Reportes (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-REP-00X.png,
 * resultados en docs/e2e-resultados/CPReportes.json.
 *
 * Orden de ejecución: 001 resumen por defecto → 002 presets → 003 rango
 * manual → 004 filtro por usuario → 005 detalle de productos → 006 período
 * vacío → 007 sin conexión (la red se restaura en el finally del caso) →
 * 008 sin permiso reportes/ver (permiso temporal, se restaura solo).
 *
 * La vista es SOLO LECTURA: ningún caso muta datos (no se toca IndexedDB ni
 * se escribe en el servidor). Lo único que se altera es el permiso
 * reportes/ver del rol Gerente, restaurado por permisoTemporal y, por
 * seguridad, otra vez en el finally del suite.
 *
 * Reglas del repo aplicadas aquí:
 *  - re-setear el MISMO hash no navega → todo pasa por `navegar`.
 *  - #/reportes (y su chunk lazy) se abren CON RED antes de cortarla.
 *  - `cortarRed` se acompaña SIEMPRE de `restaurarRed` en un finally.
 */
const {
  crearDriver,
  login,
  navegar,
  cortarRed,
  restaurarRed,
  esperarToasts,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  leerPermiso,
  ponerPermiso,
  noExiste,
  ROL_GERENTE,
  Select,
  By,
  until,
  sleep,
} = require('./utilCasos')

const RESULTADOS = []

/** Permiso reportes/ver..eliminar del rol Gerente LEÍDO antes de tocar nada. */
let PERMISO_ORIGEN = null

const TITULOS_RESUMEN = ['Clientes atendidos', 'Unidades vendidas', 'Total cobrado']
const COLUMNAS_LINEAS = ['Cantidad × Producto', 'Precio', 'Tipo de precio', 'Subtotal']
const ESTADOS = ['completada', 'anulada', 'pendiente']

const CASOS = {
  'CP-REP-001': {
    id: 'CP-REP-001',
    escenario: 'Resumen de ventas del día (preset por defecto)',
    pasos:
      '1. Iniciar sesión. 2. Ir a #/reportes. 3. Verificar que el preset "Hoy" esté activo y que "Desde"/"Hasta" sean hoy. 4. Revisar la card "Resumen" (Clientes atendidos, Unidades vendidas, Total cobrado). 5. Revisar los grupos por día y el pie del listado',
    requisitos:
      'Usuario con permiso reportes/ver; ventas registradas HOY en la sucursal del dispositivo (precondición del caso)',
    datos:
      'Usuario alex/alex123 (Gerente, sucursal "Ferromax chichi"); presets "Hoy", "Este Mes" y "Este Año"; rango por defecto Desde = Hasta = fecha local de hoy; tarjetas con data-testid resumen-clientes / resumen-unidades / resumen-total',
    esperado:
      'Preset "Hoy" activo (botón sólido, los otros dos en outline) con Desde = Hasta = hoy; tarjetas "Clientes atendidos", "Unidades vendidas" y "Total cobrado" (Q) con valores; ventas agrupadas por día con encabezado tipo "Martes, 07 de octubre de 2026"; pie "N ventas en el período · detalle de productos visible en cada venta"',
  },
  'CP-REP-002': {
    id: 'CP-REP-002',
    escenario: 'Cambio de preset de fecha',
    pasos:
      '1. Ir a #/reportes (preset "Hoy"). 2. Clic en "Este Mes". 3. Revisar rango, tarjetas y listado. 4. Clic en "Este Año". 5. Revisar rango, tarjetas y listado',
    requisitos: 'Ventas registradas en el mes y en el año de la sucursal activa',
    datos:
      'Presets "Hoy" (desde=hasta=hoy), "Este Mes" (desde=primer día del mes, hasta=hoy) y "Este Año" (desde=01-01 del año, hasta=hoy)',
    esperado:
      'Cada preset actualiza los inputs "Desde"/"Hasta", deja su botón sólido (los demás en outline) y recalcula tarjetas y listado; el total del período crece al ampliar el rango (coincidencia Este Mes = Este Año solo si todas las ventas del año caen en el mes en curso)',
  },
  'CP-REP-003': {
    id: 'CP-REP-003',
    escenario: 'Rango de fechas manual',
    pasos:
      '1. Ir a #/reportes. 2. Clic en "Este Mes". 3. Editar el input "Desde" (data-testid input-desde) al primer día del mes anterior. 4. Editar el input "Hasta" (data-testid input-hasta) al último día del mes anterior. 5. Revisar el resaltado de los presets y el listado',
    requisitos: 'Reporte abierto con un preset activo y ventas en el mes en curso',
    datos:
      'Rango manual: Desde = 01 del mes anterior y Hasta = último día de ese mes (mes anterior sin ventas); el preset activo debía ser "Este Mes"',
    esperado:
      'Al editar cualquier input el preset activo se desactiva (los tres botones quedan en outline) y el listado se refiltra por el rango elegido (de N ventas a "No hay ventas en el período seleccionado" con tarjetas en 0)',
  },
  'CP-REP-004': {
    id: 'CP-REP-004',
    escenario: 'Filtrado por usuario',
    pasos:
      '1. Ir a #/reportes y elegir el preset "Este Mes". 2. Revisar las opciones del select "Usuario". 3. Seleccionar el usuario disponible. 4. Verificar que solo se listen sus ventas. 5. Volver a "Todos los usuarios (N)"',
    requisitos:
      'Ventas en el período con el campo usuario resuelto (el select solo ofrece a quien vendió en el rango)',
    datos:
      'Select "Usuario" con la opción "Todos los usuarios (N)" y un elemento por vendedor del período (por defecto "Alex Simaj"); el listado completo se restaura con la opción vacía',
    esperado:
      'Con un usuario seleccionado solo se muestran sus bloques de venta; al elegir "Todos los usuarios (N)" vuelve el listado completo con el mismo número de bloques',
  },
  'CP-REP-005': {
    id: 'CP-REP-005',
    escenario: 'Detalle de productos por venta',
    pasos:
      '1. Ir a #/reportes y elegir "Este Mes". 2. Revisar el primer bloque de venta (data-testid venta-bloque): id, cliente, usuario, hora, "N líneas", total y badge de estado. 3. Revisar la tabla inferior de productos (data-testid venta-lineas / tabla-lineas). 4. Revisar el pie del listado',
    requisitos: 'Ventas con detalle de líneas disponible en el período',
    datos:
      'Bloque de venta con data-testid venta-bloque y venta-cliente; tabla con columnas "Cantidad × Producto", "Precio", "Tipo de precio" y "Subtotal"; pie con data-testid pie-reportes',
    esperado:
      'Cada venta muestra cliente, usuario, hora, "N líneas", total en Q y badge de estado (completada/anulada/pendiente); la tabla lista las 4 columnas con al menos una línea de producto; el pie indica "N ventas en el período · detalle de productos visible en cada venta"',
  },
  'CP-REP-006': {
    id: 'CP-REP-006',
    escenario: 'Período sin ventas',
    pasos:
      '1. Ir a #/reportes. 2. Editar "Desde" a 2020-01-01. 3. Editar "Hasta" a 2020-01-31. 4. Revisar tarjetas, listado y alertas',
    requisitos: 'Ninguno (rango histórico sin actividad)',
    datos: 'Rango manual 2020-01-01 .. 2020-01-31; los tres presets quedan desactivados',
    esperado:
      'Tarjetas en 0 (0 clientes, 0 unidades, Q0.00) con el mensaje "No hay ventas en el período seleccionado", sin alertas de error y sin excepciones en consola',
  },
  'CP-REP-007': {
    id: 'CP-REP-007',
    escenario: 'Reportes sin conexión',
    pasos:
      '1. Abrir #/reportes con red (calienta el chunk lazy). 2. Cortar la red por CDP. 3. Volver a entrar a #/reportes. 4. Revisar la alerta, el listado local y que la vista no quede en blanco. 5. Restaurar la red',
    requisitos:
      'Ruta #/reportes ya cargada con red (regla del repo: sin red un import dinámico frío revienta); IndexedDB de la sucursal disponible',
    datos:
      'Red cortada con Network.emulateNetworkConditions offline=true (navigator.onLine=false); se restaura en el finally de este caso',
    esperado:
      'La vista renderiza en #/reportes sin quedar en blanco ni quedarse en spinner; se informa el origen de los datos (locales) y, si procede, la alerta "Sin respuesta del servidor, se muestran solo las ventas locales: ..." junto con el aviso de folio sin red en el detalle',
  },
  'CP-REP-008': {
    id: 'CP-REP-008',
    escenario: 'Acceso sin permiso de ver',
    pasos:
      '1. Con red, quitar reportes/ver al rol Gerente (permiso temporal). 2. Ir a #/dashboard. 3. Intentar entrar a #/reportes. 4. Verificar la URL final y que la vista no se renderice (el permiso se restaura solo)',
    requisitos:
      'Red disponible (permisoService re-consulta has_permission con red y cachea el resultado); existe el permiso reportes del rol Gerente',
    datos:
      'Rol Gerente 3cf414b4-156f-40d2-a6a2-715ad8113283 con reportes/ver=false temporal; restaurado en el finally de permisoTemporal',
    esperado:
      'Tras validar el permiso el sistema redirige a #/dashboard sin renderizar "Reportes de Ventas"',
  },
}

// ------------------------- helpers de la vista -------------------------

/** Fecha local YYYY-MM-DD (la misma que usa ReportesPage). */
function fechaLocal(d = new Date()) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** "Q1,500.00" → 150000 centavos (0 si no es un monto legible). */
function aCentavos(texto) {
  const limpio = String(texto || '').replace(/[^0-9.]/g, '')
  return limpio ? Math.round(parseFloat(limpio) * 100) : 0
}

/** True si el preset con ese texto quedó sólido (activo) en la vista. */
function presetActivo(v, texto) {
  return v.presets.some((p) => p.texto === texto && p.activo)
}

function nombresPresetsActivos(v) {
  return v.presets.filter((p) => p.activo).map((p) => p.texto)
}

/** Escribe en un input de React (controlled) disparando el evento input nativo. */
async function escribirEn(driver, selector, valor) {
  const ok = await driver.executeScript(
    `
    const el = document.querySelector(arguments[0])
    if (!el) return false
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(el, arguments[1])
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  `,
    selector,
    valor,
  )
  if (!ok) throw new Error(`no se encontró el input ${selector}`)
  await driver.sleep(600)
  const quedo = await driver.executeScript(
    'const e = document.querySelector(arguments[0]); return e ? e.value : null',
    selector,
  )
  if (quedo !== valor) {
    throw new Error(`no se pudo escribir "${valor}" en ${selector} (quedó en "${quedo}")`)
  }
  return true
}

/** Espera a que la vista termine de cargar (sin spinner y con la card "Resumen"). */
async function esperarListo(driver, ms = 20000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const e = await driver.executeScript(`
      return {
        resumen: !!document.querySelector('[data-testid="resumen"]'),
        spin: document.querySelectorAll('.card-body .spinner-border').length,
        sinSucursal: (document.body.innerText || '').includes('No se encontró la sucursal activa'),
      }
    `)
    if (e.sinSucursal) throw new Error('la vista respondió "No se encontró la sucursal activa"')
    if (e.resumen && !e.spin) {
      await driver.sleep(350)
      const estable = await driver.executeScript(
        'return !!document.querySelector(\'[data-testid="resumen"]\') && ' +
          "document.querySelectorAll('.card-body .spinner-border').length === 0",
      )
      if (estable) return true
    }
    await driver.sleep(200)
  }
  throw new Error(
    `Reportes no terminó de cargar en ${ms} ms (card "Resumen" ausente o spinner persistente)`,
  )
}

/** Lee el estado completo de la vista de Reportes sin depender de selectores frágiles. */
async function leerVista(driver) {
  return driver.executeScript(`
    const q = (s) => document.querySelector(s)
    const norm = (t) => (t || '').replace(/\\s+/g, ' ').trim()
    const presets = [...document.querySelectorAll('[data-testid^="preset-"]')].map((b) => ({
      id: b.getAttribute('data-testid'),
      texto: norm(b.innerText),
      activo:
        /\\bbtn-primary\\b/.test(b.className) && !/\\bbtn-outline-primary\\b/.test(b.className),
    }))
    const sel = q('.card-header select')
    const stat = (id) => {
      const e = q('[data-testid="' + id + '"] .stat-value')
      return e ? norm(e.innerText) : null
    }
    const desde = q('[data-testid="input-desde"]')
    const hasta = q('[data-testid="input-hasta"]')
    const aviso = q('[data-testid="resumen-aviso"]')
    const pie = q('[data-testid="pie-reportes"]')
    const h5 = q('.card-header h5')
    const tablas = [...document.querySelectorAll('[data-testid="tabla-lineas"]')]
    return {
      hash: location.hash,
      cargando: document.querySelectorAll('.card-body .spinner-border').length > 0,
      resumen: !!q('[data-testid="resumen"]'),
      titulo: h5 ? norm(h5.innerText) : null,
      presets,
      desde: desde ? desde.value : null,
      hasta: hasta ? hasta.value : null,
      usuarioValor: sel ? sel.value : null,
      usuarioDeshabilitado: sel ? sel.disabled : null,
      usuarioOpciones: sel
        ? [...sel.options].map((o) => ({ v: o.value, t: norm(o.textContent) }))
        : [],
      statTitulos: [...document.querySelectorAll('[data-testid^="resumen-"] .stat-label')].map(
        (e) => norm(e.innerText),
      ),
      clientes: stat('resumen-clientes'),
      unidades: stat('resumen-unidades'),
      total: stat('resumen-total'),
      avisoResumen: aviso ? norm(aviso.innerText) : null,
      grupos: [...document.querySelectorAll('[data-testid="dia-grupo"]')].map((g) => ({
        titulo: norm((g.querySelector('[data-testid="dia-titulo"]') || {}).innerText),
        encabezado: norm((g.querySelector('.card-header') || {}).innerText),
        bloques: g.querySelectorAll('[data-testid="venta-bloque"]').length,
      })),
      bloques: [...document.querySelectorAll('[data-testid="venta-bloque"]')].map((b) => ({
        hijos: [...b.children].map((c) => norm(c.innerText)),
        texto: norm(b.innerText),
        cliente: norm((b.querySelector('[data-testid="venta-cliente"]') || {}).innerText),
      })),
      tablas: tablas.length,
      columnas: tablas.length
        ? [...tablas[0].querySelectorAll('thead th')].map((th) => norm(th.textContent))
        : [],
      vacio: (document.body.innerText || '').includes('No hay ventas en el período seleccionado'),
      sinSucursal: (document.body.innerText || '').includes('No se encontró la sucursal activa'),
      alertas: [...document.querySelectorAll('.alert')].map((a) => norm(a.innerText)),
      pie: pie ? norm(pie.innerText) : null,
      cuerpoLen: norm(document.body.innerText).length,
    }
  `)
}

/** Navega a #/reportes, espera la cabecera y que termine la carga. */
async function abrirReportes(driver, ms = 2500) {
  await navegar(driver, '#/reportes', ms)
  try {
    await driver.wait(
      until.elementLocated(By.xpath(`//*[normalize-space(.)='Reportes de Ventas']`)),
      12000,
    )
  } catch (e) {
    const hash = await driver.executeScript('return location.hash')
    throw new Error(`no renderizó la cabecera "Reportes de Ventas" (hash=${hash})`)
  }
  await esperarListo(driver)
  return leerVista(driver)
}

/** Tras una acción de UI: deja re-renderizar y espera a que la vista quede estable. */
async function trasAccion(driver, ms = 900) {
  await driver.sleep(ms)
  await esperarListo(driver)
}

// ------------------------------- suite --------------------------------

async function main() {
  let driver = null
  try {
    driver = await crearDriver()
    await login(driver)
    await esperarToasts(driver, 9000)

    try {
      PERMISO_ORIGEN = await leerPermiso(ROL_GERENTE, 'reportes')
      console.log('  · permiso reportes del rol Gerente:', JSON.stringify(PERMISO_ORIGEN))
    } catch (e) {
      console.log('  · aviso permiso:', String(e).split('\n').slice(0, 2).join(' '))
    }

    // --- CP-REP-001: preset "Hoy" por defecto + card Resumen + grupos por día ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-001'], async () => {
      const v = await abrirReportes(driver)
      check(v.titulo === 'Reportes de Ventas', `título observado: "${v.titulo}"`)
      const activos = nombresPresetsActivos(v)
      check(
        activos.length === 1 && activos[0] === 'Hoy',
        `debía haber UN preset activo ("Hoy") y se observaron: [${activos.join(', ')}] ` +
          `(presets: ${v.presets.map((p) => `${p.texto}=${p.activo ? 'activo' : 'outline'}`).join(', ')})`,
      )
      const hoy = fechaLocal()
      check(
        v.desde === hoy && v.hasta === hoy,
        `el rango por defecto debía ser ${hoy}..${hoy} y se observó ${v.desde}..${v.hasta}`,
      )
      check(v.resumen, 'no se renderizó la card "Resumen"')
      const faltan = TITULOS_RESUMEN.filter((t) => !v.statTitulos.includes(t))
      check(
        faltan.length === 0,
        `faltan tarjetas del Resumen: ${faltan.join(', ')} (observadas: ${v.statTitulos.join(', ')})`,
      )
      check(
        v.clientes !== null && v.unidades !== null && v.total !== null,
        `valores incompletos en el Resumen: clientes=${v.clientes}, unidades=${v.unidades}, total=${v.total}`,
      )
      check(
        /^Q[\d,]+\.\d{2}$/.test(v.total),
        `el Total cobrado no tiene formato de quetzal: "${v.total}"`,
      )
      const val = `Clientes atendidos ${v.clientes}, Unidades vendidas ${v.unidades}, Total cobrado ${v.total}`

      if (v.vacio) {
        throw new Error(
          'No reproducible con los datos actuales: precondición "Ventas registradas hoy" NO ' +
            `cumplida. El preset "Hoy" (${hoy}) está activo y el Resumen quedó en (${val}), ` +
            'pero el listado muestra "No hay ventas en el período seleccionado" → no se pudieron ' +
            'verificar los grupos por día. Las ventas de la sucursal no son del día de hoy ' +
            '(se ven con el preset "Este Mes", registrado en CP-REP-002)',
        )
      }
      check(
        v.grupos.length > 0,
        `sin grupos por día (bloques=${v.bloques.length}, vacio=${v.vacio})`,
      )
      const malos = v.grupos.filter(
        (g) => !/^[A-Za-zÁÉÍÓÚÑáéíóúñ]+, \d{2} de [A-Za-záéíóúñ]+ de \d{4}$/.test(g.titulo),
      )
      check(
        malos.length === 0,
        `encabezados de día con formato inesperado: ${JSON.stringify(malos.map((g) => g.titulo))}`,
      )
      check(
        v.pie !== null &&
          /\d+ ventas? en el período · detalle de productos visible en cada venta/.test(v.pie),
        `pie inesperado: "${v.pie}"`,
      )
      return (
        `preset "Hoy" activo (otros en outline) con rango ${v.desde}..${v.hasta} · ${val} · ` +
        `${v.grupos.length} grupo(s) por día [${v.grupos.map((g) => g.titulo).join(' | ')}] · ` +
        `${v.bloques.length} bloque(s) de venta · pie "${v.pie}"`
      )
    })

    // --- CP-REP-002: cambio de preset (Este Mes / Este Año) ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-002'], async () => {
      const inicial = await abrirReportes(driver)
      const ahora = new Date()
      const hoy = fechaLocal(ahora)
      const mesInicio = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-01`
      const anioInicio = `${ahora.getFullYear()}-01-01`

      await clicTextoSeguro(driver, 'Este Mes')
      await trasAccion(driver)
      const mes = await leerVista(driver)
      check(
        presetActivo(mes, 'Este Mes'),
        `tras clic en "Este Mes" no quedó activo (activos: [${nombresPresetsActivos(mes).join(', ')}])`,
      )
      check(!presetActivo(mes, 'Hoy'), 'el preset "Hoy" seguía activo después de elegir "Este Mes"')
      check(
        mes.desde === mesInicio && mes.hasta === hoy,
        `"Este Mes" debía fijar ${mesInicio}..${hoy} y se observó ${mes.desde}..${mes.hasta}`,
      )
      const cambioListado =
        mes.clientes !== inicial.clientes ||
        mes.total !== inicial.total ||
        mes.bloques.length !== inicial.bloques.length
      check(
        cambioListado,
        `el listado no cambió al pasar de "Hoy" a "Este Mes" (ambos: ${inicial.clientes} clientes, ` +
          `${inicial.total}, ${inicial.bloques.length} bloques)`,
      )
      check(
        aCentavos(mes.total) >= aCentavos(inicial.total),
        `el total de "Este Mes" (${mes.total}) quedó por debajo del de "Hoy" (${inicial.total})`,
      )

      await clicTextoSeguro(driver, 'Este Año')
      await trasAccion(driver)
      const anio = await leerVista(driver)
      check(
        presetActivo(anio, 'Este Año'),
        `tras clic en "Este Año" no quedó activo (activos: [${nombresPresetsActivos(anio).join(', ')}])`,
      )
      check(
        !presetActivo(anio, 'Este Mes'),
        'el preset "Este Mes" seguía activo después de elegir "Este Año"',
      )
      check(
        anio.desde === anioInicio && anio.hasta === hoy,
        `"Este Año" debía fijar ${anioInicio}..${hoy} y se observó ${anio.desde}..${anio.hasta}`,
      )
      check(
        anio.desde !== mes.desde,
        `el rango de "Este Año" no difiere del de "Este Mes" (${anio.desde} vs ${mes.desde})`,
      )
      check(
        anio.clientes !== null && /^Q[\d,]+\.\d{2}$/.test(anio.total),
        `el Resumen de "Este Año" no renderizó valores legibles (clientes=${anio.clientes}, total=${anio.total})`,
      )
      const mismo = aCentavos(anio.total) === aCentavos(mes.total)
      const nota = mismo
        ? ' Este Mes y Este Año coinciden porque todas las ventas del año caen en el mes en curso'
        : ''
      return (
        `Hoy [${inicial.desde}..${inicial.hasta}]: ${inicial.clientes} clientes, ` +
        `${inicial.unidades} unidades, ${inicial.total}, ${inicial.bloques.length} bloque(s) → ` +
        `Este Mes [${mes.desde}..${mes.hasta}]: ${mes.clientes} clientes, ${mes.unidades} unidades, ` +
        `${mes.total}, ${mes.bloques.length} bloque(s) → ` +
        `Este Año [${anio.desde}..${anio.hasta}]: ${anio.clientes} clientes, ${anio.unidades} ` +
        `unidades, ${anio.total}, ${anio.bloques.length} bloque(s). Rango y preset cambiaron en ` +
        `ambos pasos.${nota}`
      )
    })

    // --- CP-REP-003: rango manual desactiva el preset y refiltra ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-003'], async () => {
      await abrirReportes(driver)
      await clicTextoSeguro(driver, 'Este Mes')
      await trasAccion(driver)
      const base = await leerVista(driver)
      check(
        presetActivo(base, 'Este Mes'),
        `se partía del preset "Este Mes" pero el activo era [${nombresPresetsActivos(base).join(', ')}]`,
      )
      check(
        base.bloques.length > 0,
        'el período "Este Mes" no tiene ventas: no hay listado que refiltrar',
      )

      const ahora = new Date()
      const mesPrevio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
      const ultimoDia = new Date(ahora.getFullYear(), ahora.getMonth(), 0).getDate()
      const desdeManual = fechaLocal(mesPrevio)
      const hastaManual = fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth() - 1, ultimoDia))

      await escribirEn(driver, '[data-testid="input-desde"]', desdeManual)
      await trasAccion(driver)
      const p1 = await leerVista(driver)
      check(
        p1.desde === desdeManual,
        `el input "Desde" debía quedar en ${desdeManual} y se observó ${p1.desde}`,
      )
      check(
        p1.presets.every((p) => !p.activo),
        `al editar "Desde" ningún preset debía quedar activo y seguían: [${nombresPresetsActivos(p1).join(', ')}]`,
      )
      check(
        p1.bloques.length > 0,
        `al ampliar "Desde" a ${desdeManual} desaparecieron las ventas del mes (${p1.bloques.length} bloques)`,
      )

      await escribirEn(driver, '[data-testid="input-hasta"]', hastaManual)
      await trasAccion(driver)
      const p2 = await leerVista(driver)
      check(
        p2.hasta === hastaManual,
        `el input "Hasta" debía quedar en ${hastaManual} y se observó ${p2.hasta}`,
      )
      check(
        p2.presets.every((p) => !p.activo),
        `al editar "Hasta" ningún preset debía quedar activo y seguían: [${nombresPresetsActivos(p2).join(', ')}]`,
      )
      check(
        p2.vacio,
        `el listado NO se refiltró: el rango ${p2.desde}..${p2.hasta} aún muestra ` +
          `${p2.bloques.length} bloque(s) y ${p2.clientes} cliente(s)`,
      )
      check(
        p2.bloques.length === 0 && p2.grupos.length === 0 && p2.clientes === '0',
        `con el rango sin ventas se esperaban 0 bloques / 0 grupos / 0 clientes y se observó ` +
          `${p2.bloques.length} / ${p2.grupos.length} / ${p2.clientes}`,
      )
      return (
        `preset "Este Mes" activo con ${base.bloques.length} bloque(s) → editar "Desde" a ` +
        `${desdeManual} desactiva los 3 presets (todos outline) y conserva ` +
        `${p1.bloques.length} bloque(s) → editar "Hasta" a ${hastaManual} deja el rango ` +
        `${p2.desde}..${p2.hasta} sin ventas: mensaje "No hay ventas en el período seleccionado", ` +
        `tarjetas ${p2.clientes}/${p2.unidades}/${p2.total}, sin alertas (${p2.alertas.length} visibles)`
      )
    })

    // --- CP-REP-004: filtrado por usuario ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-004'], async () => {
      await abrirReportes(driver)
      await clicTextoSeguro(driver, 'Este Mes')
      await trasAccion(driver)
      const base = await leerVista(driver)
      check(
        base.usuarioOpciones.length > 0,
        'el select "Usuario" no renderizó opciones (sin ventas en el período)',
      )
      check(
        !base.usuarioDeshabilitado,
        'el select "Usuario" está deshabilitado con ventas en el período',
      )
      const opcionTodos = base.usuarioOpciones.find((o) => o.v === '')
      check(
        opcionTodos && /^Todos los usuarios \(\d+\)$/.test(opcionTodos.t),
        `la primera opción del select debía ser "Todos los usuarios (N)" y se observó "${opcionTodos && opcionTodos.t}"`,
      )
      const reales = base.usuarioOpciones.filter((o) => o.v !== '')
      check(
        reales.length > 0,
        `sin usuarios con ventas en el período → no se pudo filtrar (opciones: ${base.usuarioOpciones
          .map((o) => `"${o.t}"`)
          .join(', ')})`,
      )
      check(
        base.bloques.length > 0,
        'el listado completo no tiene bloques de venta para comparar con el filtrado',
      )
      const elegido = reales[0]

      await new Select(await driver.findElement(By.css('.card-header select'))).selectByValue(
        elegido.v,
      )
      await trasAccion(driver)
      const filtrado = await leerVista(driver)
      check(
        filtrado.usuarioValor === elegido.v,
        `el select debía quedar en "${elegido.v}" y se observó "${filtrado.usuarioValor}"`,
      )
      check(
        filtrado.bloques.length > 0,
        `al filtrar por "${elegido.t}" no quedó ninguna venta (antes ${base.bloques.length} bloque(s))`,
      )
      check(
        filtrado.bloques.length <= base.bloques.length,
        `el filtrado amplió el listado: ${base.bloques.length} → ${filtrado.bloques.length} bloque(s)`,
      )
      const ajenos = filtrado.bloques.filter((b) => b.hijos[2] !== elegido.t)
      check(
        ajenos.length === 0,
        `quedaron ${ajenos.length} venta(s) de otro usuario al filtrar por "${elegido.t}": ` +
          `${JSON.stringify(ajenos.map((b) => b.hijos[2]))}`,
      )

      await new Select(await driver.findElement(By.css('.card-header select'))).selectByValue('')
      await trasAccion(driver)
      const restaurado = await leerVista(driver)
      check(
        restaurado.usuarioValor === '',
        `al elegir "${opcionTodos.t}" el select quedó en "${restaurado.usuarioValor}"`,
      )
      check(
        restaurado.bloques.length === base.bloques.length,
        `al restaurar se esperaban ${base.bloques.length} bloque(s) y se observaron ` +
          `${restaurado.bloques.length}`,
      )
      return (
        `select "Usuario" con ${base.usuarioOpciones.length} opción(es) (${opcionTodos.t}); ` +
        `filtrar por "${elegido.t}" → ${filtrado.bloques.length} de ${base.bloques.length} ` +
        `bloque(s), todos con ese vendedor; volver a "${opcionTodos.t}" → ` +
        `${restaurado.bloques.length} bloque(s) con ${restaurado.clientes} cliente(s) y ` +
        `${restaurado.total} cobrados (listado completo restaurado)`
      )
    })

    // --- CP-REP-005: detalle de la venta y tabla de productos ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-005'], async () => {
      await abrirReportes(driver)
      await clicTextoSeguro(driver, 'Este Mes')
      await trasAccion(driver)
      const v = await leerVista(driver)
      check(v.bloques.length > 0, 'no hay ventas en el período "Este Mes" para revisar el detalle')
      check(
        v.tablas > 0,
        'ninguna venta renderizó la tabla de productos (data-testid tabla-lineas)',
      )
      const b = v.bloques[0]
      check(
        b.hijos.length >= 7,
        `estructura inesperada del bloque de venta (${b.hijos.length} nodos): "${b.texto}"`,
      )
      const [idVenta, cliente, usuario, hora, lineas, total, estado] = b.hijos
      check(/^[0-9A-F]{8}$/.test(idVenta), `id de venta inesperado: "${idVenta}"`)
      check(!!cliente, 'el bloque no muestra el cliente (data-testid venta-cliente vacío)')
      check(!!usuario, 'el bloque no muestra el usuario/vendedor')
      check(/\d{1,2}:\d{2}/.test(hora), `hora inesperada en el bloque: "${hora}"`)
      check(/\d+ líneas?/.test(lineas), `contador de líneas inesperado: "${lineas}"`)
      check(/^Q[\d,]+\.\d{2}$/.test(total), `total inesperado en el bloque: "${total}"`)
      check(
        ESTADOS.includes(estado),
        `badge de estado inesperado: "${estado}" (se esperaba ${ESTADOS.join('/')})`,
      )

      const faltan = COLUMNAS_LINEAS.filter((c) => !v.columnas.includes(c))
      check(
        faltan.length === 0,
        `faltan columnas de la tabla de productos: ${faltan.join(', ')} (observadas: ${v.columnas.join(' | ')})`,
      )
      const filas = await driver.executeScript(`
        const t = document.querySelector('[data-testid="tabla-lineas"]')
        if (!t) return []
        return [...t.querySelectorAll('tbody tr')].map((tr) =>
          [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim()),
        )
      `)
      check(
        filas.length > 0 && filas[0].length === COLUMNAS_LINEAS.length,
        `la tabla de productos no tiene filas de detalle (${filas.length} fila(s), ` +
          `${filas[0] ? filas[0].length : 0} celda(s)): ${JSON.stringify(filas.slice(0, 2))}`,
      )
      check(
        v.pie !== null &&
          /\d+ ventas? en el período · detalle de productos visible en cada venta/.test(v.pie),
        `pie inesperado: "${v.pie}"`,
      )
      return (
        `bloque ${idVenta} → cliente "${cliente}", usuario "${usuario}", hora ${hora}, ` +
        `${lineas}, total ${total}, badge "${estado}" · tabla con columnas ` +
        `[${v.columnas.join(', ')}] y ${filas.length} línea(s) de producto ` +
        `(fila: ${JSON.stringify(filas[0])}) · ${v.tablas} tabla(s) en pantalla · pie "${v.pie}"`
      )
    })

    // --- CP-REP-006: período sin ventas ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-006'], async () => {
      await abrirReportes(driver)
      await escribirEn(driver, '[data-testid="input-desde"]', '2020-01-01')
      await trasAccion(driver)
      await escribirEn(driver, '[data-testid="input-hasta"]', '2020-01-31')
      await trasAccion(driver)
      const v = await leerVista(driver)
      check(
        v.desde === '2020-01-01' && v.hasta === '2020-01-31',
        `rango observado ${v.desde}..${v.hasta} (esperado 2020-01-01..2020-01-31)`,
      )
      check(
        v.presets.every((p) => !p.activo),
        `con rango manual ningún preset debía quedar activo y seguían: [${nombresPresetsActivos(v).join(', ')}]`,
      )
      check(
        v.vacio,
        'no se mostró "No hay ventas en el período seleccionado" con un rango sin actividad',
      )
      check(v.clientes === '0', `Clientes atendidos debía ser 0 y se observó "${v.clientes}"`)
      check(v.unidades === '0', `Unidades vendidas debía ser 0 y se observó "${v.unidades}"`)
      check(v.total === 'Q0.00', `Total cobrado debía ser Q0.00 y se observó "${v.total}"`)
      check(
        v.bloques.length === 0 && v.grupos.length === 0,
        `aún se listan ${v.bloques.length} bloque(s) en un período sin ventas`,
      )
      check(
        v.alertas.length === 0,
        `sin ventas no debía haber alertas de error y se observaron: ${JSON.stringify(v.alertas)}`,
      )
      check(!v.cargando, 'la vista siguió en spinner con el período vacío')
      return (
        `rango 2020-01-01..2020-01-31 con los 3 presets en outline → ` +
        `"No hay ventas en el período seleccionado", tarjetas Clientes ${v.clientes} / ` +
        `Unidades ${v.unidades} / Total ${v.total}, 0 bloques y 0 grupos, sin alertas de error`
      )
    })

    // --- CP-REP-007: reportes sin conexión ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-007'], async () => {
      const conRed = await abrirReportes(driver)
      console.log('  · CP-REP-007: #/reportes abierto con red, cortando…')
      await cortarRed(driver)
      console.log('  · CP-REP-007: red cortada por CDP')
      try {
        const off = await driver.executeScript('return navigator.onLine === false')
        console.log('  · CP-REP-007: (navigator.onLine === false) =', off)
        check(off, 'navigator.onLine sigue en true tras cortar la red por CDP')
        await navegar(driver, '#/reportes', 3000)
        let v = await leerVista(driver)
        if (v.cargando || !v.resumen) {
          await driver.sleep(2500)
          v = await leerVista(driver)
        }
        await esperarToasts(driver, 6000)
        v = await leerVista(driver)
        check(v.hash === '#/reportes', `sin red la vista no quedó en #/reportes (hash ${v.hash})`)
        check(
          v.titulo === 'Reportes de Ventas',
          `sin red no se renderizó la cabecera de Reportes (observado "${v.titulo}")`,
        )
        check(v.resumen, 'sin red no se renderizó la card "Resumen": la vista quedó sin contenido')
        check(!v.cargando, 'la vista siguió en spinner sin red: se bloqueó al perder la conexión')
        check(!v.sinSucursal, 'sin red apareció "No se encontró la sucursal activa"')
        const alerta = v.alertas.find((a) => /Sin respuesta del servidor/.test(a)) || ''
        const origen = v.vacio
          ? '"No hay ventas en el período seleccionado" (el espejo local no tiene ventas para el rango)'
          : `${v.bloques.length} bloque(s) de venta desde IndexedDB`
        const detalleAlerta = alerta
          ? `alerta del servidor: "${alerta}"`
          : 'sin alerta "Sin respuesta del servidor…" (ReportesPage solo llama al RPC cuando ' +
            'useEstadoRed=true; con navigator.onLine=false se salta el servidor y no hay error que reportar)'
        return (
          `navigator.onLine=false con #/reportes ya abierto con red → re-navegar renderizó ` +
          `#/reportes con título "${v.titulo}" y card "Resumen" (${v.clientes} clientes, ` +
          `${v.unidades} unidades, ${v.total}) · ${origen} · ${detalleAlerta} · ` +
          `${v.alertas.length} alerta(s) en pantalla (${JSON.stringify(v.alertas)}) · la vista no ` +
          `quedó en blanco ni en spinner; con red el período mostraba ${conRed.bloques.length} ` +
          `bloque(s) y ${conRed.total}`
        )
      } finally {
        await restaurarRed(driver)
        console.log('  · red restaurada tras CP-REP-007')
      }
    })

    // --- CP-REP-008: acceso sin permiso reportes/ver ---
    await caso(driver, RESULTADOS, CASOS['CP-REP-008'], async () => {
      check(
        PERMISO_ORIGEN !== null,
        'no se pudo leer el permiso original de reportes del rol Gerente (sin él no se puede ' +
          'aplicar el permiso temporal)',
      )
      const salida = await permisoTemporal(ROL_GERENTE, 'reportes', { ver: false }, async () => {
        await navegar(driver, '#/dashboard', 2000)
        const inicio = await driver.executeScript('return location.hash')
        await navegar(driver, '#/reportes', 2000)
        let hash = await driver.executeScript('return location.hash')
        const fin = Date.now() + 12000
        while (hash !== '#/dashboard' && Date.now() < fin) {
          await sleep(400)
          hash = await driver.executeScript('return location.hash')
        }
        const sinVista = await noExiste(driver, 'Reportes de Ventas')
        return { inicio, hash, sinVista }
      })
      check(
        salida.hash === '#/dashboard',
        `se esperaba redirigir a #/dashboard y la URL quedó en ${salida.hash}`,
      )
      check(
        salida.sinVista,
        'la vista "Reportes de Ventas" se renderizó a pesar de no tener reportes/ver',
      )
      return (
        `desde ${salida.inicio} → intento de #/reportes con reportes/ver=false redirigió a ` +
        `${salida.hash} sin renderizar "Reportes de Ventas"; permiso restaurado por permisoTemporal ` +
        `(original ${JSON.stringify(PERMISO_ORIGEN)})`
      )
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    try {
      if (driver) await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }
    try {
      if (driver && PERMISO_ORIGEN) {
        await ponerPermiso(ROL_GERENTE, 'reportes', PERMISO_ORIGEN)
        console.log(
          '  · permiso reportes del rol Gerente restaurado:',
          JSON.stringify(PERMISO_ORIGEN),
        )
      }
    } catch (e) {
      console.log('  · no se pudo restaurar el permiso:', String(e).slice(0, 140))
    }
    guardarResultados('CPReportes', RESULTADOS)
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  const faltantes = Object.keys(CASOS).filter((id) => !RESULTADOS.some((r) => r.id === id))
  if (faltantes.length) {
    console.log(
      `CP-REP INCOMPLETO: ${RESULTADOS.length}/8 casos registrados, faltan ${faltantes.join(', ')}`,
    )
  } else if (reprobados.length === 0) {
    console.log('CP-REP OK (8/8 aprobados)')
  } else {
    console.log(
      `CP-REP con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
    )
  }
}

/** Clic en un preset por su texto (wrapper para no repetir el XPath en cada caso). */
async function clicTextoSeguro(driver, texto) {
  const el = await driver.wait(
    until.elementLocated(
      By.xpath(`//button[contains(., '${texto}') or .//span[contains(., '${texto}')]]`),
    ),
    7000,
  )
  await driver.wait(until.elementIsVisible(el), 3000)
  await el.click()
  return true
}

main()
