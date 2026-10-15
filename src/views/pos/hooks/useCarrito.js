import { useState, useCallback, useMemo, useEffect } from 'react'
import { calcularTier, factorDe, esPresentacion, maxCantidad } from '../precioUtils'

/**
 * Regla de selección de precio:
 * - Al agregar: tier según override o Auto (solo tiers base)
 * - Al cambiar cantidad: AUTO → el más barato que cumpla min_cantidad <= cantidad
 * - Override manual: se conserva SOLO si su tier es presentación (D6); los tiers
 *   base mantienen el reset a AUTO de siempre.
 * - Identidad de línea (D5): (idProducto, unidad del tier) — líneas de distinta
 *   unidad NO se fusionan (2 Cajas + 5 und = 2 líneas).
 */
const carritoKey = (idSucursal) => `pos_carrito_${idSucursal || 'default'}`

function cargarCarrito(idSucursal) {
  try {
    const raw = localStorage.getItem(carritoKey(idSucursal))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function recalc(item, cantidad, overrideManual) {
  const tier = calcularTier(item.precios, cantidad, overrideManual)

  const precio = tier.precio // centavos enteros
  return {
    ...item,
    cantidad,
    overrideManual,
    idPrecioSeleccionado: tier.id,
    tipoPrecio: tier.tipo,
    precio,
    subtotal: precio * cantidad, // entero × entero = entero
    factor: factorDe(tier), // unidades base por 1 unidad de venta del tier
    // La unidad de la línea (id_unidad_venta/unidad/unidadAbrev) es ESTABLE:
    // se fija al crearla y define su identidad (D5); recalc no la toca.
  }
}

/** ¿Esta línea es la que busca la clave (producto, unidad)? */
function mismaLinea(i, idProducto, idUnidad) {
  if (i.idProducto !== idProducto) return false
  if (idUnidad === undefined) return true // compat: sin unidad → la línea del producto
  return (i.id_unidad_venta || null) === (idUnidad || null)
}

export function useCarrito(idSucursal) {
  const [items, setItems] = useState(() => cargarCarrito(idSucursal))
  useEffect(() => {
    try {
      localStorage.setItem(carritoKey(idSucursal), JSON.stringify(items))
    } catch (e) {
      console.error('No se pudo guardar el carrito:', e)
    }
  }, [items, idSucursal])

  const addItem = useCallback((producto, cantidadInicial = 1, idPrecioManual = null) => {
    setItems((prev) => {
      const precios = producto.precios || []
      const tierInicial = calcularTier(precios, cantidadInicial, idPrecioManual)
      const idUnidad = tierInicial.id_unidad_venta || null
      const max = maxCantidad(producto.stockActual ?? 0, factorDe(tierInicial))

      const existe = prev.find(
        (i) => i.idProducto === producto.id && (i.id_unidad_venta || null) === idUnidad,
      )
      if (existe) {
        const nueva = Math.max(
          1,
          Math.min(existe.cantidad + cantidadInicial, maxCantidad(existe.stock, existe.factor)),
        )
        return prev.map((i) => (i === existe ? recalc(i, nueva, existe.overrideManual) : i))
      }

      const stock = producto.stockActual ?? 0
      const cantidad = Math.max(1, Math.min(cantidadInicial, max || 1))
      const item = {
        idProducto: producto.id,
        name: producto.name,
        sku: producto.sku,
        precios,
        stock,
        cantidad: 1,
        overrideManual: null,
        id_unidad_venta: idUnidad,
        unidad: tierInicial.unidad || null,
        unidadAbrev: tierInicial.unidadAbrev || null,
      }
      return [...prev, recalc(item, cantidad, idPrecioManual)]
    })
  }, [])

  const setCantidad = useCallback((idProducto, cantidad, idUnidad) => {
    setItems((prev) =>
      prev.map((i) => {
        if (!mismaLinea(i, idProducto, idUnidad)) return i
        // Clamp en la unidad del tier elegido: override → su factor; AUTO → base (1)
        const tierRef = i.overrideManual ? i.precios.find((p) => p.id === i.overrideManual) : null
        const max = maxCantidad(i.stock, factorDe(tierRef))
        const nueva = Math.max(1, Math.min(cantidad || 1, max))
        // D6: se conserva el override solo si su tier es presentación;
        // los tiers base (y AUTO) mantienen el reset a AUTO.
        const conservar = tierRef && esPresentacion(tierRef) ? i.overrideManual : null
        return recalc(i, nueva, conservar)
      }),
    )
  }, [])

  const setPrecioManual = useCallback((idProducto, idPrecioManual) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.idProducto !== idProducto) return i
        // idPrecioManual === null → volver a AUTO
        const actualizado = recalc(i, i.cantidad, idPrecioManual)
        // Cambio explícito de tier: la unidad de la línea pasa a ser la del nuevo tier
        const tier = i.precios.find((p) => p.id === idPrecioManual)
        return tier
          ? {
              ...actualizado,
              id_unidad_venta: tier.id_unidad_venta || null,
              unidad: tier.unidad || null,
              unidadAbrev: tier.unidadAbrev || null,
            }
          : { ...actualizado, id_unidad_venta: null, unidad: null, unidadAbrev: null }
      }),
    )
  }, [])

  // Se llama desde la UI con la línea ya localizada en `items` (para ofrecer
  // "Deshacer" el POS la busca antes de eliminarla: el updater de setItems NO
  // corre sincrónicamente, no se puede capturar desde aquí).
  const removeItem = useCallback((idProducto, idUnidad) => {
    setItems((prev) => prev.filter((i) => !mismaLinea(i, idProducto, idUnidad)))
  }, [])

  // Restaura una línea eliminada (botón "Deshacer" del toast, ~5 s).
  const restoreItem = useCallback((item) => {
    setItems((prev) =>
      prev.some((i) => mismaLinea(i, item.idProducto, item.id_unidad_venta))
        ? prev
        : [...prev, item],
    )
  }, [])

  // Carga completa (pendiente guardado): conserva el tier si sigue vigente,
  // si no, recalcula AUTO con precios actuales; la unidad se deriva del tier
  const loadItems = useCallback((nuevos) => {
    setItems(
      nuevos.map((i) => {
        const tier = calcularTier(i.precios || [], i.cantidad, i.id_precio_producto ?? null)
        return {
          ...recalc(i, i.cantidad, i.id_precio_producto ?? null),
          id_unidad_venta: i.id_unidad_venta ?? tier?.id_unidad_venta ?? null,
          unidad: i.unidad ?? tier?.unidad ?? null,
          unidadAbrev: i.unidadAbrev ?? tier?.unidadAbrev ?? null,
        }
      }),
    )
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const total = useMemo(() => items.reduce((suma, i) => suma + i.subtotal, 0), [items])

  return {
    items,
    addItem,
    setCantidad,
    setPrecioManual,
    removeItem,
    restoreItem,
    loadItems,
    clear,
    total,
  }
}
