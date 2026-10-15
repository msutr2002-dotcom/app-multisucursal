import { supabase } from '../lib/supabase'
import { hayRed } from './redService'

const claveCache = (idRol, modulo, accion) => `perm_${idRol}_${modulo}_${accion}`

export function guardarPermiso(idRol, modulo, accion, ok) {
  try {
    localStorage.setItem(claveCache(idRol, modulo, accion), ok ? '1' : '0')
  } catch {
    /* localStorage no disponible */
  }
}

export function leerPermiso(idRol, modulo, accion) {
  try {
    const v = localStorage.getItem(claveCache(idRol, modulo, accion))
    return v === null ? null : v === '1'
  } catch {
    return null
  }
}

/**
 * Resuelve un permiso de forma offline-first (spec offline-suite):
 * - Admin → true sin consultar.
 * - Con red → RPC `has_permission` y cachea el resultado en localStorage.
 * - Sin red (o si el RPC falla) → último resultado cacheado por rol+módulo+acción;
 *   si nunca se cacheó, PERMITE (la UI no se bloquea por red — los datos siguen
 *   protegidos en el servidor vía RLS y RPCs con permisos).
 * Sin esto, `has_permission` sin red devolvía `data: null` → false → la ruta se
 * vaciaba o redirigía (bug "vista en blanco al ir al módulo de ventas").
 */
export async function verificarPermiso(idRol, nombreRol, modulo, accion) {
  if (nombreRol === 'Admin') return true

  if (hayRed()) {
    try {
      const { data, error } = await supabase.rpc('has_permission', {
        p_id_rol: idRol,
        p_modulo: modulo,
        p_accion: accion,
      })
      if (!error) {
        const ok = data ?? false
        guardarPermiso(idRol, modulo, accion, ok)
        return ok
      }
    } catch {
      /* la red cayó a mitad de la llamada → intenta el cache */
    }
  }

  const cacheado = leerPermiso(idRol, modulo, accion)
  return cacheado === null ? true : cacheado
}

/**
 * Permiso de botón del POS (pos-ux-permisos RF-P2): a diferencia de
 * `verificarPermiso`, una fila INEXISTENTE en permisos significa VISIBLE
 * (default true al cargar en ModalPermisos) — solo se oculta el botón cuando
 * el admin desmarcó explícitamente la casilla Ver del módulo (`pos_cotizar` /
 * `pos_ver_cotizaciones`). Por eso se consulta `get_permisos_by_rol` (que
 * devuelve filas) en vez de `has_permission` (que devuelve false sin fila).
 * Offline-first: cache `permpos_<rol>_<modulo>`; sin red y sin cache → true.
 */
export async function verificarPermisoBotonPos(idRol, nombreRol, modulo) {
  if (nombreRol === 'Admin') return true
  const clave = `permpos_${idRol}_${modulo}`

  if (hayRed()) {
    try {
      const { data, error } = await supabase.rpc('get_permisos_by_rol', { p_id_rol: idRol })
      if (!error) {
        const fila = (data || []).find((p) => p.modulo === modulo)
        const ok = fila ? !!fila.puede_ver : true
        try {
          localStorage.setItem(clave, ok ? '1' : '0')
        } catch {
          /* localStorage no disponible */
        }
        return ok
      }
    } catch {
      /* la red cayó a mitad de la llamada → intenta el cache */
    }
  }

  try {
    const v = localStorage.getItem(clave)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}
