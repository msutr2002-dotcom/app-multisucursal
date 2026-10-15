import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { CSpinner } from '@coreui/react'
import { verificarPermiso } from '../services/permisoService'

const PermissionRoute = ({ modulo, children }) => {
  const [tienePermiso, setTienePermiso] = useState(null)

  useEffect(() => {
    let vivo = true
    const currentUser = JSON.parse(localStorage.getItem('currentUser'))
    verificarPermiso(currentUser?.id_rol?.id, currentUser?.id_rol?.name, modulo, 'ver').then(
      (ok) => {
        if (vivo) setTienePermiso(ok)
      },
    )
    return () => {
      vivo = false
    }
  }, [modulo])

  if (tienePermiso === null) {
    return (
      <div className="text-center py-4">
        <CSpinner color="primary" />
      </div>
    )
  }
  if (!tienePermiso) return <Navigate to="/dashboard" replace />
  return children
}

export default PermissionRoute
