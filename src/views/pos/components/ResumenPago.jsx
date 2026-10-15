import React from 'react'
import { formatQ } from '../../../utils/format'

const Fila = ({ label, valor, className = '' }) => (
  <div className={`d-flex justify-content-between align-items-center py-1 ${className}`}>
    <span className="text-body-secondary">{label}</span>
    <span className="monto">{valor}</span>
  </div>
)

const ResumenPago = ({
  subtotal,
  total,
  cambio,
  falta,
  esEfectivo,
  conRecibido = false,
  descuentoBp = 0,
  descuentoMonto = 0,
}) => {
  // rojo solo si falta dinero; verde si hay cambio; neutro si el pago es exacto
  // (Q0.00 en rojo se leía como error — critique 2026-10).
  const colorVuelto = falta > 0 ? 'danger' : cambio > 0 ? 'success' : 'secondary'

  return (
    <div className="bg-body-secondary rounded p-3 mt-3">
      {esEfectivo && conRecibido && (
        <Fila
          label="Vuelto"
          valor={<strong style={{ color: `var(--cui-${colorVuelto})` }}>{formatQ(cambio)}</strong>}
        />
      )}

      {esEfectivo && falta > 0 && (
        <Fila
          label="Falta"
          valor={<strong style={{ color: 'var(--cui-danger)' }}>{formatQ(falta)}</strong>}
        />
      )}

      {/* Subtotal solo aporta info si difiere del total (sin descuentos son iguales) */}
      {subtotal !== total && <Fila label="Subtotal" valor={<strong>{formatQ(subtotal)}</strong>} />}
      {/* Mayoreo (RF-MY4): línea explícita en el resumen y el ticket (D1) */}
      {descuentoMonto > 0 && (
        <Fila
          label={`Descuento mayoreo (${descuentoBp / 100}%)`}
          valor={
            <strong style={{ color: 'var(--cui-success)' }}>−{formatQ(descuentoMonto)}</strong>
          }
        />
      )}
      <div className="d-flex justify-content-between align-items-center pt-2 border-top mt-1">
        <span className="fw-bold">TOTAL</span>
        <span className="fs-5 fw-bold monto" style={{ color: 'var(--pos-primary)' }}>
          {formatQ(total)}
        </span>
      </div>
    </div>
  )
}

export default ResumenPago
