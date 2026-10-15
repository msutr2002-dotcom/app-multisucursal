import React from 'react'
import { Navigate } from 'react-router-dom'
import Dashboard from './Dashboard'

const DashboardRoute = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  if (currentUser?.id_rol?.name === 'Admin') {
    return <Navigate to="/admin-dashboard" replace />
  }
  return <Dashboard />
}

export default DashboardRoute
