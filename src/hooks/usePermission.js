import { useState, useEffect } from 'react'
import { verificarPermiso } from '../services/permisoService'

const usePermission = (modulo, accion) => {
  const [tienePermiso, setTienePermiso] = useState(true)

  useEffect(() => {
    const currentUser = JSON.parse(localStorage.getItem('currentUser'))
    verificarPermiso(currentUser?.id_rol?.id, currentUser?.id_rol?.name, modulo, accion).then(
      (ok) => setTienePermiso(ok),
    )
  }, [modulo, accion])

  return tienePermiso
}

export default usePermission
