/**
 * sesionService — higiene de la sesión local (Offline-First).
 *
 * La sesión del POS vive en `localStorage` (`currentUser`). Este servicio
 * centraliza el cierre de sesión y el reloj de inactividad para que exista
 * una sola fuente de verdad (logout manual + cierre automático).
 *
 * @module sesionService
 */

/** Clave de `localStorage` con la última marca de actividad del usuario (ms). */
export const CLAVE_ACTIVIDAD = 'session_last_activity'

/** Inactividad máxima antes de cerrar sesión: 15 minutos. */
export const TIMEOUT_INACTIVIDAD_MS = 15 * 60 * 1000

/**
 * Lee la última marca de actividad registrada.
 * @returns {number|null} timestamp en ms, o `null` si no hay marca.
 */
export function leerActividad() {
  const valor = Number(localStorage.getItem(CLAVE_ACTIVIDAD))
  return Number.isFinite(valor) && valor > 0 ? valor : null
}

/**
 * Registra la actividad del usuario en este instante.
 * @param {number} [timestamp] instante a guardar (por defecto `Date.now()`).
 */
export function marcarActividad(timestamp = Date.now()) {
  localStorage.setItem(CLAVE_ACTIVIDAD, String(timestamp))
}

/**
 * Cierra la sesión: limpia la sesión local completa y navega a `/login`.
 * Única vía de cierre (logout manual y cierre por inactividad).
 * @param {Function} [navigate] función `navigate` de react-router.
 */
export function cerrarSesion(navigate) {
  localStorage.removeItem('currentUser')
  localStorage.removeItem('empresaSeleccionada')
  localStorage.removeItem(CLAVE_ACTIVIDAD)
  if (typeof navigate === 'function') navigate('/login', { replace: true })
}
