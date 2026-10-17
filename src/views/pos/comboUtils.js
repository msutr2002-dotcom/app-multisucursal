/**
 * Utilidades de combos para el POS (impresiones-copias).
 *
 * Un combo (`contiene_insumos = true`) NO tiene stock propio: su disponibilidad
 * se deriva de sus componentes. `disponibilidadCombo` responde "¿cuántas
 * unidades del combo se pueden armar con el stock actual?" = mínimo, sobre los
 * componentes, de `floor(stockComponente / requeridoPorCombo)`, donde
 * `requeridoPorCombo = cantidad × factor` (componente-producto) o `cantidad`
 * (componente-ingrediente).
 *
 * Todo es síncrono y local (Offline-First): recibe los mapas ya cargados de
 * IndexedDB. `factor` viene denormalizado en la fila del componente
 * (`get_productos_admin.componentes[].factor`).
 */

const leerMapa = (mapa, clave) => {
  if (mapa instanceof Map) return mapa.get(clave)
  if (mapa && typeof mapa === 'object') return mapa[clave]
  return undefined
}

/**
 * @param {string} idProducto id del producto-combo
 * @param {object} mapas
 * @param {Map|object} mapas.componentesPorProducto id_producto → filas de combo_componentes
 * @param {Map|object} mapas.stockPorProducto       id_producto → stock (bodega activa)
 * @param {Map|object} mapas.ingredientesPorId      id_ingrediente → stock
 * @returns {number} unidades armables (entero ≥ 0); 0 si falta receta o algún componente no alcanza
 */
export function disponibilidadCombo(
  idProducto,
  { componentesPorProducto, stockPorProducto, ingredientesPorId } = {},
) {
  const comps = leerMapa(componentesPorProducto, idProducto) || []
  if (!comps.length) return 0

  let min = Infinity
  for (const c of comps) {
    const cant = Number(c.cantidad)
    if (!Number.isInteger(cant) || cant < 1) return 0

    let requerido
    let stock
    if (c.id_ingrediente) {
      requerido = cant
      stock = Number(leerMapa(ingredientesPorId, c.id_ingrediente) ?? 0)
    } else {
      const factor = Number(c.factor) > 0 ? Number(c.factor) : 1
      requerido = cant * factor
      stock = Number(leerMapa(stockPorProducto, c.id_producto_componente) ?? 0)
    }

    const disp = Math.floor(stock / requerido)
    if (disp < min) min = disp
    if (min <= 0) return 0
  }

  return Number.isFinite(min) ? min : 0
}

/** Agrupa filas planas de `combo_componentes` (Dexie) en un Map id_producto → filas. */
export function agruparComponentes(filas = []) {
  const mapa = new Map()
  for (const f of filas) {
    const lista = mapa.get(f.id_producto)
    if (lista) lista.push(f)
    else mapa.set(f.id_producto, [f])
  }
  return mapa
}
