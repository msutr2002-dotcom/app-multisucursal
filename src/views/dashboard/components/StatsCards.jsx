import React from 'react'
import { CRow, CCol, CSpinner, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilReload } from '@coreui/icons'
import StatCard from './StatCard'
import { formatQ } from '../../../utils/format'
const StatsCards = ({ stats, loading, error = false, onReintentar }) => {
  const celdas = [
    {
      title: 'Productos registrados',
      value: stats?.productos_registrados || 0,
      href: '#/productos',
    },
    {
      title: 'Compras del mes',
      value: formatQ(stats?.total_compras_mes),
      mono: true,
      href: '#/compras',
    },
    {
      title: 'Ventas del mes',
      value: formatQ(stats?.total_ventas_mes),
      mono: true,
      href: '#/historial',
    },
    {
      title: 'Ganancias del mes',
      value: formatQ(stats?.ganancias_mes),
      mono: true,
      href: '#/reportes',
    },
    {
      title: 'Productos con poco stock',
      value: stats?.productos_poco_stock || 0,
      href: '#/inventario',
    },
  ]

  return (
    <CRow className="mb-4 g-3">
      <CCol xs={12} xl={4}>
        <div className="stat-hero">
          <div className="stat-hero-label">Ventas de hoy</div>
          <div className="stat-hero-value monto">
            {loading ? (
              <CSpinner color="light" size="sm" />
            ) : error ? (
              '—'
            ) : (
              formatQ(stats?.ventas_dia)
            )}
          </div>
          {error && !loading ? (
            <div className="stat-hero-link d-flex align-items-center gap-2">
              <span className="small opacity-75">No se pudo cargar</span>
              {onReintentar && (
                <CButton
                  color="link"
                  size="sm"
                  className="p-0 text-decoration-none"
                  onClick={onReintentar}
                >
                  <CIcon icon={cilReload} className="me-1" />
                  Reintentar
                </CButton>
              )}
            </div>
          ) : (
            <a href="#/historial" className="stat-hero-link">
              Ver ventas de hoy
            </a>
          )}
        </div>
      </CCol>
      <CCol xs={12} xl={8}>
        <CRow className="g-3">
          {celdas.map((celda) => (
            <CCol key={celda.title} xs={6} md={4}>
              <StatCard {...celda} loading={loading} error={error} />
            </CCol>
          ))}
        </CRow>
      </CCol>
    </CRow>
  )
}

export default StatsCards
