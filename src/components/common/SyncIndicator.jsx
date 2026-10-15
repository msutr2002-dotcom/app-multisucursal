import React, { useCallback, useEffect, useState } from 'react'
import { CBadge, CButton, CSpinner } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilReload, cilWarning } from '@coreui/icons'
import { contarPendientes } from '../../services/colaSyncService'
import { procesarCola } from '../../services/syncEngineService'
import { useToast } from './ToastContext'

/**
 * Indicador de estado de sincronización (Offline-First Tarea 2.4).
 * Muestra en el topbar: sin conexión / N pendientes / sincronizado,
 * con un botón para forzar una ronda de `procesarCola()` a mano.
 * Nunca bloquea la UI: el conteo es local (IndexedDB) y el sync corre en background.
 */
const SyncIndicator = () => {
  const showToast = useToast()
  const [pendientes, setPendientes] = useState(0)
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  const [corriendo, setCorriendo] = useState(false)

  const refrescar = useCallback(() => {
    contarPendientes()
      .then(setPendientes)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refrescar()
    const timer = setInterval(refrescar, 5000)
    const alVolver = () => {
      setEnLinea(true)
      refrescar()
    }
    const alCortar = () => setEnLinea(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCortar)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCortar)
    }
  }, [refrescar])

  const sincronizarAhora = async () => {
    if (corriendo) return
    setCorriendo(true)
    try {
      await procesarCola()
      const restantes = await contarPendientes()
      setPendientes(restantes)
      if (restantes > 0) {
        showToast(
          'danger',
          'Sincronización',
          `Quedan ${restantes} por sincronizar (¿sin conexión?)`,
        )
      } else {
        showToast('success', 'Sincronización', 'Todo sincronizado')
      }
    } catch (err) {
      console.warn('Sync manual fallida:', err)
      showToast('danger', 'Sincronización', 'No se pudo sincronizar, se reintentará solo')
    } finally {
      setCorriendo(false)
    }
  }

  let badge
  if (!enLinea) {
    badge = (
      <CBadge color="danger" className="me-2">
        <CIcon icon={cilWarning} className="me-1" />
        Sin conexión{pendientes > 0 ? ` · ${pendientes} por enviar` : ''}
      </CBadge>
    )
  } else if (pendientes > 0) {
    badge = (
      <CBadge color="warning" className="me-2">
        Cola: {pendientes} por enviar
      </CBadge>
    )
  } else {
    badge = (
      <CBadge color="success" className="me-2">
        Sincronizado
      </CBadge>
    )
  }

  return (
    <span className="d-inline-flex align-items-center">
      {badge}
      <CButton
        color="light"
        variant="outline"
        size="sm"
        onClick={sincronizarAhora}
        disabled={corriendo}
        title="Sincronizar ahora"
        aria-label="Sincronizar ahora"
      >
        {corriendo ? <CSpinner size="sm" /> : <CIcon icon={cilReload} />}
      </CButton>
    </span>
  )
}

export default SyncIndicator
