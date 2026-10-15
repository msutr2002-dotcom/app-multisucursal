import React from 'react'
import { Navigate } from 'react-router-dom'

const PublicRoute = ({ children }) => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))

  if (currentUser) {
    // Ya está logueado → redirigir a dashboard
    return <Navigate to="/dashboard" replace />
  }

  return children
}

export default PublicRoute
