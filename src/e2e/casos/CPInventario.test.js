/**
 * CP-INV — Casos de prueba del módulo Inventario (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-INV-00X.png,
 * resultados en docs/e2e-resultados/CPInventario.json.
 *
 * Orden de ejecución: 001 listado → 002 búsqueda → 003 categoría →
 * 004 stock bajo (toca IndexedDB y RESTAURA) → 005 vacío (no reproducible
 * sin alterar datos) → 006 permisos → 007 aislamiento por sucursal →
 * 008 sin conexión (corta la red lo último posible y la restaura siempre).
 */
const {
  crearDriver,
  login,
  script,
  noExiste,
  navegar,
  cortarRed,
  restaurarRed,
  caso,
  guardarResultados,
  check,
  permisoTemporal,
  ROL_GERENTE,
  Select,
  By,
  until,
  sleep,
} = require('./utilCasos')

const RESULTADOS = []
const PLACEHOLDER = 'Buscar por nombre o SKU...'
const COLUMNAS = ['SKU', 'Producto', 'Categoría', 'Stock', 'Stock mín.', 'Precio']
const BUSCADOR = `input[placeholder="${PLACEHOLDER}"]`
const SELECT_CATEGORIAS = '.card-header select'

/** Stock tocado por CP-INV-004 (se restaura en el caso y en el finally del suite). */
let STOCK_ORIGINAL = null
/** Stock leído ANTES de tocar nada: sirve para la verificación final. */
let STOCK_INICIAL = null

const CASOS = {
  'CP-INV-001': {
    id: 'CP-INV-001',
    escenario: 'Visualización del listado de inventario',
    pasos:
      '1. Iniciar sesión. 2. Ir a #/inventario. 3. Revisar título, contador y columnas. 4. Comprobar la paginación de 25 por página si hay más de 25 productos',
    requisitos:
      'Usuario con permiso inventario/ver; catálogo hidratado en IndexedDB para la sucursal activa',
    datos:
      'Usuario alex/alex123 (Gerente, sucursal "Ferromax chichi"); empresa Ferromax con 2 productos ("llave inlgesa" y "Fixture T9 Traslados")',
    esperado:
      'Título "Inventario" con contador "N productos"; columnas SKU, Producto, Categoría, Stock, Stock mín., Precio; paginación de 25 por página cuando hay más de 25 productos',
  },
  'CP-INV-002': {
    id: 'CP-INV-002',
    escenario: 'Búsqueda por nombre o SKU',
    pasos:
      '1. Ir a #/inventario. 2. Escribir "llave" en "Buscar por nombre o SKU...". 3. Escribir el SKU "LLAVE". 4. Escribir un SKU inexistente. 5. Limpiar el buscador',
    requisitos: 'Inventario con productos (nombre "llave inlgesa" y SKU "LLAVE")',
    datos:
      'Términos válidos: "llave" (nombre) y "LLAVE" (SKU); término sin coincidencias: "SKU_INEXISTENTE_XYZ"',
    esperado:
      'La tabla filtra en memoria y vuelve a la página 1; sin coincidencias queda 0 productos con el mensaje de vacío; al limpiar se muestra el listado completo',
  },
  'CP-INV-003': {
    id: 'CP-INV-003',
    escenario: 'Filtrado por categoría',
    pasos:
      '1. Ir a #/inventario. 2. Revisar las opciones del select "Todas las categorías". 3. Seleccionar una categoría real si existe. 4. Volver a "Todas las categorías"',
    requisitos: 'Productos de al menos dos categorías en la empresa',
    datos:
      'Select "Todas las categorías" + las categorías hidratadas de la empresa Ferromax (IndexedDB db.categorias filtrada por id_empresa)',
    esperado:
      'Solo se muestran productos de la categoría elegida; al volver a "Todas las categorías" se muestra todo',
  },
  'CP-INV-004': {
    id: 'CP-INV-004',
    escenario: 'Resaltado de stock bajo',
    pasos:
      '1. Ir a #/inventario. 2. Bajar el stock local de "llave inlgesa" a ≤ stock mínimo en IndexedDB. 3. Recargar la vista. 4. Revisar el badge de la fila. 5. Restaurar el stock original',
    requisitos: 'Producto con stock menor o igual al stock mínimo; permiso inventario/ver',
    datos:
      '"llave inlgesa" en la sucursal activa (stock original 2, stock mínimo 0); se fija stock temporal 0 y se restaura el valor original',
    esperado:
      'El stock se muestra con badge rojo (bg-danger) y texto "Stock bajo"; los demás productos quedan con badge verde',
  },
  'CP-INV-005': {
    id: 'CP-INV-005',
    escenario: 'Inventario vacío',
    pasos:
      '1. Ir a #/inventario sin productos en IndexedDB. 2. Revisar el icono y el mensaje de vacío',
    requisitos: 'Sucursal sin productos en IndexedDB (catálogo local completamente vacío)',
    datos:
      'Ninguno disponible: vaciar el catálogo local está prohibido porque alteraría datos del dispositivo',
    esperado:
      'Se muestra el icono y el mensaje "No hay productos en el inventario local"; sin errores en consola',
  },
  'CP-INV-006': {
    id: 'CP-INV-006',
    escenario: 'Acceso sin permiso de ver',
    pasos:
      '1. Con red, quitar inventario/ver al rol Gerente (permiso temporal). 2. Ir a #/dashboard. 3. Intentar entrar a #/inventario. 4. Verificar la URL final (el permiso se restaura solo)',
    requisitos:
      'Red disponible (permisoService re-consulta has_permission con red y cachea el resultado)',
    datos:
      'Rol Gerente 3cf414b4-156f-40d2-a6a2-715ad8113283 con inventario/ver=false temporal; restaurado en el finally de permisoTemporal',
    esperado: 'Tras validar el permiso el sistema redirige silenciosamente a #/dashboard',
  },
  'CP-INV-007': {
    id: 'CP-INV-007',
    escenario: 'Aislamiento de datos por sucursal',
    pasos:
      '1. Ir a #/inventario. 2. Leer db.productos_sucursal de TODAS las sucursales presentes en el dispositivo. 3. Comparar el stock mostrado en cada fila con el de la sucursal de la sesión y con el de la otra sucursal. 4. Revisar que localStorage.currentUser.id_sucursal sea la sucursal activa',
    requisitos: 'Catálogo de la empresa hidratado con stock de más de una sucursal',
    datos:
      'Sesión alex → id_sucursal 64b78a15 "Ferromax chichi"; la empresa también tiene stock en "Ferromax quiche" (c7bca165) en el mismo IndexedDB',
    esperado:
      'Solo se muestra el stock de la sucursal del dispositivo (la de la sesión); nunca el de otra sucursal',
  },
  'CP-INV-008': {
    id: 'CP-INV-008',
    escenario: 'Inventario sin conexión',
    pasos:
      '1. Abrir #/inventario con red (calienta el chunk lazy). 2. Cortar la red por CDP. 3. Volver a entrar a #/inventario. 4. Comparar con lo que mostraba con red. 5. Restaurar la red',
    requisitos:
      'Catálogo hidratado en IndexedDB y chunk lazy de la ruta ya cargado con red (regla del repo: sin red un import dinámico frío revienta)',
    datos: 'Red cortada con Network.emulateNetworkConditions offline=true',
    esperado:
      'La vista carga desde IndexedDB sin bloquearse (contador y tabla visibles); sin botones de edición, solo lectura',
  },
}

// ------------------------- helpers de la vista -------------------------

/** Navega a #/inventario y espera a que termine el spinner de carga. */
async function abrirInventario(driver, ms = 2000) {
  await navegar(driver, '#/inventario', ms)
  try {
    await driver.wait(until.elementLocated(By.css('.card-header h5')), 12000)
  } catch (e) {
    const v = await leerVista(driver)
    throw new Error(
      `no renderizó la tarjeta de Inventario (hash=${v.hash}, título=${v.titulo}, ` +
        `sinSucursal=${v.sinSucursal}, vacío=${v.vacio})`,
    )
  }
  try {
    await driver.wait(
      async () => {
        const n = await driver.executeScript(
          "return document.querySelectorAll('.card-body .spinner-border').length",
        )
        return n === 0
      },
      12000,
      300,
    )
  } catch (e) {
    throw new Error('la vista siguió en spinner (cargando) más de 12 s: nunca llegó el listado')
  }
}

/** Lee el estado completo de la vista de inventario sin depender de selectores frágiles. */
async function leerVista(driver) {
  return driver.executeScript(`
    const hds = [...document.querySelectorAll('.card-header')]
    const hdr = hds.find((h) => /Inventario/.test(h.innerText || '')) || hds[0] || null
    const h5 = hdr ? hdr.querySelector('h5') : null
    const txt = document.body.innerText || ''
    const sel = hdr ? hdr.querySelector('select') : null
    const m = hdr ? (hdr.innerText || '').match(/(\\d+) productos?/) : null
    return {
      hash: location.hash,
      titulo: h5 ? h5.innerText.trim() : null,
      contador: m ? m[1] : null,
      cabeceras: [...document.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim()),
      filas: [...document.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => (td.textContent || '').trim()),
      ),
      filasHtml: [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerHTML),
      paginacion: !!document.querySelector('.pagination'),
      vacio: txt.includes('No hay productos en el inventario local'),
      sinSucursal: txt.includes('No se encontró la sucursal activa'),
      cargando: document.querySelectorAll('.card-body .spinner-border').length > 0,
      opciones: sel
        ? [...sel.options].map((o) => ({ v: o.value, t: (o.textContent || '').trim() }))
        : [],
      botones: [...document.querySelectorAll('.card button')].map((b) => (b.textContent || '').trim()),
    }
  `)
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
  await driver.sleep(700)
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
        categorias: await db.categorias.count(),
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
async function leerStockLlave(driver) {
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
    if (!p) return { error: 'el producto "llave" no está en IndexedDB' }
    const bod = await db.bodegas.where('id_sucursal').equals(idSucursal).filter((b) => b.es_principal).first()
    if (!bod) return { error: 'sin bodega principal en IndexedDB' }
    const f = await db.stock_bodega.get([bod.id, p.id])
    if (!f) return { idSucursal, idBodega: bod.id, idProducto: p.id, nombre: p.name, stock: 0, min: 0 }
    return { idSucursal, idBodega: bod.id, idProducto: p.id, nombre: p.name, stock: f.stock, min: f.stock_minimo }
  `,
    idSuc,
  )
}

/** Restaura el stock original tocado por CP-INV-004 (idempotente). */
async function restaurarStock(driver) {
  if (!STOCK_ORIGINAL || STOCK_ORIGINAL.error) return null
  return script(
    driver,
    `
    const { db } = await import('/src/lib/db.js')
    const k = [arguments[0], arguments[1]]
    const f = await db.stock_bodega.get(k)
    if (!f) return { error: 'la fila de stock ya no existe' }
    if (f.stock === arguments[2] && f.stock_minimo === arguments[3]) {
      return { ok: true, sinCambios: true, stock: f.stock, min: f.stock_minimo }
    }
    await db.stock_bodega.put({ ...f, stock: arguments[2], stock_minimo: arguments[3] })
    const g = await db.stock_bodega.get(k)
    return { ok: g.stock === arguments[2] && g.stock_minimo === arguments[3], stock: g.stock, min: g.stock_minimo }
  `,
    STOCK_ORIGINAL.idBodega,
    STOCK_ORIGINAL.idProducto,
    STOCK_ORIGINAL.stock,
    STOCK_ORIGINAL.min,
  )
}

// ------------------------------- suite --------------------------------

async function main() {
  let driver = null
  try {
    driver = await crearDriver()
    await login(driver)

    try {
      const cat = await esperarCatalogo(driver)
      console.log('  · catálogo local:', JSON.stringify(cat))
      STOCK_INICIAL = await leerStockLlave(driver)
      STOCK_ORIGINAL = STOCK_INICIAL
      console.log('  · stock inicial "llave inlgesa":', JSON.stringify(STOCK_INICIAL))
    } catch (e) {
      console.log('  · aviso catálogo:', String(e).split('\n')[0])
    }

    // --- CP-INV-001: listado, contador, columnas y paginación ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-001'], async () => {
      await abrirInventario(driver)
      const v = await leerVista(driver)
      check(v.titulo === 'Inventario', `título esperado "Inventario" y se observó "${v.titulo}"`)
      check(
        /^\d+$/.test(v.contador || ''),
        `contador "N productos" ausente (observado: ${JSON.stringify(v.contador)})`,
      )
      check(!v.sinSucursal, 'la vista mostró "No se encontró la sucursal activa"')
      check(!v.cargando, 'la vista quedó en spinner: nunca terminó de cargar')
      const faltantes = COLUMNAS.filter((c) => !v.cabeceras.includes(c))
      check(
        faltantes.length === 0,
        `faltan columnas: ${faltantes.join(', ')} (observadas: ${v.cabeceras.join(' | ')})`,
      )
      check(v.filas.length > 0, `la tabla no tiene filas (vacío=${v.vacio})`)
      const n = Number(v.contador)
      check(
        n === v.filas.length,
        `el contador dice ${n} pero la tabla renderizó ${v.filas.length} fila(s)`,
      )
      let paginacion = ''
      if (n > 25) {
        check(v.paginacion, `hay ${n} productos y NO se renderizó la paginación de 25 por página`)
        paginacion = 'paginación visible (>25 productos)'
      } else {
        check(
          !v.paginacion,
          `con ${n} productos (≤25) no debe renderizar paginación y se renderizó`,
        )
        paginacion = `sin paginación: ${n} productos ≤ 25 por página (solo se renderiza con más de 25)`
      }
      return `${v.titulo} · contador "${v.contador}" · columnas ${v.cabeceras.join(', ')} · ${v.filas.length} fila(s) · ${paginacion}`
    })

    // --- CP-INV-002: búsqueda por nombre o SKU ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-002'], async () => {
      await abrirInventario(driver)
      const base = await leerVista(driver)
      check(base.filas.length > 0, 'no hay productos que buscar en el inventario')
      const total = base.filas.length

      await escribirEn(driver, BUSCADOR, 'llave')
      let v = await leerVista(driver)
      check(
        v.contador === '1',
        `con "llave" se esperaba 1 producto y se observó contador "${v.contador}" (${v.filas.length} fila(s))`,
      )
      check(
        v.filas.some((f) => f.join(' ').toLowerCase().includes('llave inlgesa')),
        `la fila de "llave inlgesa" no aparece tras buscar "llave": ${JSON.stringify(v.filas)}`,
      )
      const trasNombre = v.filas.length

      await escribirEn(driver, BUSCADOR, 'LLAVE')
      v = await leerVista(driver)
      check(
        v.contador === '1' &&
          v.filas.some((f) => f.join(' ').toLowerCase().includes('llave inlgesa')),
        `por SKU "LLAVE" se esperaba 1 fila y se observó contador "${v.contador}" (${JSON.stringify(v.filas)})`,
      )

      await escribirEn(driver, BUSCADOR, 'SKU_INEXISTENTE_XYZ')
      v = await leerVista(driver)
      check(
        v.filas.length === 0,
        `con "SKU_INEXISTENTE_XYZ" se esperaba 0 filas y se observaron ${v.filas.length}`,
      )
      check(
        v.vacio,
        'sin coincidencias NO se mostró el estado vacío "No hay productos en el inventario local"',
      )
      const vacioTrasBusqueda = v.vacio

      await escribirEn(driver, BUSCADOR, '')
      v = await leerVista(driver)
      check(
        v.filas.length === total,
        `al limpiar el buscador se esperaban ${total} filas y se observaron ${v.filas.length}`,
      )
      return `buscar "llave" → ${trasNombre} fila (contador "${base.contador}→1"); SKU "LLAVE" → 1 fila; "SKU_INEXISTENTE_XYZ" → 0 filas con contador "0 productos" y vacío=${vacioTrasBusqueda}; limpiar → ${v.filas.length} filas (listado completo)`
    })

    // --- CP-INV-003: filtro por categoría ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-003'], async () => {
      await abrirInventario(driver)
      const v = await leerVista(driver)
      check(v.opciones.length > 0, 'no se encontró el select de categorías ".card-header select"')
      const reales = v.opciones.filter((o) => o.v !== '')
      if (reales.length === 0) {
        throw new Error(
          `el select solo contiene "Todas las categorías"; empresa sin categorías ` +
            `(opciones: ${v.opciones.map((o) => `"${o.t}"`).join(', ')}) → no se pudo filtrar de verdad`,
        )
      }
      const antes = v.filas.length
      const elegida = reales[0]
      await new Select(await driver.findElement(By.css(SELECT_CATEGORIAS))).selectByValue(elegida.v)
      await driver.sleep(800)
      const filtrado = await leerVista(driver)
      const soloElegida = filtrado.filas.every((f) => f[2] === elegida.t)
      check(
        filtrado.filas.length < antes || soloElegida,
        `filtrar por "${elegida.t}" no redujo la lista (${antes} → ${filtrado.filas.length}, todas de la categoría: ${soloElegida})`,
      )
      check(
        soloElegida,
        `quedaron filas de otra categoría: ${JSON.stringify(filtrado.filas.map((f) => f[2]))}`,
      )
      await new Select(await driver.findElement(By.css(SELECT_CATEGORIAS))).selectByValue('')
      await driver.sleep(800)
      const restaurado = await leerVista(driver)
      check(
        restaurado.filas.length === antes,
        `al volver a "Todas las categorías" se esperaban ${antes} filas y se observaron ${restaurado.filas.length}`,
      )
      return `select con ${v.opciones.length} opción(es) (reales: ${reales.length}); filtro "${elegida.t}" → ${filtrado.filas.length} fila(s) solo de esa categoría; volver a "Todas las categorías" → ${restaurado.filas.length} fila(s)`
    })

    // --- CP-INV-004: badge "Stock bajo" ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-004'], async () => {
      await abrirInventario(driver)
      const actual = await leerStockLlave(driver)
      check(!actual.error, actual.error || 'sin datos de stock locales')
      STOCK_ORIGINAL = actual
      const meta = await script(
        driver,
        `
        const { db } = await import('/src/lib/db.js')
        const k = [arguments[0], arguments[1]]
        const f = await db.stock_bodega.get(k)
        if (!f) return { error: 'sin fila de stock' }
        await db.stock_bodega.put({ ...f, stock: arguments[2] })
        const g = await db.stock_bodega.get(k)
        return { stock: g.stock, min: g.stock_minimo }
      `,
        actual.idBodega,
        actual.idProducto,
        0,
      )
      check(
        meta && !meta.error && meta.stock === 0,
        `no se pudo bajar el stock local a 0: ${JSON.stringify(meta)}`,
      )
      try {
        await abrirInventario(driver)
        const v = await leerVista(driver)
        const i = v.filas.findIndex((f) => (f[1] || '').toLowerCase().includes('llave'))
        check(i >= 0, `no aparece la fila de "${actual.nombre}" tras recargar la vista`)
        const celda = v.filas[i][3] || ''
        const mostrado = (celda.match(/^\d+/) || [])[0]
        check(mostrado === '0', `la celda de Stock muestra "${celda}" y se esperaba el valor 0`)
        check(
          /Stock bajo/.test(celda) && /bg-danger/.test(v.filasHtml[i]),
          `se esperaba badge rojo con texto "Stock bajo" y se observó: "${celda}"`,
        )
        const j = v.filas.findIndex((f) => (f[1] || '').toLowerCase().includes('fixture'))
        if (j >= 0) {
          check(
            !/Stock bajo/.test(v.filas[j][3] || ''),
            `Fixture T9 también marcó "Stock bajo" con su stock real (${v.filas[j][3]})`,
          )
        }
        return `${actual.nombre}: stock local ${actual.stock} → 0 (≤ mínimo ${actual.min}); celda "${celda}" con badge bg-danger + "Stock bajo"; Fixture T9 sin marca (badge verde); stock restaurado a ${actual.stock} en el finally de este caso`
      } finally {
        const r = await restaurarStock(driver)
        console.log('      · restauración CP-INV-004:', JSON.stringify(r))
      }
    })

    // --- CP-INV-005: inventario vacío (no reproducible sin alterar datos) ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-005'], async () => {
      await abrirInventario(driver)
      const v = await leerVista(driver)
      throw new Error(
        'No reproducible sin alterar datos: el caso exige una sucursal sin productos en ' +
          'IndexedDB y vaciar el catálogo local está prohibido (rompería el espejo offline y ' +
          'alteraría el dispositivo). Con el catálogo hidratado se observó: ' +
          `contador "${v.contador}", ${v.filas.length} fila(s), mensaje de vacío=${v.vacio}. ` +
          'El mismo bloque de UI ("No hay productos en el inventario local") sí se llega a ' +
          'ver con filtros sin coincidencia (registrado en CP-INV-002), pero el escenario ' +
          'del caso (catálogo local vacío) no se pudo ejecutar',
      )
    })

    // --- CP-INV-006: sin permiso inventario/ver ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-006'], async () => {
      const salida = await permisoTemporal(ROL_GERENTE, 'inventario', { ver: false }, async () => {
        await navegar(driver, '#/dashboard', 2000)
        const inicio = await driver.executeScript('return location.hash')
        await navegar(driver, '#/inventario', 2000)
        let hash = await driver.executeScript('return location.hash')
        const fin = Date.now() + 12000
        while (hash !== '#/dashboard' && Date.now() < fin) {
          await sleep(400)
          hash = await driver.executeScript('return location.hash')
        }
        const sinTabla = await noExiste(driver, 'Stock mín.')
        return { inicio, hash, sinTabla }
      })
      check(
        salida.hash === '#/dashboard',
        `se esperaba redirigir a #/dashboard y la URL quedó en ${salida.hash}`,
      )
      check(
        salida.sinTabla,
        'la tabla de inventario ("Stock mín.") se renderizó a pesar de no tener inventario/ver',
      )
      return `permiso inventario/ver=false en el rol Gerente: desde ${salida.inicio} → intento de #/inventario redirigió a ${salida.hash} y la vista no se renderizó; permiso restaurado por permisoTemporal`
    })

    // --- CP-INV-007: aislamiento por sucursal ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-007'], async () => {
      await abrirInventario(driver)
      const sesion = await driver.executeScript(
        "return JSON.parse(localStorage.getItem('currentUser') || 'null')",
      )
      const idSuc = sesion && sesion.id_sucursal ? sesion.id_sucursal : ''
      check(idSuc, 'localStorage.currentUser no tiene id_sucursal')
      const local = await script(
        driver,
        `
        const { db } = await import('/src/lib/db.js')
        const bod = await db.bodegas.where('id_sucursal').equals(arguments[0]).filter((b) => b.es_principal).first()
        if (!bod) return { error: 'sin bodega principal' }
        const stocks = await db.stock_bodega.where('id_bodega').equals(bod.id).toArray()
        const prods = await db.productos.toArray()
        return {
          bodega: bod.id,
          stocks: stocks.map((s) => ({
            id_bodega: s.id_bodega,
            id_producto: s.id_producto,
            stock: s.stock,
            stock_minimo: s.stock_minimo,
          })),
          productos: prods.map((p) => ({ id: p.id, name: p.name })),
        }
      `,
        idSuc,
      )
      check(local && !local.error, `no se pudo leer IndexedDB: ${JSON.stringify(local)}`)
      check(local.productos.length > 0, 'IndexedDB no tiene productos de la empresa para comparar')
      const v = await leerVista(driver)
      const detalles = []
      for (const p of local.productos) {
        const idx = v.filas.findIndex((f) => f[1] === p.name)
        check(idx >= 0, `el producto "${p.name}" no se muestra en la tabla`)
        const propio = local.stocks.find(
          (s) => s.id_bodega === local.bodega && s.id_producto === p.id,
        )
        check(propio, `sin fila de stock en la bodega principal (${local.bodega}) para "${p.name}"`)
        const ajenos = local.stocks.filter(
          (s) => s.id_bodega !== local.bodega && s.id_producto === p.id,
        )
        const mostrado = Number((v.filas[idx][3].match(/^\d+/) || [''])[0])
        check(
          mostrado === Number(propio.stock),
          `"${p.name}": la tabla muestra ${mostrado} y el stock de la bodega principal (${local.bodega}) es ${propio.stock}`,
        )
        if (ajenos.length) {
          const otros = ajenos.map((a) => `${a.id_bodega.slice(0, 8)}=${a.stock}`).join(', ')
          for (const ajeno of ajenos) {
            if (Number(ajeno.stock) !== Number(propio.stock)) {
              check(
                mostrado !== Number(ajeno.stock),
                `"${p.name}": la tabla muestra ${mostrado} que coincide con OTRA bodega (${ajeno.id_bodega.slice(0, 8)}=${ajeno.stock}) y no con la principal`,
              )
            }
          }
          detalles.push(
            `${p.name}: mostrado ${mostrado} = bodega principal; otras en el dispositivo [${otros}]`,
          )
        } else {
          detalles.push(`${p.name}: mostrado ${mostrado} = bodega principal`)
        }
      }
      const otrasBodegas = local.stocks.filter((s) => s.id_bodega !== local.bodega)
      const notaOtras = otrasBodegas.length
        ? `${otrasBodegas.length} fila(s) de otra(s) bodega(s) con datos en el dispositivo que NO aparecen en la tabla`
        : 'el dispositivo solo contiene filas de la bodega principal (no hay datos de otra bodega en IndexedDB)'
      return `bodega principal=${local.bodega} · sesión id_sucursal=${idSuc} (${sesion.name || sesion.username}) · ${detalles.join(' · ')} · ${notaOtras}`
    })

    // --- CP-INV-008: sin conexión ---
    await caso(driver, RESULTADOS, CASOS['CP-INV-008'], async () => {
      await abrirInventario(driver)
      const conRed = await leerVista(driver)
      check(
        conRed.filas.length > 0,
        'el inventario no tenía filas con red: no hay qué comparar sin conexión',
      )
      await cortarRed(driver)
      try {
        const offline = await driver.executeScript('return navigator.onLine === false')
        check(offline, 'navigator.onLine sigue en true tras cortar la red por CDP')
        const t0 = Date.now()
        await navegar(driver, '#/inventario', 2500)
        const ms = Date.now() - t0
        let v = await leerVista(driver)
        if (v.cargando || v.contador === null) {
          await driver.sleep(1500)
          v = await leerVista(driver)
        }
        check(v.hash === '#/inventario', `la vista no quedó en #/inventario (hash ${v.hash})`)
        check(!v.sinSucursal, 'sin red apareció "No se encontró la sucursal activa"')
        check(!v.cargando, 'la vista siguió en spinner: se bloqueó al perder la red')
        check(
          v.contador !== null,
          'sin red no se renderizó el contador "N productos" (la vista no cargó desde IndexedDB)',
        )
        check(
          v.contador === conRed.contador && v.filas.length === conRed.filas.length,
          `los datos locales cambiaron sin red: con red "${conRed.contador}"/${conRed.filas.length} filas, sin red "${v.contador}"/${v.filas.length} filas`,
        )
        const editables = v.botones.filter((b) => /editar|eliminar|guardar|nuevo|agregar/i.test(b))
        check(
          editables.length === 0,
          `botones de edición visibles sin red: ${editables.join(', ')}`,
        )
        return `red cortada (navigator.onLine=false) → #/inventario renderizó en ${ms} ms desde IndexedDB con contador "${v.contador}" y ${v.filas.length} fila(s), idéntico a con red; sin botones de edición (solo lectura); spinner finalizado, sin bloqueo`
      } finally {
        await restaurarRed(driver)
      }
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
      if (driver && STOCK_ORIGINAL && !STOCK_ORIGINAL.error) {
        const r = await restaurarStock(driver)
        console.log('  · restauración final de stock:', JSON.stringify(r))
      }
      if (driver && STOCK_INICIAL && !STOCK_INICIAL.error) {
        const fin = await leerStockLlave(driver)
        const igual =
          fin && !fin.error && fin.stock === STOCK_INICIAL.stock && fin.min === STOCK_INICIAL.min
        console.log(
          `  · stock final ${JSON.stringify(fin)} vs inicial ${JSON.stringify({ stock: STOCK_INICIAL.stock, min: STOCK_INICIAL.min })} → ${igual ? 'IGUAL' : 'DIFERENCIA'}`,
        )
      }
    } catch (e) {
      console.log('  · aviso stock final:', String(e).split('\n')[0])
    }
    guardarResultados('CPInventario', RESULTADOS)
    try {
      if (driver) await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  console.log(
    reprobados.length === 0
      ? 'CP-INV OK (8/8 aprobados)'
      : `CP-INV con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
