/**
 * useCierreInactividad — cierra la sesión tras 15 min sin interacción.
 *
 * Se monta en el área autenticada (`DefaultLayout`). Reinicia el reloj con
 * cada interacción del usuario y, al superar el timeout, cierra la sesión.
 * Persiste la marca en `localStorage` para sobrevivir recargas y sincroniza
 * entre pestañas (`storage`). El timeout se puede acortar para pruebas con
 * `window.__SESSION_IDLE_MS__`.
 *
 * @module useCierreInactividad
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CLAVE_ACTIVIDAD,
  TIMEOUT_INACTIVIDAD_MS,
  leerActividad,
  marcarActividad,
  cerrarSesion,
} from '../services/sesionService'

/** Eventos de DOM que cuentan como actividad del usuario. */
const EVENTOS_ACTIVIDAD = [
  'mousemove',
  'mousedown',
  'pointerdown',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
]

/** Frecuencia de la revisión del reloj de inactividad. */
const INTERVALO_REVISION_MS = 15000

/** Throttle de escritura de la marca de actividad. */
const THROTTLE_MS = 1000

export default function useCierreInactividad() {
  const navigate = useNavigate()

  useEffect(() => {
    const timeout =
      Number(window.__SESSION_IDLE_MS__) > 0
        ? Number(window.__SESSION_IDLE_MS__)
        : TIMEOUT_INACTIVIDAD_MS

    let ultimaActividad = leerActividad() ?? Date.now()
    marcarActividad(ultimaActividad)

    const revisar = () => {
      if (Date.now() - ultimaActividad >= timeout) cerrarSesion(navigate)
    }

    // Revisión inmediata: si la marca heredada ya expiró (app reabierta),
    // cierra sin esperar al intervalo.
    revisar()

    let ultimaEscritura = 0
    const registrarActividad = () => {
      const ahora = Date.now()
      if (ahora - ultimaEscritura < THROTTLE_MS) return
      ultimaEscritura = ahora
      ultimaActividad = ahora
      marcarActividad(ahora)
    }

    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS)

    // Otra pestaña registró actividad → adoptar su marca.
    // Otra pestaña cerró sesión → cerrar esta también.
    const onStorage = (evento) => {
      if (evento.key === CLAVE_ACTIVIDAD && evento.newValue) {
        ultimaActividad = Number(evento.newValue)
      }
      if (evento.key === 'currentUser' && evento.newValue === null) {
        navigate('/login', { replace: true })
      }
    }

    EVENTOS_ACTIVIDAD.forEach((evento) =>
      window.addEventListener(evento, registrarActividad, { passive: true }),
    )
    window.addEventListener('storage', onStorage)

    return () => {
      clearInterval(intervalo)
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, registrarActividad))
      window.removeEventListener('storage', onStorage)
    }
  }, [navigate])
}
