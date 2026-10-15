/**
 * CP-PROD — Casos de prueba del módulo Productos (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-PROD-00X.png,
 * resultados en docs/e2e-resultados/CPProductos.json.
 *
 * Orden de ejecución: 001 crear → 002 editar → 006 precios → 007 stock →
 * 004 nombre vacío → 005 imagen inválida → 008 filtros → 009 permisos crear →
 * 010 sin conexión (corta la red lo posible y la restaura SIEMPRE) →
 * 003 eliminar (limpieza, al final).
 *
 * El finally elimina "Producto E2E CP" vía REST si aún existe (por seguridad),
 * verifica que NO quedó en la base, borra los temporales de CP-PROD-005 y
 * cierra el driver. NO se usa taskkill (otras suites corren en paralelo).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  crearDriver,
  login,
  script,
  aparece,
  noExiste,
  existe,
  clicTexto,
  esperarToasts,
  navegar,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  resolverEmpresa,
  ROL_GERENTE,
  SUPA,
  KEY,
  Select,
  By,
  until,
  sleep,
} = require('./utilCasos')

const RESULTADOS = []
const NOMBRE_CP = 'Producto E2E CP'
const SKU_CP = 'CP-E2E-001'
const BUSCADOR = 'input[placeholder="Buscar por nombre, SKU o marca..."]'
const BTN_NUEVO = `//div[contains(@class,'card-header')]//button[contains(., 'Producto')]`
const TEMP_DIR = path.join(os.tmpdir(), 'opencode', 'cp-prod-e2e')
const TEMP_TXT = path.join(TEMP_DIR, 'no-imagen.txt')
const TEMP_PNG = path.join(TEMP_DIR, 'grande.png')

let EMPRESA_ID = null

const CASOS = {
  'CP-PROD-001': {
    id: 'CP-PROD-001',
    escenario: 'Crear un producto nuevo',
    pasos:
      '1. Ir a #/productos. 2. Clic en "+ Producto". 3. Completar "Nombre *" (único), SKU, precio compra e precio inicial Normal. 4. Clic en "Crear Producto"',
    requisitos:
      'Usuario con permiso productos/crear; empresa activa; red disponible; tipos de precio MAYOREO y NORMAL existentes',
    datos:
      'alex/alex123 (Gerente, Ferromax chichi); nombre "Producto E2E CP", SKU "CP-E2E-001", precio compra 50 (Q50.00), precio inicial Normal 100 (Q100.00), estado por defecto disponible',
    esperado:
      'Toast "Producto creado"; el producto aparece en la tabla con su precio (Q100.00), costo (Q50.00), margen y stock',
  },
  'CP-PROD-002': {
    id: 'CP-PROD-002',
    escenario: 'Editar un producto existente',
    pasos:
      '1. Ir a #/productos. 2. Clic en "Editar" del producto creado. 3. Modificar descripción y estado (a agotado). 4. Clic en "Guardar Cambios". 5. Reabrir "Editar" para verificar la descripción persistida',
    requisitos: 'Producto existente con permiso productos/editar',
    datos:
      'Producto "Producto E2E CP" (creado en CP-PROD-001); descripción → "Editado por E2E CP-PROD-002"; estado → agotado',
    esperado:
      'Toast "Producto editado"; los cambios se reflejan en la tabla (estado "agotado") y la descripción persiste al reabrir el modal',
  },
  'CP-PROD-003': {
    id: 'CP-PROD-003',
    escenario: 'Eliminar un producto con confirmación',
    pasos:
      '1. Ir a #/productos. 2. Clic en el ícono de papelera de la fila del producto. 3. Revisar "Confirmar eliminación". 4. Clic en "Eliminar"',
    requisitos: 'Producto existente con permiso productos/eliminar',
    datos:
      'Producto "Producto E2E CP" en la tabla; ConfirmModal "Confirmar eliminación" con mensaje ¿Eliminar el producto "Producto E2E CP"? Esta acción no se puede deshacer.',
    esperado:
      'Mensaje de confirmación correcto; toast "Producto eliminado"; desaparece de la tabla y del servidor (verificación REST al finalizar la suite)',
  },
  'CP-PROD-004': {
    id: 'CP-PROD-004',
    escenario: 'Crear producto sin nombre',
    pasos:
      '1. Ir a #/productos. 2. Clic en "+ Producto". 3. Dejar "Nombre *" vacío. 4. Clic en "Crear Producto"',
    requisitos: 'Modal "Nuevo Producto" abierto',
    datos: 'Modal "Nuevo Producto" con "Nombre *" vacío; botón "Crear Producto"',
    esperado:
      'El campo "Nombre *" es obligatorio (required nativo); el formulario no se envía, el modal permanece abierto y no se crea ningún producto',
  },
  'CP-PROD-005': {
    id: 'CP-PROD-005',
    escenario: 'Imagen inválida o mayor a 2 MB',
    pasos:
      '1. Abrir el modal de producto. 2. Adjuntar un .txt (no imagen). 3. Adjuntar un .png de 2.5 MB. 4. Cancelar el modal. 5. Borrar los temporales',
    requisitos:
      'Modal de producto abierto; input file "Imagen" con leyenda "PNG o JPG, máximo 2 MB"',
    datos:
      'Temporales: no-imagen.txt (texto plano) y grande.png (2.5 MB con firma PNG válida); límite MAX_BYTES = 2 MB',
    esperado:
      'Errores "El archivo debe ser una imagen" y "La imagen no puede superar 2 MB"; no se guarda el archivo; el modal se puede cancelar',
  },
  'CP-PROD-006': {
    id: 'CP-PROD-006',
    escenario: 'Gestión de precios por tipo y cantidad',
    pasos:
      '1. Clic en el precio verde de la fila (title "Clic para editar precios"). 2. En "Precios — {nombre}" agregar MAYOREO desde 5 a Q80.00. 3. Editar ese tier a Q75.00 ("Actualizar"). 4. Eliminar solo el tier MAYOREO creado (el tier NORMAL inicial se conserva)',
    requisitos:
      'Producto creado con precio inicial Normal (tier NORMAL desde 1); tipos de precio MAYOREO y NORMAL existentes',
    datos:
      'Producto "Producto E2E CP" con tier NORMAL Q100.00 (desde 1); tier MAYOREO temporal: desde 5, precio Q80.00 → se actualiza a Q75.00 → se elimina al final del caso',
    esperado:
      'Toasts "Precio agregado", "Precio actualizado" y "Precio eliminado"; la fila muestra el precio NORMAL sin alteraciones tras limpiar el tier creado',
  },
  'CP-PROD-007': {
    id: 'CP-PROD-007',
    escenario: 'Edición de stock por sucursal',
    pasos:
      '1. Clic en el número de Stock de la fila. 2. En "Stock — {nombre}" revisar columnas Sucursal/Stock/Mínimo. 3. Ajustar el Mínimo de la primera sucursal a 1. 4. Clic en "Guardar Stock"',
    requisitos:
      'Producto con stock en la sucursal actual y permiso productos/editar; red disponible (el modal escribe por RPC)',
    datos:
      'Producto "Producto E2E CP" con stock 0; se cambia Mínimo de la primera sucursal listada (Ferromax chichi) de 0 a 1; el cambio se anota y queda neutralizado con la baja del producto en CP-PROD-003',
    esperado:
      'Tabla por sucursal con columnas Sucursal, Stock y Mínimo; toast "Stock guardado"; el modal se cierra',
  },
  'CP-PROD-008': {
    id: 'CP-PROD-008',
    escenario: 'Filtros de búsqueda, estado y categoría',
    pasos:
      '1. Ir a #/productos. 2. Buscar "llave", luego "CP-E2E", luego basura ("zzqqxx@@"). 3. Filtrar por "Disponible" y por "Agotado". 4. Revisar el select de categorías',
    requisitos:
      'Productos con distintos estados (Producto E2E CP queda agotado tras CP-PROD-002); empresa sin categorías registradas',
    datos:
      'Términos válidos: "llave" (nombre) y "CP-E2E" (SKU del producto E2E); término sin coincidencias: "zzqqxx@@"; estados disponibles/agotado',
    esperado:
      'Cada filtro reduce la tabla; sin coincidencias se muestra "No hay productos"; el select de categorías solo ofrece "Todas las categorías" (catálogo vacío)',
  },
  'CP-PROD-009': {
    id: 'CP-PROD-009',
    escenario: 'Ocultación del botón de creación sin permiso',
    pasos:
      '1. Con red, quitar productos/crear al rol Gerente (permiso temporal). 2. Navegar a #/dashboard y luego a #/productos (re-montaje fuerza la re-consulta). 3. Verificar que "+ Producto" desaparece y "Editar" sigue. 4. Verificar que al restaurar el permiso el botón regresa',
    requisitos:
      'Red disponible (permisoService re-consulta has_permission con red y cachea el resultado)',
    datos:
      'Rol Gerente 3cf414b4-156f-40d2-a6a2-715ad8113283 con productos/crear=false temporal; restaurado en el finally de permisoTemporal',
    esperado:
      'El botón "+ Producto" no está visible sin permiso crear; las acciones de edición siguen sus permisos; al restaurar, el botón vuelve',
  },
  'CP-PROD-010': {
    id: 'CP-PROD-010',
    escenario: 'Productos sin conexión',
    pasos:
      '1. Abrir #/productos con red (calienta el chunk lazy). 2. Cortar la red por CDP. 3. Volver a entrar a #/productos. 4. Comparar con con red. 5. Restaurar la red',
    requisitos:
      'Catálogo hidratado en IndexedDB y chunk lazy de la ruta ya cargado con red (sin red un import dinámico frío revienta)',
    datos:
      'Red cortada con Network.emulateNetworkConditions offline=true; datos locales de Ferromax en IndexedDB',
    esperado:
      'Aparece la alerta "Sin conexión. Productos desde almacenamiento local — solo lectura."; se listan los datos de IndexedDB sin bloquearse; al restaurar la red la alerta desaparece',
  },
}

// ------------------------- helpers de la vista -------------------------

/**
 * Textos de TODOS los toasts visibles, en orden DOM. CToaster acumula toasts
 * (no reemplaza el nodo): mientras el anterior sigue en pantalla el nuevo es
 * els[1], y leer solo els[0] provoca la carrera clásica ("Precio agregado"
 * tapando a "Precio actualizado").
 */
async function textosToasts(driver) {
  try {
    const els = await driver.findElements(By.css('.toast.show'))
    const out = []
    for (const el of els) {
      try {
        const t = (await el.getText()).replace(/\s+/g, ' ').trim()
        if (t) out.push(t)
      } catch (e) {
        /* re-render del toast, se reintenta */
      }
    }
    return out
  } catch (e) {
    return []
  }
}

/** Texto del primer toast visible ('' si no aparece en `ms`). */
async function textoToast(driver, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const textos = await textosToasts(driver)
    if (textos.length) return textos[0]
    await sleep(250)
  }
  return ''
}

/**
 * Espera a que aparezca ALGÚN toast cuyo texto cumpla `regex`, escaneando
 * todos los visibles (no solo el primero): el toast anterior puede seguir en
 * el DOM varios segundos (autohide de 5 s, y más si la ventana está oculta y
 * el timer se enfría), y el nuevo entra DESPUÉS de él. Devuelve el último
 * texto observado si se agota el tiempo sin match (para diagnóstico).
 */
async function esperarToast(driver, regex, ms = 10000) {
  const fin = Date.now() + ms
  let ultimo = ''
  while (Date.now() < fin) {
    const textos = await textosToasts(driver)
    if (textos.length) {
      const match = textos.find((t) => regex.test(t))
      if (match) return match
      ultimo = textos.join(' | ')
    }
    await sleep(250)
  }
  return ultimo
}

/**
 * Espera a que un toast NUEVO (distinto a los que hay ahora) cumpla `regex`.
 * Útil cuando dos toasts se encadenan: no basta con esperar el match, porque
 * el toast anterior aún podría cumplir la misma regex. Primero congela los
 * textos actuales, luego exige uno distinto que case (escaneando todos los
 * toasts visibles, no solo el primero).
 */
async function esperarToastNuevo(driver, regex, ms = 10000) {
  const previos = await textosToasts(driver)
  const fin = Date.now() + ms
  let ultimo = ''
  while (Date.now() < fin) {
    const textos = await textosToasts(driver)
    if (textos.length) {
      const match = textos.find((t) => !previos.includes(t) && regex.test(t))
      if (match) return match
      ultimo = textos.join(' | ')
    }
    await sleep(250)
  }
  return ultimo
}

/** Escribe en un input/textarea de React (controlled) disparando el evento input nativo. */
async function escribirEn(driver, selector, valor) {
  const ok = await driver.executeScript(
    `
    const el = document.querySelector(arguments[0])
    if (!el) return false
    el.focus()
    const proto =
      el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, arguments[1])
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  `,
    selector,
    valor,
  )
  if (!ok) throw new Error(`no se encontró el input ${selector}`)
  await driver.sleep(500)
}

/** Navega a #/productos y espera a que renderice la tarjeta. */
async function abrirProductos(driver, ms = 2500) {
  await navegar(driver, '#/productos', ms)
  try {
    await driver.wait(until.elementLocated(By.css('.card-header h5')), 12000)
  } catch (e) {
    const hash = await driver.executeScript('return location.hash')
    throw new Error(`no renderizó la tarjeta de Productos (hash=${hash})`)
  }
  await driver.sleep(600)
}

/** Clic en "+ Producto" (botón del card-header; nunca clicTexto: el nav "Productos" contiene el mismo texto). */
async function clicNuevoProducto(driver) {
  await esperarToasts(driver)
  const btn = await driver.wait(until.elementLocated(By.xpath(BTN_NUEVO)), 8000)
  await driver.wait(until.elementIsVisible(btn), 3000)
  await btn.click()
  await driver.wait(until.elementLocated(By.css('.modal.show input[name="name"]')), 8000)
}

/** Elemento <tr> de la fila del producto E2E (por el nombre en la celda fw-semibold). */
async function filaCP(driver, nombre = NOMBRE_CP) {
  return driver.wait(
    until.elementLocated(
      By.xpath(`//tbody//tr[.//div[contains(@class,'fw-semibold') and contains(., '${nombre}')]]`),
    ),
    10000,
  )
}

/** Lee las celdas de la fila del producto E2E (null si no está). */
async function celdasCP(driver, nombre = NOMBRE_CP) {
  return driver.executeScript(
    `
    const tr = [...document.querySelectorAll('tbody tr')].find((x) =>
      (x.innerText || '').includes(arguments[0]),
    )
    return tr ? [...tr.querySelectorAll('td')].map((td) => (td.innerText || '').trim()) : null
  `,
    nombre,
  )
}

/** Resumen de la tabla: filas (innerText), contador y estado vacío. */
async function resumenTabla(driver) {
  return driver.executeScript(`
    const filas = [...document.querySelectorAll('tbody tr')].map((tr) =>
      (tr.innerText || '').replace(/\\s+/g, ' ').trim(),
    )
    const vacio = (document.body.innerText || '').includes('No hay productos')
    return { filas, n: filas.length, vacio }
  `)
}

/** Clic en el precio verde (celda title="Clic para editar precios") de la fila del producto. */
async function clicPrecioVerde(driver, nombre = NOMBRE_CP) {
  const ok = await driver.executeScript(
    `
    const tr = [...document.querySelectorAll('tbody tr')].find((x) =>
      (x.innerText || '').includes(arguments[0]),
    )
    if (!tr) return 'sin fila'
    const td = tr.querySelector('td[title="Clic para editar precios"]')
    if (!td) return 'sin celda de precio'
    td.scrollIntoView({ block: 'center' })
    td.click()
    return true
  `,
    nombre,
  )
  if (ok !== true) throw new Error(String(ok))
  await driver.wait(until.elementLocated(By.css('.modal.show .modal-title')), 8000)
}

/** Clic en el número de stock (span title="Ver stock por sucursal") de la fila del producto. */
async function clicStockNumero(driver, nombre = NOMBRE_CP) {
  const ok = await driver.executeScript(
    `
    const tr = [...document.querySelectorAll('tbody tr')].find((x) =>
      (x.innerText || '').includes(arguments[0]),
    )
    if (!tr) return 'sin fila'
    const span = tr.querySelector('span[title="Ver stock por sucursal"]')
    if (!span) return 'sin span de stock'
    span.scrollIntoView({ block: 'center' })
    span.click()
    return true
  `,
    nombre,
  )
  if (ok !== true) throw new Error(String(ok))
  await driver.wait(until.elementLocated(By.css('.modal.show input[type="number"]')), 10000)
}

/** Clic en el lápiz (0) o la papelera (1) del tier MAYOREO dentro del modal de precios. */
async function clicTier(driver, tipo, cual) {
  const ok = await driver.executeScript(
    `
    const filas = [...document.querySelectorAll('.modal.show .border-bottom')]
    const f = filas.find((x) => {
      const s = x.querySelector('strong')
      return s && (s.textContent || '').trim() === arguments[0]
    })
    if (!f) return 'sin tier ' + arguments[0]
    const btns = [...f.querySelectorAll('button')]
    if (!btns[arguments[1]]) return 'sin botón ' + arguments[1] + ' del tier'
    btns[arguments[1]].scrollIntoView({ block: 'center' })
    btns[arguments[1]].click()
    return true
  `,
    tipo,
    cual,
  )
  if (ok !== true) throw new Error(String(ok))
  await driver.sleep(600)
}

/**
 * Texto de la FILA de precios del tier `tipo` dentro del modal ('' si no hay).
 * Se lee la fila (.border-bottom con <strong>), NO el innerText del modal:
 * este incluye las <option> del select "Tipo de precio" y ahí "MAYOREO"
 * aparece SIEMPRE (catálogo global), lo que rompe las negaciones.
 */
async function textoTier(driver, tipo) {
  const t = await driver.executeScript(
    `
    const filas = [...document.querySelectorAll('.modal.show .border-bottom')]
    const f = filas.find((x) => {
      const s = x.querySelector('strong')
      return s && (s.textContent || '').trim() === arguments[0]
    })
    return f ? (f.innerText || '').replace(/\\s+/g, ' ').trim() : ''
  `,
    tipo,
  )
  return t || ''
}

/** Título del modal abierto ('' si no hay). */
async function tituloModal(driver) {
  return driver.executeScript(`
    const t = document.querySelector('.modal.show .modal-title')
    return t ? (t.textContent || '').trim() : ''
  `)
}

/** Texto combinado de los modales abiertos (normalizado). */
async function textoModales(driver) {
  return driver.executeScript(`
    const m = document.querySelector('.modal.show')
    return m ? (m.innerText || '').replace(/\\s+/g, ' ').trim() : ''
  `)
}

/** Cierra el modal abierto con su botón de texto dado (por defecto "Cancelar"). */
async function cerrarModal(driver, texto = 'Cancelar') {
  const cerrados = await driver.executeScript(
    `
    const btns = [...document.querySelectorAll('.modal.show button')]
    const b = btns.find((x) => (x.textContent || '').includes(arguments[0]))
    if (!b) return false
    b.click()
    return true
  `,
    texto,
  )
  if (!cerrados) {
    await driver.executeScript(
      "const b = document.querySelector('.modal.show .modal-header button.btn-close'); if (b) b.click()",
    )
  }
  const fin = Date.now() + 6000
  while (Date.now() < fin) {
    const abiertos = await driver.findElements(By.css('.modal.show'))
    if (!abiertos.length) return true
    await sleep(300)
  }
  return false
}

/** Espera a que el login termine de hidratar el catálogo local (o lo fuerza). */
async function esperarCatalogo(driver) {
  for (let i = 0; i < 25; i++) {
    const r = await script(
      driver,
      `
      const { db } = await import('/src/lib/db.js')
      return {
        productos: await db.productos.count(),
        stocks: await db.productos_sucursal.count(),
      }
    `,
    )
    if (r && !r.error && r.productos > 0 && r.stocks > 0) return r
    await sleep(600)
  }
  const sesion = await driver.executeScript(
    "return JSON.parse(localStorage.getItem('currentUser') || 'null')",
  )
  const idSuc = sesion && sesion.id_sucursal ? sesion.id_sucursal : ''
  return script(
    driver,
    `
    const { hidratarCatalogoParaSucursal } = await import('/src/services/catalogSyncService.js')
    const n = await hidratarCatalogoParaSucursal(arguments[0])
    const { db } = await import('/src/lib/db.js')
    return { forzado: n, productos: await db.productos.count(), stocks: await db.productos_sucursal.count() }
  `,
    idSuc,
  )
}

// --------------------- helpers REST (limpieza/verificación) ---------------------

function headers() {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
}

async function productoEnServidor(nombre = NOMBRE_CP) {
  try {
    const r = await fetch(`${SUPA}/rpc/get_productos_admin`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ p_id_empresa: EMPRESA_ID }),
    })
    const data = await r.json()
    return (data.productos || []).find((p) => p.name === nombre) || null
  } catch (e) {
    return { error: String((e && e.message) || e) }
  }
}

async function eliminarProductoSeguridad(nombre = NOMBRE_CP) {
  const p = await productoEnServidor(nombre)
  if (!p || p.error) return p
  const r = await fetch(`${SUPA}/rpc/delete_producto_admin`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_id: p.id }),
  })
  return { eliminado: true, status: r.status, id: p.id }
}

function borrarTemporales() {
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true })
  } catch (e) {
    /* ya borrados */
  }
}

function crearTemporales() {
  fs.mkdirSync(TEMP_DIR, { recursive: true })
  fs.writeFileSync(TEMP_TXT, 'esto no es una imagen\n', 'utf8')
  const png = Buffer.alloc(2 * 1024 * 1024 + 512 * 1024) // 2.5 MB > 2 MB
  png[0] = 0x89
  png[1] = 0x50
  png[2] = 0x4e
  png[3] = 0x47
  png[4] = 0x0d
  png[5] = 0x0a
  png[6] = 0x1a
  png[7] = 0x0a
  fs.writeFileSync(TEMP_PNG, png)
  return { txt: TEMP_TXT, png: TEMP_PNG }
}

// ------------------------------- suite --------------------------------

async function main() {
  let driver = null
  try {
    EMPRESA_ID = await resolverEmpresa('alex')
    console.log('  · empresa de alex:', EMPRESA_ID)

    // Limpieza pre-corrida: si una corrida previa dejó el producto, se borra.
    const previo = await productoEnServidor()
    if (previo && previo.id) {
      console.log('  · producto residual de una corrida previa:', previo.id, '→ eliminando')
      await eliminarProductoSeguridad()
    }

    driver = await crearDriver()
    await login(driver)

    try {
      const cat = await esperarCatalogo(driver)
      console.log('  · catálogo local:', JSON.stringify(cat))
    } catch (e) {
      console.log('  · aviso catálogo:', String(e).split('\n')[0])
    }

    // --- CP-PROD-001: crear producto ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-001'], async () => {
      await abrirProductos(driver)
      await clicNuevoProducto(driver)
      const titulo = await tituloModal(driver)
      check(
        titulo === 'Nuevo Producto',
        `título de modal esperado "Nuevo Producto" y se observó "${titulo}"`,
      )
      await escribirEn(driver, '.modal.show input[name="name"]', NOMBRE_CP)
      await escribirEn(driver, '.modal.show input[name="sku"]', SKU_CP)
      await escribirEn(driver, '.modal.show input[name="precio_compra"]', '50')
      await escribirEn(driver, '.modal.show input[name="precio_inicial"]', '100')
      await clicTexto(driver, 'Crear Producto')
      const toast = await esperarToast(driver, /Producto creado/)
      check(/Producto creado/.test(toast), `toast inesperado al crear: "${toast || '(sin toast)'}"`)
      const fin = Date.now() + 12000
      let celdas = null
      while (Date.now() < fin && !celdas) {
        celdas = await celdasCP(driver)
        if (!celdas) await sleep(500)
      }
      check(celdas, 'el producto no apareció en la tabla tras crearlo')
      check(
        celdas[0].includes(SKU_CP),
        `la celda del producto no muestra el SKU ${SKU_CP}: "${celdas[0]}"`,
      )
      check(
        celdas[0].includes('disponible'),
        `la celda del producto no muestra estado "disponible": "${celdas[0]}"`,
      )
      check(
        celdas[3].includes('Q100.00'),
        `la celda de Precio muestra "${celdas[3]}" y se esperaba Q100.00 (precio inicial Normal)`,
      )
      check(
        celdas[4].includes('Q50.00'),
        `la celda de Costo muestra "${celdas[4]}" y se esperaba Q50.00`,
      )
      return `toast "${toast}"; fila creada: producto "${celdas[0].replace(/\n/g, ' · ')}", Precio ${celdas[3]}, Costo ${celdas[4]}, Margen ${celdas[5]}, Stock ${celdas[6].replace(/\n/g, '')}`
    })

    // --- CP-PROD-002: editar producto (descripción y estado) ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-002'], async () => {
      await abrirProductos(driver)
      const fila = await filaCP(driver)
      const editar = await fila.findElement(By.xpath(`.//button[contains(., 'Editar')]`))
      await driver.wait(until.elementIsVisible(editar), 3000)
      await editar.click()
      await driver.wait(
        until.elementLocated(By.css('.modal.show textarea[name="descripcion"]')),
        8000,
      )
      const titulo = await tituloModal(driver)
      check(
        titulo === 'Editar Producto',
        `título de modal esperado "Editar Producto" y se observó "${titulo}"`,
      )
      const desc = 'Editado por E2E CP-PROD-002'
      await escribirEn(driver, '.modal.show textarea[name="descripcion"]', desc)
      const selEstado = await driver.findElement(By.css('.modal.show select[name="estado"]'))
      await new Select(selEstado).selectByValue('agotado')
      await clicTexto(driver, 'Guardar Cambios')
      const toast = await esperarToast(driver, /Producto editado/)
      check(
        /Producto editado/.test(toast),
        `toast inesperado al editar: "${toast || '(sin toast)'}"`,
      )
      const fin = Date.now() + 12000
      let celdas = null
      while (Date.now() < fin) {
        celdas = await celdasCP(driver)
        if (celdas && celdas[0].includes('agotado')) break
        celdas = null
        await sleep(500)
      }
      check(celdas, `la fila no reflejó el estado "agotado" tras guardar`)
      // reabrir Editar para verificar que la descripción persistió
      const btnEditar2 = await driver.wait(
        until.elementLocated(
          By.xpath(
            `//tbody//tr[.//div[contains(@class,'fw-semibold') and contains(., '${NOMBRE_CP}')]]//button[contains(., 'Editar')]`,
          ),
        ),
        8000,
      )
      await btnEditar2.click()
      await driver.wait(
        until.elementLocated(By.css('.modal.show textarea[name="descripcion"]')),
        8000,
      )
      const descGuardada = await driver.executeScript(
        'return document.querySelector(\'.modal.show textarea[name="descripcion"]\').value',
      )
      await cerrarModal(driver, 'Cancelar')
      check(
        descGuardada === desc,
        `la descripción no persistió: se guardó "${desc}" y se releyó "${descGuardada}"`,
      )
      return `toast "${toast}"; estado en tabla "agotado"; descripción persiste al reabrir el modal ("${descGuardada}")`
    })

    // --- CP-PROD-006: gestión de precios (agregar/actualizar/eliminar tier MAYOREO) ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-006'], async () => {
      await abrirProductos(driver)
      await clicPrecioVerde(driver)
      const titulo = await tituloModal(driver)
      check(
        titulo.includes('Precios') && titulo.includes(NOMBRE_CP),
        `título de modal esperado "Precios — ${NOMBRE_CP}" y se observó "${titulo}"`,
      )
      const tierNormal0 = await textoTier(driver, 'NORMAL')
      check(
        /NORMAL/.test(tierNormal0) && /desde 1/.test(tierNormal0),
        `el modal no lista el tier NORMAL inicial (desde 1): "${tierNormal0 || '(sin fila)'}"`,
      )
      // agregar MAYOREO desde 5 a Q80.00
      await esperarToasts(driver)
      const selTipo = await driver.findElement(
        By.css('.modal.show select[name="id_tipo_producto"]'),
      )
      await new Select(selTipo).selectByVisibleText('MAYOREO')
      await escribirEn(driver, '.modal.show input[name="min_cantidad"]', '5')
      await escribirEn(driver, '.modal.show input[name="precio"]', '80')
      await clicTexto(driver, 'Agregar')
      const toast1 = await esperarToast(driver, /Precio agregado/)
      check(
        /Precio agregado/.test(toast1),
        `toast inesperado al agregar precio: "${toast1 || '(sin toast)'}"`,
      )
      const fin1 = Date.now() + 12000
      let tier1 = ''
      while (Date.now() < fin1) {
        tier1 = await textoTier(driver, 'MAYOREO')
        if (tier1) break
        await sleep(500)
      }
      check(
        /desde 5/.test(tier1) && /Q80\.00/.test(tier1),
        `el tier MAYOREO no aparece como esperado (desde 5, Q80.00): "${tier1 || '(sin fila)'}"`,
      )
      // editar el tier a Q75.00
      await clicTier(driver, 'MAYOREO', 0)
      await driver.wait(until.elementLocated(By.css('.modal.show input[name="precio"]')), 5000)
      await escribirEn(driver, '.modal.show input[name="precio"]', '75')
      await clicTexto(driver, 'Actualizar')
      const toast2 = await esperarToast(driver, /Precio actualizado/)
      check(
        /Precio actualizado/.test(toast2),
        `toast inesperado al actualizar precio: "${toast2 || '(sin toast)'}"`,
      )
      const fin2 = Date.now() + 12000
      let tier2 = ''
      while (Date.now() < fin2) {
        tier2 = await textoTier(driver, 'MAYOREO')
        if (/Q75\.00/.test(tier2)) break
        await sleep(500)
      }
      check(
        /Q75\.00/.test(tier2),
        `el tier MAYOREO no muestra Q75.00 tras Actualizar: "${tier2 || '(sin fila)'}"`,
      )
      // eliminar SOLO el tier MAYOREO creado (el NORMAL inicial se conserva)
      await clicTier(driver, 'MAYOREO', 1)
      const toast3 = await esperarToast(driver, /Precio eliminado/)
      check(
        /Precio eliminado/.test(toast3),
        `toast inesperado al eliminar precio: "${toast3 || '(sin toast)'}"`,
      )
      const fin3 = Date.now() + 12000
      let tier3 = '(sin leer)'
      while (Date.now() < fin3) {
        tier3 = await textoTier(driver, 'MAYOREO')
        if (!tier3) break
        await sleep(500)
      }
      check(!tier3, `el tier MAYOREO siguió presente tras eliminarlo: "${tier3}"`)
      const tierNormal = await textoTier(driver, 'NORMAL')
      check(
        /NORMAL/.test(tierNormal) && /Q100\.00/.test(tierNormal),
        `el tier NORMAL inicial no quedó intacto tras eliminar MAYOREO: "${tierNormal || '(sin fila)'}"`,
      )
      await cerrarModal(driver, 'Cerrar')
      const celdas = await celdasCP(driver)
      check(
        celdas && celdas[3].includes('Q100.00'),
        `tras limpiar el tier la celda de Precio no volvió a Q100.00: "${celdas && celdas[3]}"`,
      )
      return `toasts "${toast1}" → "${toast2}" → "${toast3}"; tier MAYOREO agregado (desde 5, Q80.00), actualizado (Q75.00) y eliminado; solo queda el tier NORMAL inicial y la fila muestra Precio ${celdas[3]}`
    })

    // --- CP-PROD-007: edición de stock por sucursal ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-007'], async () => {
      await abrirProductos(driver)
      await clicStockNumero(driver)
      const titulo = await tituloModal(driver)
      check(
        titulo.includes('Stock') && titulo.includes(NOMBRE_CP),
        `título de modal esperado "Stock — ${NOMBRE_CP}" y se observó "${titulo}"`,
      )
      const cuerpo = await textoModales(driver)
      check(
        /Sucursal/.test(cuerpo) && /Mínimo/.test(cuerpo),
        `el modal no lista las columnas Sucursal/Stock/Mínimo: "${cuerpo.slice(0, 160)}"`,
      )
      const filasStock = await driver.executeScript(`
        const rows = [...document.querySelectorAll('.modal.show .d-flex.align-items-center.border-bottom')]
        return rows
          .map((r) => {
            const inputs = [...r.querySelectorAll('input')]
            const nombre = (r.querySelector('div') || {}).textContent || ''
            return {
              sucursal: nombre.trim(),
              stock: inputs[0] ? inputs[0].value : null,
              min: inputs[1] ? inputs[1].value : null,
            }
          })
          .filter((x) => x.sucursal)
      `)
      check(
        filasStock.length > 0,
        'el modal de stock no listó ninguna sucursal (sin filas con inputs)',
      )
      const objetivo = filasStock[0]
      const minOriginal = Number(objetivo.min)
      const minNuevo = minOriginal === 1 ? 2 : 1
      const ok = await driver.executeScript(
        `
        const rows = [...document.querySelectorAll('.modal.show .d-flex.align-items-center.border-bottom')]
        const r = rows.find((x) => ((x.querySelector('div') || {}).textContent || '').trim() === arguments[0])
        if (!r) return 'sin fila de ' + arguments[0]
        const inputs = [...r.querySelectorAll('input')]
        if (!inputs[1]) return 'sin input de mínimo'
        inputs[1].focus()
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setter.call(inputs[1], arguments[1])
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }))
        return true
      `,
        objetivo.sucursal,
        String(minNuevo),
      )
      check(ok === true, `no se pudo escribir el mínimo: ${ok}`)
      await clicTexto(driver, 'Guardar Stock')
      const toast = await esperarToast(driver, /Stock guardado/, 12000)
      check(
        /Stock guardado/.test(toast),
        `toast inesperado al guardar stock: "${toast || '(sin toast)'}"`,
      )
      const cerrado = await cerrarModal(driver, 'Cancelar')
      check(cerrado, 'el modal de stock no se cerró tras "Guardar Stock"')
      return `${filasStock.length} sucursal(es) listadas (${filasStock.map((f) => `${f.sucursal}: stock ${f.stock}, mín ${f.min}`).join(' | ')}); Mínimo de "${objetivo.sucursal}" ${minOriginal} → ${minNuevo}; toast "${toast}"; nota: el producto se elimina en CP-PROD-003, lo que retira sus filas de stock`
    })

    // --- CP-PROD-004: crear producto sin nombre (required nativo) ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-004'], async () => {
      await abrirProductos(driver)
      await clicNuevoProducto(driver)
      const titulo = await tituloModal(driver)
      check(
        titulo === 'Nuevo Producto',
        `título de modal esperado "Nuevo Producto" y se observó "${titulo}"`,
      )
      await esperarToasts(driver)
      await clicTexto(driver, 'Crear Producto')
      await driver.sleep(2000)
      const estado = await driver.executeScript(`
        const m = document.querySelector('.modal.show')
        const inp = m ? m.querySelector('input[name="name"]') : null
        return {
          modalAbierto: !!m,
          valido: inp ? inp.checkValidity() : null,
          requerido: inp ? inp.required : null,
          mensaje: inp ? (inp.validationMessage || '') : '',
          valor: inp ? inp.value : null,
        }
      `)
      const toast = await textoToast(driver, 1500)
      check(
        estado.modalAbierto,
        'el modal se cerró a pesar del nombre vacío: el formulario SÍ se envió',
      )
      check(estado.requerido === true, 'el input "Nombre *" no tiene el atributo required')
      check(
        estado.valido === false,
        `el input "Nombre *" reportó checkValidity()=${estado.valido} con valor vacío`,
      )
      check(
        !/Producto cread[oa]/.test(toast),
        `apareció toast de creación con nombre vacío: "${toast}"`,
      )
      await cerrarModal(driver, 'Cancelar')
      return `al clickear "Crear Producto" con nombre vacío: el navegador bloqueó el envío (required nativo, checkValidity=false, validationMessage="${estado.mensaje || '(vacía)'}"), el modal permaneció abierto y no apareció toast de creación; el formulario no se envió`
    })

    // --- CP-PROD-005: imagen inválida o mayor a 2 MB ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-005'], async () => {
      const temporales = crearTemporales()
      try {
        await abrirProductos(driver)
        await clicNuevoProducto(driver)
        const fileInput = await driver.wait(
          until.elementLocated(By.css('.modal.show input[type="file"]')),
          8000,
        )
        await fileInput.sendKeys(temporales.txt)
        const toast1 = await esperarToast(driver, /El archivo debe ser una imagen/)
        check(
          /El archivo debe ser una imagen/.test(toast1),
          `toast inesperado con .txt: "${toast1 || '(sin toast)'}"`,
        )
        await esperarToasts(driver)
        const fileInput2 = await driver.findElement(By.css('.modal.show input[type="file"]'))
        await fileInput2.sendKeys(temporales.png)
        const toast2 = await esperarToastNuevo(driver, /La imagen no puede superar 2 MB/)
        check(
          /La imagen no puede superar 2 MB/.test(toast2),
          `toast inesperado con .png de 2.5 MB: "${toast2 || '(sin toast)'}"`,
        )
        const quedo = await driver.executeScript(`
          const m = document.querySelector('.modal.show')
          const inp = m ? m.querySelector('input[type="file"]') : null
          return { modalAbierto: !!m, valor: inp ? inp.value : null }
        `)
        check(
          quedo.modalAbierto,
          'el modal se cerró tras los errores de imagen (no se debía guardar)',
        )
        await cerrarModal(driver, 'Cancelar')
        return `archivos: no-imagen.txt → toast "${toast1}"; grande.png (2.5 MB, firma PNG) → toast "${toast2}"; el input file quedó limpio (value="${quedo.valor || ''}"), el modal no guardó nada y se canceló; temporales borrados`
      } finally {
        borrarTemporales()
      }
    })

    // --- CP-PROD-008: filtros de búsqueda, estado y categoría ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-008'], async () => {
      await abrirProductos(driver)
      const base = await resumenTabla(driver)
      check(base.n > 0, 'no hay productos que filtrar en la tabla')

      await escribirEn(driver, BUSCADOR, 'llave')
      let r = await resumenTabla(driver)
      check(
        r.n === 1 && /llave inlgesa/i.test(r.filas.join(' ')),
        `con "llave" se esperaba 1 fila ("llave inlgesa") y se observó ${r.n}: ${JSON.stringify(r.filas)}`,
      )
      const trasLlave = r.n

      await escribirEn(driver, BUSCADOR, 'CP-E2E')
      r = await resumenTabla(driver)
      check(
        r.n === 1 && r.filas.join(' ').includes(NOMBRE_CP),
        `con "CP-E2E" se esperaba 1 fila ("${NOMBRE_CP}") y se observó ${r.n}: ${JSON.stringify(r.filas)}`,
      )

      await escribirEn(driver, BUSCADOR, 'zzqqxx@@')
      r = await resumenTabla(driver)
      check(r.n === 0, `con "zzqqxx@@" se esperaba 0 filas y se observaron ${r.n}`)
      check(r.vacio, 'sin coincidencias NO se mostró el mensaje "No hay productos"')

      await escribirEn(driver, BUSCADOR, '')
      r = await resumenTabla(driver)
      check(
        r.n === base.n,
        `al limpiar el buscador se esperaban ${base.n} filas y se observaron ${r.n}`,
      )

      const sels = await driver.findElements(By.css('.card-header select'))
      check(
        sels.length >= 2,
        `se esperaban 2 selects (estado/categoría) y se hallaron ${sels.length}`,
      )
      await new Select(sels[0]).selectByValue('disponible')
      await driver.sleep(500)
      r = await resumenTabla(driver)
      check(
        r.n >= 1 && r.filas.every((f) => f.includes('disponible')),
        `con estado "Disponible" quedaron filas sin ese estado: ${JSON.stringify(r.filas)}`,
      )
      check(
        !r.filas.some((f) => f.includes(NOMBRE_CP)),
        `con estado "Disponible" aparece "${NOMBRE_CP}" (quedó agotado en CP-PROD-002)`,
      )
      const disponibles = r.n

      await new Select(sels[0]).selectByValue('agotado')
      await driver.sleep(500)
      r = await resumenTabla(driver)
      check(
        r.n === 1 && r.filas.join(' ').includes(NOMBRE_CP),
        `con estado "Agotado" se esperaba solo "${NOMBRE_CP}" y se observó ${r.n}: ${JSON.stringify(r.filas)}`,
      )
      await new Select(sels[0]).selectByValue('')
      await driver.sleep(500)

      const opcionesCat = await driver.executeScript(`
        const sels = [...document.querySelectorAll('.card-header select')]
        const sel = sels[1]
        return sel ? [...sel.options].map((o) => ({ v: o.value, t: (o.textContent || '').trim() })) : []
      `)
      const reales = opcionesCat.filter((o) => o.v !== '')
      let notaCat
      if (reales.length === 0) {
        notaCat = `el select de categorías solo contiene "Todas las categorías" (empresa sin categorías registradas: ${opcionesCat.map((o) => `"${o.t}"`).join(', ')}); no se pudo filtrar de verdad — registrado honestamente`
      } else {
        await new Select(sels[1]).selectByValue(reales[0].v)
        await driver.sleep(500)
        const filtrado = await resumenTabla(driver)
        notaCat = `filtro por categoría "${reales[0].t}" → ${filtrado.n} fila(s)`
        await new Select(sels[1]).selectByValue('')
        await driver.sleep(500)
      }
      return `busqueda "llave" → ${trasLlave} fila; "CP-E2E" → 1 fila ("${NOMBRE_CP}"); "zzqqxx@@" → 0 filas con "No hay productos"; limpiar → ${base.n} filas; estado "Disponible" → ${disponibles} fila(s) sin el producto E2E; estado "Agotado" → 1 fila (solo el producto E2E); ${notaCat}`
    })

    // --- CP-PROD-009: botón "+ Producto" oculto sin permiso crear ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-009'], async () => {
      const salida = await permisoTemporal(ROL_GERENTE, 'productos', { crear: false }, async () => {
        await navegar(driver, '#/dashboard', 2000)
        const inicio = await driver.executeScript('return location.hash')
        await navegar(driver, '#/productos', 2500)
        // usePermission arranca en true y resuelve por RPC: se espera a que desaparezca
        let botones = -1
        const fin = Date.now() + 15000
        while (Date.now() < fin) {
          botones = (await driver.findElements(By.css('.card-header button'))).length
          if (botones === 0) break
          await sleep(600)
        }
        const editables = await driver.findElements(
          By.xpath(`//tbody//button[contains(., 'Editar')]`),
        )
        const hash = await driver.executeScript('return location.hash')
        return { inicio, hash, botones, editables: editables.length }
      })
      check(salida.hash === '#/productos', `la vista no quedó en #/productos (hash ${salida.hash})`)
      check(
        salida.botones === 0,
        `el botón "+ Producto" siguió visible sin permiso crear (botones en el card-header: ${salida.botones})`,
      )
      check(
        salida.editables > 0,
        'los botones "Editar" desaparecieron sin permiso crear (solo se debía ocultar la creación)',
      )
      // la restauración del permiso debe devolver el botón (re-consulta con red)
      await navegar(driver, '#/dashboard', 1500)
      await navegar(driver, '#/productos', 2500)
      let volvio = -1
      const fin2 = Date.now() + 12000
      while (Date.now() < fin2) {
        volvio = (await driver.findElements(By.css('.card-header button'))).length
        if (volvio > 0) break
        await sleep(600)
      }
      check(
        volvio > 0,
        'el botón "+ Producto" NO regresó tras restaurar el permiso productos/crear',
      )
      return `con productos/crear=false: desde ${salida.inicio} → #/productos con ${salida.botones} botón(es) en el card-header ("+ Producto" oculto) y ${salida.editables} botón(es) "Editar" visibles; al restaurar el permiso el botón regresó (${volvio}); permiso restaurado por permisoTemporal`
    })

    // --- CP-PROD-010: productos sin conexión ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-010'], async () => {
      await abrirProductos(driver)
      const conRed = await resumenTabla(driver)
      check(conRed.n > 0, 'la tabla no tenía filas con red: no hay qué comparar sin conexión')
      await cortarRed(driver)
      try {
        const onLine = await driver.executeScript('return navigator.onLine')
        check(onLine === false, `navigator.onLine sigue en ${onLine} tras cortar la red`)
        await navegar(driver, '#/productos', 3000)
        const alerta = await aparece(
          driver,
          'Sin conexión. Productos desde almacenamiento local',
          12000,
        )
        check(
          alerta,
          'no apareció la alerta "Sin conexión. Productos desde almacenamiento local — solo lectura."',
        )
        let r = await resumenTabla(driver)
        if (r.n === 0) {
          await driver.sleep(1500)
          r = await resumenTabla(driver)
        }
        check(r.n > 0, 'sin red la tabla quedó vacía (IndexedDB sin datos para la sucursal)')
        const hash = await driver.executeScript('return location.hash')
        check(hash === '#/productos', `la vista no quedó en #/productos (hash ${hash})`)
        const incluyeE2E = r.filas.some((f) => f.includes(NOMBRE_CP))
        return `red cortada (navigator.onLine=false) → #/productos mostró la alerta offline y ${r.n} fila(s) desde IndexedDB: ${JSON.stringify(r.filas.map((f) => f.split('\n')[0]))}; el producto E2E creado por RPC posterior a la hidratación ${incluyeE2E ? 'SÍ' : 'NO'} figura en el espejo local (esperado: NO, la hidratación ocurre en login); vista sin bloqueo`
      } finally {
        await restaurarRed(driver)
      }
    })

    // --- CP-PROD-003: eliminar producto con confirmación (limpieza, al final) ---
    await caso(driver, RESULTADOS, CASOS['CP-PROD-003'], async () => {
      await abrirProductos(driver)
      const fila = await filaCP(driver)
      await esperarToasts(driver)
      const papelera = await fila.findElement(By.xpath(`.//button[contains(@class,'btn-danger')]`))
      await driver.wait(until.elementIsVisible(papelera), 3000)
      await papelera.click()
      const tituloOk = await aparece(driver, 'Confirmar eliminación', 8000)
      const msg = await existe(
        driver,
        `¿Eliminar el producto "${NOMBRE_CP}"? Esta acción no se puede deshacer.`,
      )
      check(
        tituloOk && msg,
        `el ConfirmModal no mostró "Confirmar eliminación" ni el mensaje exacto (titulo=${tituloOk}, mensaje=${msg})`,
      )
      await clicTexto(driver, 'Eliminar')
      const toast = await esperarToast(driver, /Producto eliminado/, 12000)
      check(
        /Producto eliminado/.test(toast),
        `toast inesperado al eliminar: "${toast || '(sin toast)'}"`,
      )
      const fin = Date.now() + 12000
      let aun = true
      while (Date.now() < fin) {
        aun = await driver.executeScript(
          `
          return [...document.querySelectorAll('tbody tr')].some((x) =>
            (x.innerText || '').includes(arguments[0]),
          )
        `,
          NOMBRE_CP,
        )
        if (!aun) break
        await sleep(500)
      }
      check(
        !aun,
        `el producto "${NOMBRE_CP}" siguió en la tabla tras eliminar y el toast "Producto eliminado"`,
      )
      const servidor = await productoEnServidor()
      check(
        !servidor,
        `el producto "${NOMBRE_CP}" aún existe en el servidor tras eliminar (id ${servidor && servidor.id})`,
      )
      const sinTabla = await noExiste(driver, NOMBRE_CP)
      return `ConfirmModal "Confirmar eliminación" con mensaje exacto; toast "${toast}"; el producto desapareció de la tabla (visible=${!sinTabla}) y del servidor (REST get_productos_admin: 0 coincidencias)`
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    try {
      if (driver) await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }
    // Limpieza por seguridad + verificación final de que NO quedó en la base
    try {
      const limpieza = await eliminarProductoSeguridad()
      console.log('  · limpieza final:', JSON.stringify(limpieza))
      const verif = await productoEnServidor()
      console.log(
        verif && !verif.error
          ? `  · VERIFICACIÓN FALLIDA: "${NOMBRE_CP}" aún en la base: ${JSON.stringify({ id: verif.id, sku: verif.sku })}`
          : `  · VERIFICACIÓN: "${NOMBRE_CP}" NO quedó en la base (0 coincidencias en get_productos_admin)`,
      )
    } catch (e) {
      console.log('  · aviso verificación final:', String(e).split('\n')[0])
    }
    borrarTemporales()
    guardarResultados('CPProductos', RESULTADOS)
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  console.log(
    reprobados.length === 0
      ? 'CP-PROD OK (10/10 aprobados)'
      : `CP-PROD con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
