import { supabase } from '../lib/supabase'
import { db } from '../lib/db'
import { hayRed } from './redService'
import {
  consultarContribuyente,
  certificarFactura,
  anularFacturaSat,
  construirItemsFel,
  totalesFelDesdeTotal,
} from './satFelService'

/**
 * Facturas-SAT (spec facturas-sat D3/D7): el espejo local guarda las facturas
 * YA EMITIDAS con su payload completo de impresión, para que el módulo liste y
 * reimprima sin red. Emitir siempre pasa por el servidor (correlativo con
 * lock) — ver `emitirFactura`.
 */

/** Máximo de facturas reflejadas al cargar (las más recientes). */
const LIMITE_HIDRATACION = 100

/** Ejecuta `fn` sobre `items` con a lo más `limite` llamadas en paralelo. */
async function conParalelismo(items, limite, fn) {
  const cola = [...items]
  const n = Math.min(limite, cola.length)
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (cola.length) await fn(cola.shift())
    }),
  )
}

/**
 * Refleja las facturas más recientes de la sucursal en Dexie (lista + payload
 * completo de cada una). Fire-and-forget desde el módulo con red; nunca lanza
 * en la vista (la vista decide el fallback local).
 * @param {string} idSucursal
 * @returns {Promise<number>} facturas hidratadas
 */
export async function hidratarFacturas(idSucursal) {
  if (!idSucursal) return 0
  const { data, error } = await supabase.rpc('get_facturas', {
    p_id_sucursal: idSucursal,
    p_busqueda: null,
    p_limite: LIMITE_HIDRATACION,
    p_offset: 0,
  })
  if (error) throw error
  const filas = data?.facturas || []

  const completas = []
  await conParalelismo(filas, 5, async (f) => {
    const { data: det, error: err } = await supabase.rpc('get_factura', {
      p_id: f.id,
      p_id_sucursal: idSucursal,
    })
    if (!err && det) completas.push({ ...det, id_sucursal: idSucursal })
  })

  if (completas.length) {
    await db.transaction('rw', db.facturas, async () => {
      await db.facturas.bulkPut(completas)
    })
  }
  return completas.length
}

/**
 * Listado local del módulo (búsqueda en memoria: folio, cliente, NIT).
 * Mismo contrato de forma que `get_facturas` para que la vista no distinga
 * el origen.
 * @param {string} idSucursal
 * @param {{busqueda?: string, limite?: number, offset?: number}} [opciones]
 * @returns {Promise<{facturas: Array, total: number}>}
 */
export async function leerFacturasLocal(idSucursal, { busqueda, limite = 25, offset = 0 } = {}) {
  if (!idSucursal) return { facturas: [], total: 0 }
  const filas = await db.facturas.where('id_sucursal').equals(idSucursal).toArray()
  const texto = String(busqueda || '')
    .toLowerCase()
    .trim()
  const filtradas = filas
    .filter((f) => {
      if (!texto) return true
      return `${f.folio || ''} ${f.nombre_cliente || ''} ${f.nit_cliente || ''}`
        .toLowerCase()
        .includes(texto)
    })
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
  return {
    facturas: filtradas.slice(offset, offset + limite).map(({ id_sucursal, ...f }) => f),
    total: filtradas.length,
  }
}

/**
 * Payload completo de una factura desde el espejo local (reimpresión offline).
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function leerFacturaLocal(id) {
  if (!id) return null
  return (await db.facturas.get(id)) || null
}

/**
 * Emite la factura SIGUIENDO el flujo FEL (spec D9): padrón → SAT → RPC →
 * espejo. REQUIERE RED (el SAT y el correlativo viven en servidores).
 *
 * - Con `nitCliente`: consulta el padrón del SAT; 404 = rechazo (D10).
 *   Nombre/dirección del padrón son la fuente autoritativa.
 * - Sin NIT: certifica como **CF / CONSUMIDOR FINAL** (D10).
 * - Emisor = sucursal de la sesión (NIT obligatorio, D12).
 * - Ítems ÷1.12 con 6 decimales (D11) y guarda los centavos certificados.
 *
 * @param {object} p
 * @param {string} p.idVenta
 * @param {string} p.idSucursal
 * @param {string|null} [p.nitCliente] - NIT del cliente enlazado (null → CF)
 * @param {string|null} [p.nombreCliente] - solo fallback si el padrón no aplica
 * @param {string|null} [p.idUsuario]
 * @returns {Promise<object>} payload de impresión (folio + fel + venta)
 */
export async function emitirFactura({
  idVenta,
  idSucursal,
  nitCliente = null,
  nombreCliente = null,
  idUsuario = null,
}) {
  if (!idVenta || !idSucursal) throw new Error('La venta y la sucursal son obligatorias')
  if (!hayRed()) throw new Error('Se requiere conexión para emitir facturas')

  // 1) Emisor desde la sucursal de la sesión (D12)
  const { data: sucursal, error: errSuc } = await supabase
    .from('sucursal')
    .select('name, nit, address')
    .eq('id', idSucursal)
    .single()
  if (errSuc) throw new Error(errSuc.message)
  const nitEmisor = String(sucursal?.nit || '').trim()
  if (!nitEmisor) {
    throw new Error('La sucursal no tiene NIT configurado: no se puede facturar')
  }

  // 2) Detalle de la venta (ítems + total cobrado post-descuento)
  const { data: detalle, error: errDet } = await supabase.rpc('get_venta_detalle', {
    p_id: idVenta,
    p_id_sucursal: idSucursal,
  })
  if (errDet) throw new Error(errDet.message)
  const totalCobrado = Number(detalle?.total) || 0

  // 3) Receptor: padrón SAT con NIT (D10); sin NIT → CF
  let receptor
  const nit = String(nitCliente || '').trim()
  if (nit) {
    const consulta = await consultarContribuyente(nit)
    if (!consulta.ok) throw new Error(consulta.mensaje)
    receptor = {
      nit,
      nombre: consulta.contribuyente?.nombre || nombreCliente || 'CONSUMIDOR FINAL',
      direccion: consulta.contribuyente?.direccion || null,
    }
  } else {
    receptor = { nit: 'CF', nombre: 'CONSUMIDOR FINAL', direccion: null }
  }

  // 4) Ítems ÷1.12 y totales en centavos (D11/D15)
  const items = construirItemsFel(detalle?.items, totalCobrado)
  const totales = totalesFelDesdeTotal(totalCobrado)

  // 5) Certificar en el SAT
  const cert = await certificarFactura({
    emisor: { nit: nitEmisor, nombreComercial: sucursal.name },
    receptor: { nit: receptor.nit, nombre: receptor.nombre },
    items,
  })
  if (!cert.ok) throw new Error(cert.mensaje)

  // 6) Persistir con la RPC v2 (D13): si la venta tenía factura ANULADA,
  //    la RPC reutiliza la fila (nuevo FEL, mismo folio interno).
  const { data, error } = await supabase.rpc('emitir_factura', {
    p_id_venta: idVenta,
    p_id_sucursal: idSucursal,
    p_nit_cliente: receptor.nit,
    p_nombre_cliente: receptor.nombre,
    p_direccion_cliente: receptor.direccion,
    p_id_usuario: idUsuario,
    p_fel: {
      uuid: cert.fel.uuid,
      serie: cert.fel.serie,
      numeroDTE: cert.fel.numeroDTE,
      estado: cert.fel.estado,
      subtotal: totales.subtotal,
      iva: totales.iva,
      total: totales.total,
      fechaCertificacion: cert.fel.fechaHoraCertificacion || new Date().toISOString(),
    },
  })
  if (error) throw new Error(error.message)
  try {
    await db.facturas.put({ ...data, id_sucursal: idSucursal })
  } catch {
    /* el espejo es best-effort: la factura ya existe en el servidor */
  }
  return data
}

/**
 * Anula la factura (D14): DELETE en el SAT (404 = ya borrado) y luego marca
 * la fila como ANULADO. Requiere red; no toca la venta subyacente.
 * @param {{id: string, idSucursal: string, uuidFel: string}} p
 * @returns {Promise<object>} payload actualizado (`get_factura`)
 */
export async function anularFactura({ id, idSucursal, uuidFel }) {
  if (!id || !idSucursal) throw new Error('La factura y la sucursal son obligatorias')
  if (!hayRed()) throw new Error('Se requiere conexión para anular facturas')

  const sat = await anularFacturaSat(uuidFel)
  if (!sat.ok) throw new Error(sat.mensaje)

  const { error: errMarca } = await supabase.rpc('anular_factura', {
    p_id: id,
    p_id_sucursal: idSucursal,
  })
  if (errMarca) throw new Error(errMarca.message)

  // Refresca el espejo local con el estado ANULADO
  try {
    const { data } = await supabase.rpc('get_factura', { p_id: id, p_id_sucursal: idSucursal })
    if (data) await db.facturas.put({ ...data, id_sucursal: idSucursal })
  } catch {
    /* best-effort */
  }
  return true
}
