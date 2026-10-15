/** Unidades base que equivalen a 1 unidad de venta (tier "base"). */
export function factorDe(tier) {
  return tier?.factor || 1
}

/** Tier de presentación: 1 unidad de venta equivale a más de 1 und base. */
export function esPresentacion(tier) {
  return factorDe(tier) > 1
}

/** Máximo en la unidad del tier: cuántas unidades de venta caben en el stock base. */
export function maxCantidad(stock, factor) {
  return Math.floor((stock || 0) / (factor || 1))
}

/** Tiers base (factor 1); si el producto solo tiene presentaciones → todos (D2). */
function soloBase(precios) {
  const base = precios.filter((p) => factorDe(p) === 1)
  return base.length ? base : precios
}

export function precioNormal(precios) {
  const pool = soloBase(precios)
  return (
    pool.find((p) => p.tipo === 'NORMAL') || pool.find((p) => (p.min_cantidad || 1) <= 1) || pool[0]
  )
}

/** Auto SOLO compite entre tiers base: nunca asigna precio-de-caja a N unds (D2). */
export function precioAuto(precios, cantidad) {
  const pool = soloBase(precios)
  const validos = pool.filter((p) => (p.min_cantidad || 1) <= cantidad)
  if (validos.length === 0) return precioNormal(pool)
  return validos.reduce((mejor, p) => (p.precio < mejor.precio ? p : mejor))
}

/** overrideId = null → Auto; si no → tier elegido manualmente (incluye presentaciones). */
export function calcularTier(precios, cantidad, overrideId) {
  if (overrideId) {
    const manual = precios.find((p) => p.id === overrideId)
    if (manual) return manual
  }
  return precioAuto(precios, cantidad)
}
