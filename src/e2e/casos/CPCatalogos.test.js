/**
 * CP-CAT — Casos de prueba del módulo Catálogos (formato estándar CP-*).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-CAT-00X.png,
 * resultados en docs/e2e-resultados/CPCatalogos.json.
 *
 * Orden de ejecución (lo manda el estado REAL de Ferromax al entrar):
 *   010 lista vacía (Marcas sin registros) · 004 las 5 pestañas ·
 *   001 crear marca · 002 editar marca · 005 nombre vacío ·
 *   006 correo inválido (+ correo válido) · 007 unidad · 009 permisos ·
 *   008 sin conexión · 003 eliminar (limpieza de todos los registros de prueba).
 *
 * Notas de implementación:
 *  - Las pestañas de CoreUI 5 NO traen role="tab" (CNav → ul.nav.nav-tabs con
 *    <a class="nav-link">): `clicPestana` de utilCasos no sirve aquí, se usan
 *    `.card-header .nav-link`.
 *  - El botón de crear NO muestra "+" como texto: el "+" es el ícono cilPlus y
 *    el texto es el nombre singular ("Marca", "Categoría", "Tipo de Precio"...).
 *  - Sin red la cabecera oculta el botón de crear y las tarjetas ocultan
 *    Editar/Eliminar (`puedeCrear && enLinea`), así que CP-CAT-008 abre los
 *    modales CON red y solo después corta la red para probar los mensajes de
 *    "Sin conexión: no se pueden guardar catálogos" y "No se pueden eliminar
 *    registros sin red".
 *  - La limpieza es doble: CP-CAT-003 borra por UI y el finally repasa por RPC
 *    (idempotente) + verifica que no queden residuales.
 */
const {
  crearDriver,
  login,
  aparece,
  apareceTexto,
  clicTexto,
  esperarToasts,
  navegar,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  leerPermiso,
  ponerPermiso,
  resolverEmpresa,
  rpc,
  ROL_GERENTE,
  By,
  until,
  sleep,
} = require('./utilCasos')

const RESULTADOS = []

/** Empresa Ferromax (se resuelve con el login de alex). */
let EMPRESA_ID = null

const MARCA = 'Marca E2E CP'
const MARCA_2 = 'Marca E2E CP 2'
const PROVEEDOR = 'Proveedor E2E CAT'
const UNIDAD = 'Unidad E2E CP'
const CORREO_PRUEBA = 'cp@prueba.com'
const CORREO_INVALIDO = 'no-es-correo'
const MARCA_FANTASMA = 'Marca Fantasma CP'

const ALERTA_OFFLINE = 'Sin conexión. Catálogos desde almacenamiento local — solo lectura.'
const VACIO_LOCAL = 'No hay datos en el almacenamiento local.'
const ERROR_GUARDAR_OFFLINE = 'Sin conexión: no se pueden guardar catálogos'
const AVISO_ELIMINAR_OFFLINE = 'No se pueden eliminar registros sin red'
const CONFIRMACION = (n) => `¿Eliminar "${n}"? Esta acción no se puede deshacer.`

const PESTANAS = [
  { tab: 'Marcas', boton: 'Marca', clave: 'marcas' },
  { tab: 'Categorías', boton: 'Categoría', clave: 'categorias' },
  { tab: 'Proveedores', boton: 'Proveedor', clave: 'proveedores' },
  { tab: 'Unidades', boton: 'Unidad', clave: 'unidades' },
  { tab: 'Tipos de Precio', boton: 'Tipo de Precio', clave: 'tipos_precio' },
]

const CASOS = {
  'CP-CAT-001': {
    id: 'CP-CAT-001',
    escenario: 'Crear un registro en un catálogo',
    pasos:
      '1. Ir a #/catalogos. 2. Verificar la pestaña "Marcas". 3. Clic en el botón de crear ("+ Marca"). 4. Escribir "Nombre *" = "Marca E2E CP". 5. Clic en "Crear"',
    requisitos:
      'Usuario con permiso catalogos/crear; red disponible; empresa activa con el catálogo Marcas vacío',
    datos:
      'Usuario alex/alex123 (Gerente, Ferromax); nombre de prueba "Marca E2E CP" (se elimina en CP-CAT-003 y se repasa en el finally)',
    esperado:
      'Toast "Marca creada"; el registro aparece en la lista de tarjetas y el modal se cierra',
  },
  'CP-CAT-002': {
    id: 'CP-CAT-002',
    escenario: 'Editar un registro existente',
    pasos:
      '1. Ir a #/catalogos. 2. Clic en "Editar" (title) de la tarjeta "Marca E2E CP". 3. Cambiar "Nombre *" a "Marca E2E CP 2". 4. Clic en "Guardar Cambios"',
    requisitos: 'Registro "Marca E2E CP" creado por CP-CAT-001 y permiso catalogos/editar con red',
    datos:
      'Nombre original "Marca E2E CP" (el modal debe abrir precargado con ese valor); nombre nuevo "Marca E2E CP 2"',
    esperado:
      'Toast "Guardado correctamente"; la tarjeta muestra "Marca E2E CP 2" y ya no aparece "Marca E2E CP"',
  },
  'CP-CAT-003': {
    id: 'CP-CAT-003',
    escenario: 'Eliminar un registro con confirmación',
    pasos:
      '1. Clic en "Eliminar" (title) de la tarjeta "Marca E2E CP 2". 2. Revisar el mensaje del modal de confirmación. 3. Clic en "Eliminar". 4. Repetir para "Proveedor E2E CAT" y "Unidad E2E CP" si llegaron a crearse',
    requisitos:
      'Registros de prueba creados por la propia suite; permiso catalogos/eliminar; red disponible',
    datos:
      'A borrar: "Marca E2E CP 2", "Proveedor E2E CAT" (cp@prueba.com) y "Unidad E2E CP" (E2E); no se tocan "Unidad"/UNI ni MAYOREO/NORMAL',
    esperado:
      'Mensaje "¿Eliminar "X"? Esta acción no se puede deshacer."; toast "Registro eliminado"; la tarjeta desaparece de la lista',
  },
  'CP-CAT-004': {
    id: 'CP-CAT-004',
    escenario: 'Navegación entre los 5 catálogos',
    pasos:
      '1. Ir a #/catalogos. 2. Confirmar que la pestaña inicial es "Marcas". 3. Recorrer Marcas, Categorías, Proveedores, Unidades y Tipos de Precio. 4. En cada una revisar el título, el botón de creación y el contenido',
    requisitos:
      'Sesión con empresa activa y catálogos de la empresa cargados desde el servidor (red disponible)',
    datos:
      'Estado real de Ferromax al inicio: Marcas 0, Categorías 0, Proveedores 0 (o 1 con el residual "Proveedor E2E CP" que deja la suite Compras), Unidades 1 ("Unidad"/UNI/Activa), Tipos de Precio MAYOREO y NORMAL',
    esperado:
      'Cada pestaña muestra su botón con el nombre correcto ("Marca", "Categoría", "Proveedor", "Unidad", "Tipo de Precio", con ícono "+"); las listas vacías muestran "Crea el primer registro con el botón «X»." y las no vacías sus registros; pestaña inicial: Marcas',
  },
  'CP-CAT-005': {
    id: 'CP-CAT-005',
    escenario: 'Crear registro sin nombre',
    pasos:
      '1. Ir a #/catalogos. 2. Clic en el botón de crear. 3. Dejar "Nombre *" vacío. 4. Intentar guardar con "Crear". 5. Clic en "Cancelar"',
    requisitos: 'Modal "Nueva Marca" abierto con el campo "Nombre *" vacío',
    datos: 'Campo "Nombre *" con atributo required nativo; botón "Crear" (type=submit)',
    esperado:
      'El campo "Nombre *" es obligatorio: la validación nativa del navegador bloquea el envío, el modal sigue abierto y no se crea ningún registro',
  },
  'CP-CAT-006': {
    id: 'CP-CAT-006',
    escenario: 'Correo inválido en proveedor',
    pasos:
      '1. Ir a la pestaña "Proveedores". 2. Clic en "+ Proveedor". 3. Escribir nombre "Proveedor E2E CAT" y correo "no-es-correo". 4. Intentar guardar. 5. Corregir el correo a "cp@prueba.com" y volver a guardar',
    requisitos:
      'Permiso catalogos/crear con red (la pestaña puede tener el proveedor residual de la suite Compras)',
    datos:
      'Correo inválido "no-es-correo" (input type=email) y correo válido "cp@prueba.com"; el registro creado se elimina en la limpieza',
    esperado:
      'El input "Correo" (type email) bloquea el envío con correo inválido (el modal no se cierra); con correo válido se guarda con datos de contacto (address · email · tel) y toast "Proveedor creada"',
  },
  'CP-CAT-007': {
    id: 'CP-CAT-007',
    escenario: 'Crear una unidad de medida',
    pasos:
      '1. Ir a la pestaña "Unidades". 2. Clic en "+ Unidad". 3. Completar Nombre "Unidad E2E CP", Abreviatura "E2E", Equivalencia 1 y el switch "Activa". 4. Clic en "Crear"',
    requisitos: 'Pestaña Unidades con la unidad "Unidad" y permiso catalogos/crear con red',
    datos:
      'Nombre "Unidad E2E CP", Abreviatura "E2E" (placeholder del campo: UNI), Equivalencia 1, switch "Activa" activado por defecto; se elimina en la limpieza',
    esperado:
      'Toast "Unidad creada"; la tarjeta muestra el nombre con el badge de abreviatura "E2E" y el badge "Activa"',
  },
  'CP-CAT-008': {
    id: 'CP-CAT-008',
    escenario: 'Catálogos sin conexión',
    pasos:
      '1. Abrir #/catalogos con red. 2. Abrir el modal de confirmación de "Unidad E2E CP". 3. Cortar la red. 4. Revisar la alerta. 5. Confirmar la eliminación sin red. 6. Abrir "Nueva Marca" con red, cortar la red y pulsar "Crear". 7. Recargar #/catalogos sin red. 8. Restaurar la red',
    requisitos:
      '#/catalogos ya abierto con red (chunk lazy caliente), IndexedDB hidratado y corte de red por CDP (Network.enable antes de emulateNetworkConditions)',
    datos:
      'Red cortada con Network.emulateNetworkConditions offline=true; nombre fantasma "Marca Fantasma CP" que NO debe guardarse; "Unidad E2E CP" como víctima del intento de borrado offline',
    esperado:
      'Alerta "Sin conexión. Catálogos desde almacenamiento local — solo lectura."; guardar responde "Sin conexión: no se pueden guardar catálogos" y eliminar "No se pueden eliminar registros sin red"; ningún registro cambia',
  },
  'CP-CAT-009': {
    id: 'CP-CAT-009',
    escenario: 'Permisos de creación/edición/eliminación',
    pasos:
      '1. Con catalogos/crear=false (permiso temporal) recargar #/catalogos y revisar los 5 botones "+ ...". 2. Con catalogos/editar=false y catalogos/eliminar=false recargar y revisar los iconos de las tarjetas',
    requisitos:
      'Red disponible (permisoService re-consulta has_permission con red y cachea el resultado); permisoTemporal restaura el rol al salir',
    datos:
      'Rol Gerente 3cf414b4-156f-40d2-a6a2-715ad8113283 con catalogos/crear=false y luego editar=false y eliminar=false de forma temporal; estado base 4/4',
    esperado:
      'Los botones "+ ..." y los iconos Editar/Eliminar sin permiso no están visibles; el resto de la pestaña (título, pestañas y listado) se consulta normalmente',
  },
  'CP-CAT-010': {
    id: 'CP-CAT-010',
    escenario: 'Lista de catálogo vacía',
    pasos:
      '1. Ir a #/catalogos con red y el catálogo Marcas sin registros. 2. Revisar el mensaje de vacío y la consola',
    requisitos:
      'Catálogo Marcas vacío en el servidor y con red (offline mostraría "No hay datos en el almacenamiento local.")',
    datos:
      'Empresa Ferromax con marcas, categorías y proveedores vacíos al inicio de la suite (unidad "Unidad"/UNI y tipos MAYOREO/NORMAL sí existen)',
    esperado:
      'Mensaje "Crea el primer registro con el botón «Marca»."; la pestaña inicial es Marcas; sin errores no capturados en consola',
  },
}

// ---------------------------------------------------------------- helpers ---

function xpathTarjeta(nombre) {
  return (
    `//div[contains(concat(' ',normalize-space(@class),' '),' border ') and ` +
    `contains(concat(' ',normalize-space(@class),' '),' rounded ')]` +
    `[.//strong[normalize-space()='${nombre}']]`
  )
}

async function existeTarjeta(driver, nombre) {
  const els = await driver.findElements(By.xpath(xpathTarjeta(nombre)))
  return els.length > 0
}

async function esperarTarjeta(driver, nombre, ms = 9000) {
  try {
    await driver.wait(until.elementLocated(By.xpath(xpathTarjeta(nombre))), ms)
    return true
  } catch (e) {
    return false
  }
}

async function esperaSinTarjeta(driver, nombre, ms = 9000) {
  try {
    await driver.wait(
      async () => (await driver.findElements(By.xpath(xpathTarjeta(nombre)))).length === 0,
      ms,
      300,
    )
    return true
  } catch (e) {
    return false
  }
}

async function botonTarjeta(driver, nombre, titulo) {
  return driver.wait(
    until.elementLocated(By.xpath(`${xpathTarjeta(nombre)}//button[@title='${titulo}']`)),
    9000,
  )
}

async function textoTarjeta(driver, nombre) {
  const els = await driver.findElements(By.xpath(xpathTarjeta(nombre)))
  if (!els.length) return ''
  try {
    return (
      await driver.executeScript(
        'try { return arguments[0].innerText } catch (e) { return "" }',
        els[0],
      )
    )
      .replace(/\s+/g, ' ')
      .trim()
  } catch (e) {
    return ''
  }
}

/**
 * Elimina por UI TODAS las tarjetas con ese nombre (acotado a 4) validando en
 * cada pasada el mensaje exacto de confirmación y el toast "Registro eliminado".
 */
async function eliminarTarjetaPorUI(driver, nombre) {
  const toasts = []
  let intentos = 0
  while ((await existeTarjeta(driver, nombre)) && intentos < 4) {
    intentos += 1
    const btn = await botonTarjeta(driver, nombre, 'Eliminar')
    await clicBoton(driver, btn)
    const modal = await textoModales(driver, 9000)
    check(
      modal.includes(CONFIRMACION(nombre)),
      `mensaje de confirmación inesperado para "${nombre}": "${modal.slice(0, 150)}"`,
    )
    await clicTexto(driver, 'Eliminar', 6000)
    const toast = await textoToast(driver, 10000)
    check(
      /Registro eliminado/.test(toast),
      `toast inesperado al eliminar "${nombre}": "${toast || '(sin toast)'}"`,
    )
    toasts.push(toast)
    await esperarToasts(driver)
  }
  check(
    !(await existeTarjeta(driver, nombre)),
    `la tarjeta "${nombre}" siguió visible tras ${intentos} intento(s) de eliminación`,
  )
  return { intentos, toast: toasts[0] || '' }
}

/** Cabecera de la vista Catálogos (h5 + botón de crear + pestañas). */
async function cabecera(driver) {
  const hds = await driver.findElements(By.css('.card-header'))
  for (const h of hds) {
    let t = ''
    try {
      t = await h.getText()
    } catch (e) {
      continue
    }
    if (t.includes('Catálogos')) return h
  }
  throw new Error('no se encontró la cabecera con el título "Catálogos"')
}

/** Botón de crear de la cabecera (null cuando no está permitido / sin red). */
async function botonCrear(driver) {
  const h = await cabecera(driver)
  const btns = await h.findElements(By.css('button'))
  return btns.length ? btns[0] : null
}

async function clicBoton(driver, btn) {
  try {
    await btn.click()
  } catch (e) {
    await driver.executeScript('arguments[0].click()', btn)
  }
  await driver.sleep(500)
}

async function pestanas(driver) {
  return driver.findElements(By.css('.card-header .nav-link'))
}

async function textoPestanaActiva(driver) {
  const els = await driver.findElements(By.css('.card-header .nav-link.active'))
  if (!els.length) return ''
  try {
    return (await els[0].getText()).replace(/\s+/g, ' ').trim()
  } catch (e) {
    return ''
  }
}

async function clicPestanaCatalogo(driver, texto, ms = 9000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    for (const t of await pestanas(driver)) {
      let tx = ''
      try {
        tx = (await t.getText()).replace(/\s+/g, ' ').trim()
      } catch (e) {
        continue
      }
      if (tx === texto) {
        await clicBoton(driver, t)
        return true
      }
    }
    await sleep(300)
  }
  return false
}

async function esperaSinBotonCrear(driver, ms = 12000) {
  const fin = Date.now() + ms
  let racha = 0
  while (Date.now() < fin) {
    const btn = await botonCrear(driver)
    if (!btn) {
      racha += 1
      if (racha >= 4) return true
    } else {
      racha = 0
    }
    await sleep(400)
  }
  return false
}

async function esperaSinAccionesTarjeta(driver, ms = 12000) {
  const fin = Date.now() + ms
  let racha = 0
  while (Date.now() < fin) {
    const n = await driver.findElements(By.css('button[title="Editar"], button[title="Eliminar"]'))
    if (!n.length) {
      racha += 1
      if (racha >= 4) return true
    } else {
      racha = 0
    }
    await sleep(400)
  }
  return false
}

/**
 * Abre #/catalogos (respetando la regla del hash) y espera el RPC
 * `get_catalogos`. Devuelve { t0, rpcOk } para seguir esperando otros RPC de la
 * misma carga (p. ej. has_permission en CP-CAT-009).
 */
async function abrirCatalogos(driver, ms = 2500) {
  const apagado = await driver.executeScript('return navigator.onLine === false')
  if (apagado) {
    await restaurarRed(driver)
    await driver.sleep(600)
  }
  const t0 = await driver.executeScript('return performance.now()')
  await navegar(driver, '#/catalogos', ms)
  await driver.wait(until.elementLocated(By.css('.card-header h5')), 15000)
  const rpcOk = await esperarRpc(driver, 'get_catalogos', t0, 1, 9000)
  if (!rpcOk) await driver.sleep(1200)
  return { t0, rpcOk }
}

/** Espera a que se registren `minVeces` recursos de `filtro` desde `desde`. */
async function esperarRpc(driver, filtro, desde, minVeces = 1, ms = 9000) {
  try {
    await driver.wait(
      async () => {
        const n = await driver.executeScript(
          `const f = arguments[0]
           const d = arguments[1]
           return performance.getEntriesByType('resource').filter(function (e) {
             return e.name.indexOf(f) !== -1 && e.startTime >= d
           }).length`,
          filtro,
          desde,
        )
        return n >= minVeces
      },
      ms,
      400,
    )
    return true
  } catch (e) {
    return false
  }
}

async function catalogosServidor() {
  const r = await rpc('get_catalogos', { p_id_empresa: EMPRESA_ID })
  if (!r.data || typeof r.data !== 'object') {
    throw new Error(`get_catalogos respondió ${r.status}: ${JSON.stringify(r.data)}`)
  }
  return r.data
}

async function textoModales(driver, ms = 8000) {
  try {
    await driver.wait(until.elementLocated(By.css('.modal.show')), ms)
  } catch (e) {
    /* el modal no llegó: se lee lo que haya en el DOM */
  }
  const modales = await driver.findElements(By.css('.modal.show'))
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
  return out.replace(/\s+/g, ' ').trim()
}

async function tituloModal(driver, ms = 9000) {
  try {
    await driver.wait(until.elementLocated(By.css('.modal.show .modal-title')), ms)
    const t = await driver.findElement(By.css('.modal.show .modal-title'))
    return (await t.getText()).replace(/\s+/g, ' ').trim()
  } catch (e) {
    return ''
  }
}

async function modalAbierto(driver) {
  const m = await driver.findElements(By.css('.modal.show'))
  return m.length > 0
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
        /* re-render del toast */
      }
    }
    await sleep(250)
  }
  return ''
}

/** Escribe en un input controlled de React usando el setter nativo. */
async function escribirEn(driver, selector, valor) {
  const ok = await driver.executeScript(
    `const el = document.querySelector(arguments[0])
     if (!el) return false
     el.focus()
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
     setter.call(el, arguments[1])
     el.dispatchEvent(new Event('input', { bubbles: true }))
     return true`,
    selector,
    valor,
  )
  if (!ok) throw new Error(`no se encontró el input ${selector}`)
  await driver.sleep(500)
}

async function valorInput(driver, selector) {
  return driver.executeScript(
    `const el = document.querySelector(arguments[0])
     return el ? el.value : null`,
    selector,
  )
}

/** Clic en un botón del modal abierto (con respaldo JS: burbujas de validación). */
async function clicEnModal(driver, texto, ms = 6000) {
  const xp =
    `//div[contains(concat(' ',normalize-space(@class),' '),' modal ') and ` +
    `contains(concat(' ',normalize-space(@class),' '),' show ')]` +
    `//button[normalize-space(.)='${texto}']`
  try {
    const el = await driver.wait(until.elementLocated(By.xpath(xp)), ms)
    await driver.wait(until.elementIsVisible(el), 3000)
    await el.click()
  } catch (e) {
    await driver.executeScript(
      `const t = arguments[0]
       const b = [...document.querySelectorAll('.modal.show button')].find(function (x) {
         return (x.innerText || '').replace(/\\s+/g, ' ').trim() === t
       })
       if (!b) throw new Error('sin botón "' + t + '" en el modal')
       b.click()`,
      texto,
    )
  }
  await driver.sleep(500)
}

async function cerrarModal(driver) {
  try {
    await clicEnModal(driver, 'Cancelar', 4000)
  } catch (e) {
    try {
      await driver.executeScript(
        `const b = document.querySelector('.modal.show .btn-secondary')
         if (b) b.click()`,
      )
    } catch (e2) {
      /* el modal ya no está */
    }
  }
  try {
    await driver.wait(
      async () => (await driver.findElements(By.css('.modal.show'))).length === 0,
      6000,
      300,
    )
    return true
  } catch (e) {
    return false
  }
}

/** Abre el modal de creación de la pestaña actual y valida su título. */
async function abrirModalNuevo(driver, tituloEsperado) {
  await esperarToasts(driver)
  const btn = await botonCrear(driver)
  check(btn, `no hay botón de crear en la cabecera (se esperaba poder crear "${tituloEsperado}")`)
  await clicBoton(driver, btn)
  const titulo = await tituloModal(driver)
  check(titulo === tituloEsperado, `el modal mostró "${titulo}" y se esperaba "${tituloEsperado}"`)
  return titulo
}

/** Estado del formulario del modal abierto (validación nativa del navegador). */
async function estadoFormulario(driver) {
  return driver.executeScript(
    `const f = document.querySelector('.modal.show form')
     const i = document.querySelector('.modal.show input[name="name"]')
     return {
       hayFormulario: !!f,
       valido: f ? f.checkValidity() : null,
       nombreRequerido: i ? !!i.required : null,
       nombreVacio: i ? i.value.trim() === '' : null,
       toasts: document.querySelectorAll('.toast.show').length,
     }`,
  )
}

/** Colección de errores no capturados instalada tras el login. */
async function instalarColeccionErrores(driver) {
  await driver.executeScript(
    `window.__erroresApp = []
     window.addEventListener('error', function (e) {
       try { window.__erroresApp.push(String((e && e.message) || 'error')) } catch (x) {}
     })
     window.addEventListener('unhandledrejection', function (e) {
       try {
         window.__erroresApp.push('rechazo no controlado: ' + String((e && e.reason) || ''))
       } catch (x) {}
     })`,
  )
}

async function erroresApp(driver) {
  try {
    const r = await driver.executeScript('return (window.__erroresApp || []).slice(0, 8)')
    return Array.isArray(r) ? r : []
  } catch (e) {
    return []
  }
}

/**
 * Limpieza idempotente por RPC: borra todo registro de prueba que haya quedado
 * en el servidor y devuelve el estado final de los catálogos tocados.
 */
async function limpiarRegistrosPrueba() {
  if (!EMPRESA_ID) {
    return { aviso: 'sin empresa resuelta: no se pudo verificar la limpieza', residuales: [] }
  }
  const objetivos = [
    { tabla: 'marca', clave: 'marcas', nombre: MARCA },
    { tabla: 'marca', clave: 'marcas', nombre: MARCA_2 },
    { tabla: 'marca', clave: 'marcas', nombre: MARCA_FANTASMA },
    { tabla: 'proveedor', clave: 'proveedores', nombre: PROVEEDOR },
    { tabla: 'unidades', clave: 'unidades', nombre: UNIDAD },
  ]
  const borrados = []
  const fallidos = []
  let lista = await catalogosServidor()
  for (const o of objetivos) {
    // borra TODAS las filas con ese nombre (por si otra suite dejó un duplicado)
    for (let i = 0; i < 6; i++) {
      const fila = (lista[o.clave] || []).find((x) => x.name === o.nombre)
      if (!fila) break
      const r = await rpc('delete_catalogo', { p_tabla: o.tabla, p_id: fila.id })
      if (r.status === 204 || r.status === 200) {
        borrados.push(o.nombre)
        lista = await catalogosServidor()
      } else {
        fallidos.push(`${o.nombre} (status ${r.status})`)
        break
      }
    }
  }
  const despues = await catalogosServidor()
  const residuales = objetivos
    .filter((o) => (despues[o.clave] || []).some((x) => x.name === o.nombre))
    .map((o) => o.nombre)
  return {
    borrados,
    fallidos,
    residuales,
    marcas: (despues.marcas || []).map((m) => m.name),
    categorias: (despues.categorias || []).map((c) => c.name),
    proveedores: (despues.proveedores || []).map((p) => p.name),
    unidades: (despues.unidades || []).map((u) => `${u.name}/${u.abreviatura}`),
    tipos_precio: (despues.tipos_precio || []).map((t) => t.name),
  }
}

/** Login con reintento: la primera carga del dev server a veces va lenta. */
async function loginConReintento(driver, intentos = 3) {
  let ultimo = null
  for (let i = 0; i < intentos; i++) {
    try {
      await login(driver)
      return true
    } catch (e) {
      ultimo = e
      console.log(
        `  · login falló (intento ${i + 1}/${intentos}):`,
        String((e && e.message) || e).split('\n')[0],
      )
      await sleep(3000)
    }
  }
  throw ultimo
}

// ------------------------------- suite --------------------------------

async function main() {
  let driver = null
  try {
    driver = await crearDriver()
    await loginConReintento(driver)
    EMPRESA_ID = await resolverEmpresa('alex')
    if (!EMPRESA_ID) throw new Error('no se resolvió la empresa de alex (Ferromax)')
    await instalarColeccionErrores(driver)
    await driver.executeScript('try { performance.setResourceTimingBufferSize(3000) } catch (e) {}')
    const inicial = await catalogosServidor()
    console.log('  · empresa:', EMPRESA_ID)
    console.log(
      '  · estado inicial:',
      JSON.stringify({
        marcas: (inicial.marcas || []).length,
        categorias: (inicial.categorias || []).length,
        proveedores: (inicial.proveedores || []).length,
        unidades: (inicial.unidades || []).map((u) => `${u.name}/${u.abreviatura}`),
        tipos_precio: (inicial.tipos_precio || []).map((t) => t.name),
      }),
    )

    // --- CP-CAT-010: lista vacía (PRIMERO: Marcas sigue vacía de verdad) ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-010'], async () => {
      await abrirCatalogos(driver)
      const srv = await catalogosServidor()
      check(
        (srv.marcas || []).length === 0,
        `el servidor ya tiene marcas: ${(srv.marcas || []).map((m) => m.name).join(', ')}`,
      )
      const activa = await textoPestanaActiva(driver)
      check(activa === 'Marcas', `la pestaña inicial era "${activa}" y se esperaba "Marcas"`)
      const esperado = 'Crea el primer registro con el botón «Marca».'
      check(
        await apareceTexto(driver, esperado, 9000),
        `no apareció el mensaje de lista vacía "${esperado}"`,
      )
      const errs = await erroresApp(driver)
      check(
        errs.length === 0,
        `errores no capturados en consola durante la carga: ${errs.join(' | ')}`,
      )
      const texto = await textoTarjeta(driver, MARCA)
      check(!texto, `la lista de Marcas no estaba vacía: "${texto}"`)
      return `Pestaña inicial "${activa}" · marcas en servidor: 0 · mensaje exacto "${esperado}" visible · sin errores no capturados en consola (window.onerror instalado tras el login)`
    })

    // --- CP-CAT-004: las 5 pestañas, sus botones y su contenido ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-004'], async () => {
      await abrirCatalogos(driver)
      const srv = await catalogosServidor()
      const inicial = await textoPestanaActiva(driver)
      check(inicial === 'Marcas', `la pestaña inicial era "${inicial}" y se esperaba "Marcas"`)
      const nombres = []
      for (const t of await pestanas(driver)) {
        nombres.push((await t.getText()).replace(/\s+/g, ' ').trim())
      }
      const faltantes = PESTANAS.map((p) => p.tab).filter((t) => !nombres.includes(t))
      check(
        faltantes.length === 0,
        `faltan pestañas en la barra: ${faltantes.join(', ')} (observadas: ${nombres.join(' | ')})`,
      )
      const detalle = []
      for (const p of PESTANAS) {
        check(
          await clicPestanaCatalogo(driver, p.tab),
          `no se pudo abrir la pestaña "${p.tab}" (visibles: ${nombres.join(', ')})`,
        )
        const activa = await textoPestanaActiva(driver)
        check(activa === p.tab, `tras clic en "${p.tab}" la pestaña activa quedó en "${activa}"`)
        const btn = await botonCrear(driver)
        check(
          btn,
          `la pestaña "${p.tab}" no tiene botón de crear en la cabecera (¿sin permiso catalogos/crear?)`,
        )
        const texto = (await btn.getText()).replace(/\s+/g, ' ').trim()
        check(
          texto === p.boton,
          `la pestaña "${p.tab}" mostró el botón "${texto}" y se esperaba "${p.boton}"`,
        )
        const iconos = await btn.findElements(By.css('svg'))
        check(iconos.length > 0, `el botón de crear de "${p.tab}" no muestra el ícono "+"`)
        const items = srv[p.clave] || []
        if (items.length === 0) {
          const vacio = `Crea el primer registro con el botón «${p.boton}».`
          check(
            await apareceTexto(driver, vacio, 7000),
            `la pestaña "${p.tab}" está vacía en el servidor pero no mostró "${vacio}"`,
          )
          detalle.push(`${p.tab}: vacía + botón "${p.boton}"`)
        } else {
          const vistas = []
          for (const it of items) {
            check(
              await esperarTarjeta(driver, it.name),
              `la pestaña "${p.tab}" no renderizó la tarjeta "${it.name}"`,
            )
            vistas.push(it.name)
          }
          detalle.push(
            `${p.tab}: botón "${p.boton}" + ${vistas.length} registro(s) (${vistas.join(', ')})`,
          )
        }
      }
      const u = (srv.unidades || [])[0]
      if (u) {
        await clicPestanaCatalogo(driver, 'Unidades')
        const t = await textoTarjeta(driver, u.name)
        check(
          t.includes(u.abreviatura || '') && /Activa|Inactiva/.test(t),
          `la tarjeta de unidad "${u.name}" no muestra sus badges: "${t}"`,
        )
        detalle.push(`Unidades/badges: "${t}"`)
      }
      return `Pestaña inicial "${inicial}"; ${PESTANAS.length} pestañas recorridas · ${detalle.join(' · ')}`
    })

    // --- CP-CAT-001: crear una marca ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-001'], async () => {
      await abrirCatalogos(driver)
      const activa = await textoPestanaActiva(driver)
      check(activa === 'Marcas', `se esperaba la pestaña "Marcas" y estaba en "${activa}"`)
      check(
        await apareceTexto(driver, 'Crea el primer registro con el botón «Marca».', 7000),
        'Marcas no estaba vacía antes de crear (no se puede validar el alta desde cero)',
      )
      const titulo = await abrirModalNuevo(driver, 'Nueva Marca')
      check(await apareceTexto(driver, 'Nombre *', 4000), 'el modal no muestra el campo "Nombre *"')
      await escribirEn(driver, '.modal.show input[name="name"]', MARCA)
      await clicEnModal(driver, 'Crear')
      const toast = await textoToast(driver, 10000)
      check(/Marca creada/.test(toast), `toast inesperado: "${toast || '(sin toast)'}"`)
      check(!(await modalAbierto(driver)), 'el modal siguió abierto tras guardar')
      check(await esperarTarjeta(driver, MARCA), `la tarjeta "${MARCA}" no apareció en la lista`)
      const t = await textoTarjeta(driver, MARCA)
      await esperarToasts(driver)
      return `Modal "${titulo}" · "Nombre *" = "${MARCA}" · "Crear" → toast "${toast}" · tarjeta visible con texto "${t}"`
    })

    // --- CP-CAT-002: editar la marca creada ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-002'], async () => {
      await abrirCatalogos(driver)
      check(
        await esperarTarjeta(driver, MARCA),
        `no existe la tarjeta "${MARCA}" (¿falló CP-CAT-001?)`,
      )
      const editar = await botonTarjeta(driver, MARCA, 'Editar')
      await clicBoton(driver, editar)
      const titulo = await tituloModal(driver)
      check(titulo === 'Editar Marca', `el modal mostró "${titulo}" y se esperaba "Editar Marca"`)
      const previo = await valorInput(driver, '.modal.show input[name="name"]')
      check(previo === MARCA, `el modal abrió con "${previo}" y se esperaba "${MARCA}" precargado`)
      await escribirEn(driver, '.modal.show input[name="name"]', MARCA_2)
      await clicEnModal(driver, 'Guardar Cambios')
      const toast = await textoToast(driver, 10000)
      check(/Guardado correctamente/.test(toast), `toast inesperado: "${toast || '(sin toast)'}"`)
      check(
        await esperarTarjeta(driver, MARCA_2),
        `la tarjeta "${MARCA_2}" no apareció tras guardar`,
      )
      check(
        await esperaSinTarjeta(driver, MARCA),
        `la tarjeta "${MARCA}" (nombre viejo) siguió visible tras renombrar`,
      )
      await esperarToasts(driver)
      return `Modal "${titulo}" precargado con "${previo}" → "${MARCA_2}" · "Guardar Cambios" → toast "${toast}" · tarjeta actualizada y nombre viejo ausente`
    })

    // --- CP-CAT-005: crear sin nombre (validación nativa) ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-005'], async () => {
      await abrirCatalogos(driver)
      await esperarToasts(driver)
      const antes = await catalogosServidor()
      const totalAntes = (antes.marcas || []).length
      await abrirModalNuevo(driver, 'Nueva Marca')
      await escribirEn(driver, '.modal.show input[name="name"]', '')
      const estado0 = await estadoFormulario(driver)
      check(estado0.nombreRequerido, 'el campo "Nombre *" no tiene el atributo required')
      check(estado0.nombreVacio, 'el campo "Nombre *" no quedó vacío antes de intentar guardar')
      await clicEnModal(driver, 'Crear')
      await driver.sleep(1500)
      const estado1 = await estadoFormulario(driver)
      check(
        estado1.valido === false,
        `el formulario reportó checkValidity()=${estado1.valido}: la validación nativa NO bloqueó el envío`,
      )
      check(
        await modalAbierto(driver),
        'el modal se cerró: el formulario sí se envió con el nombre vacío',
      )
      check(
        estado1.toasts === 0,
        `apareció un toast con el nombre vacío (${estado1.toasts}): el formulario se envió`,
      )
      const despues = await catalogosServidor()
      check(
        (despues.marcas || []).length === totalAntes,
        `se creó un registro sin nombre: ${totalAntes} → ${(despues.marcas || []).length} marcas`,
      )
      const cerrado = await cerrarModal(driver)
      check(cerrado, 'no se pudo cerrar el modal con "Cancelar"')
      return `Campo "Nombre *" required=true y vacío → clic en "Crear" bloqueado por validación nativa (checkValidity=false), modal abierto, 0 toasts y marcas sin cambios (${totalAntes}); cerrado con "Cancelar"`
    })

    // --- CP-CAT-006: correo inválido en proveedor ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-006'], async () => {
      await abrirCatalogos(driver)
      await esperarToasts(driver)
      check(
        await clicPestanaCatalogo(driver, 'Proveedores'),
        'no se pudo abrir la pestaña "Proveedores"',
      )
      const antes = await catalogosServidor()
      const totalAntes = (antes.proveedores || []).length
      await esperarToasts(driver)
      const btnCrear = await botonCrear(driver)
      check(btnCrear, 'no hay botón de crear en la cabecera de Proveedores')
      await clicBoton(driver, btnCrear)
      const titulo = await tituloModal(driver)
      check(
        /N(ueva|uevo) Proveedor/.test(titulo),
        `el modal de proveedor mostró "${titulo}" y se esperaba "Nuevo Proveedor" (docs) / "Nueva Proveedor" (app)`,
      )
      const hallazgoTitulo =
        titulo === 'Nuevo Proveedor'
          ? ''
          : ` · hallazgo: la app titula "${titulo}" y docs/casos-prueba-usuario.md (CP-CAT-006) lo llama "Nuevo Proveedor"`
      const modalTxt = await textoModales(driver, 4000)
      for (const etiqueta of ['Dirección', 'Correo', 'Teléfono']) {
        check(modalTxt.includes(etiqueta), `el modal no muestra el campo "${etiqueta}"`)
      }
      const tipo = await driver.executeScript(
        `const el = document.querySelector('.modal.show input[name="email"]')
         return el ? el.type : null`,
      )
      check(tipo === 'email', `el campo Correo tiene type="${tipo}" y se esperaba "email"`)
      await escribirEn(driver, '.modal.show input[name="name"]', PROVEEDOR)
      await escribirEn(driver, '.modal.show input[name="email"]', CORREO_INVALIDO)
      await clicEnModal(driver, 'Crear')
      await driver.sleep(1500)
      const estado = await estadoFormulario(driver)
      check(
        estado.valido === false,
        `el formulario con correo "${CORREO_INVALIDO}" reportó checkValidity()=${estado.valido}: la validación NO bloqueó el envío`,
      )
      check(
        await modalAbierto(driver),
        'el modal se cerró: el proveedor se creó con un correo inválido',
      )
      check(estado.toasts === 0, `apareció un toast con el correo inválido (${estado.toasts})`)
      const intermedio = await catalogosServidor()
      check(
        (intermedio.proveedores || []).length === totalAntes,
        `se creó un proveedor con correo inválido: ${totalAntes} → ${(intermedio.proveedores || []).length}`,
      )
      await escribirEn(driver, '.modal.show input[name="email"]', CORREO_PRUEBA)
      await clicEnModal(driver, 'Crear')
      const toast = await textoToast(driver, 10000)
      check(/Proveedor creada/.test(toast), `toast inesperado: "${toast || '(sin toast)'}"`)
      check(
        await esperarTarjeta(driver, PROVEEDOR),
        `la tarjeta "${PROVEEDOR}" no apareció con el correo válido`,
      )
      const t = await textoTarjeta(driver, PROVEEDOR)
      check(t.includes(CORREO_PRUEBA), `la tarjeta no muestra el correo "${CORREO_PRUEBA}": "${t}"`)
      await esperarToasts(driver)
      return `Modal "${titulo}" con campos Dirección/Correo(type=email)/Teléfono${hallazgoTitulo} · correo "${CORREO_INVALIDO}" → checkValidity=false, modal abierto, 0 toasts, proveedores sin cambios (${totalAntes}) → correo "${CORREO_PRUEBA}" → toast "${toast}" y tarjeta "${t}" (registro eliminado en la limpieza)`
    })

    // --- CP-CAT-007: crear unidad de medida ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-007'], async () => {
      await abrirCatalogos(driver)
      check(await clicPestanaCatalogo(driver, 'Unidades'), 'no se pudo abrir "Unidades"')
      const titulo = await abrirModalNuevo(driver, 'Nueva Unidad')
      const placeholder = await driver.executeScript(
        `const el = document.querySelector('.modal.show input[name="abreviatura"]')
         return el ? el.placeholder : null`,
      )
      check(
        placeholder === 'UNI',
        `el placeholder de Abreviatura es "${placeholder}" y se esperaba "UNI"`,
      )
      const equivalencia = await driver.executeScript(
        `const el = document.querySelector('.modal.show input[name="equivalencia"]')
         return el ? { type: el.type, min: el.min } : null`,
      )
      check(
        equivalencia && equivalencia.type === 'number' && equivalencia.min === '1',
        `el campo Equivalencia es ${JSON.stringify(equivalencia)} y se esperaba type=number min=1`,
      )
      await escribirEn(driver, '.modal.show input[name="name"]', UNIDAD)
      await escribirEn(driver, '.modal.show input[name="abreviatura"]', 'E2E')
      await escribirEn(driver, '.modal.show input[name="equivalencia"]', '1')
      const sw = await driver.wait(
        until.elementLocated(By.css('.modal.show input.form-check-input')),
        6000,
      )
      if (!(await sw.isSelected())) await sw.click()
      check(await sw.isSelected(), 'el switch "Activa" no quedó activado')
      await clicEnModal(driver, 'Crear')
      const toast = await textoToast(driver, 10000)
      check(/Unidad creada/.test(toast), `toast inesperado: "${toast || '(sin toast)'}"`)
      check(await esperarTarjeta(driver, UNIDAD), `la tarjeta "${UNIDAD}" no apareció en la lista`)
      const t = await textoTarjeta(driver, UNIDAD)
      check(/E2E/.test(t), `la tarjeta no muestra el badge de abreviatura "E2E": "${t}"`)
      check(/Activa/.test(t), `la tarjeta no muestra el badge "Activa": "${t}"`)
      await esperarToasts(driver)
      return `Modal "${titulo}" con Nombre="${UNIDAD}", Abreviatura="E2E", Equivalencia=1 y switch "Activa" → toast "${toast}" · tarjeta "${t}" (unidad eliminada en la limpieza)`
    })

    // --- CP-CAT-009: permisos crear / editar / eliminar ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-009'], async () => {
      const sinCrear = await permisoTemporal(
        ROL_GERENTE,
        'catalogos',
        { crear: false },
        async () => {
          const { t0 } = await abrirCatalogos(driver)
          const rpcs = await esperarRpc(driver, 'has_permission', t0, 3, 12000)
          check(
            await esperaSinBotonCrear(driver),
            'con catalogos/crear=false el botón de crear siguió visible tras re-consultar has_permission',
          )
          const fallas = []
          for (const p of PESTANAS) {
            await clicPestanaCatalogo(driver, p.tab)
            await driver.sleep(300)
            const activa = await textoPestanaActiva(driver)
            if (activa !== p.tab) fallas.push(`${p.tab}: activa="${activa}"`)
            const btn = await botonCrear(driver)
            if (btn) {
              fallas.push(`${p.tab}: botón "${(await btn.getText()).trim()}" visible`)
            }
          }
          check(
            fallas.length === 0,
            `con catalogos/crear=false seguían visibles o rotos: ${fallas.join(' | ')}`,
          )
          await clicPestanaCatalogo(driver, 'Marcas')
          const sigueOperativa =
            (await textoPestanaActiva(driver)) === 'Marcas' &&
            ((await apareceTexto(driver, 'Crea el primer registro con el botón «Marca».', 4000)) ||
              (await existeTarjeta(driver, MARCA_2)))
          check(sigueOperativa, 'con crear=false la pestaña Marcas dejó de renderizar su listado')
          const err = await erroresApp(driver)
          return `crear=false: 5/5 pestañas sin botón "+ ..." (has_permission re-consultado=${rpcs ? 'sí' : 'no'}, listado operativo, errores de consola: ${err.length})`
        },
      )
      const sinAcciones = await permisoTemporal(
        ROL_GERENTE,
        'catalogos',
        { editar: false, eliminar: false },
        async () => {
          const { t0 } = await abrirCatalogos(driver)
          const rpcs = await esperarRpc(driver, 'has_permission', t0, 3, 12000)
          check(
            await esperarTarjeta(driver, MARCA_2),
            `no hay tarjeta "${MARCA_2}" para revisar los iconos sin permiso`,
          )
          check(
            await esperaSinAccionesTarjeta(driver),
            'los iconos "Editar"/"Eliminar" siguieron visibles con editar=false y eliminar=false',
          )
          const n = await driver.findElements(
            By.css('button[title="Editar"], button[title="Eliminar"]'),
          )
          check(n.length === 0, `quedaron ${n.length} icono(s) de acción en la tarjeta`)
          const btn = await botonCrear(driver)
          check(
            btn,
            'con editar/eliminar=false desapareció también el botón de crear (debe seguir)',
          )
          return `editar=false y eliminar=false: 0 iconos "Editar"/"Eliminar" en las tarjetas, botón "+ Marca" y listado siguen visibles (has_permission re-consultado=${rpcs ? 'sí' : 'no'})`
        },
      )
      return `${sinCrear} | ${sinAcciones}`
    })

    // --- CP-CAT-008: sin conexión (siempre con #/catalogos ya abierto con red) ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-008'], async () => {
      const observaciones = []

      // Fase A: eliminación sin red (el ConfirmModal se abre CON red)
      await abrirCatalogos(driver)
      check(await clicPestanaCatalogo(driver, 'Unidades'), 'no se pudo abrir "Unidades"')
      check(
        await esperarTarjeta(driver, UNIDAD),
        `no existe la tarjeta "${UNIDAD}" para probar la eliminación sin red`,
      )
      const eliminar = await botonTarjeta(driver, UNIDAD, 'Eliminar')
      await clicBoton(driver, eliminar)
      const modalConRed = await textoModales(driver, 9000)
      check(
        modalConRed.includes(CONFIRMACION(UNIDAD)),
        `no se abrió la confirmación con red: "${modalConRed.slice(0, 140)}"`,
      )
      observaciones.push(`confirmación con red: "${CONFIRMACION(UNIDAD)}"`)

      await cortarRed(driver)
      const onLine = await driver.executeScript('return navigator.onLine')
      check(onLine === false, `navigator.onLine sigue en ${onLine} tras cortar la red por CDP`)
      check(
        await aparece(driver, ALERTA_OFFLINE, 12000),
        `no apareció la alerta offline "${ALERTA_OFFLINE}"`,
      )
      check(
        (await botonCrear(driver)) === null,
        'el botón de crear siguió visible sin red (debe ocultarse: solo lectura)',
      )
      observaciones.push(`alerta offline "${ALERTA_OFFLINE}" y botón de crear oculto`)

      await clicTexto(driver, 'Eliminar', 6000)
      const toastBorrar = await textoToast(driver, 9000)
      check(
        toastBorrar.includes(AVISO_ELIMINAR_OFFLINE),
        `toast inesperado al eliminar sin red: "${toastBorrar || '(sin toast)'}"`,
      )
      observaciones.push(`eliminar sin red → toast "${toastBorrar}"`)
      const cerrado = await cerrarModal(driver)
      check(cerrado, 'no se pudo cerrar el modal de confirmación sin red')

      await restaurarRed(driver)
      await driver.sleep(1200)
      const trasBorrar = await catalogosServidor()
      check(
        (trasBorrar.unidades || []).some((u) => u.name === UNIDAD),
        'la unidad desapareció del servidor: la eliminación sin red SÍ se ejecutó',
      )
      observaciones.push(`tras restaurar la red "${UNIDAD}" sigue en el servidor`)

      // Fase B: guardado sin red (el modal de alta se abre CON red)
      await driver.sleep(500)
      check(await clicPestanaCatalogo(driver, 'Marcas'), 'no se pudo abrir "Marcas"')
      const antes = await catalogosServidor()
      const totalAntes = (antes.marcas || []).length
      await abrirModalNuevo(driver, 'Nueva Marca')
      await escribirEn(driver, '.modal.show input[name="name"]', MARCA_FANTASMA)
      await cortarRed(driver)
      const onLine2 = await driver.executeScript('return navigator.onLine')
      check(onLine2 === false, `navigator.onLine sigue en ${onLine2} tras el segundo corte`)
      check(
        await aparece(driver, ALERTA_OFFLINE, 12000),
        `no apareció la alerta offline "${ALERTA_OFFLINE}" tras el segundo corte`,
      )
      check(
        (await botonCrear(driver)) === null,
        'el botón de crear siguió visible sin red tras el segundo corte',
      )
      await clicEnModal(driver, 'Crear')
      const toastGuardar = await textoToast(driver, 10000)
      check(
        toastGuardar.includes(ERROR_GUARDAR_OFFLINE),
        `toast inesperado al guardar sin red: "${toastGuardar || '(sin toast)'}"`,
      )
      check(await modalAbierto(driver), 'el modal se cerró: el registro sin red sí se guardó')
      observaciones.push(`guardar sin red → toast "${toastGuardar}" (modal abierto)`)
      const cerrado2 = await cerrarModal(driver)
      check(cerrado2, 'no se pudo cerrar el modal de alta sin red')

      // Recarga de la ruta sin red: la alerta debe volver a renderizar
      await navegar(driver, '#/catalogos', 3000)
      check(
        await aparece(driver, ALERTA_OFFLINE, 12000),
        `tras recargar #/catalogos sin red no apareció la alerta "${ALERTA_OFFLINE}"`,
      )
      check(
        (await botonCrear(driver)) === null,
        'tras recargar sin red volvió el botón de crear (debe seguir oculto)',
      )
      const vacioLocal = await driver.findElements(
        By.xpath(`//*[normalize-space(.)='${VACIO_LOCAL}']`),
      )
      observaciones.push(
        `recarga sin red: alerta visible, botón oculto, mensaje local "${VACIO_LOCAL}" = ${vacioLocal.length > 0 ? 'sí' : 'no'}`,
      )

      await restaurarRed(driver)
      await driver.sleep(1500)
      const trasRestaurar = await catalogosServidor()
      check(
        !(trasRestaurar.marcas || []).some((m) => m.name === MARCA_FANTASMA),
        `el registro "${MARCA_FANTASMA}" se guardó sin red: ${(trasRestaurar.marcas || []).map((m) => m.name).join(', ')}`,
      )
      check(
        (trasRestaurar.marcas || []).length === totalAntes,
        `cambiaron las marcas sin red: ${totalAntes} → ${(trasRestaurar.marcas || []).length}`,
      )
      observaciones.push(`marcas intactas tras restaurar la red (${totalAntes})`)
      return `red cortada por CDP (navigator.onLine=false) · ${observaciones.join(' · ')}`
    })

    // --- CP-CAT-003: eliminar con confirmación (limpieza, al final) ---
    await caso(driver, RESULTADOS, CASOS['CP-CAT-003'], async () => {
      await abrirCatalogos(driver)
      await esperarToasts(driver)
      check(
        await esperarTarjeta(driver, MARCA_2),
        `no existe la tarjeta "${MARCA_2}" (¿falló CP-CAT-002?)`,
      )
      const marca = await eliminarTarjetaPorUI(driver, MARCA_2)

      const restos = []
      for (const r of [
        { tab: 'Proveedores', nombre: PROVEEDOR },
        { tab: 'Unidades', nombre: UNIDAD },
      ]) {
        check(await clicPestanaCatalogo(driver, r.tab), `no se pudo abrir "${r.tab}"`)
        await esperarToasts(driver)
        if (!(await esperarTarjeta(driver, r.nombre, 6000))) {
          restos.push(`${r.nombre}: no estaba (no se creó o ya se limpió)`)
          continue
        }
        const del = await eliminarTarjetaPorUI(driver, r.nombre)
        restos.push(`${r.nombre}: eliminada en ${del.intentos} pasada(s)`)
      }
      const srv = await catalogosServidor()
      const nombres = [
        ['marcas', MARCA_2],
        ['proveedores', PROVEEDOR],
        ['unidades', UNIDAD],
      ]
      for (const [clave, nombre] of nombres) {
        check(
          !(srv[clave] || []).some((x) => x.name === nombre),
          `"${nombre}" sigue en el servidor (${clave})`,
        )
      }
      return `Confirmación exacta "${CONFIRMACION(MARCA_2)}" → toast "${marca.toast}" y tarjeta desaparecida (${marca.intentos} pasada) · ${restos.join(' · ')} · verificado contra el servidor: sin registros de prueba`
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
      if (driver) {
        await driver.executeScript(
          `try {
             Object.keys(localStorage)
               .filter(function (k) { return k.indexOf('perm_') === 0 })
               .forEach(function (k) { localStorage.removeItem(k) })
           } catch (e) {}`,
        )
      }
    } catch (e) {
      /* la página ya no está en el origen de la app */
    }
    try {
      if (!EMPRESA_ID) EMPRESA_ID = await resolverEmpresa('alex')
      const limpieza = await limpiarRegistrosPrueba()
      console.log('  · limpieza final:', JSON.stringify(limpieza))
      if (limpieza.residuales.length) {
        console.log('  · ¡QUEDARON REGISTROS DE PRUEBA!', limpieza.residuales.join(', '))
      }
    } catch (e) {
      console.log('  · aviso limpieza:', String(e).split('\n')[0])
    }
    try {
      const p = await leerPermiso(ROL_GERENTE, 'catalogos')
      if (p && (!p.ver || !p.crear || !p.editar || !p.eliminar)) {
        await ponerPermiso(ROL_GERENTE, 'catalogos', {
          ver: true,
          crear: true,
          editar: true,
          eliminar: true,
        })
        console.log('  · permisos catalogos restaurados a 4/4 (antes:', JSON.stringify(p), ')')
      }
      console.log(
        '  · permisos catalogos finales:',
        JSON.stringify(await leerPermiso(ROL_GERENTE, 'catalogos')),
      )
    } catch (e) {
      console.log('  · aviso permisos:', String(e).split('\n')[0])
    }
    guardarResultados('CPCatalogos', RESULTADOS)
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  console.log(
    reprobados.length === 0
      ? 'CP-CAT OK (10/10 aprobados)'
      : `CP-CAT con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
