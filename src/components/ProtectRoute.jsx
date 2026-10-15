import React from 'react'
import { Navigate } from 'react-router-dom'

const ProtectedRoute = ({ children }) => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))

  if (!currentUser) {
    // No está logueado → redirigir a login
    return <Navigate to="/login" replace />
  }

  return children
}

export default ProtectedRoute
