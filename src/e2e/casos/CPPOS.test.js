/**
 * CP-POS — Casos de prueba del módulo Punto de Venta (formato estándar CP-*).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-POS-00X.png,
 * resultados en docs/e2e-resultados/CPPOS.json.
 *
 * Orden de ejecución (todo dentro de #/pos, sin salir de la ruta para no
 * re-montar el POS y re-disparar la hidratación del catálogo):
 *   002 búsqueda · 006 carrito vacío · 005 efectivo corto · 004 vuelto ·
 *   007 cantidad > stock · 008 sin stock (toca IndexedDB y RESTAURA) ·
 *   011 vaciar · 003 precio por volumen (toca stock y RESTAURA) ·
 *   001 venta real · 012 pendiente → venta real ·
 *   BASELINE de IndexedDB · 009 venta offline · 010 cotización offline ·
 *   limpieza offline (con la red AÚN cortada) · restaurar red · reporte.
 *
 * Notas de la suite:
 *  - CP-POS-004 solo verifica el "Vuelto" y el botón habilitado: NO ejecuta el
 *    cobro, para no dejar una venta real extra (documentado en `real`).
 *  - CP-POS-011 resulta Reprobado: "Vaciar" no pide confirmación y solo hay 1
 *    producto con precios en la cuenta de prueba (no 2+).
 *  - CP-POS-009/010 crean datos locales que se BORRAN con la red aún cortada
 *    (patrón del finally de TrasladosUI): nunca deben sincronizarse.
 *  - Nunca se pulsan "Ticket 80 mm" / "Carta" (llaman a window.print()).
 */
const {
  crearDriver,
  login,
  script,
  esperarToasts,
  abrirRuta,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  rpc,
  By,
  until,
  sleep,
} = require('./utilCasos')
const { Key } = require('selenium-webdriver')

const RESULTADOS = []
const BUSCADOR = 'input[placeholder="Buscar por nombre, marca o código..."]'
const RECIBIDO = 'input[placeholder="0.00"]'
const CANTIDAD_DETALLE = 'input[aria-label="Cantidad"]'
const PRECIO_SELECTOR = 'select[aria-label="Precio a aplicar"]'
const SIN_RESULTADOS = 'ZZQQ99NOEXISTE'
const NOMBRE_LLAVE = 'llave inlgesa'

/** Estado compartido de la corrida. */
let ID_LLAVE = null
let SUCURSAL = null
let EMPRESA = null
let STOCK_INICIAL = null
let STOCK_ORIGINAL = null
let STOCK_PARCHADO = null
let STOCK_LOCAL_HONESTO = null
let BASELINE = null
let LIMPIEZA_HECHA = false
let redCortada = false

const CASOS = {
  'CP-POS-001': {
    id: 'CP-POS-001',
    escenario: 'Venta completa en efectivo (ruta ideal)',
    requisitos: 'Sesión iniciada, producto con stock y precio en la sucursal, red disponible',
    pasos:
      '1. Ir a #/pos. 2. Buscar un producto y seleccionarlo. 3. Elegir cantidad y clic en "Agregar". 4. Verificar el carrito. 5. En el panel de pago elegir tipo de pago "Efectivo". 6. Clic en "Realizar Venta"',
    datos:
      'Usuario alex/alex123 (Gerente, Ferromax chichi); producto "llave inlgesa" (SKU LLAVE, precio NORMAL Q40.00); stock leído en tiempo de ejecución',
    esperado:
      'El carrito agrega el ítem; se muestra spinner "Procesando..."; aparece modal "¡Venta realizada!" con Folio y botones "Nueva venta"; toast "Venta registrada correctamente"; el stock baja',
  },
  'CP-POS-002': {
    id: 'CP-POS-002',
    escenario: 'Búsqueda de producto por nombre y por SKU',
    requisitos: 'Al menos un producto existe en la sucursal',
    pasos:
      '1. Ir a #/pos. 2. Escribir parte del nombre en el buscador ("Buscar por nombre, marca o código..."). 3. Limpiar y escribir el SKU completo. 4. Presionar Enter',
    datos:
      'Término parcial "llav" (lista filtrada), SKU completo "LLAVE" con Enter (auto-selección) y término inexistente "ZZQQ99NOEXISTE"',
    esperado:
      'El listado se filtra tras el debounce; con SKU exacto único el producto se selecciona automáticamente; sin coincidencias muestra "Sin resultados para "x""',
  },
  'CP-POS-003': {
    id: 'CP-POS-003',
    escenario: 'Selección de precio por volumen',
    requisitos: 'Producto con más de un tipo de precio configurado (ej: mínimo 5 unidades)',
    pasos:
      '1. Ir a #/pos. 2. Seleccionar el producto. 3. Revisar la sección "Precio:". 4. Cambiar la cantidad a un valor que alcanza el mínimo. 5. Agregar al carrito',
    datos:
      '"llave inlgesa" con NORMAL Q40.00 (mín. 1) y MAYOREO Q35.00 (mín. 10); el stock local se sube temporalmente a 12 para poder alcanzar el mínimo 10 y se restaura al final del caso',
    esperado:
      'Se muestra la opción "Auto _ Qx (según cantidad)" o "TIPO _ Qx (mín. N)"; al alcanzar el mínimo cambia al precio mayorista; el total se recalcula',
  },
  'CP-POS-004': {
    id: 'CP-POS-004',
    escenario: 'Vuelto con efectivo recibido mayor al total',
    requisitos: 'Carrito con ítems y total a cobrar mayor a cero',
    pasos:
      '1. Armar un carrito. 2. Elegir "Efectivo". 3. Ingresar en "Efectivo recibido" un monto mayor al total. 4. Clic en "Realizar Venta"',
    datos:
      'Carrito con "llave inlgesa" x1 (Q40.00) y efectivo recibido Q100.00 (vuelto esperado Q60.00); el cobro NO se ejecuta en esta corrida (ver resultado)',
    esperado:
      'El resumen muestra el campo "Vuelto" con la diferencia; la venta se procesa correctamente',
  },
  'CP-POS-005': {
    id: 'CP-POS-005',
    escenario: 'Efectivo recibido menor al total',
    requisitos: 'Carrito con ítems',
    pasos:
      '1. Armar carrito. 2. Elegir "Efectivo". 3. Ingresar en "Efectivo recibido" un monto menor al total',
    datos:
      'Carrito con "llave inlgesa" x1 (Q40.00) y efectivo recibido Q10.00 (falta esperada Q30.00)',
    esperado:
      'El resumen muestra "Falta" con la diferencia; el botón "Realizar Venta" queda deshabilitado',
  },
  'CP-POS-006': {
    id: 'CP-POS-006',
    escenario: 'Intento de cobro con carrito vacío',
    requisitos: 'Sesión iniciada, carrito sin ítems',
    pasos: '1. Ir a #/pos. 2. No agregar productos. 3. Intentar realizar la venta',
    datos: 'Carrito vacío y sin producto seleccionado en el detalle',
    esperado:
      'El carrito muestra "Carrito vacío"; no se puede cobrar; se muestra el estado vacío "Busca un producto para ver su detalle"',
  },
  'CP-POS-007': {
    id: 'CP-POS-007',
    escenario: 'Cantidad mayor al stock disponible',
    requisitos: 'Producto con stock limitado (ej: 3 unidades)',
    pasos:
      '1. Seleccionar un producto con stock 3. 2. Intentar ingresar cantidad 5 en el detalle. 3. Agregar al carrito y subir la cantidad con +',
    datos:
      '"llave inlgesa" con su stock real en la sucursal del dispositivo (leído en tiempo de ejecución)',
    esperado:
      'La cantidad se limita al stock; el input queda bloqueado al llegar a stock máximo; no se excede el inventario',
  },
  'CP-POS-008': {
    id: 'CP-POS-008',
    escenario: 'Producto sin stock en la sucursal',
    requisitos: 'Producto con stock 0 en la sucursal del dispositivo',
    pasos: '1. Buscar un producto agotado en la sucursal. 2. Revisar el detalle',
    datos:
      '"llave inlgesa" con stock local fijado a 0 en IndexedDB (ambos stores) y restaurado al final del caso',
    esperado:
      'Se muestra "Sin stock en tu sucursal — revisa disponibilidad en otras bodegas" y el botón "Agregar" está deshabilitado',
  },
  'CP-POS-009': {
    id: 'CP-POS-009',
    escenario: 'Venta sin conexión (cola de sincronización)',
    requisitos: 'Sesión iniciada, red caída, producto disponible localmente',
    pasos:
      '1. Cortar la red. 2. Ir a #/pos. 3. Armar carrito y realizar la venta en efectivo. 4. Revisar el modal resultado. 5. Clic en "Imprimir comprobante sin conexión"',
    datos:
      'Red cortada con Network.emulateNetworkConditions offline=true; "llave inlgesa" x1; baseline de IndexedDB capturado antes del caso',
    esperado:
      'Venta registrada localmente con toast "Venta registrada correctamente"; modal "¡Venta realizada!" con Folio; el comprobante impreso lleva marca de agua "PENDIENTE DE SINCRONIZACIÓN FISCAL"; la venta queda PENDING',
  },
  'CP-POS-010': {
    id: 'CP-POS-010',
    escenario: 'Guardar cotización sin conexión',
    requisitos: 'Red caída y carrito con ítems',
    pasos:
      '1. Cortar la red. 2. Armar carrito. 3. Clic en "Cotización". 4. Abrir "Ver cotizaciones"',
    datos:
      'Red cortada con CDP; "llave inlgesa" x1; borrador local nuevo en db.offline_quotes (baseline antes del caso)',
    esperado:
      'Modal "¡Cotización guardada localmente!" con aviso de comprobante sin red; toast "Cotización guardada"; la cotización aparece en el listado local',
  },
  'CP-POS-011': {
    id: 'CP-POS-011',
    escenario: 'Vaciar carrito con confirmación',
    requisitos: 'Carrito con ítems',
    pasos: '1. Armar carrito con 2 o más productos. 2. Clic en "Vaciar". 3. Confirmar el reemplazo',
    datos:
      'Cuenta de prueba con 2 productos, pero solo "llave inlgesa" tiene precios ("Fixture T9 Traslados" sin precios deja "Agregar" deshabilitado): solo 1 producto agregable',
    esperado:
      'Aparece confirmación "Reemplazar carrito"; al confirmar el carrito queda vacío ("Carrito vacío") y al cancelar conserva los ítems',
  },
  'CP-POS-012': {
    id: 'CP-POS-012',
    escenario: 'Recuperar una venta pendiente',
    requisitos: 'Existe al menos una venta pendiente guardada en la sucursal',
    pasos:
      '1. Ir a #/pos. 2. Clic en "Pendientes (n)". 3. Seleccionar un pendiente. 4. Completar el cobro',
    datos:
      'Se crea un pendiente en el propio caso con "llave inlgesa" x1 y se recarga al carrito para cobrarlo (red disponible)',
    esperado:
      'Se lista "No hay ventas pendientes en esta sucursal." solo si no hay; si hay, el pendiente se carga en el carrito y la venta se completa con folio',
  },
}

// --------------------------------------------------------------- helpers ---

/** XPath de un botón cuyo texto visible (normalize-space) es EXACTAMENTE `t`. */
const btn = (t) => `//button[normalize-space(.)='${t}']`

/** Espera a que exista un nodo cuyo texto CONTENGA `texto`. */
async function hayTexto(driver, texto, ms = 7000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(., '${texto}')]`)), ms)
    return true
  } catch (e) {
    return false
  }
}

/** True si `texto` ya está en el DOM (sin esperar). */
async function existeTexto(driver, texto) {
  const els = await driver.findElements(By.xpath(`//*[contains(., '${texto}')]`))
  return els.length > 0
}

/** innerText del primer nodo HOJA (sin descendientes con el texto) que lo contiene. */
async function textoContenido(driver, texto, ms = 7000) {
  // `//*[contains(., X)]` devuelve <html> como primer match (orden de documento);
  // el predicado extra deja solo las hojas para leer el texto concreto.
  const x = `//*[contains(., '${texto}') and not(.//*[contains(., '${texto}')])]`
  try {
    await driver.wait(until.elementLocated(By.xpath(x)), ms)
    const el = await driver.findElement(By.xpath(x))
    return (await el.getText()).replace(/\s+/g, ' ').trim()
  } catch (e) {
    return ''
  }
}

/**
 * Escribe en un input/select de React (controlled) con el setter nativo.
 * Acepta CSS (`input[placeholder="0.00"]`) o XPath (`//div//input`).
 */
async function escribir(driver, selector, valor) {
  const ok = await driver.executeScript(
    `
    const sel = arguments[0]
    let el = null
    if (sel.charAt(0) === '/' || sel.charAt(0) === '(') {
      const r = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      el = r.singleNodeValue
    } else {
      el = document.querySelector(sel)
    }
    if (!el) return false
    el.focus()
    const esSelect = el.tagName === 'SELECT'
    const proto = esSelect ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, arguments[1])
    el.dispatchEvent(new Event(esSelect ? 'change' : 'input', { bubbles: true }))
    return true
  `,
    selector,
    valor,
  )
  if (!ok) throw new Error(`no se encontró el campo ${selector}`)
  await driver.sleep(450)
  return true
}

/** Valor actual del input CSS/XPath ('' si no existe). */
async function valorCampo(driver, selector) {
  return driver.executeScript(
    `
    const sel = arguments[0]
    let el = null
    if (sel.charAt(0) === '/' || sel.charAt(0) === '(') {
      const r = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      el = r.singleNodeValue
    } else {
      el = document.querySelector(sel)
    }
    return el ? String(el.value) : null
  `,
    selector,
  )
}

/** Clic en un elemento ya localizado: centra, reintenta con JS si hay interceptor. */
async function clicEn(driver, el, etiqueta) {
  try {
    await driver.executeScript(
      'arguments[0].scrollIntoView({block:"center", inline:"nearest"})',
      el,
    )
    await sleep(150)
    await el.click()
    return true
  } catch (e) {
    const diag = await driver.executeScript(
      `
      const el = arguments[0]
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return {
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        vp: [window.innerWidth, window.innerHeight],
        top: top ? (top.tagName + '.' + (top.className || '')).slice(0, 140) : null,
        err: String(arguments[1]).replace(/\\s+/g, ' ').slice(0, 140),
      }
    `,
      el,
      e.message,
    )
    console.log(`    · clic "${etiqueta}" interceptado →`, JSON.stringify(diag))
    await driver.executeScript(
      'arguments[0].scrollIntoView({block:"center", inline:"nearest"}); arguments[0].click()',
      el,
    )
    return true
  }
}

/** Foca un campo y simula una tecla real (Enter/Escape). */
async function presionar(driver, selector, tecla) {
  const el = await driver.findElement(By.css(selector))
  await driver.wait(until.elementIsVisible(el), 5000)
  await clicEn(driver, el, selector)
  await el.sendKeys(tecla)
  await driver.sleep(600)
}

/** Clic robusto: centra el elemento, reintenta con JS si WebDriver lo intercepta. */
async function clicRobusto(driver, x, etiqueta, ms = 7000) {
  const el = await driver.wait(until.elementLocated(By.xpath(x)), ms)
  await driver.wait(until.elementIsVisible(el), 4000)
  return clicEn(driver, el, etiqueta)
}

/** Clic en el botón cuyo texto visible es EXACTAMENTE `etiqueta`. */
async function clicExacto(driver, etiqueta, ms = 7000) {
  return clicRobusto(driver, btn(etiqueta), etiqueta, ms)
}

/** Clic en el botón/enlace cuyo texto CONTIENE `texto` (variante robusta de clicTexto). */
async function clicQueContenga(driver, texto, ms = 7000) {
  const x =
    `//button[contains(., '${texto}') or .//span[contains(., '${texto}')]]` +
    ` | //a[contains(., '${texto}')]`
  return clicRobusto(driver, x, texto, ms)
}

/** Estado del botón cuyo texto CONTIENE `etiqueta` ({existe, disabled}). */
async function estadoBoton(driver, etiqueta) {
  return driver.executeScript(
    `
    const b = [...document.querySelectorAll('button')].find((x) =>
      (x.innerText || '').includes(arguments[0]),
    )
    return b ? { existe: true, disabled: !!b.disabled } : { existe: false, disabled: null }
  `,
    etiqueta,
  )
}

/** Espera a que el botón exista y tenga el estado `disabled` indicado. */
async function esperarBoton(driver, etiqueta, disabled, ms = 12000) {
  const fin = Date.now() + ms
  let ultimo = null
  while (Date.now() < fin) {
    ultimo = await estadoBoton(driver, etiqueta)
    if (ultimo.existe && ultimo.disabled === disabled) return ultimo
    await sleep(300)
  }
  return ultimo
}

/** Texto visible de todos los toasts activos, unidos por " | ". */
async function leerToasts(driver) {
  const els = await driver.findElements(By.css('.toast.show'))
  const partes = []
  for (const e of els) {
    try {
      partes.push((await e.getText()).replace(/\s+/g, ' ').trim())
    } catch (e2) {
      /* el toast desapareció mientras se leía */
    }
  }
  return partes.join(' | ')
}

/** Espera a que algún toast contenga `texto` y devuelve su texto (o ''). */
async function esperarToast(driver, texto, ms = 10000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const t = await leerToasts(driver)
    if (t && t.includes(texto)) return t
    await sleep(250)
  }
  return ''
}

/** innerText del último modal abierto (.modal.show) que contiene `texto`. */
async function textoModal(driver, texto) {
  return driver.executeScript(
    `
    const ms = [...document.querySelectorAll('.modal.show')].filter((m) =>
      (m.innerText || '').includes(arguments[0]),
    )
    const m = ms[ms.length - 1]
    return m ? m.innerText : ''
  `,
    texto,
  )
}

/** Espera (máx. `ms`) a que un modal abierto contenga `texto` y devuelve su texto. */
async function esperarModal(driver, texto, ms = 12000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const t = await textoModal(driver, texto)
    if (t.trim()) return t
    await sleep(250)
  }
  return ''
}

/** Cierra todos los modales abiertos (X del header o botón de acción). */
async function cerrarModales(driver) {
  await driver.sleep(300)
  for (let i = 0; i < 6; i++) {
    const cierres = await driver.findElements(By.css('.modal.show .modal-header button.btn-close'))
    if (!cierres.length) {
      const accion = await driver.findElements(
        By.xpath(
          `//div[contains(@class,'modal') and contains(@class,'show')]` +
            `//button[normalize-space(.)='Nueva venta' or normalize-space(.)='Entendido']`,
        ),
      )
      if (!accion.length) return true
      try {
        await accion[accion.length - 1].click()
      } catch (e) {
        return false
      }
      await driver.sleep(700)
      continue
    }
    try {
      await cierres[cierres.length - 1].click()
    } catch (e) {
      await esperarToasts(driver, 7000)
      continue
    }
    await driver.sleep(700)
  }
  return true
}

/** Limpia el buscador (Escape → busqueda.clear: query + selected). */
async function limpiarSeleccion(driver) {
  const inputs = await driver.findElements(By.css(BUSCADOR))
  if (inputs.length) {
    try {
      await clicEn(driver, inputs[0], 'buscador')
      await inputs[0].sendKeys(Key.ESCAPE)
      await driver.sleep(450)
    } catch (e) {
      /* el input ya no está enfocado */
    }
  }
  await driver.sleep(300)
}

/** Vacia el input "Efectivo recibido" si tiene valor. */
async function limpiarRecibido(driver) {
  const v = await valorCampo(driver, RECIBIDO)
  if (v !== null && v !== '') await escribir(driver, RECIBIDO, '')
}

/** Limpia el carrito con el botón "Vaciar" (no pide confirmación). */
async function vaciarCarrito(driver) {
  const b = await estadoBoton(driver, 'Vaciar')
  if (b.existe && !b.disabled) {
    await clicExacto(driver, 'Vaciar')
    await driver.sleep(500)
  }
  const c = await leerCarrito(driver)
  if (!c.vacio) throw new Error(`el carrito no quedó vacío: ${JSON.stringify(c.items)}`)
  return c
}

/**
 * Deja #/pos en un estado limpio: sin modales, sin toasts, carrito vacío,
 * sin producto seleccionado y sin efectivo recibido.
 */
async function prepararPos(driver, { limpiarCarrito: conCarrito = true } = {}) {
  await esperarToasts(driver, 9000)
  if (!(await sinModales(driver))) throw new Error('no se pudieron cerrar los modales abiertos')
  const hash = await driver.executeScript('return location.hash')
  if (hash !== '#/pos') await abrirRuta(driver, '/pos', 3500)
  check(await hayTexto(driver, 'Punto de Venta', 15000), 'no se renderizó la ruta #/pos')
  if (conCarrito) await vaciarCarrito(driver)
  await limpiarSeleccion(driver)
  await limpiarRecibido(driver)
  await driver.sleep(300)
}

// ------------------------------------------------- helpers del POS (vista) ---

/** Escribe en el buscador de productos y espera el debounce (300 ms). */
async function buscarProducto(driver, texto, { enter = false } = {}) {
  await escribir(driver, BUSCADOR, texto)
  await driver.sleep(800)
  if (enter) {
    await presionar(driver, BUSCADOR, Key.ENTER)
    await driver.sleep(700)
  }
}

/** True si el detalle del producto (botón "Agregar") está visible. */
async function detalleVisible(driver) {
  const els = await driver.findElements(By.xpath(btn('Agregar')))
  return els.length > 0
}

/** Espera a que se seleccione un producto y aparezca su detalle. */
async function esperarDetalle(driver, ms = 9000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(btn('Agregar'))), ms)
    return true
  } catch (e) {
    return false
  }
}

/** Selecciona "llave inlgesa" por su SKU exacto con Enter (auto-selección). */
async function seleccionarLlave(driver) {
  await limpiarSeleccion(driver)
  await buscarProducto(driver, 'LLAVE', { enter: true })
  check(
    await esperarDetalle(driver),
    'no se seleccionó "llave inlgesa" (sin detalle con "Agregar")',
  )
}

/** Selecciona el primer resultado del dropdown (para productos sin SKU). */
async function seleccionarDeLista(driver, texto) {
  await limpiarSeleccion(driver)
  await buscarProducto(driver, texto)
  const filas = await driver.findElements(By.css('[data-testid="resultados-busqueda"] button'))
  check(filas.length > 0, `sin resultados en el dropdown para "${texto}"`)
  await clicEn(driver, filas[0], `dropdown "${texto}"`)
  await driver.sleep(600)
}

/** Badge "Stock: N" del detalle ('' si no está). */
async function stockDetalle(driver) {
  const t = await driver.executeScript(`
    const b = [...document.querySelectorAll('.badge')].find((x) => /Stock:\\s*\\d/.test(x.textContent || ''))
    return b ? (b.textContent || '').trim() : ''
  `)
  const m = t.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/** Opciones del dropdown de precios ({valor, opciones[], texto}). */
async function opcionesPrecio(driver) {
  return driver.executeScript(`
    const s = document.querySelector('select[aria-label="Precio a aplicar"]')
    if (!s) return null
    return {
      valor: s.value,
      texto: (s.options[s.selectedIndex]?.textContent || '').trim(),
      opciones: [...s.options].map((o) => ({ v: o.value, t: (o.textContent || '').trim() })),
    }
  `)
}

/** Total del detalle (el `strong` junto a la etiqueta "total:"). */
async function totalDetalle(driver) {
  return driver.executeScript(`
    const lbl = [...document.querySelectorAll('span')].find(
      (s) => (s.textContent || '').trim() === 'total:' && s.nextElementSibling,
    )
    return lbl ? (lbl.nextElementSibling.innerText || '').trim() : null
  `)
}

/** Valor del input de cantidad del detalle ('' si no hay detalle). */
async function valorCantidad(driver) {
  return valorCampo(driver, CANTIDAD_DETALLE)
}

/** Estado del carrito: items de localStorage + filas y total renderizados. */
async function leerCarrito(driver) {
  return driver.executeScript(`
    const sesion = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const key = 'pos_carrito_' + (sesion.id_sucursal || 'default')
    let items = []
    try { items = JSON.parse(localStorage.getItem(key) || '[]') } catch (e) { items = [] }
    const card = [...document.querySelectorAll('.card')].find(
      (c) => /PRODUCTO/.test(c.innerText || '') && /Carrito/.test(c.innerText || ''),
    )
    const filas = card
      ? [...card.querySelectorAll('tbody tr')].map((tr) =>
          (tr.innerText || '').replace(/\\s+/g, ' ').trim(),
        )
      : []
    const totalEl = card ? card.querySelector('.fs-4.monto') : null
    return {
      items: items.map((i) => ({
        name: i.name,
        sku: i.sku,
        cantidad: i.cantidad,
        precio: i.precio,
        subtotal: i.subtotal,
        tipo: i.tipoPrecio,
      })),
      total: items.reduce((s, i) => s + (i.subtotal || 0), 0),
      filas,
      totalTexto: totalEl ? (totalEl.innerText || '').trim() : null,
      vacio: items.length === 0,
      mensajeVacio: card ? /Carrito vac/i.test(card.innerText || '') : false,
    }
  `)
}

/** Cantidad en la fila del carrito que contiene `texto` ('' si no hay fila). */
async function filaCarrito(driver, texto) {
  const filas = (await leerCarrito(driver)).filas
  return filas.find((f) => f.includes(texto)) || ''
}

/** Contador "Pendientes (n)" del encabezado del carrito (null si no hay). */
async function pendientesCount(driver) {
  return driver.executeScript(`
    const b = [...document.querySelectorAll('button')].find((x) =>
      /Pendientes\\s*\\(/.test(x.innerText || ''),
    )
    if (!b) return null
    const m = (b.innerText || '').match(/\\((\\d+)\\)/)
    return m ? parseInt(m[1], 10) : null
  `)
}

/**
 * Diagnóstico de pendientes tras un fallo del contador: filas locales, estado
 * de los eventos INSERT de la cola y filas del servidor. Sirve para separar
 * "el guardado falló" de la carrera de fusionarPendientes (huérfanos).
 */
async function diagnosticoPendientes(driver) {
  let local = null
  try {
    local = await script(
      driver,
      `const { db } = await import('/src/lib/db.js')
       const suc = JSON.parse(localStorage.getItem('currentUser') || '{}').id_sucursal
       const vs = await db.ventas.where('[id_sucursal+estado]').equals([suc, 'pendiente']).toArray()
       const evs = await db.cola_sincronizacion.where('tabla').equals('ventas').toArray()
       const ins = evs.filter((e) => e.operacion === 'INSERT')
       return {
         locales: vs.length,
         eventos: ins.length
           ? ins.map((e) => String(e.sync_status)).join(',')
           : 'ninguno',
       }`,
    )
  } catch (e) {
    local = null
  }
  let servidor = '?'
  if (SUCURSAL) {
    const r = await rpc('get_ventas_pendientes', { p_id_sucursal: SUCURSAL }).catch(() => null)
    servidor = r && Array.isArray(r.data) ? r.data.length : String(r && r.data).slice(0, 80)
  }
  return `locales=${local ? local.locales : '?'} · eventos INSERT=${local ? local.eventos : '?'} · servidor=${servidor}`
}

/** Valor de la fila del resumen de pago ("Vuelto Q60.00" / "Falta Q30.00"). */
async function filaResumen(driver, label) {
  return driver.executeScript(
    `
    const el = [...document.querySelectorAll('span')].find(
      (s) => (s.textContent || '').trim() === arguments[0],
    )
    if (!el || !el.parentElement) return ''
    return (el.parentElement.innerText || '').replace(/\\s+/g, ' ').trim()
  `,
    label,
  )
}

/** Total "Total a cobrar" del panel de pago ('' si no está). */
async function totalPanel(driver) {
  return driver.executeScript(`
    const el = document.querySelector('.fs-2.monto')
    return el ? (el.innerText || '').trim() : ''
  `)
}

/** True si el botón "Efectivo" del panel está activo (inline background). */
async function efectivoActivo(driver) {
  return driver.executeScript(`
    const b = [...document.querySelectorAll('button')].find(
      (x) => (x.innerText || '').trim() === 'Efectivo',
    )
    if (!b) return null
    return !!(b.style && b.style.background)
  `)
}

/** Agrega "llave inlgesa" al carrito con la cantidad dada. */
async function agregarLlave(driver, cantidad = 1) {
  await seleccionarLlave(driver)
  if (cantidad !== 1) await escribir(driver, CANTIDAD_DETALLE, String(cantidad))
  await clicExacto(driver, 'Agregar')
  await driver.sleep(500)
  const c = await leerCarrito(driver)
  check(!c.vacio, 'el carrito quedó vacío tras pulsar "Agregar"')
  return c
}

// ------------------------------------------------ helpers de IndexedDB ---

/** Sucursal del dispositivo (localStorage.currentUser). */
async function idSucursal(driver) {
  const s = await driver.executeScript(
    "return JSON.parse(localStorage.getItem('currentUser') || 'null')",
  )
  return s && s.id_sucursal ? s.id_sucursal : null
}

/** Espera a que el login/POS hidrate el catálogo local (o lo fuerza). */
async function esperarCatalogo(driver) {
  for (let i = 0; i < 25; i++) {
    const r = await script(
      driver,
      `
      const { db } = await import('/src/lib/db.js')
      const prods = await db.productos.toArray()
      const llave = prods.find((x) => String(x.name || '').toLowerCase().includes('llave'))
      return {
        productos: prods.length,
        stocks: await db.productos_sucursal.count(),
        metodos: await db.metodos_pago.count(),
        idLlave: llave ? llave.id : null,
        preciosLlave: llave && llave.precios ? llave.precios.length : 0,
      }
    `,
    )
    if (r && !r.error && r.productos > 0 && r.stocks > 0 && r.idLlave) return r
    await sleep(700)
  }
  const suc = await idSucursal(driver)
  return script(
    driver,
    `
    const { hidratarCatalogoParaSucursal } = await import('/src/services/catalogSyncService.js')
    const n = await hidratarCatalogoParaSucursal(arguments[0])
    const { db } = await import('/src/lib/db.js')
    const prods = await db.productos.toArray()
    const llave = prods.find((x) => String(x.name || '').toLowerCase().includes('llave'))
    return {
      forzado: n,
      productos: prods.length,
      stocks: await db.productos_sucursal.count(),
      metodos: await db.metodos_pago.count(),
      idLlave: llave ? llave.id : null,
      preciosLlave: llave && llave.precios ? llave.precios.length : 0,
    }
  `,
    suc,
  )
}

/**
 * Stock de "llave inlgesa" en AMBOS stores: `productos_sucursal` (plano, el que
 * descuenta registrarVentaLocal) y `productos[].stock` (anidado, el que lee el
 * POS para pintar el detalle y el dropdown).
 */
async function leerStock(driver) {
  const idSuc = await idSucursal(driver)
  if (!idSuc) return { error: 'sin id_sucursal en localStorage.currentUser' }
  if (!ID_LLAVE) return { error: 'sin ID_LLAVE' }
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const idSucursal = arguments[0]
    const idProd = arguments[1]
    const f = await db.productos_sucursal.get([idSucursal, idProd])
    const p = await db.productos.get(idProd)
    const s = (p && Array.isArray(p.stock) ? p.stock : []).find((x) => x.id_sucursal === idSucursal)
    return {
      flat: f ? f.stock : null,
      deep: s ? s.stock : null,
      min: f ? f.stock_minimo : null,
    }
  `,
    idSuc,
    ID_LLAVE,
  )
}

/** Escribe el stock en ambos stores y espera a que las lecturas se estabilicen. */
async function fijarStockLlave(driver, valor) {
  const idSuc = await idSucursal(driver)
  const r = await script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const idSucursal = arguments[0]
    const idProd = arguments[1]
    const valor = arguments[2]
    const k = [idSucursal, idProd]
    const f = await db.productos_sucursal.get(k)
    if (!f) return { error: 'sin fila de productos_sucursal' }
    const antesFlat = f.stock
    await db.productos_sucursal.put({ ...f, stock: valor })
    const p = await db.productos.get(idProd)
    let antesDeep = null
    if (p && Array.isArray(p.stock)) {
      antesDeep = (p.stock.find((x) => x.id_sucursal === idSucursal) || {}).stock ?? null
      await db.productos.update(idProd, {
        stock: p.stock.map((x) =>
          x.id_sucursal === idSucursal ? { ...x, stock: valor } : x,
        ),
      })
    }
    return { ok: true, antesFlat, antesDeep, valor }
  `,
    idSuc,
    ID_LLAVE,
    valor,
  )
  if (r && r.error) throw new Error(`fijarStockLlave: ${r.error}`)
  for (let i = 0; i < 8; i++) {
    const s = await leerStock(driver)
    if (s && s.flat === valor && s.deep === valor) return { ...r, estable: true, actual: s }
    await sleep(400)
  }
  const s = await leerStock(driver)
  return { ...r, estable: false, actual: s }
}

/** Stock del servidor (get_productos_admin) para "llave inlgesa". Node-side: no depende de la red del navegador. */
async function leerStockServidor() {
  if (!ID_LLAVE || !SUCURSAL || !EMPRESA) return { error: 'sin ID_LLAVE/SUCURSAL/EMPRESA' }
  const r = await rpc('get_productos_admin', { p_id_empresa: EMPRESA })
  if (r.status !== 200) return { error: `HTTP ${r.status}: ${JSON.stringify(r.data)}` }
  const p = (r.data.productos || []).find((x) => x.id === ID_LLAVE)
  if (!p) return { error: 'producto no encontrado en el servidor' }
  const f = (p.stock || []).find((s) => s.id_sucursal === SUCURSAL)
  return { stock: f ? f.stock : null, min: f ? f.stock_minimo : null }
}

/**
 * Repone el stock del SERVIDOR si difiere del inicial.
 * Las ventas reales de CP-POS-001/012 descuentan stock en Supabase; sin reponerlo,
 * la siguiente corrida hidrata el catálogo con stock 0 y el suite deja de ser repetible
 * (mismo criterio de idempotencia que CPCompras.test.js). Node-side: funciona aunque
 * el navegador siga con la red cortada.
 */
async function restaurarStockServidor() {
  if (!STOCK_INICIAL || STOCK_INICIAL.error) return { omitido: 'sin stock inicial' }
  const actual = await leerStockServidor()
  if (actual.error) return { error: actual.error }
  if (actual.stock === STOCK_INICIAL.flat) {
    return { ok: true, sinCambios: true, stock: actual.stock }
  }
  const up = await rpc('upsert_producto_sucursal', {
    p_id_producto: ID_LLAVE,
    p_id_sucursal: SUCURSAL,
    p_stock: STOCK_INICIAL.flat,
    p_stock_minimo: typeof STOCK_INICIAL.min === 'number' ? STOCK_INICIAL.min : 0,
  })
  if (up.status !== 200 && up.status !== 204) {
    return { error: `upsert HTTP ${up.status}: ${JSON.stringify(up.data)}`, antes: actual.stock }
  }
  const desp = await leerStockServidor()
  if (desp.error) return { error: desp.error, antes: actual.stock }
  return { ok: true, antes: actual.stock, stock: desp.stock }
}

// ------------------------------------------- baseline y limpieza offline ---

/** Instantánea de IndexedDB capturada DESPUÉS de las ventas reales. */
async function capturarBaseline(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const ventas = await db.ventas.toArray()
    const dets = await db.detalle_venta.toArray()
    const evs = await db.cola_sincronizacion.toArray()
    const qs = await db.offline_quotes.toArray()
    const ps = await db.productos_sucursal.toArray()
    const prods = await db.productos.toArray()
    return {
      ts: Date.now(),
      ventas: ventas.map((v) => v.id),
      detalle: dets.map((d) => d.id),
      eventos: evs.map((e) => e.id),
      quotes: qs.map((q) => q.temp_id),
      stock: ps.map((s) => ({
        k: [s.id_sucursal, s.id_producto],
        stock: s.stock,
        min: s.stock_minimo,
      })),
      anidado: prods.map((p) => ({
        id: p.id,
        stock: (p.stock || []).map((x) => ({ id_sucursal: x.id_sucursal, stock: x.stock })),
      })),
      colaPend: evs.filter((e) => e.sync_status === 'PENDING').length,
    }
  `,
  )
}

/**
 * Limpia TODO lo que crearon CP-POS-009 y CP-POS-010, con la red AÚN CORTADA
 * (patrón del finally de TrasladosUI): si se restaura la red antes, el motor
 * de sync empujaría la venta offline y la cotización al servidor.
 * Solo borra filas FUERA del baseline y restaura el stock a los valores del
 * baseline (las ventas reales de CP-POS-001/012 se conservan).
 */
async function limpiarOffline(driver) {
  if (!BASELINE) return { omitido: 'sin baseline' }
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const b = arguments[0]

    const fueraVentas = (await db.ventas.toArray()).filter((v) => !b.ventas.includes(v.id))
    const ids = fueraVentas.map((v) => v.id)
    const evs = await db.cola_sincronizacion.toArray()

    // estado de sincronización de cada venta fuera del baseline
    const sinc = {}
    for (const id of ids) {
      const ev = evs.filter((e) => e.tabla === 'ventas' && e.id_registro === id).pop()
      sinc[id] = ev ? ev.sync_status : 'sin-evento'
    }
    // solo se borra lo que NUNCA llegó al servidor
    const borrables = ids.filter((id) => sinc[id] === 'PENDING' || sinc[id] === 'sin-evento')
    const retenidas = ids.filter((id) => !borrables.includes(id))

    const dets = (await db.detalle_venta.toArray()).filter(
      (d) => !b.detalle.includes(d.id) || borrables.includes(d.id_venta),
    )
    const evBorrar = evs.filter((e) => !b.eventos.includes(e.id) && borrables.includes(e.id_registro))
    const qs = (await db.offline_quotes.toArray()).filter((q) => !b.quotes.includes(q.temp_id))

    await db.cola_sincronizacion.bulkDelete(evBorrar.map((e) => e.id))
    if (dets.length) await db.detalle_venta.bulkDelete(dets.map((d) => d.id))
    if (borrables.length) await db.ventas.bulkDelete(borrables)
    if (qs.length) await db.offline_quotes.bulkDelete(qs.map((q) => q.temp_id))

    // stock de vuelta a los valores del baseline (plano + anidado)
    let stockPlano = 0
    for (const s of b.stock) {
      const f = await db.productos_sucursal.get(s.k)
      if (f && (f.stock !== s.stock || f.stock_minimo !== s.min)) {
        await db.productos_sucursal.put({ ...f, stock: s.stock, stock_minimo: s.min })
        stockPlano++
      }
    }
    let stockAnidado = 0
    for (const p of b.anidado) {
      const cur = await db.productos.get(p.id)
      if (!cur || !Array.isArray(cur.stock)) continue
      const mapa = new Map(p.stock.map((x) => [x.id_sucursal, x.stock]))
      let cambia = false
      const nuevo = cur.stock.map((x) => {
        if (!mapa.has(x.id_sucursal) || mapa.get(x.id_sucursal) === x.stock) return x
        cambia = true
        return { ...x, stock: mapa.get(x.id_sucursal) }
      })
      if (cambia) {
        await db.productos.update(p.id, { stock: nuevo })
        stockAnidado++
      }
    }

    return {
      ventasFuera: ids.length,
      ventasBorradas: borrables.length,
      ventasRetenidas: retenidas.map((id) => ({ id: id.slice(0, 8), sinc: sinc[id] })),
      detalleBorrado: dets.filter((d) => borrables.includes(d.id_venta) || !b.detalle.includes(d.id))
        .length,
      eventosBorrados: evBorrar.length,
      quotesBorrados: qs.length,
      stockPlanoRestaurado: stockPlano,
      stockAnidadoRestaurado: stockAnidado,
      colaRestante: await db.cola_sincronizacion.count(),
      ventasRestantes: await db.ventas.count(),
      quotesRestantes: await db.offline_quotes.count(),
    }
  `,
    BASELINE,
  )
}

/** Resumen final de IndexedDB (reporte de la corrida). */
async function estadoFinal(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const evs = await db.cola_sincronizacion.toArray()
    return {
      ventas: await db.ventas.count(),
      detalle: await db.detalle_venta.count(),
      quotes: await db.offline_quotes.count(),
      cola: evs.length,
      colaPend: evs.filter((e) => e.sync_status === 'PENDING').length,
      colaSync: evs.filter((e) => e.sync_status === 'SYNCED').length,
      colaConflict: evs.filter((e) => e.sync_status === 'CONFLICT').length,
      metodos: await db.metodos_pago.count(),
    }
  `,
  )
}

// ------------------------------------------------- helpers de ejecución ---

/** Q(centavos) con la misma regla que formatQ del navegador. */
const Q = (centavos) =>
  `Q${(centavos / 100).toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

/** Clic en el botón de un modal abierto cuyo texto visible es EXACTAMENTE `etiqueta`. */
async function clicBotonModal(driver, etiqueta, ms = 8000) {
  const x =
    `//div[contains(@class,'modal') and contains(@class,'show')]` +
    `//button[normalize-space(.)='${etiqueta}']`
  const el = await driver.wait(until.elementLocated(By.xpath(x)), ms)
  await driver.wait(until.elementIsVisible(el), 4000)
  await clicEn(driver, el, etiqueta)
  return true
}

/** Cierra modales hasta que no quede ninguno `.modal.show` (máx. 4 rondas). */
async function sinModales(driver, rondas = 4) {
  for (let i = 0; i < rondas; i++) {
    const m = await driver.findElements(By.css('.modal.show'))
    if (!m.length) return true
    await cerrarModales(driver)
    await driver.sleep(400)
  }
  return (await driver.findElements(By.css('.modal.show'))).length === 0
}

/** Pulsa el botón "+" de la fila del carrito que contiene `texto`. */
async function clicMasFila(driver, texto) {
  return driver.executeScript(
    `
    const q = arguments[0]
    const card = [...document.querySelectorAll('.card')].find(
      (c) => /PRODUCTO/.test(c.innerText || '') && /Carrito/.test(c.innerText || ''),
    )
    if (!card) return { error: 'sin tarjeta Carrito' }
    const row = [...card.querySelectorAll('tbody tr')].find((tr) =>
      (tr.innerText || '').includes(q),
    )
    if (!row) return { error: 'sin fila ' + q }
    const bs = [...row.querySelectorAll('button')]
    if (bs.length < 2) return { error: 'botones de fila: ' + bs.length }
    const bloqueado = !!bs[1].disabled
    if (!bloqueado) bs[1].click()
    const input = row.querySelector('input[type=number]')
    return { ok: true, bloqueado, antes: input ? input.value : null, max: input ? input.max : null }
  `,
    texto,
  )
}

/** Estado final de la fila del carrito (`{cantidad, mas, menos, max}`). */
async function estadoFilaCarrito(driver, texto) {
  return driver.executeScript(
    `
    const q = arguments[0]
    const card = [...document.querySelectorAll('.card')].find(
      (c) => /PRODUCTO/.test(c.innerText || '') && /Carrito/.test(c.innerText || ''),
    )
    if (!card) return null
    const row = [...card.querySelectorAll('tbody tr')].find((tr) =>
      (tr.innerText || '').includes(q),
    )
    if (!row) return null
    const bs = [...row.querySelectorAll('button')]
    const input = row.querySelector('input[type=number]')
    return {
      cantidad: input ? input.value : null,
      max: input ? input.max : null,
      mas: bs.length > 1 ? !!bs[1].disabled : null,
      menos: bs.length > 0 ? !!bs[0].disabled : null,
      fila: (row.innerText || '').replace(/\\s+/g, ' ').trim(),
    }
  `,
    texto,
  )
}

/** Espera a que el contador "Pendientes (n)" llegue a >= `min`. */
async function esperarPendientes(driver, min, ms = 12000) {
  const fin = Date.now() + ms
  let ultimo = null
  while (Date.now() < fin) {
    ultimo = await pendientesCount(driver)
    if (typeof ultimo === 'number' && ultimo >= min) return ultimo
    await sleep(400)
  }
  return ultimo
}

// ------------------------------------------------------------------ main ---

async function main() {
  let driver = null
  let fase = 'setup'
  let fallo = null

  try {
    driver = await crearDriver()
    await login(driver)

    // ---------------------------------------------------------- entorno ---
    fase = 'entorno'
    SUCURSAL = await idSucursal(driver)
    check(SUCURSAL, 'no se pudo leer la sucursal desde localStorage.currentUser')
    EMPRESA = await driver.executeScript("return localStorage.getItem('empresaSeleccionada')")
    check(EMPRESA, 'no se pudo leer localStorage.empresaSeleccionada')
    let cat = await esperarCatalogo(driver)
    if (!cat.metodos) {
      const rec = await script(
        driver,
        `
        const { hidratarCatalogoParaSucursal } = await import('/src/services/catalogSyncService.js')
        const n = await hidratarCatalogoParaSucursal(arguments[0])
        const { db } = await import('/src/lib/db.js')
        return { forzado: n, metodos: await db.metodos_pago.count(), productos: await db.productos.count() }
      `,
        SUCURSAL,
      )
      console.log('  · rehidratación de catálogo:', JSON.stringify(rec))
      cat = await esperarCatalogo(driver)
    }
    ID_LLAVE = cat.idLlave
    STOCK_INICIAL = await leerStock(driver)
    console.log('  · sucursal:', SUCURSAL)
    console.log('  · catálogo local:', JSON.stringify(cat))
    console.log('  · stock inicial (plano/anidado):', JSON.stringify(STOCK_INICIAL))
    check(ID_LLAVE, 'no se encontró "llave inlgesa" en el catálogo local')
    check(
      STOCK_INICIAL && !STOCK_INICIAL.error && typeof STOCK_INICIAL.flat === 'number',
      `stock inicial ilegible: ${JSON.stringify(STOCK_INICIAL)}`,
    )
    check(cat.metodos > 0, `IndexedDB sin métodos de pago: ${JSON.stringify(cat)}`)

    // Regla del repo: con RED se abre cada ruta lazy que se usará después.
    fase = 'apertura de #/pos'
    await abrirRuta(driver, '/pos', 4500)
    check(
      await hayTexto(driver, 'Punto de Venta', 25000),
      'no se renderizó la ruta #/pos con red disponible',
    )
    check(
      (await driver.executeScript('return navigator.onLine')) === true,
      'se necesitaba red para abrir #/pos por primera vez',
    )

    // ------------------------------------------------------- CP-POS-002 ---
    fase = 'CP-POS-002'
    await caso(driver, RESULTADOS, CASOS['CP-POS-002'], async () => {
      await prepararPos(driver)

      await buscarProducto(driver, 'llav')
      const filas = await driver.findElements(By.css('[data-testid="resultados-busqueda"] button'))
      const nombres = []
      for (const f of filas) {
        try {
          nombres.push((await f.getText()).replace(/\s+/g, ' ').trim())
        } catch (e) {
          /* la fila desapareció en el re-render */
        }
      }
      check(filas.length > 0, 'con "llav" no se abrió el dropdown de resultados')
      check(
        nombres.some((t) => t.toLowerCase().includes('llave inlgesa')),
        `el dropdown no lista "llave inlgesa": ${JSON.stringify(nombres)}`,
      )
      check(
        !(await detalleVisible(driver)),
        'con un término parcial el producto se auto-seleccionó (debía mostrarse la lista)',
      )

      await seleccionarLlave(driver)
      const sku = await textoContenido(driver, 'SKU:')
      check(/SKU:\s*LLAVE/.test(sku), `el detalle no muestra "SKU: LLAVE" (leído "${sku}")`)
      const op = await opcionesPrecio(driver)
      check(
        op && op.opciones.length >= 2,
        `el selector "Precio:" tiene ${op ? op.opciones.length : 0} opción(es) (esperado 2)`,
      )
      check(
        !(await existeTexto(driver, 'Busca un producto para ver su detalle')),
        'el detalle no reemplazó al estado vacío "Busca un producto para ver su detalle"',
      )

      await buscarProducto(driver, SIN_RESULTADOS)
      const sinRes = await textoContenido(driver, 'Sin resultados para')
      check(
        sinRes.includes('Sin resultados para'),
        `no apareció "Sin resultados para …" con un término inexistente (leído "${sinRes}")`,
      )

      await limpiarSeleccion(driver)
      return (
        `"llav" → dropdown con ${filas.length} fila(s) y sin auto-selección; ` +
        `"LLAVE"+Enter → detalle con ${sku} y ${op.opciones.length} precios ` +
        `(${op.opciones.map((o) => o.t).join(' | ')}); ` +
        `"${SIN_RESULTADOS}" → ${sinRes || '(sin texto)'}`
      )
    })

    // ------------------------------------------------------- CP-POS-006 ---
    fase = 'CP-POS-006'
    await caso(driver, RESULTADOS, CASOS['CP-POS-006'], async () => {
      await prepararPos(driver)
      const c = await leerCarrito(driver)
      check(
        c.vacio && c.mensajeVacio,
        `el carrito no muestra "Carrito vacío": ${JSON.stringify({ vacio: c.vacio, msg: c.mensajeVacio })}`,
      )
      check(
        await existeTexto(driver, 'Busca un producto para ver su detalle'),
        'falta el estado vacío "Busca un producto para ver su detalle"',
      )
      const rv = await esperarBoton(driver, 'Realizar Venta', true, 9000)
      check(
        rv && rv.existe && rv.disabled,
        `el botón "Realizar Venta" no quedó deshabilitado: ${JSON.stringify(rv)}`,
      )
      const cot = await esperarBoton(driver, 'Cotización', true, 6000)
      check(
        cot && cot.existe && cot.disabled,
        `el botón "Cotización" no quedó deshabilitado: ${JSON.stringify(cot)}`,
      )
      const vac = await esperarBoton(driver, 'Vaciar', true, 6000)
      check(
        vac && vac.existe && vac.disabled,
        `el botón "Vaciar" no quedó deshabilitado: ${JSON.stringify(vac)}`,
      )
      return (
        'carrito vacío + estado vacío visible · "Realizar Venta" deshabilitado · ' +
        '"Cotización" deshabilitado · "Vaciar" deshabilitado · no se pudo cobrar'
      )
    })

    // ------------------------------------------------------- CP-POS-005 ---
    fase = 'CP-POS-005'
    await caso(driver, RESULTADOS, CASOS['CP-POS-005'], async () => {
      await prepararPos(driver)
      const c = await agregarLlave(driver, 1)
      check(
        c.total === 4000,
        `el total del carrito es ${c.total} centavos (esperado 4000 = Q40.00)`,
      )
      const ef = await efectivoActivo(driver)
      check(ef === true, `el botón "Efectivo" no está activo (devolvió ${ef})`)
      const rv0 = await esperarBoton(driver, 'Realizar Venta', false, 9000)
      check(
        rv0 && !rv0.disabled,
        `con carrito completo el botón no habilitó: ${JSON.stringify(rv0)}`,
      )

      await escribir(driver, RECIBIDO, '10')
      const falta = await filaResumen(driver, 'Falta')
      check(
        /Falta\s*Q30\.00/.test(falta),
        `la fila "Falta" muestra "${falta}" (esperado "Falta Q30.00")`,
      )
      const rv = await esperarBoton(driver, 'Realizar Venta', true, 6000)
      check(
        rv && rv.disabled,
        `con efectivo insuficiente "Realizar Venta" sigue habilitado: ${JSON.stringify(rv)}`,
      )
      return (
        `carrito 1 × Q40.00 = Q40.00 · Efectivo activo · recibido Q10.00 → "${falta}" · ` +
        '"Realizar Venta" deshabilitado'
      )
    })

    // ------------------------------------------------------- CP-POS-004 ---
    fase = 'CP-POS-004'
    await caso(driver, RESULTADOS, CASOS['CP-POS-004'], async () => {
      await prepararPos(driver, { limpiarCarrito: false })
      let c = await leerCarrito(driver)
      if (c.vacio) c = await agregarLlave(driver, 1)
      check(
        c.total === 4000,
        `el total del carrito es ${c.total} centavos (esperado 4000 = Q40.00)`,
      )
      await escribir(driver, RECIBIDO, '100')
      const vuelto = await filaResumen(driver, 'Vuelto')
      check(
        /Vuelto\s*Q60\.00/.test(vuelto),
        `la fila "Vuelto" muestra "${vuelto}" (esperado "Vuelto Q60.00")`,
      )
      const total = await totalPanel(driver)
      check(total === 'Q40.00', `el total a cobrar es "${total}" (esperado "Q40.00")`)
      const rv = await esperarBoton(driver, 'Realizar Venta', false, 6000)
      check(
        rv && !rv.disabled,
        `el botón "Realizar Venta" quedó deshabilitado: ${JSON.stringify(rv)}`,
      )
      return (
        `carrito Q40.00 · recibido Q100.00 → "${vuelto}" · total "${total}" · botón habilitado · ` +
        'DESVIACIÓN: el cobro NO se ejecuta en esta corrida para no dejar una venta extra ' +
        '(la venta real la hace CP-POS-001)'
      )
    })

    // ------------------------------------------------------- CP-POS-007 ---
    fase = 'CP-POS-007'
    await caso(driver, RESULTADOS, CASOS['CP-POS-007'], async () => {
      await prepararPos(driver)
      const stock = STOCK_INICIAL.flat
      await seleccionarLlave(driver)
      const badge = await stockDetalle(driver)
      check(
        badge === stock,
        `el badge del detalle marca "Stock: ${badge}" (IndexedDB dice ${stock})`,
      )
      await escribir(driver, CANTIDAD_DETALLE, '5')
      const cant = await valorCantidad(driver)
      check(
        cant === String(stock),
        `con stock ${stock} la cantidad quedó en "${cant}" (esperado "${stock}")`,
      )
      const esperadoDetalle = Q(stock * (stock >= 10 ? 3500 : 4000))
      const totalD = await totalDetalle(driver)
      check(
        totalD === esperadoDetalle,
        `el total del detalle es "${totalD}" (esperado "${esperadoDetalle}")`,
      )

      await clicExacto(driver, 'Agregar')
      await driver.sleep(600)
      const c1 = await leerCarrito(driver)
      check(
        c1.items.length === 1 && c1.items[0].cantidad === stock,
        `el carrito quedó con ${JSON.stringify(c1.items.map((i) => i.cantidad))} (esperado [${stock}])`,
      )

      let clics = 0
      for (let i = 0; i < 4; i++) {
        const r = await clicMasFila(driver, 'LLAVE')
        if (r.error) throw new Error(`botón "+" del carrito: ${r.error}`)
        clics++
        if (r.bloqueado) break
        await driver.sleep(450)
      }
      const fila = await estadoFilaCarrito(driver, 'LLAVE')
      check(fila, 'no se encontró la fila del carrito con "LLAVE"')
      check(
        fila.cantidad === String(stock),
        `tras pulsar "+" la cantidad quedó en "${fila.cantidad}" (esperado "${stock}")`,
      )
      check(
        fila.mas,
        `el botón "+" no quedó deshabilitado al llegar al stock: ${JSON.stringify(fila)}`,
      )
      check(
        fila.max === String(stock),
        `el input del carrito tiene max="${fila.max}" (esperado "${stock}")`,
      )
      const c2 = await leerCarrito(driver)
      check(
        c2.items[0].subtotal === stock * (stock >= 10 ? 3500 : 4000),
        `el subtotal del carrito es ${c2.items[0].subtotal} centavos`,
      )
      return (
        `stock local ${stock} · badge "Stock: ${badge}" · escribir 5 → "${cant}" (limitado) · ` +
        `total detalle ${totalD} · Agregar → cantidad ${stock} · "+" pulsado ${clics} vez(es) ` +
        `hasta quedarse en ${fila.cantidad} con "+" deshabilitado (max=${fila.max}) · fila "${fila.fila}"`
      )
    })

    // ------------------------------------------------------- CP-POS-008 ---
    fase = 'CP-POS-008'
    await caso(driver, RESULTADOS, CASOS['CP-POS-008'], async () => {
      await prepararPos(driver)
      STOCK_ORIGINAL = await leerStock(driver)
      const fix = await fijarStockLlave(driver, 0)
      STOCK_PARCHADO = 0
      check(fix.estable, `no se estabilizó el stock en 0: ${JSON.stringify(fix)}`)
      await seleccionarLlave(driver)
      const badge = await stockDetalle(driver)
      check(badge === 0, `el badge del detalle marca "Stock: ${badge}" (esperado 0)`)
      const msg = await textoContenido(driver, 'Sin stock en tu sucursal', 8000)
      check(
        msg.includes('Sin stock en tu sucursal'),
        `no se mostró "Sin stock en tu sucursal — revisa disponibilidad en otras bodegas" (leído "${msg}")`,
      )
      const b = await esperarBoton(driver, 'Agregar', true, 6000)
      check(
        b && b.existe && b.disabled,
        `el botón "Agregar" no quedó deshabilitado: ${JSON.stringify(b)}`,
      )
      // El stock se restaura al arrancar CP-POS-011 (y en el finally de la suite)
      return (
        `stock fijado a 0 en ambos stores (antes ${JSON.stringify(STOCK_ORIGINAL)}) · ` +
        `badge "Stock: 0" · "${msg}" · botón "Agregar" deshabilitado · ` +
        'la restauración queda para CP-POS-011 (para que la captura muestre el estado)'
      )
    })

    // ------------------------------------------------------- CP-POS-011 ---
    fase = 'CP-POS-011'
    await caso(driver, RESULTADOS, CASOS['CP-POS-011'], async () => {
      const rest = await fijarStockLlave(driver, STOCK_INICIAL.flat)
      STOCK_PARCHADO = null
      check(rest.estable, `no se restauró el stock tras CP-POS-008: ${JSON.stringify(rest)}`)
      await prepararPos(driver)

      const c = await agregarLlave(driver, 1)
      check(c.items.length === 1, `el carrito no quedó con 1 ítem: ${JSON.stringify(c.items)}`)

      let segundoAgregable = false
      let segundoDetalle = ''
      try {
        await seleccionarDeLista(driver, 'fixture')
        segundoDetalle = await textoContenido(
          driver,
          'Este producto no tiene precios configurados',
          5000,
        )
        const b2 = await estadoBoton(driver, 'Agregar')
        segundoAgregable = b2.existe && !b2.disabled
        segundoDetalle = segundoDetalle
          ? `"Fixture T9 Traslados" sin precios → "Agregar" deshabilitado`
          : `el detalle del segundo producto sí permite agregar (${JSON.stringify(b2)})`
      } catch (e) {
        segundoDetalle = `no se pudo seleccionar el segundo producto: ${String(e.message || e)}`
      }

      await clicExacto(driver, 'Vaciar')
      await driver.sleep(1200)
      const modalConfirm = await existeTexto(driver, 'Reemplazar carrito')
      const c2 = await leerCarrito(driver)
      const vacioTras = c2.vacio && c2.mensajeVacio

      if (!modalConfirm) {
        throw new Error(
          `"Vaciar" vació el carrito de inmediato sin mostrar la confirmación ` +
            `"Reemplazar carrito" (ni opción de cancelar). Diagnóstico: carrito vacío=` +
            `${vacioTras} · segundo producto agregable=${segundoAgregable} (${segundoDetalle}) · ` +
            `la única ruta con esa confirmación es cargar un pendiente sobre un carrito con ítems (ver CP-POS-012)`,
        )
      }
      check(vacioTras, `tras confirmar, el carrito no quedó vacío: ${JSON.stringify(c2.items)}`)
      return (
        `confirmación "Reemplazar carrito" visible · al confirmar "Carrito vacío"=${vacioTras} · ` +
        `segundo producto agregable=${segundoAgregable} (${segundoDetalle})`
      )
    })

    // ------------------------------------------------------- CP-POS-003 ---
    fase = 'CP-POS-003'
    await caso(driver, RESULTADOS, CASOS['CP-POS-003'], async () => {
      try {
        await prepararPos(driver)
        const fix = await fijarStockLlave(driver, 12)
        STOCK_PARCHADO = 12
        check(fix.estable, `no se estabilizó el stock en 12: ${JSON.stringify(fix)}`)

        await seleccionarLlave(driver)
        const badge = await stockDetalle(driver)
        check(badge === 12, `el badge del detalle marca "Stock: ${badge}" (esperado 12)`)

        const op0 = await opcionesPrecio(driver)
        check(op0, 'no se renderizó el selector "Precio:"')
        check(
          /^Auto _ Q40\.00/.test(op0.texto),
          `el tier Auto inicial es "${op0.texto}" (esperado "Auto _ Q40.00 (según cantidad)")`,
        )
        const mayoreo = op0.opciones.find(
          (o) => /MAYOREO/.test(o.t) && /Q35\.00/.test(o.t) && /mín\. 10/.test(o.t),
        )
        check(
          mayoreo,
          `falta la opción "MAYOREO _ Q35.00 (mín. 10)": ${JSON.stringify(op0.opciones)}`,
        )
        const normal = op0.opciones.find((o) => /NORMAL/.test(o.t) && /Q40\.00/.test(o.t))
        check(normal, `falta la opción "NORMAL _ Q40.00": ${JSON.stringify(op0.opciones)}`)

        await escribir(driver, CANTIDAD_DETALLE, '10')
        const cant = await valorCantidad(driver)
        check(cant === '10', `la cantidad quedó en "${cant}" (esperado 10; stock 12)`)

        const op10 = await opcionesPrecio(driver)
        check(
          /Auto _ Q35\.00 \(según cantidad\)/.test(op10.texto),
          `con cantidad 10 el tier Auto es "${op10.texto}" (esperado "Auto _ Q35.00 (según cantidad)")`,
        )
        const totalD = await totalDetalle(driver)
        check(totalD === 'Q350.00', `el total del detalle es "${totalD}" (esperado "Q350.00")`)

        await clicExacto(driver, 'Agregar')
        await driver.sleep(700)
        const c = await leerCarrito(driver)
        check(c.items.length === 1, `el carrito tiene ${c.items.length} ítems (esperado 1)`)
        const it = c.items[0]
        check(it.cantidad === 10, `la cantidad del carrito es ${it.cantidad} (esperado 10)`)
        check(
          it.precio === 3500,
          `el precio unitario es ${it.precio} centavos (esperado 3500 = Q35.00)`,
        )
        check(
          it.subtotal === 35000,
          `el subtotal es ${it.subtotal} centavos (esperado 35000 = Q350.00)`,
        )
        check(it.tipo === 'MAYOREO', `el tipo de precio es "${it.tipo}" (esperado MAYOREO)`)
        const fila = c.filas[0] || ''
        check(
          /LLAVE/.test(fila) && /Q35\.00/.test(fila) && /Q350\.00/.test(fila),
          `la fila del carrito no muestra LLAVE/Q35.00/Q350.00: "${fila}"`,
        )
        return (
          `stock fijado a 12 · Auto "${op0.texto}" → con cantidad 10 "${op10.texto}" · ` +
          `total detalle ${totalD} · carrito ${it.cantidad} × Q35.00 = Q350.00 (${it.tipo}) ` +
          `· fila "${fila}" · el stock se restaura en el finally de este caso`
        )
      } finally {
        const r = await fijarStockLlave(driver, STOCK_INICIAL.flat)
        STOCK_PARCHADO = null
        console.log('  · stock restaurado tras CP-POS-003:', JSON.stringify(r))
      }
    })

    // ------------------------------------------------------- CP-POS-001 ---
    fase = 'CP-POS-001'
    await caso(driver, RESULTADOS, CASOS['CP-POS-001'], async () => {
      await prepararPos(driver)
      const c = await agregarLlave(driver, 1)
      check(
        c.total === 4000,
        `el total del carrito es ${c.total} centavos (esperado 4000 = Q40.00)`,
      )
      const rv = await esperarBoton(driver, 'Realizar Venta', false, 9000)
      check(
        rv && !rv.disabled,
        `el botón "Realizar Venta" no quedó habilitado: ${JSON.stringify(rv)}`,
      )

      const stockAntes = await leerStock(driver)
      await clicExacto(driver, 'Realizar Venta')

      let spinner = false
      const t0 = Date.now()
      while (Date.now() - t0 < 3000 && !spinner) {
        spinner = (await driver.findElements(By.xpath("//button[contains(., 'Procesando')]")))
          .length
        if (!spinner) await sleep(150)
      }

      const toast = await esperarToast(driver, 'Venta registrada correctamente', 15000)
      check(toast, 'no apareció el toast "Venta registrada correctamente"')
      const mod = await esperarModal(driver, '¡Venta realizada!', 15000)
      check(mod, 'no se abrió el modal "¡Venta realizada!"')
      const plano = mod.replace(/\s+/g, ' ')
      check(
        /Folio: [0-9A-F]{8}/.test(plano),
        `el modal no muestra el folio: "${plano.slice(0, 200)}"`,
      )
      check(
        /Nueva venta/.test(plano),
        `el modal no tiene el botón "Nueva venta": "${plano.slice(0, 200)}"`,
      )

      const stockDesp = await leerStock(driver)
      check(
        stockDesp.flat === stockAntes.flat - 1,
        `el stock local pasó de ${stockAntes.flat} a ${stockDesp.flat} (esperado ${stockAntes.flat - 1})`,
      )
      return (
        `carrito Q40.00 · spinner "Procesando" ${spinner ? 'visto' : 'NO visto (efímero)'} · ` +
        `toast "${toast.slice(0, 80)}" · modal "${plano.slice(0, 90)}" · ` +
        `stock local ${stockAntes.flat} → ${stockDesp.flat} · ` +
        `stock anidado ${stockAntes.deep} → ${stockDesp.deep} (solo desciende productos_sucursal) · ` +
        'el modal se deja abierto a propósito (la captura lo muestra)'
      )
    })

    // ------------------------------------------------------- CP-POS-012 ---
    fase = 'CP-POS-012'
    await caso(driver, RESULTADOS, CASOS['CP-POS-012'], async () => {
      await prepararPos(driver)
      const c1 = await agregarLlave(driver, 1)
      check(c1.total === 4000, `el carrito sembrado suma ${c1.total} centavos (esperado 4000)`)
      const nAntes = await pendientesCount(driver)

      await clicExacto(driver, 'Pendiente')
      const toastP = await esperarToast(driver, 'Pendiente guardado', 12000)
      check(toastP, 'no apareció el toast "Pendiente guardado"')
      await esperarToasts(driver, 9000)
      const c2 = await leerCarrito(driver)
      check(c2.vacio, `el carrito no se vació al guardar el pendiente: ${JSON.stringify(c2.items)}`)
      const nDesp = await esperarPendientes(driver, (nAntes || 0) + 1, 12000)
      if (nDesp === null || nDesp < (nAntes || 0) + 1) {
        const diag = await diagnosticoPendientes(driver)
        throw new Error(
          `el contador "Pendientes (n)" no subió (antes ${nAntes}, ahora ${nDesp}) · ${diag} · ` +
            'los datos de arriba separan el fallo: si locales=0 con servidor=nAntes+1 el pendiente ' +
            'SÍ se guardó (push completado) pero fusionarPendientes lo borró localmente como ' +
            'huérfano (evento SYNCED + get_ventas_pendientes leído antes del commit)',
        )
      }

      // Re-sembrar el carrito: la confirmación "Reemplazar carrito" solo
      // aparece si AL CARGAR el pendiente ya hay ítems (POSPage handleCargarPendiente)
      const cRe = await agregarLlave(driver, 1)
      check(
        cRe.total === 4000,
        `no se pudo re-sembrar el carrito antes de cargar el pendiente: ${cRe.total} centavos`,
      )

      await clicQueContenga(driver, 'Pendientes (')
      const mod = await esperarModal(driver, 'Ventas pendientes', 10000)
      check(mod, 'no se abrió el modal "Ventas pendientes"')
      let cuerpo = ''
      const f1 = Date.now() + 12000
      while (Date.now() < f1) {
        cuerpo = await textoModal(driver, 'Ventas pendientes')
        if (/Q40\.00/.test(cuerpo)) break
        await sleep(400)
      }
      check(
        /Q40\.00/.test(cuerpo),
        `el modal no lista el pendiente de Q40.00: "${cuerpo.slice(0, 240)}"`,
      )

      const r = await driver.executeScript(`
        const t = 'Q40.00'
        const btns = [...document.querySelectorAll('.modal.show button[title="Cargar al carrito"]')]
        for (const b of btns) {
          const row = b.closest('.border')
          if (row && (row.innerText || '').includes(t)) { b.click(); return 'ok' }
        }
        return btns.length ? 'sin fila con ' + t : 'sin botones de cargar'
      `)
      check(r === 'ok', `no se pudo pulsar "Cargar al carrito" (${r})`)

      const conf = await esperarModal(driver, 'Reemplazar carrito', 8000)
      check(
        conf,
        'no apareció la confirmación "Reemplazar carrito" al cargar sobre un carrito con ítems',
      )
      const planoConf = conf.replace(/\s+/g, ' ')
      check(
        /¿Continuar\?/.test(planoConf),
        `la confirmación no explica el reemplazo: "${planoConf.slice(0, 220)}"`,
      )
      await clicBotonModal(driver, 'Cargar')
      const toastC = await esperarToast(driver, 'Pendiente cargado', 10000)
      check(toastC, 'no apareció el toast "Pendiente cargado"')
      await esperarToasts(driver, 9000)
      const c3 = await leerCarrito(driver)
      check(
        !c3.vacio && c3.total === 4000,
        `el pendiente no se cargó al carrito: ${JSON.stringify(c3.items)}`,
      )

      const rv = await esperarBoton(driver, 'Realizar Venta', false, 9000)
      check(
        rv && !rv.disabled,
        `el botón "Realizar Venta" quedó deshabilitado tras cargar el pendiente: ${JSON.stringify(rv)}`,
      )
      const stockAntes = await leerStock(driver)
      await clicExacto(driver, 'Realizar Venta')
      const toastV = await esperarToast(driver, 'Venta registrada correctamente', 15000)
      check(toastV, 'no apareció el toast "Venta registrada correctamente" al cobrar el pendiente')
      const mod2 = await esperarModal(driver, '¡Venta realizada!', 15000)
      check(mod2, 'no se abrió el modal "¡Venta realizada!" al cobrar el pendiente')
      const plano2 = mod2.replace(/\s+/g, ' ')
      check(
        /Folio: [0-9A-F]{8}/.test(plano2),
        `el modal no muestra el folio: "${plano2.slice(0, 200)}"`,
      )

      const stockDesp = await leerStock(driver)
      check(
        stockDesp.flat === stockAntes.flat - 1,
        `el stock local pasó de ${stockAntes.flat} a ${stockDesp.flat} (esperado ${stockAntes.flat - 1})`,
      )
      const nFinal = await esperarPendientes(driver, Math.max(0, (nDesp || 1) - 1), 10000)
      return (
        `pendientes ${nAntes} → ${nDesp} (guardar) → ${nFinal} (cobrar, informativo) · ` +
        `modal "Ventas pendientes" lista Q40.00 · confirmación "${planoConf.slice(0, 90)}" · ` +
        `toast "Pendiente cargado" · carrito ${c3.total} centavos · ` +
        `cobro con Folio (${plano2.slice(0, 40)}) · stock ${stockAntes.flat} → ${stockDesp.flat} · ` +
        'el modal de resultado queda abierto para la captura'
      )
    })

    // ------------------------------------------------------- baseline ---
    fase = 'baseline'
    BASELINE = await capturarBaseline(driver)
    console.log(
      '  · baseline (tras CP-POS-001/012):',
      JSON.stringify({
        ventas: BASELINE.ventas.length,
        eventos: BASELINE.eventos.length,
        colaPend: BASELINE.colaPend,
        quotes: BASELINE.quotes.length,
        stock: BASELINE.stock.filter((s) => String(s.k[1]) === ID_LLAVE),
      }),
    )

    // ------------------------------------------------------- CP-POS-009 ---
    fase = 'CP-POS-009'
    await caso(driver, RESULTADOS, CASOS['CP-POS-009'], async () => {
      const on0 = await driver.executeScript('return navigator.onLine')
      check(on0 === true, `CP-POS-009 necesita la red arriba al entrar (navigator.onLine=${on0})`)
      await cortarRed(driver)
      redCortada = true
      const on1 = await driver.executeScript('return navigator.onLine')
      check(on1 === false, `no se pudo cortar la red con CDP (navigator.onLine=${on1})`)

      await prepararPos(driver)
      const s0 = await leerStock(driver)
      check(!s0.error, `stock ilegible antes de la venta offline: ${JSON.stringify(s0)}`)
      let stockParchado = false
      if (s0.flat < 1) {
        const f = await fijarStockLlave(driver, 1)
        STOCK_PARCHADO = 1
        stockParchado = true
        console.log('  · stock subido a 1 para poder vender offline:', JSON.stringify(f))
      }

      const c = await agregarLlave(driver, 1)
      check(c.total === 4000, `el carrito offline suma ${c.total} centavos (esperado 4000)`)
      const bCot = await driver.findElements(By.xpath(btn('Cotización')))
      const tituloCot = bCot.length ? await bCot[0].getAttribute('title') : null
      const avisoPanel = !!tituloCot && /Sin conexión/.test(tituloCot)

      const stockAntes = await leerStock(driver)
      await clicExacto(driver, 'Realizar Venta')

      const toast = await esperarToast(driver, 'Venta registrada correctamente', 15000)
      check(toast, 'no apareció el toast "Venta registrada correctamente" con la red cortada')
      const mod = await esperarModal(driver, '¡Venta realizada!', 15000)
      check(mod, 'no se abrió el modal "¡Venta realizada!" con la red cortada')
      const plano = mod.replace(/\s+/g, ' ')
      check(
        /Folio: [0-9A-F]{8}/.test(plano),
        `el modal no muestra el folio: "${plano.slice(0, 200)}"`,
      )

      let est = null
      const f2 = Date.now() + 8000
      while (Date.now() < f2) {
        est = await script(
          driver,
          `
          const { db } = await import('/src/lib/db.js')
          const b = arguments[0]
          const fuera = (await db.ventas.toArray()).filter((v) => !b.ventas.includes(v.id))
          if (!fuera.length) return { error: 'sin ventas fuera del baseline' }
          const id = fuera[fuera.length - 1].id
          const evs = await db.cola_sincronizacion
            .filter((e) => e.tabla === 'ventas' && e.id_registro === id)
            .toArray()
          const ev = evs[evs.length - 1]
          return {
            id: id.slice(0, 8),
            sync: ev ? ev.sync_status : 'sin-evento',
            op: ev ? ev.operacion : null,
            intentos: ev ? ev.intentos : null,
            ultimo_error: ev ? (ev.ultimo_error || null) : null,
            colaPend: await db.cola_sincronizacion.where('sync_status').equals('PENDING').count(),
          }
        `,
          BASELINE,
        )
        if (est && est.sync === 'PENDING') break
        await sleep(500)
      }
      check(est && !est.error, `no se pudo leer el estado de la cola: ${JSON.stringify(est)}`)
      check(
        est.sync === 'PENDING',
        `la venta offline quedó con sync_status="${est.sync}" (esperado PENDING) · ${JSON.stringify(est)}`,
      )

      const bImp = await driver.findElements(
        By.xpath(
          `//div[contains(@class,'modal') and contains(@class,'show')]//button[contains(., 'Imprimir comprobante')]`,
        ),
      )
      check(bImp.length > 0, 'no existe el botón "Imprimir comprobante…" en el modal de resultado')
      const etiqueta = (await bImp[0].getText()).replace(/\s+/g, ' ').trim()
      check(
        /sin conexión/.test(etiqueta),
        `el botón de comprobante dice "${etiqueta}" (esperado "Imprimir comprobante sin conexión")`,
      )
      await clicEn(driver, bImp[0], etiqueta)

      const cuerpo = await esperarModal(driver, 'PENDIENTE DE SINCRONIZACIÓN FISCAL', 15000)
      check(cuerpo, 'no se abrió el comprobante (sin la marca de agua)')
      const ticket = cuerpo.toUpperCase()
      check(
        ticket.includes('COMPROBANTE DE VENTA'),
        `el comprobante no muestra "Comprobante de venta": "${cuerpo.slice(0, 300)}"`,
      )
      check(
        ticket.includes('NO ES FACTURA FISCAL'),
        `el comprobante no muestra "No es factura fiscal": "${cuerpo.slice(0, 300)}"`,
      )
      check(
        ticket.includes('COMPROBANTE NO FISCAL'),
        `el comprobante no muestra "Comprobante no fiscal" (marca de agua): "${cuerpo.slice(0, 300)}"`,
      )
      check(
        ticket.includes('TICKET 80 MM') && ticket.includes('CARTA'),
        `el comprobante no ofrece "Ticket 80 mm"/"Carta": "${cuerpo.slice(0, 300)}"`,
      )
      check(ticket.includes('CERRAR'), 'el comprobante no tiene el botón "Cerrar"')
      // deja terminar el fade del modal para que la captura salga nítida
      await driver.sleep(1500)

      const stockDesp = await leerStock(driver)
      return (
        `red cortada (navigator.onLine=${on1}) · venta local ${est.id} sync=${est.sync} ` +
        `(intentos=${est.intentos}, cola PENDING=${est.colaPend}) · ` +
        `toast y modal con Folio (${plano.slice(0, 40)}) · ` +
        `botón "${etiqueta}" → comprobante con marca de agua ` +
        '"PENDIENTE DE SINCRONIZACIÓN FISCAL" + "Comprobante no fiscal" + "No es factura fiscal" ' +
        `· aviso offline en el panel "Cotización": ${avisoPanel ? 'sí' : 'NO (tolerado)'} · ` +
        `stock ${stockAntes.flat} → ${stockDesp.flat} · sin pulsar Ticket/Carta (window.print) · ` +
        `comprobante y modal quedan abiertos para la captura${stockParchado ? ' · stock subido a 1 antes de vender' : ''}`
      )
    })

    // ------------------------------------------------------- CP-POS-010 ---
    fase = 'CP-POS-010'
    await caso(driver, RESULTADOS, CASOS['CP-POS-010'], async () => {
      const on = await driver.executeScript('return navigator.onLine')
      check(on === false, `CP-POS-010 necesita la red cortada (navigator.onLine=${on})`)

      await prepararPos(driver)
      const c = await agregarLlave(driver, 1)
      check(c.total === 4000, `el carrito suma ${c.total} centavos (esperado 4000)`)

      const bCot = await driver.findElements(By.xpath(btn('Cotización')))
      check(bCot.length > 0, 'no se encontró el botón "Cotización"')
      const titulo = bCot.length ? await bCot[0].getAttribute('title') : null
      check(
        !!titulo && /Sin conexión/.test(titulo),
        `el botón "Cotización" no muestra el aviso offline (title="${titulo}")`,
      )

      await clicExacto(driver, 'Cotización')
      const toast = await esperarToast(driver, 'Cotización guardada', 12000)
      check(toast, 'no apareció el toast "Cotización guardada"')
      const mod = await esperarModal(driver, '¡Cotización guardada localmente!', 12000)
      check(mod, 'no se abrió el modal "¡Cotización guardada localmente!"')
      const plano = mod.replace(/\s+/g, ' ')
      check(
        /El comprobante oficial no puede ser emitido sin red/.test(plano),
        `falta el aviso de comprobante sin red: "${plano.slice(0, 300)}"`,
      )
      check(
        /Entendido/.test(plano),
        `el modal no tiene el botón "Entendido": "${plano.slice(0, 300)}"`,
      )
      check(
        /Imprimir cotización/.test(plano),
        `el modal no ofrece "Imprimir cotización": "${plano.slice(0, 300)}"`,
      )

      const q = await script(
        driver,
        `
        const { db } = await import('/src/lib/db.js')
        const b = arguments[0]
        const fuera = (await db.offline_quotes.toArray()).filter((x) => !b.quotes.includes(x.temp_id))
        return fuera.map((x) => ({
          id: x.temp_id.slice(0, 8),
          status: x.status,
          receipt: x.receipt_status,
          total: x.total,
          items: (x.items || []).length,
        }))
      `,
        BASELINE,
      )
      check(
        Array.isArray(q) && q.length === 1,
        `db.offline_quotes tiene ${Array.isArray(q) ? q.length : '?'} borrador(es) fuera del baseline: ${JSON.stringify(q)}`,
      )
      check(q[0].total === 4000, `el borrador local suma ${q[0].total} centavos (esperado 4000)`)
      check(
        q[0].status === 'pending_sync' && q[0].receipt === 'pending_network',
        `estado del borrador ${JSON.stringify(q[0])} (esperado pending_sync/pending_network)`,
      )

      await cerrarModales(driver)
      await driver.sleep(600)

      await clicQueContenga(driver, 'Ver cotizaciones')
      const mod2 = await esperarModal(driver, 'Cotizaciones', 10000)
      check(mod2, 'no se abrió el modal "Cotizaciones"')
      let cuerpo = ''
      const f3 = Date.now() + 12000
      while (Date.now() < f3) {
        cuerpo = await textoModal(driver, 'Cotizaciones')
        if (/borrador/.test(cuerpo) && /Folio /.test(cuerpo)) break
        await sleep(400)
      }
      const plano2 = cuerpo.replace(/\s+/g, ' ')
      check(
        /borrador/.test(plano2),
        `el listado no muestra el estado "borrador": "${plano2.slice(0, 300)}"`,
      )
      check(
        /Folio [0-9A-F]{8}/.test(plano2),
        `el listado no muestra el folio del borrador: "${plano2.slice(0, 300)}"`,
      )
      return (
        `red cortada (navigator.onLine=${on}) · toast "Cotización guardada" · modal "${plano.slice(0, 70)}" ` +
        `· borrador offline_quote ${JSON.stringify(q[0])} · listado "Ver cotizaciones" → ` +
        `${plano2.slice(0, 140)} · el modal queda abierto para la captura`
      )
    })

    // -------------------------------------------------------- limpieza ---
    fase = 'limpieza offline'
    const limp = await limpiarOffline(driver)
    LIMPIEZA_HECHA = true
    console.log('  · limpieza offline (red AÚN cortada):', JSON.stringify(limp))
    check(limp && !limp.error, `la limpieza offline falló: ${JSON.stringify(limp)}`)
  } catch (e) {
    fallo = e
    console.log(`\nEXCEP en fase "${fase}":`, String((e && e.message) || e).slice(0, 600))
  } finally {
    // 1) Stock de vuelta si quedó parcheado (solo si aún no hay baseline)
    try {
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        STOCK_LOCAL_HONESTO = await leerStock(driver)
      }
      if (driver && STOCK_PARCHADO !== null && STOCK_INICIAL && !STOCK_INICIAL.error) {
        const r = await fijarStockLlave(driver, STOCK_INICIAL.flat)
        STOCK_PARCHADO = null
        console.log('  · stock restaurado en el finally:', JSON.stringify(r))
      }
    } catch (e) {
      console.log('  · aviso al restaurar stock:', String((e && e.message) || e).slice(0, 200))
    }

    // 2) Limpieza offline de emergencia, ANTES de restaurar la red
    try {
      if (driver && BASELINE && !LIMPIEZA_HECHA) {
        const l = await limpiarOffline(driver)
        LIMPIEZA_HECHA = true
        console.log('  · limpieza offline de emergencia:', JSON.stringify(l))
      }
    } catch (e) {
      console.log('  · aviso en la limpieza:', String((e && e.message) || e).slice(0, 200))
    }

    // 3) La red SIEMPRE se restaura
    const huboCorte = redCortada
    try {
      if (driver) await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }
    redCortada = false

    // 4) Reporte de stock e IndexedDB (valores HONESTOS, antes de reponer)
    try {
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        const loc =
          STOCK_LOCAL_HONESTO && !STOCK_LOCAL_HONESTO.error
            ? STOCK_LOCAL_HONESTO
            : await leerStock(driver)
        const srv = await leerStockServidor()
        const est = await estadoFinal(driver)
        console.log(
          '  · STOCK INICIAL  (plano/anidado):',
          STOCK_INICIAL.flat,
          '/',
          STOCK_INICIAL.deep,
        )
        console.log(
          '  · STOCK FINAL    (plano/anidado, al cerrar los casos):',
          loc.flat,
          '/',
          loc.deep,
        )
        console.log(
          '  · STOCK SERVIDOR (inicial → final):',
          STOCK_INICIAL.flat,
          '→',
          srv.stock ?? srv.error,
        )
        console.log(
          '  · Δ:',
          'local plano',
          loc.flat - STOCK_INICIAL.flat,
          '· local anidado',
          loc.deep - STOCK_INICIAL.deep,
          '· servidor',
          typeof srv.stock === 'number' ? srv.stock - STOCK_INICIAL.flat : 'n/d',
          '· (divergencia conocida: registrarVentaLocal solo descuenta productos_sucursal)',
        )
        if (STOCK_ORIGINAL)
          console.log('  · stock leído en CP-POS-008:', JSON.stringify(STOCK_ORIGINAL))
        console.log('  · IndexedDB final:', JSON.stringify(est))
        console.log('  · red cortada en algún momento:', huboCorte ? 'sí' : 'no')
      }
    } catch (e) {
      console.log('  · aviso en el reporte:', String((e && e.message) || e).slice(0, 300))
    }

    // 4b) Idempotencia: devolver el stock (servidor + local) al valor inicial.
    //     Se hace DESPUÉS del reporte para no ocultar el Δ real de la corrida.
    try {
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        const srv = await restaurarStockServidor()
        console.log('  · stock del servidor repuesto:', JSON.stringify(srv))
        const loc = await fijarStockLlave(driver, STOCK_INICIAL.flat)
        console.log('  · stock local repuesto:', JSON.stringify(loc))
      }
    } catch (e) {
      console.log('  · aviso al reponer el stock:', String((e && e.message) || e).slice(0, 300))
    }

    // 5) Resultados + cierre
    try {
      guardarResultados('CPPOS', RESULTADOS)
    } catch (e) {
      console.log('  · no se pudo escribir CPPOS.json:', String(e).slice(0, 200))
    }
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* nada */
    }
  }

  return fallo ? 1 : 0
}

function imprimirResumen() {
  console.log('\n================= RESUMEN CP-POS =================')
  const orden = [...RESULTADOS].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  if (!orden.length) console.log('(no se ejecutó ningún caso)')
  for (const r of orden) {
    const ok = r.estado === 'Aprobado'
    console.log(`${ok ? 'APROBADO  ' : 'REPROBADO'} ${r.id} — ${r.escenario}`)
    if (!ok) console.log(`           motivo: ${r.real}`)
  }
  console.log(
    `Total: ${orden.filter((r) => r.estado === 'Aprobado').length} aprobados / ${orden.length}`,
  )
  console.log('==================================================\n')
}

main()
  .then((codigo) => {
    imprimirResumen()
    process.exit(codigo)
  })
  .catch((e) => {
    console.error('FATAL:', e)
    imprimirResumen()
    try {
      guardarResultados('CPPOS', RESULTADOS)
    } catch (err) {
      /* nada */
    }
    process.exit(1)
  })
