/**
 * Estado de red y bloqueo de solicitudes al servidor (Task 2, specs/offline-suite.md
 * RF-03): "Desactivar la solicitud de folios oficiales a la API fiscal si
 * `navigator.onLine === false`".
 *
 * Fuente única de verdad para decidir si una operación que necesita el servidor
 * (folio oficial, anulación, edición de cliente, RPC de cotizaciones) puede
 * intentarse. La UI debe consultarla ANTES de disparar cualquier fetch para que
 * la interfaz nunca se bloquee ni deje de responder por latencia o caída de red
 * (RNF-02), y para que la UI pueda avisar con un mensaje concreto.
 */

/** Motivo/leyenda para tooltips y toasts cuando el folio oficial no se puede pedir. */
export const AVISO_FOLIO_SIN_RED =
  'Sin conexión: el folio oficial se solicita al recuperar la red. ' +
  'Mientras tanto el comprobante se imprime desde los datos locales de este dispositivo.'

/**
 * `true` si el navegador reporta conexión. `navigator.onLine` es una pista (true
 * no garantiza que Supabase responda), por eso los flujos que sí dependen del
 * servidor siguen atrapando el error y clasificando el fallo con
 * `clasificarFallo` de `colaSyncService`.
 * @returns {boolean}
 */
export function hayRed() {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/**
 * Regla de negocio central: sin red NO se solicitan folios oficiales ni datos
 * al servidor. Devuelve `false` para que el llamador ofrezca la respuesta local
 * y el aviso, en vez de dejar el botón en un spinner eterno.
 * @returns {boolean}
 */
export function puedeSolicitarFolioOficial() {
  return hayRed()
}
