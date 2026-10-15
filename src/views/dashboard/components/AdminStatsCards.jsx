import React from 'react'
import { CRow, CCol } from '@coreui/react'
import StatCard from './StatCard'

const AdminStatsCards = ({ stats, loading }) => {
  const celdas = [
    { title: 'Empresas', value: stats?.total_empresas || 0, href: '#/Empresas' },
    { title: 'Usuarios', value: stats?.total_usuarios || 0, href: '#/usuarios' },
    { title: 'Sucursales', value: stats?.total_sucursales || 0, href: '#/sucursales' },
  ]

  return (
    <CRow className="mb-4 g-3">
      {celdas.map((celda) => (
        <CCol key={celda.title} xs={6} md={4}>
          <StatCard {...celda} loading={loading} />
        </CCol>
      ))}
    </CRow>
  )
}

export default AdminStatsCards
