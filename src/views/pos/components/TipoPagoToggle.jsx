import React from 'react'
import CIcon from '@coreui/icons-react'
import { cilMoney, cilBank, cilCreditCard, cilWallet, cilWarning, cilReload } from '@coreui/icons'
import { CButton, CSpinner } from '@coreui/react'

const iconoPorNombre = (name = '') => {
  const n = name.toLowerCase()
  if (n.includes('efectivo')) return cilMoney
  if (n.includes('transfer')) return cilBank
  if (n.includes('tarjeta')) return cilCreditCard
  return cilWallet
}

const TipoPagoToggle = ({
  metodos,
  value,
  onChange,
  cargando = false,
  error = false,
  onReintentar,
}) => {
  if (cargando && !metodos.length) {
    return (
      <div className="d-flex align-items-center gap-2 text-body-secondary small">
        <CSpinner size="sm" />
        Cargando métodos de pago...
      </div>
    )
  }

  if (error && !metodos.length) {
    return (
      <div className="d-flex align-items-center justify-content-between gap-2">
        <span className="text-body-secondary small">
          <CIcon icon={cilWarning} className="me-1" />
          No se pudieron cargar los métodos de pago
        </span>
        {onReintentar && (
          <CButton color="secondary" variant="outline" size="sm" onClick={onReintentar}>
            <CIcon icon={cilReload} className="me-1" />
            Reintentar
          </CButton>
        )}
      </div>
    )
  }

  if (!metodos.length) {
    return (
      <div className="text-body-secondary small">
        No hay métodos de pago guardados en este dispositivo
      </div>
    )
  }

  return (
    <div className="d-flex gap-2" role="group" aria-label="Método de pago">
      {metodos.map((m) => {
        const activo = m.id === value
        return (
          <button
            key={m.id}
            type="button"
            aria-pressed={activo}
            onClick={() => onChange(m.id)}
            className="btn flex-grow-1 d-flex align-items-center justify-content-center gap-2"
            style={
              activo
                ? {
                    borderColor: 'var(--pos-primary)',
                    color: 'var(--pos-primary)',
                    background: 'var(--pos-primary-soft)',
                    fontWeight: 600,
                  }
                : undefined
            }
          >
            <CIcon icon={iconoPorNombre(m.name)} />
            {m.name}
          </button>
        )
      })}
    </div>
  )
}

export default TipoPagoToggle
