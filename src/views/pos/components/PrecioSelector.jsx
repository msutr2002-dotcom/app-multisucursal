import React from 'react'
import { CFormSelect } from '@coreui/react'
import { formatQ } from '../../../utils/format'
import { precioAuto, factorDe, esPresentacion } from '../precioUtils'

/**
 * Dropdown de precios estilo sistema viejo: opción "Auto" (según cantidad,
 * compite SOLO entre tiers base) y luego cada tier.
 * - Base: "TIPO _ Q. precio (mín. N)"
 * - Presentación: "CAJA · Q110.00 (1 Caja = 12 und)"
 *
 * value: null = Auto | id de tier = manual
 * onChange(null) vuelve a Auto
 */
const PrecioSelector = ({ precios, value, onChange, cantidad }) => {
  if (!precios?.length) return null

  const auto = precioAuto(precios, cantidad)

  const etiqueta = (p) =>
    esPresentacion(p)
      ? `${p.tipo} · ${formatQ(p.precio)} (1 ${p.unidad || 'unidad'} = ${factorDe(p)} und)`
      : `${p.tipo} _ ${formatQ(p.precio)}${p.min_cantidad > 1 ? ` (mín. ${p.min_cantidad})` : ''}`

  return (
    <div className="mb-3">
      <div className="small text-body-secondary mb-1">Precio:</div>
      <CFormSelect
        size="sm"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Precio a aplicar"
      >
        <option value="">{`Automático — ${formatQ(auto.precio)} (según cantidad)`}</option>
        {precios.map((p) => (
          <option key={p.id} value={p.id}>
            {etiqueta(p)}
          </option>
        ))}
      </CFormSelect>
    </div>
  )
}

export default PrecioSelector
