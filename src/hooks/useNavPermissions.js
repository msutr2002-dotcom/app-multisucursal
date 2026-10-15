import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { hayRed } from '../services/redService'
import { guardarPermiso, leerPermiso } from '../services/permisoService'

const MODULOS = [
  'usuarios',
  'empresas',
  'sucursales',
  'bodegas',
  'roles',
  'pos',
  'productos',
  'ingredientes',
  'clientes',
  'catalogos',
  'historial',
  'compras',
  'traslados',
  'inventario',
  'reportes',
  'facturacion',
]

const mapaTodos = (valor) => {
  const mapa = {}
  MODULOS.forEach((m) => {
    mapa[m] = valor
  })
  return mapa
}

// Semilla del primer render (evita el "flash de admin" al recargar la página):
// Admin → todo true; otros roles → lo que haya en cache; sin rol → null (resolviendo).
const estadoInicial = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  if (currentUser?.id_rol?.name === 'Admin') return mapaTodos(true)
  if (!currentUser?.id_rol?.id) return null
  const mapa = {}
  MODULOS.forEach((m) => {
    mapa[m] = leerPermiso(currentUser.id_rol.id, m, 'ver') === true
  })
  return mapa
}

const useNavPermissions = () => {
  const [permisos, setPermisos] = useState(estadoInicial)

  const cargarPermisos = async () => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'))
    const idRol = currentUser?.id_rol?.id

    // Admin ve todo
    if (currentUser?.id_rol?.name === 'Admin') {
      const todos = {}
      MODULOS.forEach((m) => {
        todos[m] = true
      })
      setPermisos(todos)
      return
    }

    // Otros roles: consultar permisos ver (con red) y cachearlo por módulo
    // para que PermissionRoute pueda resolverlo sin red (offline-first).
    if (hayRed()) {
      try {
        const { data, error } = await supabase.rpc('get_permisos_by_rol', {
          p_id_rol: idRol,
        })
        if (!error) {
          const mapa = {}
          MODULOS.forEach((m) => {
            mapa[m] = false
          })
          ;(data || []).forEach((p) => {
            if (p.puede_ver) mapa[p.modulo] = true
          })
          MODULOS.forEach((m) => {
            guardarPermiso(idRol, m, 'ver', mapa[m])
          })
          setPermisos(mapa)
          return
        }
      } catch {
        /* la red cayó a mitad de la llamada → usa el cache */
      }
    }

    // Sin red (o RPC falló): último resultado cacheado por módulo;
    // sin cache, se muestra todo (la UI no se bloquea por red; RLS protege).
    const mapa = {}
    MODULOS.forEach((m) => {
      const cacheado = leerPermiso(idRol, m, 'ver')
      mapa[m] = cacheado === null ? true : cacheado
    })
    setPermisos(mapa)
  }

  useEffect(() => {
    // setTimeout: la regla react-hooks/set-state-in-effect prohíbe llamar
    // setState directo desde el effect (patrón del repo: ver Catalogos.jsx).
    const t = setTimeout(() => cargarPermisos(), 0)
    return () => clearTimeout(t)
  }, [])

  return permisos
}

export default useNavPermissions
