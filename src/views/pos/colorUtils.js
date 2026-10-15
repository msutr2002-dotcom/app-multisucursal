/**
 * papel-iris — agrupación de productos por color (POS).
 *
 * Cada color es un producto independiente (su stock y su precio). El POS los
 * agrupa por "nombre base": el `name` sin el nombre del color al final
 * (ej. "Hojas Iris carta amarillo" + color "Amarillo" → base "Hojas Iris carta").
 * Sin red no cambia nada: todo sale de Dexie (`db.productos`, `db.colores`).
 */

/** Nombre del color desde el mapa `id_color → name|{name}`; `null` si no aplica. */
export function nombreColor(coloresPorId, idColor) {
  if (!idColor || !coloresPorId) return null
  const v = coloresPorId[idColor]
  if (!v) return null
  const nombre = typeof v === 'string' ? v : v.name
  return (nombre || '').trim() || null
}

/**
 * "Nombre base" = `name` sin el color del final (trim, case-insensitive).
 * Si no aplica (sin color, o el nombre no termina en el color), devuelve el
 * nombre tal cual (degradación segura: grupo = 1 → sin selector).
 */
export function nombreBase(name, colorNombre) {
  const n = (name || '').trim()
  const c = (colorNombre || '').trim()
  if (!n || !c) return n
  if (n.toLowerCase().endsWith(c.toLowerCase())) {
    const base = n.slice(0, n.length - c.length).trim()
    return base || n
  }
  return n
}

/**
 * Hermanos de color de `producto`: productos con el mismo nombre base y
 * `id_color` asignado, cada uno con su stock (vía `stockDe`). Devuelve `[]`
 * cuando no hay `id_color` o el grupo tiene < 2 variantes (no hay qué elegir).
 *
 * @returns {Array<{id, idColor, nombre, activo, stock, producto}>}
 */
export function grupoColores(producto, productos, coloresPorId, stockDe) {
  if (!producto || !producto.id_color) return []
  const key = nombreBase(producto.name, nombreColor(coloresPorId, producto.id_color)).toLowerCase()

  const vistos = new Set()
  const hermanos = []
  for (const p of productos || []) {
    if (!p || !p.id_color) continue
    const c = nombreColor(coloresPorId, p.id_color)
    if (nombreBase(p.name, c).toLowerCase() !== key) continue
    if (vistos.has(p.id)) continue
    vistos.add(p.id)
    hermanos.push({
      id: p.id,
      idColor: p.id_color,
      nombre: c || '—',
      activo: p.id === producto.id,
      stock: typeof stockDe === 'function' ? stockDe(p) : undefined,
      producto: p,
    })
  }

  if (hermanos.length < 2) return []
  hermanos.sort((a, b) => a.nombre.localeCompare(b.nombre))
  return hermanos
}
