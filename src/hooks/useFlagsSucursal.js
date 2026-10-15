import { useState, useEffect } from 'react'
import { leerFlagsSucursal, hidratarFlagsSucursal } from '../services/catalogSyncService'

/**
 * Flags de la sucursal activa (`vender_sin_stock` / `activar_ingredientes`).
 *
 * Offline-first: lee el espejo de Dexie (mismo origen que POS/Productos) y,
 * si hay red, rehidrata en background (fire-and-forget) para que un
 * dispositivo que aún no abrió el POS también tenga el flag. Default OFF
 * hasta que se confirme (mismo criterio que `esComida` en POSPage).
 *
 * @returns {{esComida: boolean, venderSinStock: boolean, listo: boolean}}
 */
const useFlagsSucursal = () => {
  const [estado, setEstado] = useState({
    esComida: false,
    venderSinStock: false,
    listo: false,
  })

  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'))
    const idSucursal = currentUser?.id_sucursal
    if (!idSucursal) return undefined
    let vivo = true
    const aplicar = (f) => {
      if (!vivo || !f) return
      setEstado({
        esComida: !!f.activar_ingredientes,
        venderSinStock: !!f.vender_sin_stock,
        listo: true,
      })
    }
    leerFlagsSucursal(idSucursal)
      .then(aplicar)
      .catch(() => {})
    hidratarFlagsSucursal(idSucursal)
      .then(() => leerFlagsSucursal(idSucursal))
      .then(aplicar)
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])

  return estado
}

export default useFlagsSucursal
