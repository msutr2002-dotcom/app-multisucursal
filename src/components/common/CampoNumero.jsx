import React, { useEffect, useRef, useState } from 'react'
import { CFormInput } from '@coreui/react'

/**
 * Campo numérico editable que permite **borrar** el valor para reescribirlo.
 *
 * Los valores de negocio siguen siendo números; el componente mantiene un estado
 * local de texto (permite `''`) para que el usuario pueda limpiar el campo:
 * - Sólo acepta dígitos (`/^\d*$/`).
 * - Al teclear un número válido hace `onCommit` en vivo (el carrito/total
 *   reaccionan sin esperar el blur).
 * - Vaciar NO dispara commit: el valor vigente se conserva hasta que haya número.
 * - Al `blur`/`Enter` recorta a `[min, max]`; si quedó vacío, vuelve a `min`.
 */
const CampoNumero = ({
  value,
  onCommit,
  min,
  max,
  size,
  className,
  style,
  'aria-label': ariaLabel,
  ...rest
}) => {
  const [texto, setTexto] = useState(value === '' || value == null ? '' : String(value))
  const enfocado = useRef(false)

  useEffect(() => {
    if (!enfocado.current) setTexto(value === '' || value == null ? '' : String(value))
  }, [value])

  const clamp = (n) => {
    let r = n
    if (typeof min === 'number') r = Math.max(min, r)
    if (typeof max === 'number') r = Math.min(max, r)
    return r
  }

  const commit = (bruto) => {
    if (bruto === '') return null
    const n = parseInt(bruto, 10)
    if (!Number.isFinite(n)) return null
    return clamp(n)
  }

  return (
    <CFormInput
      type="number"
      inputMode="numeric"
      size={size}
      className={className}
      style={style}
      aria-label={ariaLabel}
      value={texto}
      onChange={(e) => {
        const v = e.target.value
        if (!/^\d*$/.test(v)) return
        setTexto(v)
        const c = commit(v)
        if (c != null) onCommit?.(c)
      }}
      onFocus={() => {
        enfocado.current = true
      }}
      onBlur={() => {
        enfocado.current = false
        const c = commit(texto)
        if (c == null) {
          const base = typeof min === 'number' ? min : 0
          setTexto(String(base))
          if (base !== value) onCommit?.(base)
        } else {
          setTexto(String(c))
          if (c !== value) onCommit?.(c)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      {...rest}
    />
  )
}

export default CampoNumero
