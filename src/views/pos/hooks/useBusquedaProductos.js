import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { db } from '../../../lib/db'

/**
 * Búsqueda de productos para el POS (Offline-First: primero IndexedDB).
 * - Escribe → espera 300ms → busca en el catálogo local (Dexie); si el catálogo
 *   local está vacío (aún sin hidratar o sin datos) → fallback al RPC buscar_productos
 * - Vacío → limpia resultados (NO toca selected)
 * - selected SOLO cambia con seleccionar() o clear()
 */
/**
 * Une nombre/abreviatura de unidad a cada tier (para etiquetas de presentación
 * "CAJA · Q110.00 (1 Caja = 12 und)" y la identidad de línea del carrito).
 */
function conUnidades(p, unidades) {
  if (!p?.precios?.length || !unidades?.length) return p
  return {
    ...p,
    precios: p.precios.map((tier) => {
      const u = unidades.find((x) => x.id === tier.id_unidad_venta)
      return u ? { ...tier, unidad: u.name, unidadAbrev: u.abreviatura } : tier
    }),
  }
}

export function useBusquedaProductos(idSucursal) {
  const [query, setQueryState] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const timerRef = useRef(null)
  const requestIdRef = useRef(0)
  const unidadesRef = useRef(null)

  // Limpiar/arrancar la búsqueda ocurre en el handler (permitido), no en el effect
  const setQuery = useCallback((nueva) => {
    setQueryState(nueva)
    clearTimeout(timerRef.current)
    if (nueva.trim()) {
      setLoading(true)
    } else {
      setResults([])
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => {
    setQueryState('')
    setResults([])
    setSelected(null)
  }, [])

  const seleccionar = useCallback(async (p) => {
    clearTimeout(timerRef.current)
    if (unidadesRef.current === null) {
      try {
        unidadesRef.current = await db.unidades.toArray()
      } catch {
        unidadesRef.current = []
      }
    }
    setSelected(conUnidades(p, unidadesRef.current))
    setResults([])
    setLoading(false)
    setQueryState('')
  }, [])

  /**
   * RF-V4 — lector de barras: coincidencia EXACTA de sku, sin pasar por el
   * debounce de 300ms. Devuelve true si encontró y seleccionó el producto.
   */
  const seleccionarPorCodigo = useCallback(
    async (texto) => {
      const t = (texto || '').trim().toLowerCase()
      if (!t) return false
      try {
        const totalLocal = await db.productos.count()
        let match = null
        if (totalLocal > 0) {
          match = await db.productos.filter((p) => (p.sku || '').toLowerCase() === t).first()
        } else {
          const { data, error } = await supabase.rpc('buscar_productos', {
            p_query: t,
            p_id_sucursal: idSucursal,
          })
          if (!error && Array.isArray(data)) {
            match = data.find((p) => (p.sku || '').toLowerCase() === t) || null
          }
        }
        if (match) {
          seleccionar(match)
          return true
        }
      } catch (err) {
        console.error('Error buscando por código:', err)
      }
      return false
    },
    [idSucursal, seleccionar],
  )

  useEffect(() => {
    const q = query.trim()
    const requestId = ++requestIdRef.current // invalida respuestas anteriores

    if (!q) return

    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        // 1) Primero: catálogo local (IndexedDB) — nunca depende de la red
        const termino = q.toLowerCase()
        const totalLocal = await db.productos.count()

        if (totalLocal > 0) {
          if (requestId !== requestIdRef.current) return
          const locales = await db.productos
            .filter((p) =>
              [p.name, p.sku, p.marca, p.categoria].some((campo) =>
                (campo || '').toLowerCase().includes(termino),
              ),
            )
            .toArray()

          // RF-V4: sku EXACTO y único (lector de barras sin Enter) → de una vez.
          // Con más de un resultado NO secuestra la búsqueda por nombre.
          const exacto = locales.find((p) => (p.sku || '').toLowerCase() === termino)
          if (exacto && termino.length >= 3 && locales.length === 1) {
            seleccionar(exacto)
            return
          }

          // padre/hijo: no listar hijos sueltos (se alcanzan desde su padre).
          const ordenados = locales
            .filter((p) => !p.id_padre)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .slice(0, 30)
          setResults(ordenados)
          setLoading(false)
          return // el catálogo local respondió, no se toca la red
        }

        // 2) Fallback: catálogo local vacío → Supabase
        const { data, error } = await supabase.rpc('buscar_productos', {
          p_query: q,
          p_id_sucursal: idSucursal,
        })

        if (error) throw error
        if (requestId !== requestIdRef.current) return // respuesta obsoleta

        const arr = Array.isArray(data) ? data : []

        // RF-V4: sku EXACTO y único también en el fallback remoto → de una vez
        const exactoRemoto = arr.find((p) => (p.sku || '').toLowerCase() === termino)
        if (exactoRemoto && termino.length >= 3 && arr.length === 1) {
          seleccionar(exactoRemoto)
          return
        }

        // padre/hijo: no listar hijos sueltos (se alcanzan desde su padre).
        setResults(arr.filter((p) => !p.id_padre))
        // OJO: aquí NO se modifica selected (eso cerraba el detalle)
      } catch (err) {
        console.error('Error buscando productos:', err)
        if (requestId === requestIdRef.current) setResults([])
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timerRef.current)
  }, [query, idSucursal, seleccionar])

  return {
    query,
    setQuery,
    results,
    loading,
    selected,
    setSelected,
    seleccionar,
    seleccionarPorCodigo,
    clear,
  }
}
