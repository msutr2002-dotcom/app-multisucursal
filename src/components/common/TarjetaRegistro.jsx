import React from 'react'

/**
 * TarjetaRegistro — fila de listado en formato tarjeta para móvil.
 *
 * Reemplaza a las tablas anchas en <768px (specs/movil.md, D1/D2): una tarjeta
 * por fila, con el dato principal arriba, los campos etiquetados en medio y las
 * acciones siempre visibles abajo. CoreUI-only (sin librerías externas).
 *
 * @param {object} props
 * @param {React.ReactNode} props.titulo      Dato principal (ej. folio, producto).
 * @param {React.ReactNode} [props.subtitulo] Línea secundaria (ej. fecha · usuario).
 * @param {React.ReactNode} [props.badge]      Badge a la derecha del título.
 * @param {Array<{label:React.ReactNode, value:React.ReactNode}>} [props.campos]
 * @param {React.ReactNode} [props.acciones]   Botones de acción de la tarjeta.
 * @param {Function} [props.onClick]           Si existe, toda la tarjeta es un botón.
 * @param {string} [props.className]
 */
const TarjetaRegistro = ({
  titulo,
  subtitulo,
  badge,
  campos,
  acciones,
  onClick,
  className = '',
}) => {
  const interactiva = typeof onClick === 'function'
  return (
    <div
      className={`tarjeta-registro${interactiva ? ' tarjeta-registro-click' : ''} ${className}`.trim()}
      onClick={onClick}
      role={interactiva ? 'button' : undefined}
      tabIndex={interactiva ? 0 : undefined}
      onKeyDown={
        interactiva
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    >
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div className="min-w-0">
          <div className="fw-semibold text-truncate">{titulo}</div>
          {subtitulo && <div className="small text-body-secondary">{subtitulo}</div>}
        </div>
        {badge}
      </div>

      {campos?.length > 0 && (
        <dl className="tarjeta-registro-campos mb-0">
          {campos.map((c, i) => (
            <div key={i} className="d-flex justify-content-between gap-3">
              <dt className="fw-normal text-body-secondary small mb-0">{c.label}</dt>
              <dd className="mb-0 small text-end">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {acciones && <div className="tarjeta-registro-acciones">{acciones}</div>}
    </div>
  )
}

export default TarjetaRegistro
