/**
 * Formatea centavos enteros a quetzales.
 * 1250000 → "Q 12,500.00"
 * Nunca usa decimales intermedios: la división es solo visual.
 */
export function formatQ(centavos) {
  const valor = (centavos || 0) / 100
  return `Q${valor.toLocaleString('es-GT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
