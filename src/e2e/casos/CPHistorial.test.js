/**
 * CP-HIST — Casos de prueba del módulo Historial (formato estándar CP-*).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-HIST-00X.png,
 * resultados en docs/e2e-resultados/CPHistorial.json.
 *
 * Orden de ejecución (lectura → detalle → edición → offline → permisos →
 * anulación al final para no interferir con los demás casos):
 *   001 listado · 002 búsqueda · 003 filtros · 004 detalle/comprobante ·
 *   007 cliente · 006 anulación sin red · 008 vacío · 009 sin ver ·
 *   010 sin eliminar · 005 anulación con red (deja 1 fila anulada de prueba).
 *
 * Nota de impresión: "Imprimir comprobante" solo ABRE ModalComprobante;
 * window.print() lo disparan los botones "Ticket 80 mm" / "Carta" de ese modal
 * (src/components/common/ModalComprobante.jsx:190), por eso NO se tocan.
 */
const {
  crearDriver,
  login,
  aparece,
  apareceTexto,
  existe,
  clicTexto,
  esperarToasts,
  navegar,
  abrirRuta,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  ponerPermiso,
  ROL_GERENTE,
  By,
  until,
  Select,
  sleep,
} = require('./utilCasos')
const { Key } = require('selenium-webdriver')

const RESULTADOS = []
const COLUMNAS = [
  'Fecha',
  'Tipo',
  'Folio',
  'Usuario',
  'Método',
  'Ítems',
  'Total',
  'Estado',
  'Acciones',
]
const CLIENTE_CP = 'Cliente CP-HIST 007'
const MOTIVO_CP = 'Prueba E2E CP-HIST-005'
const BUSQUEDA_VACIA = 'ZZQQ99NOEXISTE'

let redCortada = false

const CASOS = {
  'CP-HIST-001': {
    id: 'CP-HIST-001',
    escenario: 'Listado de ventas y cotizaciones con paginación',
    pasos:
      '1. Ir a #/historial. 2. Revisar columnas y contador. 3. Cambiar el selector de tipo a "Solo ventas" y "Solo cotizaciones". 4. Volver a "Ventas y cotizaciones"',
    requisitos: 'Ventas y cotizaciones registradas en la sucursal',
    datos:
      'Usuario: alex / alex123 (Gerente, sucursal Ferromax chichi); ventas previas del servidor (tomadas del contador en tiempo de ejecución)',
    esperado:
      'Título "Historial de Ventas y Cotizaciones"; contador "Mostrando X de Y"; columnas Fecha, Tipo, Folio, Usuario, Método, Ítems, Total, Estado, Acciones; "Cargar más" pagina de 50 en 50',
  },
  'CP-HIST-002': {
    id: 'CP-HIST-002',
    escenario: 'Búsqueda por folio o usuario',
    pasos:
      '1. Ir a #/historial. 2. Escribir un folio en "Buscar por folio o usuario (Enter)". 3. Presionar Enter. 4. Repetir con un texto inexistente',
    requisitos: 'Existe al menos una venta registrada',
    datos:
      'Usuario: alex / alex123; folio tomado de la primera fila de la tabla en tiempo de ejecución; texto inexistente "ZZQQ99NOEXISTE"',
    esperado:
      'El listado se filtra solo al presionar Enter y muestra el registro coincidente; con texto inexistente se muestra el vacío',
  },
  'CP-HIST-003': {
    id: 'CP-HIST-003',
    escenario: 'Filtros de estado, fechas y limpiar',
    pasos:
      '1. Ir a #/historial. 2. Seleccionar "Completadas" y luego "Anuladas" en el select de estado. 3. Definir fechas desde/hasta. 4. Clic en "Limpiar"',
    requisitos: 'Registros con distintos estados y fechas',
    datos:
      'Usuario: alex / alex123; fechas desde/hasta calculadas en la corrida (rango con ventas y rango futuro sin ventas)',
    esperado:
      'Cada filtro aplica sobre la lista; "Limpiar" restaura "Todos los estados", limpia las fechas y devuelve el listado completo',
  },
  'CP-HIST-004': {
    id: 'CP-HIST-004',
    escenario: 'Detalle e impresión de comprobante',
    pasos:
      '1. Ir a #/historial. 2. Clic en una venta completada. 3. Revisar el modal "Detalle de venta". 4. Clic en "Imprimir comprobante" y cerrar',
    requisitos: 'Venta completada existente',
    datos:
      'Usuario: alex / alex123; venta completada (folio tomado de la tabla en tiempo de ejecución)',
    esperado:
      'Modal con Fecha, Usuario, Método de pago, Estado, Cliente, ítems y Total; "Imprimir comprobante" habilitado abre el comprobante con marca de agua si aún no sincroniza',
  },
  'CP-HIST-005': {
    id: 'CP-HIST-005',
    escenario: 'Anulación de venta completada con red',
    pasos:
      '1. Ir a #/historial. 2. Clic en el ícono de papelera de una venta completada. 3. Revisar el modal "Anular venta". 4. Escribir un motivo. 5. Clic en "Anular venta"',
    requisitos: 'Usuario con permiso historial/eliminar, red disponible, venta completada',
    datos:
      'Usuario: alex / alex123; venta completada a anular (folio en tiempo de ejecución); motivo "Prueba E2E CP-HIST-005"',
    esperado:
      'El modal muestra "¿Anular la venta XXXXXXXX por Q…? El stock se devolverá a la sucursal."; toast "Venta anulada / El stock fue devuelto a la sucursal"; el estado cambia a anulada',
  },
  'CP-HIST-006': {
    id: 'CP-HIST-006',
    escenario: 'Intento de anulación sin conexión',
    pasos:
      '1. Abrir el modal de anulación de una venta completada con red. 2. Cortar la red. 3. Clic en "Anular venta". 4. Restaurar la red y revisar el estado de la venta',
    requisitos:
      'Red disponible para abrir la papelera y luego caída (sin red la papelera se oculta)',
    datos:
      'Usuario: alex / alex123; venta completada (folio en tiempo de ejecución); red cortada con CDP Network.emulateNetworkConditions',
    esperado:
      'Toast warning "La anulación se registra en el servidor: inténtala de nuevo al recuperar la red."; el estado no cambia',
  },
  'CP-HIST-007': {
    id: 'CP-HIST-007',
    escenario: 'Edición y quita del cliente de la venta',
    pasos:
      '1. Abrir el detalle de una venta. 2. Clic en "Editar". 3. Escribir un nombre de cliente y "Guardar". 4. Repetir y dejar el campo vacío',
    requisitos: 'Usuario con permiso historial/editar, red disponible',
    datos:
      'Usuario: alex / alex123; venta completada (folio en tiempo de ejecución); cliente "Cliente CP-HIST 007" (se agrega y luego se quita)',
    esperado:
      'Con nombre: se guarda el cliente y aparece en el detalle. Vacío: toast "Cliente quitado de la venta" y el detalle vuelve a "Sin cliente"',
  },
  'CP-HIST-008': {
    id: 'CP-HIST-008',
    escenario: 'Búsqueda sin resultados',
    pasos: '1. Ir a #/historial. 2. Aplicar un folio inexistente con Enter',
    requisitos: 'Filtros que no coinciden con ningún registro',
    datos: 'Usuario: alex / alex123; búsqueda inexistente "ZZQQ99NOEXISTE"',
    esperado:
      'Se muestra "No hay registros con esos filtros" (agrega "en el almacenamiento local" si está offline); sin errores',
  },
  'CP-HIST-009': {
    id: 'CP-HIST-009',
    escenario: 'Acceso sin permiso de ver',
    pasos:
      '1. Poner historial/ver=false al rol Gerente. 2. Intentar entrar a #/historial. 3. Restaurar el permiso',
    requisitos: 'Rol con historial/ver desactivado temporalmente (permisoTemporal)',
    datos:
      'Usuario: alex / alex123; rol Gerente (3cf414b4-156f-40d2-a6a2-715ad8113283) con historial/ver=false',
    esperado: 'El sistema redirige a #/dashboard',
  },
  'CP-HIST-010': {
    id: 'CP-HIST-010',
    escenario: 'Anulación sin permiso de eliminar',
    pasos:
      '1. Poner historial/eliminar=false (ver=true) al rol Gerente. 2. Ir a #/historial. 3. Revisar las acciones de las filas. 4. Restaurar el permiso',
    requisitos: 'Rol con historial/ver pero sin historial/eliminar (permisoTemporal)',
    datos:
      'Usuario: alex / alex123; rol Gerente con historial/eliminar=false y ver=true de forma temporal',
    esperado:
      'El botón de papelera (anular) no está visible en las filas completadas; el resto del listado funciona',
  },
}

// ---------------------------------------------------------------- helpers ---

async function textoContenido(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'${texto}')]`)), ms)
    const el = await driver.findElement(By.xpath(`//*[contains(text(),'${texto}')]`))
    return (await el.getText()).replace(/\s+/g, ' ').trim()
  } catch (e) {
    return ''
  }
}

async function existeEnTabla(driver, texto) {
  const els = await driver.findElements(By.xpath(`//*[contains(text(),'${texto}')]`))
  return els.length > 0
}

/** Espera a que desaparezca el spinner del listado (nunca cuenta filas antes). */
async function esperarCarga(driver, ms = 12000) {
  await driver.sleep(700)
  try {
    await driver.wait(
      async () => {
        const s = await driver.findElements(By.css('.card-body .spinner-border'))
        return s.length === 0
      },
      ms,
      400,
    )
  } catch (e) {
    /* seguimos: el spinner no desapareció pero hay que registrar el estado */
  }
  await driver.sleep(500)
}

/** Texto del primer toast visible ('' si no aparece en `ms`). */
async function textoToast(driver, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const els = await driver.findElements(By.css('.toast.show'))
    if (els.length) {
      try {
        const t = (await els[0].getText()).replace(/\s+/g, ' ').trim()
        if (t) return t
      } catch (e) {
        /* re-render del toast, se reintenta */
      }
    }
    await sleep(250)
  }
  return ''
}

/**
 * Texto combinado de los modales abiertos (normalizado).
 * CoreUI inserta el `.modal` en el DOM con clase `modal fade` y añade `show`
 * (display:block) en el siguiente commit: sin esperar a `.modal.show` se lee
 * vacío justo después del clic que lo abre.
 */
async function textoModales(driver, ms = 8000) {
  try {
    await driver.wait(until.elementLocated(By.css('.modal.show')), ms)
  } catch (e) {
    /* el modal no llegó: se lee lo que haya en el DOM */
  }
  for (const sel of ['.modal.show', '.modal']) {
    const modales = await driver.findElements(By.css(sel))
    let out = ''
    for (const m of modales) {
      try {
        const t = await driver.executeScript(
          'try { return arguments[0].innerText } catch (e) { return "" }',
          m,
        )
        if (t) out += ' ' + t
      } catch (e) {
        /* modal re-renderizado */
      }
    }
    if (out.trim()) return out.replace(/\s+/g, ' ').trim()
  }
  return ''
}

async function cerrarModales(driver) {
  await driver.sleep(400)
  for (let i = 0; i < 4; i++) {
    const cierres = await driver.findElements(By.css('.modal.show .modal-header button.btn-close'))
    if (!cierres.length) return true
    try {
      await cierres[cierres.length - 1].click()
    } catch (e) {
      const toasts = await driver.findElements(By.css('.toast.show'))
      if (toasts.length) {
        await esperarToasts(driver)
        continue
      }
      return false
    }
    await driver.sleep(700)
  }
  return true
}

/** Limpia filtros/búsqueda/modales y espera a que el listado se recargue. */
async function limpiarFiltros(driver) {
  await esperarToasts(driver)
  await cerrarModales(driver)
  const botones = await driver.findElements(By.xpath(`//button[contains(., 'Limpiar')]`))
  if (botones.length) {
    try {
      await botones[0].click()
    } catch (e) {
      /* ya estaba limpio */
    }
  }
  await esperarCarga(driver)
}

/** Asegura estar en #/historial con el listado cargado (con red). */
async function asegurarHistorial(driver) {
  await esperarToasts(driver)
  const hash = await driver.executeScript('return location.hash')
  if (hash !== '#/historial') await navegar(driver, '#/historial', 2500)
  await esperarCarga(driver)
}

async function filas(driver) {
  try {
    return await driver.findElements(By.css('tbody tr'))
  } catch (e) {
    return []
  }
}

async function textoFila(fila) {
  try {
    return (await fila.getText()).replace(/\s+/g, ' ').trim()
  } catch (e) {
    return ''
  }
}

/** Primera fila con estado "completada": { folio, fila, texto }. */
async function filaCompletada(driver) {
  for (const f of await filas(driver)) {
    const t = await textoFila(f)
    if (!/completada/.test(t)) continue
    try {
      const celdas = await f.findElements(By.css('td'))
      if (celdas.length < 3) continue
      const folio = (await celdas[2].getText()).trim()
      if (folio) return { folio, fila: f, texto: t }
    } catch (e) {
      continue
    }
  }
  return null
}

async function filaPorFolio(driver, folio) {
  try {
    const els = await driver.findElements(By.xpath(`//tbody//tr[td[contains(., '${folio}')]]`))
    return els.length ? els[0] : null
  } catch (e) {
    return null
  }
}

/** Espera a que la fila del folio exista y su texto cumpla `re`. */
async function esperarFilaCon(driver, folio, re, ms = 12000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const f = await filaPorFolio(driver, folio)
    if (f) {
      const t = await textoFila(f)
      if (t && re.test(t)) return t
    }
    await sleep(400)
  }
  return ''
}

/** Botón de la fila cuyo title contiene "anular" (papelera). */
async function botonAnular(fila) {
  try {
    const botones = await fila.findElements(By.css('button'))
    for (const b of botones) {
      const title = (await b.getAttribute('title')) || ''
      if (/anular/i.test(title)) return b
    }
  } catch (e) {
    /* fila re-renderizada */
  }
  return null
}

async function cambiarSelect(driver, indice, valor) {
  const selects = await driver.findElements(By.css('select'))
  if (!selects[indice]) throw new Error(`no existe el select #${indice}`)
  await new Select(selects[indice]).selectByValue(valor)
  await esperarCarga(driver)
}

async function valorSelect(driver, indice) {
  const selects = await driver.findElements(By.css('select'))
  if (!selects[indice]) return null
  return driver.executeScript('return arguments[0].value', selects[indice])
}

async function fijarFecha(driver, indice, valor) {
  const inputs = await driver.findElements(By.css('input[type="date"]'))
  if (!inputs[indice]) throw new Error(`no existe el input de fecha #${indice}`)
  await driver.executeScript(
    `const el = arguments[0], v = arguments[1]
     const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
     set.call(el, v)
     el.dispatchEvent(new Event('input', { bubbles: true }))
     el.dispatchEvent(new Event('change', { bubbles: true }))`,
    inputs[indice],
    valor,
  )
  await esperarCarga(driver)
}

async function valorFecha(driver, indice) {
  const inputs = await driver.findElements(By.css('input[type="date"]'))
  if (!inputs[indice]) return null
  return driver.executeScript('return arguments[0].value', inputs[indice])
}

async function buscador(driver) {
  return driver.findElement(By.css('input[placeholder*="Buscar por folio"]'))
}

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

async function buscar(driver, texto) {
  const input = await buscador(driver)
  await input.sendKeys(Key.CONTROL, 'a')
  await input.sendKeys(Key.BACK_SPACE)
  await input.sendKeys(texto)
  await input.sendKeys(Key.ENTER)
  await esperarCarga(driver)
}

/** Abre el detalle de la primera venta completada y espera su carga. */
async function abrirDetalle(driver) {
  const r = await filaCompletada(driver)
  check(r, 'no hay ninguna fila con estado "completada" en el listado')
  const info = await r.fila.findElement(By.css('button[title="Ver detalle"]'))
  await info.click()
  check(await aparece(driver, 'Detalle de venta', 9000), 'no se abrió el modal "Detalle de venta"')
  // CoreUI añade `show` en un commit posterior: sin esto el texto aparece oculto.
  try {
    await driver.wait(until.elementLocated(By.css('.modal.show')), 8000)
  } catch (e) {
    /* se evalúa con los checks siguientes */
  }
  check(await aparece(driver, 'Total:', 12000), 'el detalle no terminó de cargar (sin "Total:")')
  await driver.sleep(500)
  return r
}

// ------------------------------------------------------- sesión Selenium ---

let driver = null

/** Errores que indican que la sesión/driver murió por causas ajenas al caso. */
const ES_FALLO_SESION =
  /ECONNREFUSED|invalid session|session deleted|disconnected|ERR_CONNECTION|no such window|chrome not reachable|unable to receive message/i

async function sesionViva(d) {
  if (!d) return false
  try {
    await d.executeScript('return 1')
    return true
  } catch (e) {
    return false
  }
}

/** (Re)crea el driver e inicia sesión desde cero. */
async function nuevaSesion() {
  if (driver) {
    try {
      await driver.quit()
    } catch (e) {
      /* la sesión ya estaba muerta */
    }
  }
  driver = await crearDriver()
  redCortada = false
  await login(driver)
  return driver
}

/** Garantiza una sesión Selenium usable antes de cada caso. */
async function asegurarSesion() {
  if (!(await sesionViva(driver))) {
    console.log('  · sesión Selenium perdida; se recrea el driver y se repite el login')
    await nuevaSesion()
  }
  return driver
}

/**
 * Envuelve `caso`: si el caso reprobó porque la sesión murió (un proceso externo
 * puede cerrar Edge mientras corre la suite), recrea la sesión y reintenta una
 * vez. Un fallo real del producto NUNCA se reintenta.
 */
async function casoConReintento(resultados, meta, fn) {
  let item = await caso(driver, resultados, meta, fn)
  if (item.estado === 'Reprobado' && ES_FALLO_SESION.test(item.real)) {
    console.log(`  · sesión perdida en ${meta.id}; se recrea y se reintenta el caso`)
    const i = resultados.findIndex((r) => r.id === meta.id)
    if (i >= 0) resultados.splice(i, 1)
    try {
      await nuevaSesion()
      await abrirRuta(driver, '/historial', 4000)
    } catch (e) {
      console.log('  · no se pudo recrear la sesión:', String(e).slice(0, 100))
    }
    item = await caso(driver, resultados, meta, fn)
  }
  return item
}

// ------------------------------------------------------------------ main ---

async function main() {
  try {
    try {
      await nuevaSesion()
      await abrirRuta(driver, '/historial', 4500)
    } catch (e) {
      console.log('SETUP', String(e).split('\n').slice(0, 4).join(' | '))
    }

    // --- CP-HIST-001: listado, columnas, contador y selector de tipo ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-001'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      check(
        await existe(driver, 'Historial de Ventas y Cotizaciones'),
        'no aparece el título "Historial de Ventas y Cotizaciones"',
      )
      const faltantes = []
      for (const c of COLUMNAS) if (!(await existeEnTabla(driver, c))) faltantes.push(c)
      check(faltantes.length === 0, `faltan columnas de la tabla: ${faltantes.join(', ')}`)
      const contador = await textoContenido(driver, 'Mostrando', 9000)
      check(
        /^Mostrando \d+ de \d+$/.test(contador),
        `contador con formato inesperado: "${contador || '(sin contador)'}"`,
      )
      const filas0 = await filas(driver)
      check(filas0.length > 0, 'el listado no tiene filas a pesar de tener ventas registradas')

      await cambiarSelect(driver, 0, 'venta')
      const soloVentas = await filas(driver)
      check(
        soloVentas.length > 0 || (await existeEnTabla(driver, 'No hay registros con esos filtros')),
        'el selector "Solo ventas" no actualizó el listado',
      )
      let malas = 0
      for (const f of soloVentas) {
        const t = await textoFila(f)
        if (t && !/Venta/.test(t)) malas++
      }
      check(malas === 0, `${malas} fila(s) con tipo distinto de "Venta" en "Solo ventas"`)

      await cambiarSelect(driver, 0, 'cotizacion')
      const cotizaciones = await filas(driver)
      const vaciasCot = await existeEnTabla(driver, 'No hay registros con esos filtros')
      check(
        cotizaciones.length > 0 || vaciasCot,
        'el selector "Solo cotizaciones" no actualizó el listado',
      )
      let malasCot = 0
      for (const f of cotizaciones) {
        const t = await textoFila(f)
        if (t && !/Cotizaci/.test(t)) malasCot++
      }
      check(malasCot === 0, `${malasCot} fila(s) no cotización en "Solo cotizaciones"`)

      await cambiarSelect(driver, 0, '')
      check(
        (await filas(driver)).length > 0,
        'al volver a "Ventas y cotizaciones" el listado quedó vacío',
      )
      const cargarMas = await driver.findElements(By.xpath(`//button[contains(., 'Cargar más')]`))
      const paginacion =
        cargarMas.length > 0
          ? '"Cargar más" visible'
          : '"Cargar más" oculto porque hay menos de 50 registros (no hay páginas que cargar)'
      CASOS['CP-HIST-001'].datos =
        `Usuario alex/alex123 (Gerente, Ferromax chichi); contador "${contador}"; 9 columnas`
      return `Título y las 9 columnas presentes; contador "${contador}"; selector tipo: "Solo ventas" → ${soloVentas.length} fila(s) todas de tipo Venta, "Solo cotizaciones" → ${cotizaciones.length} fila(s)${vaciasCot ? ' (vacío: sin cotizaciones locales en el dispositivo)' : ''}, de vuelta a "Ventas y cotizaciones" → ${(await filas(driver)).length} fila(s); ${paginacion}`
    })

    // --- CP-HIST-002: búsqueda por folio/usuario con Enter ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-002'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      const r = await filaCompletada(driver)
      check(r, 'no hay filas en el listado para tomar un folio de prueba')
      const folio = r.folio
      CASOS['CP-HIST-002'].datos =
        `Usuario alex/alex123; folio de prueba ${folio} (primera fila); texto inexistente "${BUSQUEDA_VACIA}"`

      await buscar(driver, folio)
      const filtradas = await filas(driver)
      check(filtradas.length >= 1, `la búsqueda por el folio ${folio} no devolvió ningún registro`)
      let ajenas = 0
      for (const f of filtradas) {
        const t = await textoFila(f)
        if (t && !t.includes(folio)) ajenas++
      }
      check(ajenas === 0, `${ajenas} fila(s) ajenas al folio ${folio} dentro del listado filtrado`)
      const contador1 = await textoContenido(driver, 'Mostrando', 4000)

      await limpiarFiltros(driver)
      await buscar(driver, BUSQUEDA_VACIA)
      check(
        await apareceTexto(driver, 'No hay registros con esos filtros', 9000),
        'la búsqueda con texto inexistente no mostró "No hay registros con esos filtros"',
      )
      const filasVacias = await filas(driver)
      await limpiarFiltros(driver)
      return `Enter filtró el folio ${folio}: ${filtradas.length} fila(s) y contador "${contador1 || '(sin contador)'}"; con "${BUSQUEDA_VACIA}" apareció el vacío "No hay registros con esos filtros" (${filasVacias.length} filas)`
    })

    // --- CP-HIST-003: filtros de estado, fechas y limpiar ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-003'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)

      await cambiarSelect(driver, 1, 'completada')
      const completadas = await filas(driver)
      check(completadas.length > 0, 'el filtro "Completadas" dejó el listado vacío')
      let noCompletadas = 0
      for (const f of completadas) {
        const t = await textoFila(f)
        if (t && !/completada/.test(t)) noCompletadas++
      }
      check(
        noCompletadas === 0,
        `${noCompletadas} fila(s) sin estado completada con el filtro activo`,
      )
      const estadoSelect = await valorSelect(driver, 1)

      await cambiarSelect(driver, 1, 'anulada')
      const anuladas = await filas(driver)
      let noAnuladas = 0
      for (const f of anuladas) {
        const t = await textoFila(f)
        if (t && !/anulada/.test(t)) noAnuladas++
      }
      check(noAnuladas === 0, `${noAnuladas} fila(s) sin estado anulada con el filtro activo`)

      await cambiarSelect(driver, 1, '')
      check(
        (await filas(driver)).length > 0,
        'al volver a "Todos los estados" el listado quedó vacío',
      )

      const hoy = new Date()
      const hace30 = new Date(hoy.getTime() - 30 * 86400000)
      await fijarFecha(driver, 0, isoLocal(hace30))
      await fijarFecha(driver, 1, isoLocal(hoy))
      const enRango = await filas(driver)
      check(enRango.length > 0, 'el rango de fechas con ventas devolvió 0 registros')

      await fijarFecha(driver, 0, '2030-01-01')
      const fueraRango = await filas(driver)
      const vacioFecha = await apareceTexto(driver, 'No hay registros con esos filtros', 9000)
      check(
        fueraRango.length === 0 && vacioFecha,
        `el rango futuro no vació el listado (${fueraRango.length} filas)`,
      )

      await limpiarFiltros(driver)
      const estadoFinal = await valorSelect(driver, 1)
      const desdeFinal = await valorFecha(driver, 0)
      const hastaFinal = await valorFecha(driver, 1)
      const filasFinales = await filas(driver)
      check(estadoFinal === '', `"Limpiar" dejó el select de estado en "${estadoFinal}"`)
      check(desdeFinal === '' && hastaFinal === '', '"Limpiar" no vació los inputs de fecha')
      check(filasFinales.length > 0, '"Limpiar" dejó el listado vacío')
      return `Filtro "Completadas" → ${completadas.length} fila(s) (select="${estadoSelect}"); "Anuladas" → ${anuladas.length} fila(s) todas anuladas; fechas ${isoLocal(hace30)}→${isoLocal(hoy)} → ${enRango.length} fila(s) y desde 2030-01-01 → vacío; "Limpiar" restauró estado="${estadoFinal || 'Todos los estados'}", fechas vacías y ${filasFinales.length} fila(s)`
    })

    // --- CP-HIST-004: detalle e impresión de comprobante ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-004'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      const r = await abrirDetalle(driver)
      CASOS['CP-HIST-004'].datos = `Usuario alex/alex123; venta completada ${r.folio}`
      const modal = await textoModales(driver)
      const requeridos = ['Fecha', 'Usuario', 'Método de pago', 'Estado', 'Cliente', 'Total:']
      const sinTexto = requeridos.filter((t) => !modal.includes(t))
      check(sinTexto.length === 0, `el detalle no muestra: ${sinTexto.join(', ')}`)
      check(
        (await filas(driver)).length > 0 && modal.includes(r.folio),
        `el encabezado del detalle no muestra el folio ${r.folio}`,
      )
      const items = ['Producto', 'Cantidad', 'Precio unit.', 'Subtotal']
      const faltanItems = []
      for (const i of items) if (!(await existeEnTabla(driver, i))) faltanItems.push(i)
      check(faltanItems.length === 0, `la tabla de ítems no muestra: ${faltanItems.join(', ')}`)

      const imprimir = await driver.findElements(
        By.xpath(`//button[contains(., 'Imprimir comprobante')]`),
      )
      check(imprimir.length > 0, 'no existe el botón "Imprimir comprobante"')
      const deshabilitado = await imprimir[0].getAttribute('disabled')
      check(deshabilitado === null, 'el botón "Imprimir comprobante" está deshabilitado')
      await imprimir[0].click()
      check(
        await aparece(driver, 'Comprobante de venta', 9000),
        'al pulsar "Imprimir comprobante" no se abrió el modal "Comprobante de venta"',
      )
      await driver.sleep(1500)
      const cerrar = await driver.findElements(By.xpath(`//button[contains(., 'Cerrar')]`))
      check(cerrar.length === 1, `botones "Cerrar" del comprobante: ${cerrar.length}`)
      await cerrar[0].click()
      await driver.sleep(1000)
      check(await aparece(driver, 'Detalle de venta', 5000), 'se perdió el modal de detalle')
      return `Detalle de la venta ${r.folio} con Fecha, Usuario, Método de pago, Estado, Cliente, ítems (Producto/Cantidad/Precio unit./Subtotal) y Total; botón "Imprimir comprobante" habilitado → abrió el modal "Comprobante de venta" y se cerró con "Cerrar" (NO se pulsó "Ticket 80 mm"/"Carta" porque esos sí llaman a window.print())`
    })

    // --- CP-HIST-007: edición y quita del cliente ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-007'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      const r = await abrirDetalle(driver)
      CASOS['CP-HIST-007'].datos =
        `Usuario alex/alex123; venta completada ${r.folio}; cliente "${CLIENTE_CP}" (se agrega y se quita)`

      const editar = await driver.findElements(By.xpath(`//button[contains(., 'Editar')]`))
      check(editar.length > 0, 'no hay botón "Editar" en el detalle de la venta')
      await editar[0].click()
      const input = await driver.wait(
        until.elementLocated(By.css('input[placeholder="Nombre del cliente"]')),
        7000,
      )
      await driver.wait(until.elementIsVisible(input), 6000)
      await input.sendKeys(CLIENTE_CP)
      const guardar = await driver.findElements(By.xpath(`//button[contains(., 'Guardar')]`))
      check(guardar.length === 1, `botones "Guardar" encontrados: ${guardar.length}`)
      await guardar[0].click()
      const toast1 = await textoToast(driver, 9000)
      check(/Cliente guardado/.test(toast1), `toast inesperado al guardar: "${toast1}"`)
      check(
        await existe(driver, CLIENTE_CP),
        `el detalle no muestra el cliente "${CLIENTE_CP}" guardado`,
      )
      await esperarToasts(driver)

      const editar2 = await driver.findElements(By.xpath(`//button[contains(., 'Editar')]`))
      check(editar2.length > 0, 'desapareció el botón "Editar" después de guardar el cliente')
      await editar2[0].click()
      const input2 = await driver.wait(
        until.elementLocated(By.css('input[placeholder="Nombre del cliente"]')),
        7000,
      )
      await driver.wait(until.elementIsVisible(input2), 6000)
      const prefilled = await input2.getAttribute('value')
      await input2.sendKeys(Key.CONTROL, 'a')
      await input2.sendKeys(Key.BACK_SPACE)
      const vacio = await input2.getAttribute('value')
      check(vacio === '', `el campo del cliente no quedó vacío (valor "${vacio}")`)
      const guardar2 = await driver.findElements(By.xpath(`//button[contains(., 'Guardar')]`))
      check(guardar2.length === 1, `botones "Guardar" encontrados: ${guardar2.length}`)
      await guardar2[0].click()
      const toast2 = await textoToast(driver, 9000)
      check(
        /Cliente quitado de la venta/.test(toast2),
        `toast inesperado al quitar el cliente: "${toast2}"`,
      )
      check(await existe(driver, 'Sin cliente'), 'el detalle no volvió a "Sin cliente"')
      return `Venta ${r.folio}: "Editar" → "${CLIENTE_CP}" → Guardar → toast "${toast1}" y el detalle muestra "${CLIENTE_CP}"; de nuevo "Editar" (campo precargado con "${prefilled}") → vacío → Guardar → toast "${toast2}" y el detalle vuelve a "Sin cliente"`
    })

    // --- CP-HIST-006: intento de anulación sin conexión ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-006'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      const r = await filaCompletada(driver)
      check(r, 'no hay ninguna fila con estado "completada" para intentar anular')
      const folio = r.folio
      CASOS['CP-HIST-006'].datos =
        `Usuario alex/alex123; venta completada ${folio}; red cortada vía CDP`
      const papelera = await botonAnular(r.fila)
      check(papelera, `la fila ${folio} no tiene botón de papelera`)
      // Base de comparación: anuladas YA existentes en el listado (corridas
      // anteriores dejan ventas anuladas; la aserción es por DELTA, no absoluta)
      const filasBase006 = await filas(driver)
      let anuladasAntes = 0
      for (const f of filasBase006) {
        const t = await textoFila(f)
        if (t && /anulada/.test(t)) anuladasAntes++
      }
      await papelera.click()
      const modalConRed = await textoModales(driver)
      check(
        /¿Anular la venta/.test(modalConRed),
        `no se abrió el modal "Anular venta" con red disponible: "${modalConRed.slice(0, 120)}"`,
      )

      await cortarRed(driver)
      redCortada = true
      const onLine = await driver.executeScript('return navigator.onLine')
      check(onLine === false, `navigator.onLine sigue en ${onLine} tras cortar la red`)
      await driver.sleep(1200)
      check(
        await existeEnTabla(driver, 'Se muestran los registros guardados en este dispositivo'),
        'no apareció la alerta "Sin conexión. Se muestran los registros guardados en este dispositivo…"',
      )

      await clicTexto(driver, 'Anular venta')
      const toast = await textoToast(driver, 9000)
      check(
        /La anulación se registra en el servidor/.test(toast),
        `toast inesperado al anular sin red: "${toast || '(sin toast)'}"`,
      )
      const filasOffline = await filas(driver)

      await restaurarRed(driver)
      redCortada = false
      await esperarCarga(driver)
      const trasRestaurar = await esperarFilaCon(driver, folio, /completada/, 15000)
      check(
        trasRestaurar,
        `la fila ${folio} no volvió a mostrarse como completada tras restaurar la red`,
      )
      const anuladasPorError = await filas(driver)
      let cuentaAnuladas = 0
      for (const f of anuladasPorError) {
        const t = await textoFila(f)
        if (t && /anulada/.test(t)) cuentaAnuladas++
      }
      check(
        cuentaAnuladas === anuladasAntes,
        `${cuentaAnuladas - anuladasAntes} venta(s) quedaron anuladas sin red (antes ${anuladasAntes}, después ${cuentaAnuladas})`,
      )
      return `navigator.onLine=false; alerta offline visible; con el modal abierto "${modalConRed.slice(0, 70)}…" la confirmación mostró el toast "${toast}" y el estado de ${folio} sigue "completada" (anuladas antes ${anuladasAntes} → después ${cuentaAnuladas}, delta 0). Nota: sin red el listado local mostró ${filasOffline.length} fila(s) (el espejo IndexedDB de este equipo no tiene ventas espejadas)`
    })

    // --- CP-HIST-008: búsqueda sin resultados ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-008'], async () => {
      await asegurarHistorial(driver)
      await limpiarFiltros(driver)
      await buscar(driver, BUSQUEDA_VACIA)
      check(
        await apareceTexto(driver, 'No hay registros con esos filtros', 9000),
        'no apareció "No hay registros con esos filtros" con una búsqueda inexistente',
      )
      const vacias = await filas(driver)
      check(
        vacias.length === 0,
        `quedaron ${vacias.length} fila(s) tras una búsqueda sin coincidencias`,
      )
      const toasts = await driver.findElements(By.css('.toast.show'))
      check(toasts.length === 0, 'apareció un toast de error con la búsqueda sin resultados')
      return `Búsqueda "${BUSQUEDA_VACIA}" con Enter → 0 filas y mensaje exacto "No hay registros con esos filtros"; sin toasts de error`
    })

    // --- CP-HIST-009: acceso sin permiso de ver ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-009'], async () => {
      await driver.executeScript("window.location.hash = '#/dashboard'")
      await driver.sleep(800)
      const texto = await permisoTemporal(ROL_GERENTE, 'historial', { ver: false }, async () => {
        await navegar(driver, '#/historial', 1500)
        let hash = await driver.executeScript('return location.hash')
        if (hash !== '#/dashboard') {
          try {
            await driver.wait(
              async () => (await driver.executeScript('return location.hash')) === '#/dashboard',
              12000,
              400,
            )
          } catch (e) {
            /* se evalúa abajo */
          }
        }
        hash = await driver.executeScript('return location.hash')
        check(
          hash === '#/dashboard',
          `se esperaba redirección a #/dashboard y el hash quedó en "${hash}"`,
        )
        return `Redirigió a ${hash} al entrar a #/historial con historial/ver=false (permiso restaurado por permisoTemporal)`
      })
      return texto
    })

    // --- CP-HIST-010: anulación sin permiso de eliminar ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-010'], async () => {
      await driver.executeScript("window.location.hash = '#/dashboard'")
      await driver.sleep(800)
      const texto = await permisoTemporal(
        ROL_GERENTE,
        'historial',
        { eliminar: false },
        async () => {
          await navegar(driver, '#/historial', 2000)
          await esperarCarga(driver)
          await driver.sleep(2500)
          const hash = await driver.executeScript('return location.hash')
          check(hash === '#/historial', `no se pudo entrar a #/historial (hash "${hash}")`)
          const filasAhora = await filas(driver)
          check(filasAhora.length > 0, 'el listado no mostró filas con historial/eliminar=false')
          const papeleras = await driver.findElements(
            By.xpath(`//tbody//tr//button[contains(@title, 'nular')]`),
          )
          check(
            papeleras.length === 0,
            `había ${papeleras.length} botón(es) de papelera visibles sin permiso de eliminar`,
          )
          const detalles = await driver.findElements(
            By.xpath(`//tbody//tr//button[@title='Ver detalle']`),
          )
          check(
            detalles.length > 0,
            'las filas perdieron el botón "Ver detalle" al quitar historial/eliminar',
          )
          return `Con historial/eliminar=false: ${filasAhora.length} fila(s) visibles, 0 papeleras (botones title con "anular") y ${detalles.length} botón(es) "Ver detalle" activos; permiso restaurado por permisoTemporal`
        },
      )
      return texto
    })

    // --- CP-HIST-005: anulación completa con red (al final) ---
    await asegurarSesion()
    await casoConReintento(RESULTADOS, CASOS['CP-HIST-005'], async () => {
      await navegar(driver, '#/historial', 2500)
      await esperarCarga(driver)
      await limpiarFiltros(driver)
      const r = await filaCompletada(driver)
      check(r, 'no hay ninguna venta completada para anular')
      const folio = r.folio
      CASOS['CP-HIST-005'].datos =
        `Usuario alex/alex123; venta completada anulada: ${folio}; motivo "${MOTIVO_CP}"`

      const papelera = await botonAnular(r.fila)
      check(papelera, `la fila ${folio} no tiene botón de papelera (falta historial/eliminar)`)
      await papelera.click()
      const modal = await textoModales(driver)
      check(
        modal.includes(`¿Anular la venta ${folio} por Q`),
        `el modal "Anular venta" no muestra "¿Anular la venta ${folio} por Q…?": "${modal.slice(0, 160)}"`,
      )
      check(
        /El stock se devolverá a la sucursal/.test(modal),
        'el modal no muestra "El stock se devolverá a la sucursal."',
      )
      const motivo = await driver.findElement(By.css('input[placeholder*="Motivo de anulación"]'))
      await driver.wait(until.elementIsVisible(motivo), 6000)
      await motivo.sendKeys(MOTIVO_CP)
      await clicTexto(driver, 'Anular venta')
      const toast = await textoToast(driver, 12000)
      check(/Venta anulada/.test(toast), `toast inesperado al anular: "${toast || '(sin toast)'}"`)
      check(
        /El stock fue devuelto a la sucursal/.test(toast),
        `el toast no trae el mensaje de stock: "${toast}"`,
      )
      const trasAnular = await esperarFilaCon(driver, folio, /anulada/, 15000)
      check(trasAnular, `la venta ${folio} no quedó con estado "anulada" en el listado`)
      return `Anulada la venta ${folio} con motivo "${MOTIVO_CP}": modal con "¿Anular la venta ${folio} por Q…" y leyenda de devolución de stock; toast "${toast}"; la fila ahora muestra "${trasAnular.slice(0, 120)}" (queda 1 venta anulada de prueba)`
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    if (redCortada) console.log('  · la red seguía cortada al salir; se restaura')
    try {
      await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }
    try {
      await ponerPermiso(ROL_GERENTE, 'historial', {
        ver: true,
        crear: true,
        editar: true,
        eliminar: true,
      })
      console.log('  · permisos de historial del rol Gerente restaurados')
    } catch (e) {
      console.log('  · no se pudieron restaurar permisos:', String(e).slice(0, 120))
    }
    guardarResultados('CPHistorial', RESULTADOS)
    try {
      await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  for (const r of RESULTADOS) console.log(`  ${r.estado} ${r.id}`)
  console.log(
    reprobados.length === 0
      ? 'CP-HIST OK (10/10 aprobados)'
      : `CP-HIST con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
