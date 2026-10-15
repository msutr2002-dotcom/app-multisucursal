import React, { createContext, useContext, useState } from 'react'
import { CToast, CToastBody, CToastHeader, CToaster, CButton } from '@coreui/react'

const ToastContext = createContext()

export const useToast = () => useContext(ToastContext)

// Mensajes crudos de Postgres/RLS/infra/JS no deben llegar al cajero. Si un
// toast de error huele a técnico, se sustituye por uno genérico accionable.
// cubre: SQL/PostgREST, red (Failed to fetch / NetworkError) y ReferenceError
// de frontend. Los mensajes de negocio (español, call sites) pasan tal cual.
const esTecnico = (msg = '') =>
  /column|relation|function|syntax|constraint|violat|permission denied|does not exist|uuid|pgrst|jsonb|foreign key|duplicate key|SQLSTATE|syntax error|Failed to fetch|NetworkError|ERR_INTERNET|ERR_NETWORK|is not defined|is not a function|TypeError|ReferenceError|undefined is not/i.test(
    String(msg),
  )

const mensajeUsuario = (msg) => {
  const texto = String(msg ?? '')
  if (!texto) return 'Ocurrió un error. Intenta de nuevo.'
  return esTecnico(texto) ? 'No se pudo completar la operación. Intenta de nuevo.' : texto
}

const MAX_TOASTS = 3

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([])

  const showToast = (color, title, message, accion = null) => {
    const id = Date.now() + Math.random()
    const toast = (
      <CToast key={id} color={color} visible={true} autohide={true} delay={accion ? 6000 : 5000}>
        <CToastHeader closeButton>
          <strong className="me-auto">{title}</strong>
        </CToastHeader>
        <CToastBody>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <span>{mensajeUsuario(message)}</span>
            {accion && (
              <CButton
                size="sm"
                color="light"
                variant="outline"
                className="text-nowrap flex-shrink-0"
                onClick={() => {
                  accion.onClick()
                  setToasts((prev) => prev.filter((t) => t.key !== id))
                }}
              >
                {accion.label}
              </CButton>
            )}
          </div>
        </CToastBody>
      </CToast>
    )
    setToasts((prev) => {
      // danger se pina al frente y no se auto-oculta hasta que el usuario lo cierre
      const nuevos = color === 'danger' ? [toast, ...prev] : [...prev, toast]
      return nuevos.slice(-MAX_TOASTS)
    })
  }

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div aria-live="polite" aria-atomic="false">
        <CToaster placement="top-end">{toasts}</CToaster>
      </div>
    </ToastContext.Provider>
  )
}
