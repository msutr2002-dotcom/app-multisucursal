import { db } from '../lib/db'
import { sincronizarEvento } from './colaSyncService'
import { subirComprobantesPendientes } from './compraOfflineService'

/**
 * Motor de sincronización en segundo plano (Offline-First Fase 2, Tarea 2.3).
 * Drena la cola `cola_sincronizacion` (eventos PENDING, en orden FIFO) hacia
 * Supabase usando la misma `sincronizarEvento` del push inmediato.
 *
 * Disparadores: arranque de la app, evento `online` del navegador y un
 * temporizador de respaldo. Nunca bloquea la UI (todo fire-and-forget).
 *
 * Política de estados (ver specs/offline-sync.md):
 * - Éxito → SYNCED; fallo de red → sigue PENDING y se reintenta en la próxima
 *   ronda; rechazo de negocio del RPC → CONFLICT (terminal, resolución manual).
 */

const INTERVALO_MS = 30000

let timer = null
let corriendo = false
let iniciado = false

/**
 * Una ronda de sincronización. Procesa los eventos PENDING en orden FIFO.
 * Se detiene ante el primer fallo de red (con la red caída, el resto fallaría
 * igual) y continúa ante CONFLICTs (quedan marcados, no frenan la cola).
 *
 * @returns {Promise<number>} eventos sincronizados en esta ronda
 */
export async function procesarCola() {
  if (corriendo) return 0
  corriendo = true
  try {
    const eventos = await db.cola_sincronizacion
      .where('sync_status')
      .equals('PENDING')
      .sortBy('timestamp')

    let sincronizados = 0
    let cortadoPorRed = false
    for (const ev of eventos) {
      const r = await sincronizarEvento(ev.id)
      if (r.ok) {
        sincronizados++
        continue
      }
      if (r.motivo === 'sin-red') {
        cortadoPorRed = true
        break
      }
      // 'conflict' | 'en-vuelo' | 'no-pendiente' | 'no-soportado' → siguiente
    }

    // Task 7: recién con los padres SYNCED/remapeados suben los comprobantes
    // locales pendientes (sin red la ronda se cortó arriba: no se intenta)
    if (!cortadoPorRed) {
      await subirComprobantesPendientes().catch((e) =>
        console.warn('Subida de comprobantes pendientes fallida:', e),
      )
    }
    return sincronizados
  } finally {
    corriendo = false
  }
}

function rondaEnSegundoPlano() {
  procesarCola().catch((err) => console.warn('Ronda de sincronización fallida:', err))
}

/**
 * Arranca el motor (idempotente): drena pendientes de sesiones anteriores,
 * escucha `online` y programa el temporizador de respaldo. Llamar una vez
 * desde App.jsx.
 */
export function iniciarMotorSync() {
  if (iniciado) return
  iniciado = true

  rondaEnSegundoPlano()
  window.addEventListener('online', rondaEnSegundoPlano)
  timer = setInterval(rondaEnSegundoPlano, INTERVALO_MS)
}

/** Detiene el motor (solo para pruebas). */
export function detenerMotorSync() {
  if (timer) clearInterval(timer)
  timer = null
  window.removeEventListener('online', rondaEnSegundoPlano)
  iniciado = false
}
