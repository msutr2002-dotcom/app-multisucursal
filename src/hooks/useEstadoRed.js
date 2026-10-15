import { useState, useEffect } from 'react'
import { hayRed } from '../services/redService'

/**
 * Estado de conexión del dispositivo (`navigator.onLine`) con listeners
 * `online`/`offline` (Task 2, specs/offline-suite.md RF-03).
 *
 * Permite que las vistas cambien de fuente de verdad al vuelo: con red leen del
 * servidor y sin red de IndexedDB, sin bloquear la interfaz (RNF-02) y avisando
 * al usuario con la leyenda de comprobante sin fiscalizar.
 *
 * @returns {boolean} `true` si el navegador reporta conexión
 */
const useEstadoRed = () => {
  const [enLinea, setEnLinea] = useState(hayRed)

  useEffect(() => {
    const alVolver = () => setEnLinea(true)
    const alCortar = () => setEnLinea(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCortar)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCortar)
    }
  }, [])

  return enLinea
}

export default useEstadoRed
