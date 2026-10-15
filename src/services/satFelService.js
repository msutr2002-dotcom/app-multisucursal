/**
 * Facturas-SAT (spec facturas-sat D9–D11/D14/D16): cliente de la API
 * pública del simulador FEL de la SAT. CORS abierto, sin auth.
 *
 * - GET  /api/sat/contribuyentes/:nit   → padrón (404 = NIT no registrado)
 * - POST /api/fel/facturas              → certifica el DTE (IVA 12% server-side)
 * - DELETE /api/fel/facturas/:uuid      → elimina el DTE (anulación)
 *
 * Los precios del POS incluyen IVA: `construirItemsFel` divide por 1.12 a
 * 6 decimales para que `totalGeneral = round(Σ × 1.12, 2)` sea EXACTAMENTE
 * el total cobrado (D11).
 */

const API_FEL = 'https://api-fel-sat.onrender.com'

/** Render cold start puede tardar ~30–60 s; sin reintentos en loop (D16). */
const TIMEOUT_MS = 45000

/** Caché en memoria para respuestas inmediatas (0 ms) en consultas repetidas de NIT */
const cacheContribuyentes = new Map()

async function fetchConTimeout(url, opciones = {}, ms = TIMEOUT_MS) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { ...opciones, signal: ctrl.signal })
    let cuerpo = null
    try {
      cuerpo = await r.json()
    } catch {
      cuerpo = null
    }
    return { ok: r.ok, status: r.status, cuerpo }
  } finally {
    clearTimeout(t)
  }
}

const mensajeSat = (status, cuerpo, porDefecto) =>
  cuerpo?.message || (status === 404 ? 'No encontrado en el servicio del SAT' : porDefecto)

/**
 * Consulta el padrón de contribuyentes del SAT (D10).
 * @param {string} nit
 * @returns {Promise<{ok: boolean, contribuyente?: object, mensaje?: string}>}
 */
export async function consultarContribuyente(nit) {
  const limpio = String(nit || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
  if (!limpio) return { ok: false, mensaje: 'El NIT es obligatorio' }
  if (cacheContribuyentes.has(limpio)) {
    return cacheContribuyentes.get(limpio)
  }
  let res
  try {
    res = await fetchConTimeout(`${API_FEL}/api/sat/contribuyentes/${encodeURIComponent(limpio)}`)
  } catch {
    return { ok: false, mensaje: 'El servicio del SAT no responde, intente de nuevo' }
  }
  if (!res.ok || res.cuerpo?.status !== 'success') {
    const errorRes = {
      ok: false,
      // 404 = NIT ausente del padrón (bloqueo D10); distinto de error de red.
      noEnPadron: res.status === 404,
      mensaje: mensajeSat(
        res.status,
        res.cuerpo,
        'El servicio del SAT no responde, intente de nuevo',
      ),
    }
    return errorRes
  }
  const exitoRes = { ok: true, contribuyente: res.cuerpo.data }
  cacheContribuyentes.set(limpio, exitoRes)
  return exitoRes
}

/**
 * Certifica la factura en el SAT (D9). `items[].precioUnitario` en
 * QUETZALES con decimales (÷1.12); el servidor calcula IVA y totales.
 * @param {{emisor: object, receptor: object, items: Array}} p
 * @returns {Promise<{ok: boolean, fel?: object, mensaje?: string}>}
 */
export async function certificarFactura({ emisor, receptor, items }) {
  if (!Array.isArray(items) || !items.length)
    return { ok: false, mensaje: 'Debe incluir al menos un ítem en la factura' }
  let res
  try {
    res = await fetchConTimeout(`${API_FEL}/api/fel/facturas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emisor, receptor, items }),
    })
  } catch {
    return { ok: false, mensaje: 'El servicio del SAT no responde, intente de nuevo' }
  }
  if (!res.ok || res.cuerpo?.status !== 'success') {
    return {
      ok: false,
      mensaje: mensajeSat(res.status, res.cuerpo, 'No se pudo certificar la factura en el SAT'),
    }
  }
  return { ok: true, fel: res.cuerpo.data }
}

/**
 * Elimina el DTE en el SAT (D14). Un 404 cuenta como éxito: el DTE ya no
 * existe (caso de un corte anterior entre DELETE y RPC).
 * @param {string} uuid
 * @returns {Promise<{ok: boolean, mensaje?: string}>}
 */
export async function anularFacturaSat(uuid) {
  if (!uuid) return { ok: false, mensaje: 'La factura no tiene uuid del SAT' }
  let res
  try {
    res = await fetchConTimeout(`${API_FEL}/api/fel/facturas/${encodeURIComponent(uuid)}`, {
      method: 'DELETE',
    })
  } catch {
    return { ok: false, mensaje: 'El servicio del SAT no responde, intente de nuevo' }
  }
  if (res.ok || res.status === 404) return { ok: true }
  return {
    ok: false,
    mensaje: mensajeSat(res.status, res.cuerpo, 'No se pudo anular la factura en el SAT'),
  }
}

/**
 * Líneas fiscales de la venta (D11): prorratea el TOTAL COBRADO
 * (post-descuento) entre los ítems según su subtotal y divide cada parte por
 * 1.12 con 6 decimales. El último ítem toma el residuo para que la suma cierre
 * exacta. Además devuelve `monto` (parte en CENTAVOS, total de la línea
 * incluido IVA) para la impresión carta FEL (D17).
 *
 * @param {Array<{producto: string, cantidad: number, subtotal: number}>} itemsVenta
 *   ítems de `get_venta_detalle` (subtotal en CENTAVOS, pre-descuento)
 * @param {number} totalCobradoCentavos total de la venta en CENTAVOS
 * @returns {Array<{descripcion: string, cantidad: number, precioUnitario: number, monto: number}>}
 */
export function lineasFel(itemsVenta, totalCobradoCentavos) {
  const items = (itemsVenta || []).filter((i) => i && i.cantidad > 0)
  if (!items.length) throw new Error('La venta no tiene ítems para facturar')
  const total = Number(totalCobradoCentavos) || 0
  if (total <= 0) throw new Error('La factura necesita un total mayor a cero')

  const totalFull = items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0) || total
  let acumulado = 0
  return items.map((it, idx) => {
    const parte =
      idx === items.length - 1
        ? total - acumulado
        : Math.round((Number(it.subtotal) / totalFull) * total)
    acumulado += parte
    // centavos → quetzales por unidad, ÷1.12 con 6 decimales (D11)
    const quetzalesUnit = parte / Number(it.cantidad) / 1.12
    return {
      descripcion: it.producto,
      cantidad: Number(it.cantidad),
      precioUnitario: Number(quetzalesUnit.toFixed(6)),
      monto: parte,
    }
  })
}

/**
 * Ítems para el SAT (payload `POST /api/fel/facturas`): los mismos campos de
 * `lineasFel` sin `monto` (el SAT solo acepta descripcion/cantidad/precio).
 * @param {Array} itemsVenta
 * @param {number} totalCobradoCentavos
 * @returns {Array<{descripcion: string, cantidad: number, precioUnitario: number}>}
 */
export function construirItemsFel(itemsVenta, totalCobradoCentavos) {
  return lineasFel(itemsVenta, totalCobradoCentavos).map(
    ({ descripcion, cantidad, precioUnitario }) => ({ descripcion, cantidad, precioUnitario }),
  )
}

/**
 * Totales de visualización/BD en CENTAVOS a partir del total cobrado:
 * subtotal = round(total/1.12), IVA = resto (siempre suman; D15).
 * @param {number} totalCentavos
 * @returns {{subtotal: number, iva: number, total: number}}
 */
export function totalesFelDesdeTotal(totalCentavos) {
  const total = Math.round(Number(totalCentavos) || 0)
  const subtotal = Math.round(total / 1.12)
  return { subtotal, iva: total - subtotal, total }
}
