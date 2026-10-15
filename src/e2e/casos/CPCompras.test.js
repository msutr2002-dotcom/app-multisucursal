/**
 * CP-COMP — Casos de prueba del módulo Compras (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-COMP-00X.png,
 * resultados en docs/e2e-resultados/CPCompras.json.
 *
 * Orden de ejecución: 008 (listado todavía vacío) → alta del proveedor de
 * prueba en #/catalogos → 001 (compra) → 002 (entrada) → 003 (validaciones) →
 * 004 (adjunto > 4 MB) → 009 (comprobante) → 005 (anulación con red) →
 * 006 (compra sin conexión) → 007 (anulación bloqueada + limpieza local) →
 * 010 (permisos).
 *
 * Controles de entorno (todos se restauran en el `finally`):
 *  - `detenerMotorSync()` al arrancar: el motor de sync (ronda cada 30 s)
 *    borraría el badge "sin sincronizar" de CP-COMP-001 y mandaría al servidor
 *    la entrada de CP-COMP-002. CP-COMP-005 sincroniza SOLO la compra con
 *    `sincronizarEvento`; el finally limpia la entrada local y reinicia el motor.
 *  - Stock de "llave inlgesa": se lee al inicio y se restaura al final en
 *    IndexedDB y en el servidor (deriva final 0).
 *  - El proveedor de prueba se crea por UI en #/catalogos y se elimina en el
 *    finally (UI primero, RPC `delete_catalogo` como respaldo).
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const {
  crearDriver,
  login,
  script,
  aparece,
  existe,
  clicTexto,
  clicPestana,
  esperarToasts,
  navegar,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  ROL_GERENTE,
  By,
  until,
  sleep,
} = require('./utilCasos')

const RESULTADOS = []

const NOMBRE_PROVEEDOR = 'Proveedor E2E CP'
const NOMBRE_PRODUCTO = 'llave inlgesa'
const MOTIVO_ENTRADA = 'Entrada E2E CP'
const PLACEHOLDER_COMPRAS = 'Buscar por proveedor o producto...'
const PLACEHOLDER_ENTRADAS = 'Buscar por producto o motivo...'
const BUSQUEDA_SIN_MATCH = 'zzz_sin_coincidencias_cp'
const ARCHIVO_GRANDE = path.join(os.tmpdir(), 'opencode', 'AdjuntoGrande_CP.pdf')

const COLUMNAS_COMPRAS = ['Fecha', 'Proveedor', 'Usuario', 'Artículos', 'Total', 'Estado']
const COLUMNAS_ENTRADAS = ['Fecha', 'Producto', 'Cantidad', 'Motivo', 'Usuario', 'Estado']

/** Stock leído al arrancar: sirve para la restauración y la verificación final. */
let STOCK_INICIAL = null
let ID_PROVEEDOR = null
let ID_COMPRA_001 = null
let TOTAL_001 = null
let ID_COMPRA_OFFLINE = null
let MOTOR_DETENIDO = false
let RED_CORTADA = false
let PROVEEDOR_BORRADO = null
/** Contadores locales tras la limpieza de corridas anteriores (baseline). */
let COMPRAS_BASE = 0
let ENTRADAS_BASE = 0
let TOTALES_INICIALES = null

const CASOS = {
  'CP-COMP-001': {
    id: 'CP-COMP-001',
    escenario: 'Registrar una nueva compra',
    pasos:
      '1. Ir a #/compras. 2. Clic en "Nueva compra". 3. Seleccionar el proveedor. 4. Agregar producto con cantidad y precio unitario. 5. (Opcional) adjuntar imagen/PDF menor a 4 MB. 6. Clic en "Registrar compra"',
    requisitos: 'Usuario con permiso compras/crear; al menos un proveedor y productos',
    datos:
      'Usuario alex/alex123 (Gerente, sucursal "Ferromax chichi"); proveedor de prueba "Proveedor E2E CP" (creado por la suite en #/catalogos); producto "llave inlgesa" (SKU LLAVE); cantidad 1, precio unitario Q10.00; sin adjunto',
    esperado:
      'Se agrega la línea con total "Total: Q10.00"; toast "Compra registrada" ("Guardada en el dispositivo y en cola de sincronización"); aparece en el listado con badge "sin sincronizar" hasta que sincronice',
  },
  'CP-COMP-002': {
    id: 'CP-COMP-002',
    escenario: 'Registrar una entrada manual de mercadería',
    pasos:
      '1. Ir a la pestaña "Entradas". 2. Clic en "Nueva entrada". 3. Elegir producto. 4. Revisar la alerta "Stock actual: X → quedará Y". 5. Ingresar cantidad y motivo. 6. Clic en "Registrar entrada"',
    requisitos: 'Usuario con permiso compras/crear; producto seleccionable',
    datos:
      'Producto "llave inlgesa" (stock local al entrar al caso = stock inicial + 1 de CP-COMP-001); cantidad 5; motivo "Entrada E2E CP"',
    esperado:
      'Toast "Entrada registrada"; el stock del producto sube al instante; la fila aparece en el listado de entradas',
  },
  'CP-COMP-003': {
    id: 'CP-COMP-003',
    escenario: 'Validaciones del formulario de compra',
    pasos:
      '1. Clic en "Registrar compra" sin proveedor. 2. Seleccionar proveedor pero sin productos. 3. Ingresar cantidad 0. 4. Ingresar precio vacío/inválido. 5. Cerrar el modal sin guardar',
    requisitos: 'Modal "Nueva compra" abierto y proveedor disponible en el catálogo',
    datos:
      'Proveedor "Proveedor E2E CP"; producto "llave inlgesa"; cantidad 0; precio vacío; ninguna línea se agrega',
    esperado:
      'Toasts warning: "Falta el proveedor", "Sin productos", "Cantidad inválida" / "Usa un entero mayor a cero", "Precio inválido"; no se guarda nada',
  },
  'CP-COMP-004': {
    id: 'CP-COMP-004',
    escenario: 'Adjunto mayor a 4 MB',
    pasos:
      '1. Abrir el modal "Nueva compra". 2. Seleccionar un archivo de ~5 MB en "Adjunto opcional (imagen o PDF, máx. 4 MB)". 3. Revisar el toast y el estado del adjunto. 4. Cerrar el modal',
    requisitos: 'Modal "Nueva compra" abierto; archivo temporal de ~5 MB generado por la suite',
    datos:
      'Archivo AdjuntoGrande_CP.pdf en el temporal del sistema (5 MB, Buffer.alloc); se borra en el finally',
    esperado:
      'Toast "Adjunto muy grande" / "El archivo no puede superar 4 MB"; el archivo no se adjunta (no aparece su nombre en el modal)',
  },
  'CP-COMP-005': {
    id: 'CP-COMP-005',
    escenario: 'Anulación de compra con devolución de stock',
    pasos:
      '1. Sincronizar la compra de CP-COMP-001 (el motor de sync está detenido: se usa sincronizarEvento). 2. Ir a #/compras. 3. Clic en anular de la compra completada. 4. Revisar el modal "Anular compra". 5. Escribir motivo. 6. Clic en "Anular compra"',
    requisitos:
      'Usuario con permiso compras/eliminar, red disponible, compra de CP-COMP-001 ya sincronizada (SYNCED)',
    datos:
      'Compra de CP-COMP-001 (folio anotado en el caso); motivo de anulación "Anulación E2E CP"',
    esperado:
      'Confirmación "¿Anular la compra XXXXXXXX por Q…? El stock se devolverá a la sucursal."; toast "Compra anulada" / "El stock fue devuelto a la sucursal"; estado en anulada; el stock del servidor vuelve al inicial',
  },
  'CP-COMP-006': {
    id: 'CP-COMP-006',
    escenario: 'Registrar compra sin conexión',
    pasos:
      '1. Abrir #/compras con red. 2. Cortar la red. 3. Volver a entrar a #/compras (alerta offline). 4. Registrar una compra válida',
    requisitos:
      'Chunk lazy de #/compras ya cargado con red; catálogo y proveedor hidratados en IndexedDB',
    datos:
      'Proveedor "Proveedor E2E CP"; producto "llave inlgesa"; cantidad 1, precio unitario Q15.00; red cortada por CDP',
    esperado:
      'Toast "Compra registrada" / "Sin conexión: guardada localmente (cola PENDING)"; la fila muestra el badge "sin sincronizar"; alerta "Sin conexión: estás viendo los registros locales. El alta de compras y entradas sigue permitida."',
  },
  'CP-COMP-007': {
    id: 'CP-COMP-007',
    escenario: 'Intento de anular compra pendiente de sync',
    pasos:
      '1. Con la red aún cortada, clic en anular de la compra PENDING de CP-COMP-006. 2. Revisar el toast y que NO se abra el confirm. 3. Borrar la compra local + detalle + eventos de cola con script (red aún cortada). 4. Recargar el listado. 5. Restaurar la red',
    requisitos: 'Compra local con sync_status PENDING (badge "sin sincronizar") y red cortada',
    datos:
      'Compra offline de CP-COMP-006 (id anotado en el caso); el script borra compras, detalle_compra y cola_sincronizacion',
    esperado:
      'El sistema bloquea la acción con toast "Compra local sin sincronizar" / "Todavía no existe en el servidor…"; la compra no cambia de estado y, tras la limpieza local, desaparece del listado sin dejar eventos PENDING',
  },
  'CP-COMP-008': {
    id: 'CP-COMP-008',
    escenario: 'Filtros, pestañas y paginación',
    pasos:
      '1. Ir a #/compras. 2. Alternar pestañas "Compras" y "Entradas". 3. Buscar "Buscar por proveedor o producto...". 4. Filtrar por estado. 5. Recargar con el botón "Recargar listado"',
    requisitos:
      'Sucursal sin compras ni entradas registradas al inicio de la suite (verificado por REST: get_compras y get_entradas devuelven total 0)',
    datos:
      'Búsqueda sin coincidencias: "zzz_sin_coincidencias_cp"; estados: Todos los estados / Completadas / Anuladas',
    esperado:
      'Cada pestaña muestra sus columnas y su vacío propio ("No hay compras registradas" / "No hay entradas registradas"); filtros y paginación de 50 por página funcionan',
  },
  'CP-COMP-009': {
    id: 'CP-COMP-009',
    escenario: 'Visualización del comprobante de compra',
    pasos:
      '1. Ir a #/compras. 2. Clic en el ícono de archivo de una compra. 3. Verificar "Cerrar", "Ticket 80 mm" y "Carta". 4. Clic en "Cerrar" (no se pulsa nada que dispare window.print nativo)',
    requisitos: 'Compra existente en el listado (la de CP-COMP-001, sin adjunto)',
    datos:
      'Compra de CP-COMP-001 sin adjunto → ticket armado desde IndexedDB; "Ticket 80 mm" y "Carta" llaman a window.print() (diálogo nativo) y NO se pulsan en automation',
    esperado:
      'El modal muestra el adjunto local o el ticket con MarcaAguaComprobante; los botones "Cerrar", "Ticket 80 mm" y "Carta" funcionan (PDF: "Abrir en pestaña")',
  },
  'CP-COMP-010': {
    id: 'CP-COMP-010',
    escenario: 'Permisos de creación y visualización',
    pasos:
      '1. Con compras/crear=false en el rol Gerente: entrar a #/compras y revisar "Nueva compra" y "Nueva entrada". 2. Con compras/ver=false: intentar entrar a #/compras. 3. Verificar que los permisos quedaron restaurados',
    requisitos:
      'Red disponible (los permisos se re-consultan con red); permisoTemporal restaura el estado previo en su finally',
    datos:
      'Rol Gerente 3cf414b4-156f-40d2-a6a2-715ad8113283 con compras/crear=false y luego compras/ver=false (temporales)',
    esperado:
      'Sin crear: los botones quedan deshabilitados u ocultos. Sin ver: redirige a #/dashboard. Restaurados: el botón "Nueva compra" vuelve a habilitarse',
  },
}

// ------------------------- helpers de la vista -------------------------

/** XPath del modal abierto (el último) cuyo título contiene `titulo`. */
const modal = (titulo) =>
  `(//div[contains(@class,'modal') and contains(@class,'show')]` +
  `[.//*[contains(@class,'modal-title')][contains(.,'${titulo}')]])[last()]`

/** Escribe en un input/select de React (controlled) con el setter nativo. */
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

/** Valor de la opción cuyo texto contiene `texto` en el select `selector`. */
async function valorOpcion(driver, selector, texto) {
  return driver.executeScript(
    `
    const sel = document.evaluate(arguments[0], document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
      .singleNodeValue
    if (!sel) return null
    const o = [...sel.options].find((x) => (x.textContent || '').includes(arguments[1]))
    return o ? o.value : null
  `,
    selector,
    texto,
  )
}

/** Selecciona en `selector` la opción cuyo texto contiene `texto`. */
async function seleccionarPorTexto(driver, selector, texto) {
  const v = await valorOpcion(driver, selector, texto)
  check(v, `el select ${selector} no contiene la opción "${texto}"`)
  await escribir(driver, selector, v)
  return v
}

/** Texto visible de los toasts activos (título + mensaje), unidos por " | ". */
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
async function esperarToast(driver, texto, ms = 9000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const t = await leerToasts(driver)
    if (t && t.includes(texto)) return t
    await sleep(250)
  }
  return ''
}

/** Estado del listado actual (columnas, filas, contador, vacío, alertas). */
async function leerListado(driver) {
  return driver.executeScript(`
    const txt = document.body.innerText || ''
      const hdr = document.querySelector('.card-header')
      const inp = document.querySelector('.card-body input[placeholder]')
      const sel = document.querySelector('.card-body select')
    return {
      hash: location.hash,
      headers: [...document.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
      filas: [...document.querySelectorAll('tbody tr')].map((tr) =>
        (tr.innerText || '').replace(/\\s+/g, ' ').trim(),
      ),
      contador: (txt.match(/\\b\\d+\\s+(compras?|entradas?)\\b/) || [''])[0],
      contadorNodos: [...document.querySelectorAll('div,span')]
        .filter(
          (e) =>
            e.children.length === 0 &&
            /\\d/.test(e.textContent || '') &&
            /compra|entrada/i.test(e.textContent || ''),
        )
        .slice(0, 6)
        .map((e) => (e.textContent || '').trim()),
      vacio: /No hay compras registradas|No hay entradas registradas/.test(txt),
      placeholder: inp ? inp.getAttribute('placeholder') : null,
      filtro: sel ? [...sel.options].map((o) => (o.textContent || '').trim()) : [],
      alertas: [...document.querySelectorAll('.alert')].map((a) =>
        (a.innerText || '').replace(/\\s+/g, ' ').trim(),
      ),
      botones: [...document.querySelectorAll('.card button')].map((b) => (b.textContent || '').trim()),
      cargando: document.querySelectorAll('.spinner-border').length > 0,
    }
  `)
}

/**
 * Espera a que aparezca una fila cuyo texto contenga TODOS los textos pedidos.
 * `textos` puede ser un string o un array (útil para no confundir la fila de
 * esta corrida con la que dejó una corrida anterior).
 */
async function esperarFila(driver, textos, ms = 12000) {
  const lista = Array.isArray(textos) ? textos : [textos]
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const r = await driver.executeScript(
      `
      const buscados = arguments[0]
      const rows = [...document.querySelectorAll('tbody tr')].filter((tr) => {
        const t = tr.innerText || ''
        return buscados.every((x) => t.includes(x))
      })
      return rows.length
        ? { n: rows.length, texto: rows[0].innerText.replace(/\\s+/g, ' ').trim() }
        : null
    `,
      lista,
    )
    if (r) return r
    await sleep(300)
  }
  return null
}

/** Estado del botón cuyo texto contiene `etiqueta` ({existe, disabled}). */
async function estadoBoton(driver, etiqueta) {
  return driver.executeScript(
    `
    const b = [...document.querySelectorAll('button')].find((x) => (x.innerText || '').includes(arguments[0]))
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

/** Espera a que no queden spinners de carga en la página. */
async function esperarCarga(driver, ms = 12000) {
  try {
    await driver.wait(
      async () =>
        (await driver.executeScript(
          'return document.querySelectorAll(".spinner-border").length',
        )) === 0,
      ms,
      300,
    )
    return true
  } catch (e) {
    return false
  }
}

// --------------------- helpers de datos (IndexedDB) ---------------------

/** Espera a que el login hidrate el catálogo local (o lo fuerza). */
async function esperarCatalogo(driver) {
  for (let i = 0; i < 25; i++) {
    const r = await script(
      driver,
      `
      const { db } = await import('/src/lib/db.js')
      return {
        productos: await db.productos.count(),
        stocks: await db.productos_sucursal.count(),
        proveedores: await db.proveedores.count(),
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

/** Lee el stock local de "llave inlgesa" en la sucursal de la sesión. */
async function leerStock(driver) {
  const sesion = await driver.executeScript(
    "return JSON.parse(localStorage.getItem('currentUser') || 'null')",
  )
  const idSuc = sesion && sesion.id_sucursal ? sesion.id_sucursal : ''
  if (!idSuc) return { error: 'sin id_sucursal en localStorage.currentUser' }
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const idSucursal = arguments[0]
    const prods = await db.productos.toArray()
    const p = prods.find((x) => String(x.name || '').toLowerCase().includes('llave'))
    if (!p) return { error: 'el producto llave no está en IndexedDB' }
    const f = await db.productos_sucursal.get([idSucursal, p.id])
    if (!f) return { error: 'sin fila de stock en la sucursal activa' }
    return { idSucursal, idProducto: p.id, nombre: p.name, stock: f.stock, min: f.stock_minimo }
  `,
    idSuc,
  )
}

/** Lee el stock del servidor (get_productos_admin) para la sucursal activa. */
async function leerStockServidor(driver) {
  return script(
    driver,
    `
    const { supabase } = await import('/src/lib/supabase.js')
    const empresaId = localStorage.getItem('empresaSeleccionada')
    const { data, error } = await supabase.rpc('get_productos_admin', { p_id_empresa: empresaId })
    if (error) return { error: error.message }
    const p = (data.productos || []).find((x) => String(x.name || '').toLowerCase().includes('llave'))
    if (!p) return { error: 'producto no encontrado en el servidor' }
    const f = (p.stock || []).find((s) => s.id_sucursal === arguments[0])
    return { stock: f ? f.stock : null, min: f ? f.stock_minimo : null }
  `,
    STOCK_INICIAL ? STOCK_INICIAL.idSucursal : '',
  )
}

/** Restaura el stock local al valor inicial (idempotente). */
async function restaurarStockLocal(driver) {
  if (!STOCK_INICIAL || STOCK_INICIAL.error) return { omitido: 'sin stock inicial' }
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const k = [arguments[0], arguments[1]]
    const f = await db.productos_sucursal.get(k)
    if (!f) return { error: 'la fila de stock ya no existe' }
    if (f.stock === arguments[2]) return { ok: true, sinCambios: true, stock: f.stock }
    await db.productos_sucursal.put({ ...f, stock: arguments[2] })
    const g = await db.productos_sucursal.get(k)
    return { ok: g.stock === arguments[2], antes: f.stock, stock: g.stock }
  `,
    STOCK_INICIAL.idSucursal,
    STOCK_INICIAL.idProducto,
    STOCK_INICIAL.stock,
  )
}

/** Restaura el stock del servidor si difiere del inicial (deriva final 0). */
async function restaurarStockServidor(driver) {
  if (!STOCK_INICIAL || STOCK_INICIAL.error) return { omitido: 'sin stock inicial' }
  const actual = await leerStockServidor(driver)
  if (actual.error) return { error: actual.error }
  if (actual.stock === STOCK_INICIAL.stock) {
    return { ok: true, sinCambios: true, stock: actual.stock }
  }
  return script(
    driver,
    `
    const { supabase } = await import('/src/lib/supabase.js')
    const antes = arguments[4]
    const { error } = await supabase.rpc('upsert_producto_sucursal', {
      p_id_producto: arguments[0],
      p_id_sucursal: arguments[1],
      p_stock: arguments[2],
      p_stock_minimo: arguments[3],
    })
    if (error) return { error: error.message }
    const { data } = await supabase.rpc('get_productos_admin', {
      p_id_empresa: localStorage.getItem('empresaSeleccionada'),
    })
    const p = (data.productos || []).find((x) => String(x.name || '').toLowerCase().includes('llave'))
    const f = (p.stock || []).find((s) => s.id_sucursal === arguments[1])
    return { ok: true, antes, stock: f ? f.stock : null }
  `,
    STOCK_INICIAL.idProducto,
    STOCK_INICIAL.idSucursal,
    STOCK_INICIAL.stock,
    STOCK_INICIAL.min,
    actual.stock,
  )
}

/** Resumen de compras locales + eventos de cola (asserts y limpieza). */
async function estadoCompras(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const cs = await db.compras.toArray()
    const evs = await db.cola_sincronizacion.where('tabla').equals('compras').toArray()
    return {
      compras: cs.length,
      pendientes: evs.filter((e) => e.sync_status === 'PENDING').length,
      filas: cs.map((c) => ({ id: c.id, estado: c.estado, sync: c.sync_status, total: c.total })),
    }
  `,
  )
}

/** Sincroniza los eventos PENDING de `tabla` (opcionalmente solo uno). */
async function sincronizarCola(driver, tabla, idRegistro) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const { sincronizarEvento } = await import('/src/services/colaSyncService.js')
    const evs = await db.cola_sincronizacion.where('tabla').equals(arguments[0]).toArray()
    const pend = evs.filter(
      (e) => e.sync_status === 'PENDING' && (!arguments[1] || e.id_registro === arguments[1]),
    )
    const resultados = []
    for (const e of pend) resultados.push({ id: e.id, ...(await sincronizarEvento(e.id)) })
    return { pendientes: pend.length, resultados }
  `,
    tabla,
    idRegistro || null,
  )
}

/** Borra una compra local + su detalle + sus eventos de cola. */
async function borrarCompraLocal(driver, idCompra) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const id = arguments[0]
    const c = await db.compras.get(id)
    const dets = await db.detalle_compra.where('id_compra').equals(id).toArray()
    await db.detalle_compra.where('id_compra').equals(id).delete()
    await db.compras.delete(id)
    const evs = (await db.cola_sincronizacion.where('tabla').equals('compras').toArray()).filter(
      (e) => e.id_registro === id,
    )
    await db.cola_sincronizacion.bulkDelete(evs.map((e) => e.id))
    return { existia: !!c, detalle: dets.length, eventos: evs.length }
  `,
    idCompra,
  )
}

/** Borra las entradas de prueba de la suite (local) + sus eventos de cola. */
async function borrarEntradasDePrueba(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const ents = await db.entradas.toArray()
    const mias = ents.filter((e) => String(e.motivo || '').trim() === arguments[0])
    const ids = mias.map((e) => e.id)
    const evs = (await db.cola_sincronizacion.where('tabla').equals('entradas').toArray()).filter(
      (e) => ids.includes(e.id_registro),
    )
    await db.cola_sincronizacion.bulkDelete(evs.map((e) => e.id))
    await db.entradas.bulkDelete(ids)
    return { entradas: mias.length, eventos: evs.length }
  `,
    MOTIVO_ENTRADA,
  )
}

/**
 * Totales reales del servidor para la sucursal activa (get_compras/get_entradas).
 * Se usan para que los contadores del listado se comparen contra el servidor y
 * la suite pueda re-ejecutarse sobre una BD que ya dejó datos de una corrida.
 */
async function serverTotals(driver) {
  return script(
    driver,
    `
    const { supabase } = await import('/src/lib/supabase.js')
    const sesion = JSON.parse(localStorage.getItem('currentUser') || '{}')
    const idSucursal = sesion && sesion.id_sucursal ? sesion.id_sucursal : null
    if (!idSucursal) return { error: 'sin id_sucursal en la sesión' }
    const [c, e] = await Promise.all([
      supabase.rpc('get_compras', {
        p_id_sucursal: idSucursal,
        p_estado: null,
        p_desde: null,
        p_hasta: null,
        p_busqueda: null,
        p_limite: 50,
        p_offset: 0,
      }),
      supabase.rpc('get_entradas', {
        p_id_sucursal: idSucursal,
        p_desde: null,
        p_hasta: null,
        p_busqueda: null,
        p_limite: 50,
        p_offset: 0,
      }),
    ])
    if (c.error) return { error: 'get_compras: ' + c.error.message }
    if (e.error) return { error: 'get_entradas: ' + e.error.message }
    return { compras: c.data?.total ?? null, entradas: e.data?.total ?? null }
  `,
  )
}

/** Contador singular/plural que renderiza la vista ("1 compra" / "2 compras"). */
function textoContador(n, esCompras) {
  const base = esCompras ? 'compra' : 'entrada'
  return `${n} ${base}${n === 1 ? '' : 's'}`
}

/**
 * Limpia en IndexedDB lo que dejó una corrida anterior de ESTA suite (compras
 * del proveedor de prueba y entradas con el motivo de prueba) para que los
 * contadores locales sean deterministas. No toca el stock ni el servidor.
 */
async function limpiarLocales(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const motivo = arguments[0]
    const nombreProv = arguments[1]

    const evs0 = await db.cola_sincronizacion.toArray()
    const ents = await db.entradas.toArray()
    const misEnts = ents.filter((e) => String(e.motivo || '').trim() === motivo)
    const idsEnts = misEnts.map((e) => e.id)
    const evEnts = evs0.filter((e) => e.tabla === 'entradas' && idsEnts.includes(e.id_registro))

    const provs = await db.proveedores.toArray()
    const idsProv = new Set(provs.filter((p) => p.name === nombreProv).map((p) => p.id))
    const cs = await db.compras.toArray()
    const misCs = cs.filter((c) => idsProv.has(c.id_proveedor))
    const idsCs = misCs.map((c) => c.id)
    const evCs = evs0.filter((e) => e.tabla === 'compras' && idsCs.includes(e.id_registro))

    await db.cola_sincronizacion.bulkDelete([...evEnts, ...evCs].map((e) => e.id))
    if (idsCs.length) await db.detalle_compra.where('id_compra').anyOf(idsCs).delete()
    await db.compras.bulkDelete(idsCs)
    await db.entradas.bulkDelete(idsEnts)

    return {
      entradasBorradas: misEnts.length,
      comprasBorradas: misCs.length,
      eventosBorrados: evEnts.length + evCs.length,
      comprasRestantes: await db.compras.count(),
      entradasRestantes: await db.entradas.count(),
      colaRestante: await db.cola_sincronizacion.count(),
    }
  `,
    MOTIVO_ENTRADA,
    NOMBRE_PROVEEDOR,
  )
}

/** Crea el proveedor de prueba por UI y hidrata el catálogo local. */
async function crearProveedorPrueba(driver) {
  await navegar(driver, '#/catalogos', 2500)
  await driver.wait(until.elementLocated(By.xpath("//*[contains(text(),'Catálogos')]")), 12000)
  await clicTexto(driver, 'Proveedores')
  await driver.sleep(900)

  if (!(await existe(driver, NOMBRE_PROVEEDOR))) {
    const btn = await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space()='Proveedor']")),
      9000,
    )
    await btn.click()
    await driver.wait(
      until.elementLocated(By.xpath(`${modal('Nueva Proveedor')}//input[@name='name']`)),
      8000,
    )
    await escribir(driver, `${modal('Nueva Proveedor')}//input[@name='name']`, NOMBRE_PROVEEDOR)
    await clicTexto(driver, 'Crear')
    const t = await esperarToast(driver, 'Proveedor')
    check(t, 'no apareció el toast de alta del proveedor en #/catalogos')
    check(t.includes('Proveedor creada'), `se esperaba "Proveedor creada" y se observó: "${t}"`)
    await esperarToasts(driver, 8000)
  }
  check(
    await existe(driver, NOMBRE_PROVEEDOR),
    `el proveedor "${NOMBRE_PROVEEDOR}" no aparece en el listado de #/catalogos`,
  )

  // El alta en #/catalogos solo escribe en el servidor: el modal de Compras lee
  // IndexedDB, así que hay que volver a hidratar el catálogo local.
  const sesion = await driver.executeScript(
    "return JSON.parse(localStorage.getItem('currentUser') || 'null')",
  )
  const idSuc = sesion && sesion.id_sucursal ? sesion.id_sucursal : ''
  const r = await script(
    driver,
    `
    const { hidratarCatalogoParaSucursal } = await import('/src/services/catalogSyncService.js')
    const n = await hidratarCatalogoParaSucursal(arguments[0])
    const { db } = await import('/src/lib/db.js')
    const ps = await db.proveedores.toArray()
    return { forzado: n, proveedores: ps.map((p) => ({ id: p.id, name: p.name })) }
  `,
    idSuc,
  )
  let fila = r && !r.error ? (r.proveedores || []).find((p) => p.name === NOMBRE_PROVEEDOR) : null
  if (!fila) {
    // Respaldo: si get_productos_admin no devolvió el proveedor nuevo, se siembra
    // el espejo local con la fila que el servidor ya confirmó.
    const empresaId = await driver.executeScript(
      "return localStorage.getItem('empresaSeleccionada')",
    )
    const idRemoto = await valorRemotoProveedor(driver, empresaId)
    if (idRemoto) {
      await script(
        driver,
        `
        const { db } = await import('/src/lib/db.js')
        await db.proveedores.put({ id: arguments[0], id_empresa: arguments[1], name: arguments[2] })
        return { ok: true }
      `,
        idRemoto,
        empresaId,
        NOMBRE_PROVEEDOR,
      )
      fila = { id: idRemoto, name: NOMBRE_PROVEEDOR }
    }
  }
  check(fila, `el proveedor "${NOMBRE_PROVEEDOR}" no quedó en el catálogo local (IndexedDB)`)
  ID_PROVEEDOR = fila.id
  return fila
}

/** id del proveedor de prueba leyendo el servidor (get_catalogos). */
async function valorRemotoProveedor(driver, empresaId) {
  const r = await script(
    driver,
    `
    const { supabase } = await import('/src/lib/supabase.js')
    const { data, error } = await supabase.rpc('get_catalogos', { p_id_empresa: arguments[0] })
    if (error) return { error: error.message }
    const p = (data.proveedores || []).find((x) => x.name === arguments[1])
    return p ? { id: p.id } : null
  `,
    empresaId,
    NOMBRE_PROVEEDOR,
  )
  return r && !r.error && r.id ? r.id : null
}

/** Elimina el proveedor de prueba en el finally (UI primero, RPC de respaldo). */
async function eliminarProveedorPrueba(driver) {
  const res = { ui: false, rpc: false, motivo: null }
  try {
    await navegar(driver, '#/catalogos', 2500)
    await driver.wait(until.elementLocated(By.xpath("//*[contains(text(),'Catálogos')]")), 10000)
    await clicTexto(driver, 'Proveedores')
    await driver.sleep(900)
    if (await existe(driver, NOMBRE_PROVEEDOR)) {
      let btns = await driver.findElements(
        By.xpath(
          `//div[contains(@class,'border') and .//strong[normalize-space()='${NOMBRE_PROVEEDOR}']]//button[@title='Eliminar']`,
        ),
      )
      if (!btns.length) btns = await driver.findElements(By.xpath("//button[@title='Eliminar']"))
      if (btns.length) {
        await btns[0].click()
        await driver.wait(
          until.elementLocated(
            By.xpath("//*[contains(@class,'modal-title')][contains(., 'Confirmar')]"),
          ),
          7000,
        )
        await clicTexto(driver, 'Eliminar')
        const t = await esperarToast(driver, 'Elimin', 9000)
        if (t.includes('Registro eliminado')) res.ui = true
        else res.motivo = `UI: ${t || 'sin toast'}`
        await esperarToasts(driver, 8000)
      } else {
        res.motivo = 'UI: no se encontró el botón Eliminar de la fila'
      }
    } else {
      res.ui = true
      res.motivo = 'ya no existía en el listado'
    }
  } catch (e) {
    res.motivo = `UI: ${String((e && e.message) || e).split('\n')[0]}`
  }

  if (!res.ui) {
    const r = await script(
      driver,
      `
      const { supabase } = await import('/src/lib/supabase.js')
      const { data, error } = await supabase.rpc('get_catalogos', {
        p_id_empresa: localStorage.getItem('empresaSeleccionada'),
      })
      if (error) return { error: error.message }
      const p = (data.proveedores || []).find((x) => x.name === arguments[0])
      if (!p) return { ok: true, yaNoExiste: true }
      const r2 = await supabase.rpc('delete_catalogo', { p_tabla: 'proveedor', p_id: p.id })
      return r2.error ? { error: r2.error.message } : { ok: true }
    `,
      NOMBRE_PROVEEDOR,
    )
    if (r && r.ok) res.rpc = true
    else res.motivo = `${res.motivo || ''} · RPC: ${JSON.stringify(r)}`
  }
  PROVEEDOR_BORRADO = res.ui || res.rpc
  return res
}

// ---------------------- helpers de UI de #/compras ----------------------

/** Abre #/compras y espera a que el listado deje de cargar (devuelve el estado). */
/**
 * Espera a que el listado se asiente: sin spinner Y con la tabla renderizada
 * (o con el estado vacío propio), para no leer cabeceras/filas a medio montar.
 */
async function esperarAsentado(driver, ms = 15000) {
  try {
    await driver.wait(
      async () => {
        try {
          return (
            (await driver.executeScript(`
              const spinner = document.querySelectorAll('.spinner-border').length
              const cols = document.querySelectorAll('.table-responsive thead th').length
              const txt = document.body.innerText || ''
              const vacio =
                txt.includes('No hay compras registradas') || txt.includes('No hay entradas registradas')
              return spinner === 0 && (cols > 0 || vacio)
            `)) === true
          )
        } catch (e) {
          return false
        }
      },
      ms,
      400,
    )
    return true
  } catch (e) {
    return false
  }
}

async function abrirCompras(driver, ms = 3000) {
  await navegar(driver, '#/compras', ms)
  await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'Compras y entradas')]")), 15000)
  await esperarCarga(driver)
  await esperarAsentado(driver)
  return leerListado(driver)
}

/** innerText del modal abierto cuyo título contiene `titulo` ('' si no está). */
async function textoModal(driver, titulo) {
  return driver.executeScript(
    `
    const ms = [...document.querySelectorAll('.modal.show')].filter((m) =>
      (m.innerText || '').includes(arguments[0]),
    )
    const m = ms[ms.length - 1]
    return m ? m.innerText : ''
  `,
    titulo,
  )
}

/** Clic en el botón con `title=` dentro de la fila que contiene TODOS los textos. */
async function clicBotonFila(driver, textos, tituloBoton) {
  const lista = Array.isArray(textos) ? textos : [textos]
  return driver.executeScript(
    `
    const buscados = arguments[0]
    const filas = [...document.querySelectorAll('tbody tr')].filter((tr) => {
      const t = tr.innerText || ''
      return buscados.every((x) => t.includes(x))
    })
    if (!filas.length) return 'sin fila con ' + JSON.stringify(buscados)
    const b = filas[0].querySelector('button[title="' + arguments[1] + '"]')
    if (!b) return 'sin botón title=' + arguments[1] + ' en la fila'
    b.click()
    return 'ok'
  `,
    lista,
    tituloBoton,
  )
}

/** Escribe en el input de búsqueda del listado y espera el debounce + refetch. */
async function escribirBusqueda(driver, texto) {
  const ok = await driver.executeScript(
    `
    const i = document.querySelector('.card-body input[placeholder]')
    if (!i) return false
    i.focus()
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
      i,
      arguments[0],
    )
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  `,
    texto,
  )
  check(ok, 'no se encontró el input de búsqueda del listado')
  await driver.sleep(1500)
  return true
}

/** Cambia el filtro de estado del listado (solo pestaña Compras). */
async function filtrarEstado(driver, textoOpcion) {
  const ok = await driver.executeScript(
    `
    const sel = document.querySelector('.card-body select')
    if (!sel) return false
    const o = [...sel.options].find((x) => (x.textContent || '').trim() === arguments[0])
    if (!o) return false
    sel.focus()
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(
      sel,
      o.value,
    )
    sel.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  `,
    textoOpcion,
  )
  check(ok, `el filtro de estado no tiene la opción "${textoOpcion}"`)
  await driver.sleep(1400)
  return leerListado(driver)
}

/** Espera (máx. `ms`) a que el modal con ese título tenga texto visible. */
async function esperarModal(driver, titulo, ms = 8000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const t = await textoModal(driver, titulo)
    if (t.trim()) return t
    await sleep(250)
  }
  return ''
}

/** Estado de las entradas locales + eventos de cola de la tabla entradas. */
async function estadoEntradas(driver) {
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const es = await db.entradas.toArray()
    const evs = await db.cola_sincronizacion.where('tabla').equals('entradas').toArray()
    return {
      entradas: es.length,
      pendientes: evs.filter((e) => e.sync_status === 'PENDING').length,
      filas: es.map((e) => ({
        id: e.id,
        motivo: e.motivo,
        cantidad: e.cantidad,
        sync: e.sync_status,
      })),
    }
  `,
  )
}

/** Botones del modal abierto con ese título: [{t, vis, dis}] ([] si no está). */
async function botonesModal(driver, titulo) {
  return driver.executeScript(
    `
    const ms = [...document.querySelectorAll('.modal.show')].filter((m) =>
      (m.innerText || '').includes(arguments[0]),
    )
    const m = ms[ms.length - 1]
    if (!m) return []
    return [...m.querySelectorAll('button')].map((b) => ({
      t: (b.innerText || '').replace(/\\s+/g, ' ').trim(),
      vis: b.getClientRects().length > 0 && !b.disabled,
      dis: !!b.disabled,
    }))
  `,
    titulo,
  )
}

/** Clic en un botón POR TEXTO dentro del modal con ese título (JS, sin espera de visibilidad). */
async function clicBotonModal(driver, titulo, texto) {
  return driver.executeScript(
    `
    const ms = [...document.querySelectorAll('.modal.show')].filter((m) =>
      (m.innerText || '').includes(arguments[0]),
    )
    const m = ms[ms.length - 1]
    if (!m) return 'sin modal'
    const b = [...m.querySelectorAll('button')].find((x) =>
      (x.innerText || '').includes(arguments[1]),
    )
    if (!b) return 'sin botón ' + arguments[1]
    b.click()
    return 'ok'
  `,
    titulo,
    texto,
  )
}

/** True si el modal con ese título sigue abierto. */
async function modalAbierto(driver, titulo, ms = 6000) {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    const t = await textoModal(driver, titulo)
    if (!t.trim()) return false
    await sleep(300)
  }
  return true
}

async function main() {
  let driver = null
  try {
    driver = await crearDriver()
    await login(driver)

    // --- entorno: catálogo local, limpieza de corridas previas y stock inicial ---
    try {
      const cat = await esperarCatalogo(driver)
      console.log('  · catálogo local:', JSON.stringify(cat))
      const limp = await limpiarLocales(driver)
      console.log('  · limpieza local de corridas anteriores:', JSON.stringify(limp))
      COMPRAS_BASE = limp.comprasRestantes || 0
      ENTRADAS_BASE = limp.entradasRestantes || 0
      STOCK_INICIAL = await leerStock(driver)
      console.log('  · stock inicial "llave inlgesa":', JSON.stringify(STOCK_INICIAL))
      TOTALES_INICIALES = await serverTotals(driver)
      console.log('  · totales del servidor al inicio:', JSON.stringify(TOTALES_INICIALES))
    } catch (e) {
      console.log('  · aviso catálogo:', String(e).split('\n')[0])
    }
    check(
      STOCK_INICIAL && !STOCK_INICIAL.error,
      `no se pudo leer el stock inicial: ${JSON.stringify(STOCK_INICIAL)}`,
    )
    check(
      TOTALES_INICIALES && !TOTALES_INICIALES.error,
      `no se pudieron leer los totales del servidor: ${JSON.stringify(TOTALES_INICIALES)}`,
    )

    const det = await script(
      driver,
      `const m = await import('/src/services/syncEngineService.js')
       m.detenerMotorSync()
       return { ok: true }`,
    )
    check(det && !det.error, `no se pudo detener el motor de sync: ${JSON.stringify(det)}`)
    MOTOR_DETENIDO = true
    console.log('  · motor de sincronización detenido (la cola solo avanza con sincronizarCola)')

    // se abren los chunks lazy con red ANTES de cualquier caso offline
    await abrirCompras(driver, 3000)
    await navegar(driver, '#/catalogos', 2500)
    await navegar(driver, '#/dashboard', 1500)

    // --- CP-COMP-008: filtros, pestañas y paginación (listado vacío) ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-008'], async () => {
      const tot = await serverTotals(driver)
      check(tot && !tot.error, `no se pudieron leer los totales: ${JSON.stringify(tot)}`)
      TOTALES_INICIALES = tot
      const nC = tot.compras
      const nE = tot.entradas
      const v = await abrirCompras(driver)
      // con el listado vacío la vista NO renderiza <table>: las columnas se
      // verifican en CP-COMP-001/002 en cuanto hay filas
      let colsCompras = 'la vista vacía no renderiza <table> (columnas verificadas en CP-COMP-001)'
      if (v.filas.length > 0) {
        const faltan = COLUMNAS_COMPRAS.filter((c) => !v.headers.includes(c))
        check(
          faltan.length === 0,
          `faltan columnas de Compras: ${faltan.join(', ')} (observadas: ${v.headers.join(' | ')})`,
        )
        colsCompras = `columnas ${v.headers.join(', ')}`
      }
      check(
        v.contador === textoContador(nC, true),
        `el contador debía decir "${textoContador(nC, true)}" y dice "${v.contador}" · ` +
          `diagnóstico: ${JSON.stringify({
            cargando: v.cargando,
            filas: v.filas,
            vacio: v.vacio,
            headers: v.headers,
            contadorNodos: v.contadorNodos,
            hash: v.hash,
            alertas: v.alertas,
          })}`,
      )
      check(
        nC === 0 ? v.vacio && v.filas.length === 0 : !v.vacio && v.filas.length > 0,
        nC === 0
          ? `se esperaba el vacío "No hay compras registradas" y se observaron ${v.filas.length} fila(s)`
          : `con ${nC} compra(s) en el servidor el listado mostró ${v.filas.length} fila(s) (vacío=${v.vacio})`,
      )
      check(
        v.placeholder === PLACEHOLDER_COMPRAS,
        `placeholder "${v.placeholder}" ≠ "${PLACEHOLDER_COMPRAS}"`,
      )
      check(
        JSON.stringify(v.filtro) ===
          JSON.stringify(['Todos los estados', 'Completadas', 'Anuladas']),
        `filtro de estados inesperado: ${JSON.stringify(v.filtro)}`,
      )
      check(!v.cargando, 'el listado quedó en spinner')

      await escribirBusqueda(driver, BUSQUEDA_SIN_MATCH)
      const sinMatch = await leerListado(driver)
      check(
        sinMatch.filas.length === 0,
        `la búsqueda "${BUSQUEDA_SIN_MATCH}" devolvió ${sinMatch.filas.length} fila(s)`,
      )
      check(sinMatch.vacio, 'la búsqueda sin coincidencias no mostró el estado vacío')
      await escribirBusqueda(driver, '')

      const fCompletadas = await filtrarEstado(driver, 'Completadas')
      const fAnuladas = await filtrarEstado(driver, 'Anuladas')
      const fTodas = await filtrarEstado(driver, 'Todos los estados')
      const esContadorCompras = (t) => /^\d+ compras?$/.test(String(t))
      check(
        esContadorCompras(fCompletadas.contador) &&
          esContadorCompras(fAnuladas.contador) &&
          esContadorCompras(fTodas.contador),
        `los filtros dejaron contadores inválidos: ${JSON.stringify([
          fCompletadas.contador,
          fAnuladas.contador,
          fTodas.contador,
        ])}`,
      )
      check(
        fTodas.contador === textoContador(nC, true),
        `al volver a "Todos los estados" el contador quedó "${fTodas.contador}" (esperado "${textoContador(nC, true)}")`,
      )
      if (nC === 0) {
        check(
          fCompletadas.contador === '0 compras' && fAnuladas.contador === '0 compras',
          `con la BD vacía los filtros devolvieron ${JSON.stringify([
            fCompletadas.contador,
            fAnuladas.contador,
          ])}`,
        )
      }
      const notaFiltros =
        `Todos los estados → ${fTodas.contador} · Completadas → ${fCompletadas.contador} · ` +
        `Anuladas → ${fAnuladas.contador}`

      check(await clicPestana(driver, 'Entradas'), 'no se pudo cambiar a la pestaña Entradas')
      await driver.sleep(900)
      const entr = await leerListado(driver)
      let colsEntradas = 'la vista vacía no renderiza <table> (columnas verificadas en CP-COMP-002)'
      if (entr.filas.length > 0) {
        const faltanE = COLUMNAS_ENTRADAS.filter((c) => !entr.headers.includes(c))
        check(
          faltanE.length === 0,
          `faltan columnas de Entradas: ${faltanE.join(', ')} (observadas: ${entr.headers.join(' | ')})`,
        )
        check(
          !entr.headers.includes('Acciones'),
          'la pestaña Entradas no debe tener columna Acciones',
        )
        colsEntradas = `columnas ${entr.headers.join(', ')}`
      }
      check(
        entr.contador === textoContador(nE, false),
        `el contador debía decir "${textoContador(nE, false)}" y dice "${entr.contador}"`,
      )
      check(
        nE === 0 ? entr.vacio && entr.filas.length === 0 : !entr.vacio && entr.filas.length > 0,
        nE === 0
          ? `se esperaba "No hay entradas registradas" y se observaron ${entr.filas.length} fila(s)`
          : `con ${nE} entrada(s) en el servidor el listado mostró ${entr.filas.length} fila(s) (vacío=${entr.vacio})`,
      )
      check(
        entr.placeholder === PLACEHOLDER_ENTRADAS,
        `placeholder de entradas "${entr.placeholder}" ≠ "${PLACEHOLDER_ENTRADAS}"`,
      )
      check(
        entr.filtro.length === 0,
        `la pestaña Entradas no debe mostrar filtro de estado y mostró ${JSON.stringify(entr.filtro)}`,
      )

      check(await clicPestana(driver, 'Compras'), 'no se pudo volver a la pestaña Compras')
      await driver.sleep(800)

      const btn = await driver.findElement(By.css('button[title="Recargar listado"]'))
      await btn.click()
      await esperarCarga(driver)
      const rec = await leerListado(driver)
      check(
        rec.contador === textoContador(nC, true),
        `tras recargar el contador quedó "${rec.contador}" (esperado "${textoContador(nC, true)}")`,
      )

      const estadoVacio =
        nC === 0 && nE === 0
          ? 'estados vacíos propios verificados en ambas pestañas'
          : `la BD ya traía ${textoContador(nC, true)} / ${textoContador(nE, false)} de corridas ` +
            'anteriores de esta misma suite (no hay API para borrar compras del servidor): se ' +
            'verificó la consistencia listado↔servidor en vez del estado vacío'
      return (
        `Compras → ${colsCompras} · Entradas → ${colsEntradas} · ` +
        `placeholder y filtro de estado correctos · ` +
        `búsqueda "${BUSQUEDA_SIN_MATCH}" → 0 filas · ${notaFiltros} · ` +
        `recarga con "Recargar listado" → ${rec.contador} · ${estadoVacio} · ` +
        `sin paginación (total ${nC} < 50 por página)`
      )
    })

    // --- setup: proveedor de prueba (fuera de los 10 casos) ---
    const prov = await crearProveedorPrueba(driver)
    console.log('  · proveedor de prueba:', JSON.stringify(prov))

    // --- CP-COMP-001: registrar una nueva compra ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-001'], async () => {
      await abrirCompras(driver)
      await clicTexto(driver, 'Nueva compra')
      const t0 = await esperarModal(driver, 'Nueva compra', 9000)
      check(t0, 'no abrió el modal "Nueva compra"')
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[1]`, NOMBRE_PROVEEDOR)
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[2]`, NOMBRE_PRODUCTO)
      await escribir(driver, `(${modal('Nueva compra')}//*[@type='number'])[1]`, '1')
      await escribir(driver, `(${modal('Nueva compra')}//*[@placeholder='0.00'])[1]`, '10')
      await clicTexto(driver, 'Agregar')
      const t1 = await textoModal(driver, 'Nueva compra')
      check(
        t1.includes('Total: Q10.00'),
        `el total del modal debía ser "Total: Q10.00" (observado: ${JSON.stringify(t1.match(/Total:.*$/m) || t1.slice(0, 200))})`,
      )
      await clicTexto(driver, 'Registrar compra')
      const toast = await esperarToast(driver, 'Compra registrada')
      check(toast, 'no apareció el toast "Compra registrada"')
      check(
        toast.includes('Guardada en el dispositivo y en cola de sincronización'),
        `mensaje de toast inesperado: "${toast}"`,
      )
      await esperarToasts(driver, 9000)
      const fila = await esperarFila(driver, [NOMBRE_PROVEEDOR, 'sin sincronizar'], 15000)
      check(fila, 'la compra no apareció en el listado con el badge "sin sincronizar"')
      check(
        fila.texto.includes('completada'),
        `la fila no muestra el estado "completada" (fila: "${fila.texto}")`,
      )
      const lst = await leerListado(driver)
      const faltanCols = COLUMNAS_COMPRAS.filter((c) => !lst.headers.includes(c))
      check(
        faltanCols.length === 0,
        `faltan columnas de Compras con filas: ${faltanCols.join(', ')} (observadas: ${lst.headers.join(' | ')})`,
      )
      const est = await estadoCompras(driver)
      check(
        est.compras === COMPRAS_BASE + 1,
        `en IndexedDB hay ${est.compras} compra(s) (baseline ${COMPRAS_BASE} + 1 esperada)`,
      )
      const nueva = est.filas.find((f) => f.sync === 'PENDING')
      check(nueva, `ninguna compra quedó PENDING: ${JSON.stringify(est.filas)}`)
      ID_COMPRA_001 = nueva.id
      TOTAL_001 = nueva.total
      return (
        `modal "Nueva compra" → ${NOMBRE_PROVEEDOR} + 1 × ${NOMBRE_PRODUCTO} → "Total: Q10.00" → ` +
        `toast "${toast}" → fila con badges "completada" y "sin sincronizar"; ` +
        `IndexedDB: ${COMPRAS_BASE} → ${est.compras} compras, la nueva PENDING ` +
        `(id ${ID_COMPRA_001}, total ${TOTAL_001} centavos)`
      )
    })

    // --- CP-COMP-002: entrada manual de mercadería ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-002'], async () => {
      const antes = await leerStock(driver)
      check(!antes.error, `no se pudo leer el stock local: ${antes.error}`)
      await abrirCompras(driver)
      check(await clicPestana(driver, 'Entradas'), 'no se pudo abrir la pestaña Entradas')
      await driver.sleep(900)
      await clicTexto(driver, 'Nueva entrada')
      const t0 = await esperarModal(driver, 'Nueva entrada', 9000)
      check(t0, 'no abrió el modal "Nueva entrada"')
      await seleccionarPorTexto(driver, `(${modal('Nueva entrada')}//select)[1]`, NOMBRE_PRODUCTO)
      // la cantidad se fija ANTES de leer la alerta: "quedará" se recalcula con
      // el valor actual del input (por defecto trae 1)
      await escribir(driver, `(${modal('Nueva entrada')}//*[@type='number'])[1]`, '5')
      await driver.sleep(400)
      const t1 = await textoModal(driver, 'Nueva entrada')
      const m = t1.match(/Stock actual:\s*(\d+)\s*→\s*quedará\s*(\d+)/)
      check(
        m,
        `no se leyó la alerta de stock del modal (texto: ${JSON.stringify(t1.slice(0, 300))})`,
      )
      const actual = Number(m[1])
      const quedara = Number(m[2])
      check(
        actual === antes.stock,
        `la alerta dice stock actual ${actual} y IndexedDB tiene ${antes.stock}`,
      )
      check(
        quedara === actual + 5,
        `la alerta dice que quedará ${quedara} (esperado ${actual + 5})`,
      )
      await escribir(
        driver,
        `${modal('Nueva entrada')}//input[@placeholder='Ej: Reposición de bodega']`,
        MOTIVO_ENTRADA,
      )
      await clicTexto(driver, 'Registrar entrada')
      const toast = await esperarToast(driver, 'Entrada registrada')
      check(toast, 'no apareció el toast "Entrada registrada"')
      check(
        toast.includes('Stock actualizado en el dispositivo (cola PENDING)'),
        `mensaje de toast inesperado: "${toast}"`,
      )
      await esperarToasts(driver, 9000)
      const despues = await leerStock(driver)
      check(
        despues.stock === antes.stock + 5,
        `el stock local pasó de ${antes.stock} a ${despues.stock} (esperado ${antes.stock + 5})`,
      )
      const fila = await esperarFila(driver, ['+5', MOTIVO_ENTRADA], 15000)
      check(fila, 'la entrada no apareció en el listado de entradas')
      check(
        fila.texto.includes('sin sincronizar'),
        `la fila de entrada no muestra "sin sincronizar" (fila: "${fila.texto}")`,
      )
      const lstE = await leerListado(driver)
      const faltanColsE = COLUMNAS_ENTRADAS.filter((c) => !lstE.headers.includes(c))
      check(
        faltanColsE.length === 0,
        `faltan columnas de Entradas con filas: ${faltanColsE.join(', ')} (observadas: ${lstE.headers.join(' | ')})`,
      )
      const est = await estadoEntradas(driver)
      check(
        est.entradas === ENTRADAS_BASE + 1,
        `en IndexedDB hay ${est.entradas} entrada(s) (baseline ${ENTRADAS_BASE} + 1 esperada)`,
      )
      check(
        est.pendientes === 1,
        `eventos de cola de entradas PENDING = ${est.pendientes} (esperado 1)`,
      )
      return (
        `alerta "Stock actual: ${actual} → quedará ${quedara}" (coincide con IndexedDB) → 5 × ` +
        `${NOMBRE_PRODUCTO}, motivo "${MOTIVO_ENTRADA}" → toast "${toast}" → stock local ` +
        `${antes.stock} → ${despues.stock} · fila "+5" con badge "sin sincronizar" · ` +
        `entradas locales ${ENTRADAS_BASE} → ${est.entradas} · 1 evento PENDING`
      )
    })

    // --- CP-COMP-003: validaciones del formulario de compra ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-003'], async () => {
      await abrirCompras(driver)
      const antes = await estadoCompras(driver)
      await clicTexto(driver, 'Nueva compra')
      const t0 = await esperarModal(driver, 'Nueva compra', 9000)
      check(t0, 'no abrió el modal "Nueva compra"')

      // 1) sin proveedor
      await clicTexto(driver, 'Registrar compra')
      const v1 = await esperarToast(driver, 'Falta el proveedor', 9000)
      check(v1, 'no apareció el toast "Falta el proveedor" al registrar sin proveedor')
      check(v1.includes('Selecciona el proveedor de la compra'), `mensaje inesperado: "${v1}"`)
      await esperarToasts(driver, 8000)

      // 2) proveedor sin líneas
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[1]`, NOMBRE_PROVEEDOR)
      await clicTexto(driver, 'Registrar compra')
      const v2 = await esperarToast(driver, 'Sin productos', 9000)
      check(v2, 'no apareció el toast "Sin productos" al registrar sin líneas')
      check(v2.includes('Agrega al menos una línea a la compra'), `mensaje inesperado: "${v2}"`)
      await esperarToasts(driver, 8000)

      // 3) cantidad 0
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[2]`, NOMBRE_PRODUCTO)
      await escribir(driver, `(${modal('Nueva compra')}//*[@type='number'])[1]`, '0')
      await clicTexto(driver, 'Agregar')
      const v3 = await esperarToast(driver, 'Cantidad inválida', 9000)
      check(v3, 'no apareció el toast "Cantidad inválida" con cantidad 0')
      check(v3.includes('Usa un entero mayor a cero'), `mensaje inesperado: "${v3}"`)
      await esperarToasts(driver, 8000)

      // 4) precio vacío
      await escribir(driver, `(${modal('Nueva compra')}//*[@type='number'])[1]`, '1')
      await escribir(driver, `(${modal('Nueva compra')}//*[@placeholder='0.00'])[1]`, '')
      await clicTexto(driver, 'Agregar')
      const v4 = await esperarToast(driver, 'Precio inválido', 9000)
      check(v4, 'no apareció el toast "Precio inválido" con precio vacío')
      check(v4.includes('Ingresa el precio unitario en quetzales'), `mensaje inesperado: "${v4}"`)
      await esperarToasts(driver, 8000)

      // 5) cerrar sin guardar
      const cuerpo = await textoModal(driver, 'Nueva compra')
      check(
        cuerpo.includes('Sin líneas'),
        `el modal no quedó sin líneas tras las validaciones: ${JSON.stringify(cuerpo.slice(0, 400))}`,
      )
      await clicTexto(driver, 'Cancelar')
      check(
        !(await modalAbierto(driver, 'Nueva compra', 6000)),
        'el modal "Nueva compra" no se cerró con Cancelar',
      )
      const despues = await estadoCompras(driver)
      check(
        despues.compras === antes.compras,
        `las validaciones dejaron ${despues.compras - antes.compras} compra(s) nuevas en IndexedDB`,
      )
      return (
        `4 validaciones con su toast (Falta el proveedor / Sin productos / Cantidad inválida + ` +
        '"Usa un entero mayor a cero" / Precio inválido) · el modal siguió "Sin líneas" · ' +
        `Cancelar cerró el modal · IndexedDB sin compras nuevas (${antes.compras} → ${despues.compras})`
      )
    })

    // --- CP-COMP-004: adjunto mayor a 4 MB ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-004'], async () => {
      fs.mkdirSync(path.dirname(ARCHIVO_GRANDE), { recursive: true })
      fs.writeFileSync(
        ARCHIVO_GRANDE,
        Buffer.concat([
          Buffer.from('%PDF-1.4\n% archivo de prueba > 4 MB\n'),
          Buffer.alloc(5 * 1024 * 1024, 0x20),
        ]),
      )
      try {
        await abrirCompras(driver)
        await clicTexto(driver, 'Nueva compra')
        const t0 = await esperarModal(driver, 'Nueva compra', 9000)
        check(t0, 'no abrió el modal "Nueva compra"')
        const inp = await driver.findElement(
          By.xpath(`${modal('Nueva compra')}//input[@type='file']`),
        )
        await inp.sendKeys(ARCHIVO_GRANDE)
        const toast = await esperarToast(driver, 'Adjunto muy grande', 10000)
        check(toast, 'no apareció el toast "Adjunto muy grande" al adjuntar ~5 MB')
        check(toast.includes('El archivo no puede superar 4 MB'), `mensaje inesperado: "${toast}"`)
        const cuerpo = await textoModal(driver, 'Nueva compra')
        check(
          !cuerpo.includes('AdjuntoGrande_CP.pdf'),
          `el archivo quedó adjunto a pesar del límite de 4 MB: ${JSON.stringify(cuerpo.slice(-300))}`,
        )
        await esperarToasts(driver, 8000)
        await clicTexto(driver, 'Cancelar')
        check(
          !(await modalAbierto(driver, 'Nueva compra', 6000)),
          'el modal "Nueva compra" no se cerró con Cancelar',
        )
        return (
          `archivo de ${Math.round(fs.statSync(ARCHIVO_GRANDE).size / (1024 * 1024))} MB en el input ` +
          `→ toast "${toast}" → el modal no muestra el archivo (se rechazó) · sin compras nuevas`
        )
      } finally {
        try {
          fs.unlinkSync(ARCHIVO_GRANDE)
        } catch (e) {
          /* ya borrado */
        }
      }
    })

    // --- CP-COMP-009: comprobante de compra ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-009'], async () => {
      await abrirCompras(driver)
      const est = await estadoCompras(driver)
      check(est.compras > 0, 'no hay compras para ver su comprobante')
      const compra = est.filas.find((f) => f.id === ID_COMPRA_001) || est.filas[0]
      check(compra, `no se encontró la compra de CP-COMP-001: ${JSON.stringify(est.filas)}`)
      const r = await clicBotonFila(
        driver,
        ['Q10.00', 'completada', 'sin sincronizar'],
        'Ver comprobante',
      )
      check(r === 'ok', `clic en "Ver comprobante": ${r}`)
      const cuerpo = await esperarModal(driver, 'Comprobante de compra', 9000)
      check(cuerpo, 'no abrió el modal "Comprobante de compra"')
      const folio = String(compra.id).slice(0, 8).toUpperCase()
      check(cuerpo.includes('Comprobante de compra'), 'falta el título "Comprobante de compra"')
      check(cuerpo.includes('Folio'), 'el comprobante no muestra el campo "Folio"')
      check(
        cuerpo.includes(folio),
        `el comprobante no muestra el folio ${folio} (texto: ${JSON.stringify(cuerpo.slice(0, 500))})`,
      )
      check(
        cuerpo.includes('No es factura fiscal'),
        'sin adjunto se esperaba la leyenda "No es factura fiscal"',
      )
      check(
        cuerpo.includes('PENDIENTE DE SINCRONIZACIÓN FISCAL'),
        'falta la marca de agua "PENDIENTE DE SINCRONIZACIÓN FISCAL"',
      )
      // el CSS aplica text-transform:uppercase y innerText devuelve el texto
      // renderizado → se compara en mayúsculas
      check(
        cuerpo.toUpperCase().includes('COMPROBANTE NO FISCAL'),
        `falta la leyenda "Comprobante no fiscal" (texto: ${JSON.stringify(cuerpo.slice(-400))})`,
      )
      check(cuerpo.includes('Total'), 'el comprobante no muestra el Total')
      const botones = await botonesModal(driver, 'Comprobante de compra')
      const tiene = (t) => botones.some((b) => b.t.includes(t) && b.vis && !b.dis)
      check(tiene('Cerrar'), `botón "Cerrar" no visible/habilitado: ${JSON.stringify(botones)}`)
      check(
        tiene('Ticket 80 mm'),
        `botón "Ticket 80 mm" no visible/habilitado: ${JSON.stringify(botones)}`,
      )
      check(tiene('Carta'), `botón "Carta" no visible/habilitado: ${JSON.stringify(botones)}`)
      // "Ticket 80 mm" y "Carta" disparan window.print() nativo: NO se pulsan en automation.
      // El clic se acota al modal: clicTexto('Cerrar') caza "Cerrar sesión" del
      // header (oculta) y se queda esperando visibilidad.
      const cerrar = await clicBotonModal(driver, 'Comprobante de compra', 'Cerrar')
      check(cerrar === 'ok', `clic en "Cerrar" del comprobante: ${cerrar}`)
      check(
        !(await modalAbierto(driver, 'Comprobante de compra', 6000)),
        'el comprobante no se cerró con "Cerrar"',
      )
      return (
        `folio ${folio} · "Comprobante de compra" sin adjunto → "No es factura fiscal" + ` +
        '"PENDIENTE DE SINCRONIZACIÓN FISCAL" + "Comprobante no fiscal" · botones Cerrar / ' +
        'Ticket 80 mm / Carta habilitados (los de impresión no se pulsan: window.print() nativo)'
      )
    })

    // --- CP-COMP-005: anulación de compra con devolución de stock ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-005'], async () => {
      await abrirCompras(driver)
      const sync = await sincronizarCola(driver, 'compras', ID_COMPRA_001)
      check(
        sync.pendientes === 1,
        `eventos de compras PENDING = ${sync.pendientes} (se esperaba 1: el de CP-COMP-001)`,
      )
      const fallos = sync.resultados.filter((x) => !x.ok)
      check(
        fallos.length === 0,
        `sincronizarEvento devolvió fallos: ${JSON.stringify(sync.resultados)}`,
      )
      const est = await estadoCompras(driver)
      const compra = est.filas.find((f) => f.estado === 'completada')
      check(
        compra,
        `no quedó ninguna compra completada tras sincronizar: ${JSON.stringify(est.filas)}`,
      )
      check(compra.sync === 'SYNCED', `sync_status = ${compra.sync} (esperado SYNCED)`)
      const folio = String(compra.id).slice(0, 8).toUpperCase()

      const srv1 = await leerStockServidor(driver)
      check(!srv1.error, `no se pudo leer el stock del servidor: ${JSON.stringify(srv1)}`)
      check(
        srv1.stock === STOCK_INICIAL.stock + 1,
        `stock servidor ${srv1.stock} tras registrar_compra (esperado ${STOCK_INICIAL.stock + 1})`,
      )

      await abrirCompras(driver)
      const fila = await esperarFila(driver, ['Q10.00', 'completada'], 15000)
      check(fila, 'la compra no aparece en el listado tras sincronizar')
      check(
        !fila.texto.includes('sin sincronizar'),
        `la compra sigue marcada "sin sincronizar" tras sincronizarla (fila: "${fila.texto}")`,
      )
      check(
        fila.texto.includes('completada'),
        `la fila no muestra el estado "completada" (fila: "${fila.texto}")`,
      )
      const r = await clicBotonFila(driver, ['Q10.00', 'completada'], 'Anular compra')
      check(r === 'ok', `clic en "Anular compra": ${r}`)
      const cuerpo = await esperarModal(driver, 'Anular compra', 9000)
      check(cuerpo, 'no abrió el modal "Anular compra"')
      const textoEsperado = `¿Anular la compra ${folio} por Q10.00? El stock se devolverá a la sucursal.`
      check(
        cuerpo.includes(textoEsperado),
        `el modal no muestra "${textoEsperado}" (texto: ${JSON.stringify(cuerpo)})`,
      )
      await escribir(
        driver,
        `${modal('Anular compra')}//input[@placeholder='Motivo de anulación (opcional)']`,
        'Anulación E2E CP',
      )
      await clicTexto(driver, 'Anular compra')
      const toast = await esperarToast(driver, 'Compra anulada', 15000)
      check(toast, 'no apareció el toast "Compra anulada"')
      check(
        toast.includes('El stock fue devuelto a la sucursal'),
        `mensaje de toast inesperado: "${toast}"`,
      )
      await esperarToasts(driver, 9000)
      const fila2 = await esperarFila(driver, 'anulada', 12000)
      check(fila2, 'la compra no aparece como "anulada" en el listado')
      check(
        fila2.texto.includes('Q10.00'),
        `la fila anulada no conserva el total (fila: "${fila2.texto}")`,
      )
      const srv2 = await leerStockServidor(driver)
      check(
        srv2.stock === STOCK_INICIAL.stock,
        `stock servidor ${srv2.stock} tras anular (esperado volver a ${STOCK_INICIAL.stock})`,
      )
      const est2 = await estadoCompras(driver)
      const c2 = est2.filas.find((f) => f.id === compra.id)
      check(
        c2 && c2.estado === 'anulada',
        `estado local = ${JSON.stringify(c2)} (esperado anulada)`,
      )
      return (
        `sincronización manual del evento PENDING → SYNCED (folio ${folio}, id remapeado por el ` +
        `servidor) · stock servidor ${STOCK_INICIAL.stock} → ${srv1.stock} → ${srv2.stock} · ` +
        `modal con "${textoEsperado}" · motivo "Anulación E2E CP" → toast "${toast}" · ` +
        `fila en "anulada" y estado local anulada`
      )
    })

    // --- CP-COMP-006: registrar compra sin conexión ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-006'], async () => {
      await abrirCompras(driver)
      const onLine = await driver.executeScript('return navigator.onLine')
      check(onLine === true, `navigator.onLine = ${onLine}: se necesitaba red para abrir la ruta`)
      await cortarRed(driver)
      RED_CORTADA = true
      const offLine = await driver.executeScript('return navigator.onLine')
      check(offLine === false, `navigator.onLine = ${offLine} tras cortar la red`)
      await navegar(driver, '#/compras', 3500)
      const alerta = await aparece(
        driver,
        'Sin conexión: estás viendo los registros locales',
        12000,
      )
      check(alerta, 'no apareció la alerta offline en #/compras')
      const v = await leerListado(driver)
      check(!v.cargando, 'sin red el listado quedó en spinner (no leyó IndexedDB)')

      await clicTexto(driver, 'Nueva compra')
      const t0 = await esperarModal(driver, 'Nueva compra', 9000)
      check(t0, 'no abrió el modal "Nueva compra" sin conexión')
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[1]`, NOMBRE_PROVEEDOR)
      await seleccionarPorTexto(driver, `(${modal('Nueva compra')}//select)[2]`, NOMBRE_PRODUCTO)
      await escribir(driver, `(${modal('Nueva compra')}//*[@type='number'])[1]`, '1')
      await escribir(driver, `(${modal('Nueva compra')}//*[@placeholder='0.00'])[1]`, '15')
      await clicTexto(driver, 'Agregar')
      const cuerpo = await textoModal(driver, 'Nueva compra')
      check(
        cuerpo.includes('Total: Q15.00'),
        `el total del modal debía ser "Total: Q15.00" (observado: ${JSON.stringify(cuerpo.match(/Total:.*$/m) || '')})`,
      )
      await clicTexto(driver, 'Registrar compra')
      const toast = await esperarToast(driver, 'Compra registrada', 12000)
      check(toast, 'no apareció el toast "Compra registrada" sin conexión')
      check(
        toast.includes('Sin conexión: guardada localmente (cola PENDING)'),
        `mensaje de toast inesperado: "${toast}"`,
      )
      await esperarToasts(driver, 9000)
      const fila = await esperarFila(driver, 'Q15.00', 12000)
      check(fila, 'la compra offline no apareció en el listado')
      check(
        fila.texto.includes('sin sincronizar'),
        `la fila offline no muestra "sin sincronizar" (fila: "${fila.texto}")`,
      )
      const est = await estadoCompras(driver)
      const pend = est.filas.filter((f) => f.sync === 'PENDING')
      check(
        pend.length === 1,
        `hay ${pend.length} compra(s) PENDING en IndexedDB (se esperaba 1): ${JSON.stringify(est.filas)}`,
      )
      ID_COMPRA_OFFLINE = pend[0].id
      check(
        ID_COMPRA_OFFLINE && ID_COMPRA_OFFLINE !== ID_COMPRA_001,
        'no se identificó la compra offline aparte de la de CP-COMP-001',
      )
      // la red queda cortada: CP-COMP-007 sigue offline
      return (
        `navigator.onLine=false → alerta offline en #/compras → alta con ${NOMBRE_PROVEEDOR} + ` +
        `1 × ${NOMBRE_PRODUCTO} a Q15.00 → "Total: Q15.00" → toast "${toast}" → fila ` +
        `con badge "sin sincronizar" · 1 compra PENDING (id ${ID_COMPRA_OFFLINE}) · red aún cortada`
      )
    })

    // --- CP-COMP-007: anulación bloqueada de compra pendiente + limpieza ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-007'], async () => {
      try {
        const onLine = await driver.executeScript('return navigator.onLine')
        check(onLine === false, `CP-COMP-007 necesita la red cortada (navigator.onLine=${onLine})`)
        const est0 = await estadoCompras(driver)
        check(
          est0.filas.some((f) => f.id === ID_COMPRA_OFFLINE),
          `la compra offline ya no está en IndexedDB: ${JSON.stringify(est0.filas)}`,
        )
        const r = await clicBotonFila(driver, 'Q15.00', 'Anular compra')
        check(r === 'ok', `clic en "Anular compra" de la fila PENDING: ${r}`)
        const toast = await esperarToast(driver, 'Compra local sin sincronizar', 10000)
        check(toast, 'no apareció el toast "Compra local sin sincronizar"')
        check(
          toast.includes('Todavía no existe en el servidor'),
          `mensaje de toast inesperado: "${toast}"`,
        )
        const cuerpoModal = await textoModal(driver, 'Anular compra')
        check(
          !cuerpoModal,
          `se abrió el modal de anulación de una compra PENDING: ${JSON.stringify(cuerpoModal)}`,
        )
        const fila = await esperarFila(driver, 'Q15.00', 8000)
        check(fila, 'la compra offline desapareció sin que se borrara')
        check(
          fila.texto.includes('sin sincronizar') && fila.texto.includes('completada'),
          `la compra PENDING cambió de estado (fila: "${fila.texto}")`,
        )

        // limpieza local con la red todavía cortada (el registro no existe en el servidor)
        const borr = await borrarCompraLocal(driver, ID_COMPRA_OFFLINE)
        check(
          borr.existia && borr.eventos >= 1,
          `borrado local inesperado: ${JSON.stringify(borr)}`,
        )
        await navegar(driver, '#/compras', 3000)
        const v = await leerListado(driver)
        check(
          !v.filas.some((f) => f.includes('Q15.00')),
          `la compra offline siguió visible tras borrarla: ${JSON.stringify(v.filas)}`,
        )
        check(
          v.filas.length === est0.compras - 1,
          `quedaron ${v.filas.length} fila(s) en compras sin red (esperaba ${est0.compras - 1}: ` +
            'las que había menos la offline borrada)',
        )
        const est1 = await estadoCompras(driver)
        check(
          est1.compras === est0.compras - 1 && est1.pendientes === 0,
          `IndexedDB tras la limpieza: ${JSON.stringify(est1)} (esperaba ${est0.compras - 1} compras y 0 PENDING)`,
        )
        const notas =
          `sin red el botón no abre el confirm → toast "${toast}" · borrado local ` +
          `${JSON.stringify(borr)} · listado sin red quedó en ${v.filas.length} fila(s) · ` +
          `cola de compras PENDING = ${est1.pendientes}`
        return notas
      } finally {
        await restaurarRed(driver)
        RED_CORTADA = false
      }
      // nada: el finally restaura la red
    })

    // verificación con la red restaurada (tras el finally del caso anterior)
    try {
      await navegar(driver, '#/compras', 3500)
      await esperarCarga(driver)
      const onLine = await driver.executeScript('return navigator.onLine')
      const v = await leerListado(driver)
      const tot = await serverTotals(driver)
      const esperado = tot && !tot.error ? textoContador(tot.compras, true) : null
      const okRed = onLine === true
      const okContador = esperado === null ? true : v.contador === esperado
      const okSinOffline = !v.filas.some((f) => f.includes('Q15.00'))
      console.log(
        `  · tras restaurar la red: onLine=${okRed} contador="${v.contador}" ` +
          `(servidor: ${esperado}) sinOffline=${okSinOffline} filas=${JSON.stringify(v.filas)}`,
      )
      if (!okRed || !okContador || !okSinOffline) {
        console.log('  · AVISO: la verificación posterior a CP-COMP-007 no cuadró')
      }
    } catch (e) {
      console.log('  · aviso verificación post-red:', String(e).split('\n')[0])
    }

    // --- CP-COMP-010: permisos de creación y visualización ---
    await caso(driver, RESULTADOS, CASOS['CP-COMP-010'], async () => {
      const sinCrear = await permisoTemporal(ROL_GERENTE, 'compras', { crear: false }, async () => {
        await navegar(driver, '#/dashboard', 1500)
        await abrirCompras(driver, 3000)
        const compra = await esperarBoton(driver, 'Nueva compra', true, 15000)
        check(await clicPestana(driver, 'Entradas'), 'no se pudo cambiar a la pestaña Entradas')
        await driver.sleep(900)
        const entrada = await esperarBoton(driver, 'Nueva entrada', true, 12000)
        const filaEntrada = await esperarFila(driver, MOTIVO_ENTRADA, 8000)
        const lst = await leerListado(driver)
        const est = await estadoEntradas(driver)
        return {
          compra,
          entrada,
          filas: lst.filas.length,
          vacio: lst.vacio,
          cargando: lst.cargando,
          filaEntrada: !!filaEntrada,
          est,
        }
      })
      check(
        sinCrear.compra && sinCrear.compra.existe && sinCrear.compra.disabled,
        `con compras/crear=false el botón "Nueva compra" quedó ${JSON.stringify(sinCrear.compra)}`,
      )
      check(
        sinCrear.entrada && sinCrear.entrada.existe && sinCrear.entrada.disabled,
        `con compras/crear=false el botón "Nueva entrada" quedó ${JSON.stringify(sinCrear.entrada)}`,
      )
      check(
        sinCrear.filas > 0,
        'sin permiso crear el listado de entradas se vació (solo debía bloquear la creación) · ' +
          `diagnóstico: ${JSON.stringify(sinCrear)}`,
      )

      const sinVer = await permisoTemporal(ROL_GERENTE, 'compras', { ver: false }, async () => {
        await navegar(driver, '#/dashboard', 1500)
        const inicio = await driver.executeScript('return location.hash')
        await navegar(driver, '#/compras', 3500)
        const hash = await driver.executeScript('return location.hash')
        const render = await existe(driver, 'Compras y entradas')
        return { inicio, hash, render }
      })
      check(
        sinVer.hash === '#/dashboard',
        `con compras/ver=false la navegación quedó en ${sinVer.hash} (esperado #/dashboard)`,
      )
      check(!sinVer.render, 'la vista "Compras y entradas" se renderizó con compras/ver=false')

      await navegar(driver, '#/dashboard', 1500)
      await abrirCompras(driver, 3000)
      const volvio = await esperarBoton(driver, 'Nueva compra', false, 15000)
      check(
        volvio.existe && volvio.disabled === false,
        `el botón "Nueva compra" no regresó tras restaurar el permiso: ${JSON.stringify(volvio)}`,
      )
      return (
        `compras/crear=false → "Nueva compra" y "Nueva entrada" deshabilitados con el listado ` +
        `intacto (${sinCrear.filas} fila(s)) · compras/ver=false → desde ${sinVer.inicio} ` +
        `redirigió a ${sinVer.hash} sin renderizar la vista · permisos restaurados: ` +
        `"Nueva compra" habilitado de nuevo (${volvio.existe && !volvio.disabled})`
      )
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    // 1) la red siempre se restaura primero (las limpiezas RPC la necesitan)
    try {
      if (driver && RED_CORTADA) await restaurarRed(driver)
      else if (driver) await restaurarRed(driver)
    } catch (e) {
      /* driver ya cerrado */
    }

    // 2) limpieza local de la suite (con la red ya restaurada)
    try {
      if (driver) {
        const e1 = await borrarEntradasDePrueba(driver)
        console.log('  · limpieza local de entradas:', JSON.stringify(e1))
        if (ID_COMPRA_OFFLINE) {
          const e2 = await borrarCompraLocal(driver, ID_COMPRA_OFFLINE)
          console.log('  · limpieza local de la compra offline:', JSON.stringify(e2))
        }
        const est = await estadoCompras(driver)
        const estE = await estadoEntradas(driver)
        console.log('  · IndexedDB al salir:', JSON.stringify({ compras: est, entradas: estE }))
      }
    } catch (e) {
      console.log('  · aviso limpieza local:', String(e).split('\n')[0])
    }

    // 3) stock local de vuelta al valor inicial
    try {
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        const r = await restaurarStockLocal(driver)
        console.log('  · restauración de stock local:', JSON.stringify(r))
      }
    } catch (e) {
      console.log('  · aviso stock local:', String(e).split('\n')[0])
    }

    // 4) motor de sincronización de vuelta a marcha
    try {
      if (driver && MOTOR_DETENIDO) {
        const r = await script(
          driver,
          `const m = await import('/src/services/syncEngineService.js')
           m.iniciarMotorSync()
           return { ok: true }`,
        )
        MOTOR_DETENIDO = false
        console.log('  · motor de sincronización reiniciado:', JSON.stringify(r))
        await driver.sleep(1500)
      }
    } catch (e) {
      console.log('  · aviso motor de sync:', String(e).split('\n')[0])
    }

    // 5) stock del servidor verificado (y restaurado si difiere) → deriva final
    let deriva = null
    try {
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        let srv = await leerStockServidor(driver)
        let restaurado = null
        if (!srv.error && srv.stock !== STOCK_INICIAL.stock) {
          restaurado = await restaurarStockServidor(driver)
          srv = await leerStockServidor(driver)
        }
        const loc = await leerStock(driver)
        deriva = {
          inicial: STOCK_INICIAL.stock,
          servidor: srv.error ? `ERROR ${srv.error}` : srv.stock,
          local: loc.error ? `ERROR ${loc.error}` : loc.stock,
          restaurado,
        }
        deriva.final =
          deriva.servidor === STOCK_INICIAL.stock && deriva.local === STOCK_INICIAL.stock
            ? '0 (igual al inicial)'
            : `NO CERO (${JSON.stringify(deriva)})`
        console.log('  · stock final:', JSON.stringify(deriva))
      }
    } catch (e) {
      console.log('  · aviso stock final:', String(e).split('\n')[0])
    }

    // 6) proveedor de prueba fuera del servidor
    try {
      if (driver) {
        const p = await eliminarProveedorPrueba(driver)
        console.log('  · proveedor de prueba eliminado:', JSON.stringify(p))
        if (!p.ui && !p.rpc) {
          console.log('  · AVISO: el proveedor de prueba quedó en el servidor')
        }
      }
    } catch (e) {
      console.log('  · aviso proveedor:', String(e).split('\n')[0])
    }

    // 7) deriva de datos: totales del servidor y locales al salir
    try {
      if (driver) {
        const fin = await serverTotals(driver)
        const loc = await script(
          driver,
          `
          const { db } = await import('/src/lib/db.js')
          return {
            compras: await db.compras.count(),
            entradas: await db.entradas.count(),
            colaPendiente: await db.cola_sincronizacion
              .where('sync_status')
              .equals('PENDING')
              .count(),
          }
        `,
        )
        const derivaDatos = {
          comprasServidor: fin && !fin.error ? fin.compras : `ERROR ${fin && fin.error}`,
          entradasServidor: fin && !fin.error ? fin.entradas : `ERROR ${fin && fin.error}`,
          inicio: TOTALES_INICIALES,
          locales: loc,
        }
        console.log('  · deriva de datos:', JSON.stringify(derivaDatos))
        if (fin && !fin.error && TOTALES_INICIALES && !TOTALES_INICIALES.error) {
          const dC = fin.compras - TOTALES_INICIALES.compras
          const dE = fin.entradas - TOTALES_INICIALES.entradas
          console.log(
            `  · Δ servidor: compras ${dC >= 0 ? '+' : ''}${dC} (la compra sincronizada en ` +
              'CP-COMP-005 queda anulada: no hay API para borrarla) · entradas ' +
              `${dE >= 0 ? '+' : ''}${dE} (debe ser 0: la entrada nunca se sincroniza)`,
          )
        }
      }
    } catch (e) {
      console.log('  · aviso deriva de datos:', String(e).split('\n')[0])
    }

    guardarResultados('CPCompras', RESULTADOS)
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }

  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  const faltantes = 10 - RESULTADOS.length
  if (PROVEEDOR_BORRADO !== null) {
    console.log(
      `  · proveedor de prueba "${NOMBRE_PROVEEDOR}" borrado del servidor: ${PROVEEDOR_BORRADO}`,
    )
  }
  console.log(
    reprobados.length === 0 && faltantes === 0
      ? 'CP-COMP OK (10/10 aprobados)'
      : `CP-COMP: ${RESULTADOS.length}/10 ejecutados, ${faltantes} sin ejecutar, ` +
          `${reprobados.length} reprobado(s)${reprobados.length ? ': ' + reprobados.map((r) => r.id).join(', ') : ''}`,
  )
  process.exit(reprobados.length === 0 && faltantes === 0 ? 0 : 1)
}

main()
