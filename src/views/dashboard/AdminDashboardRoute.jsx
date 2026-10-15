import React from 'react'
import { Navigate } from 'react-router-dom'
import AdminDashboard from './AdminDashboard'

const AdminDashboardRoute = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  if (currentUser?.id_rol?.name !== 'Admin') {
    return <Navigate to="/dashboard" replace />
  }
  return <AdminDashboard />
}

export default AdminDashboardRoute
