import React, { useState, useEffect } from 'react'
import { CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBasket } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import SaludoHeader from './components/SaludoHeader'
import StatsCards from './components/StatsCards'
import VentasChart from './components/VentasChart'

const Dashboard = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const [stats, setStats] = useState({})
  const [statsError, setStatsError] = useState(false)
  const [chartData, setChartData] = useState([])
  const [chartError, setChartError] = useState(false)
  const [loading, setLoading] = useState(true)

  const cargarDatos = async () => {
    setLoading(true)

    try {
      const [statsResult, chartResult] = await Promise.all([
        supabase.rpc('get_dashboard_stats', {
          p_id_sucursal: currentUser.id_sucursal,
        }),
        supabase.rpc('get_monthly_sales_chart', {
          p_id_sucursal: currentUser.id_sucursal,
        }),
      ])

      setStatsError(!!statsResult.error)
      if (statsResult.data) setStats(statsResult.data)
      setChartError(!!chartResult.error)
      if (chartResult.data) setChartData(chartResult.data)
    } catch (error) {
      console.warn('Error cargando datos del dashboard:', error)
      setStatsError(true)
      setChartError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // setTimeout: la regla react-hooks/set-state-in-effect prohíbe llamar
    // funciones con setState directo desde el effect (patrón del repo).
    const t = setTimeout(() => cargarDatos(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <SaludoHeader nombre={currentUser.name}>
        <CButton color="primary" href="#/pos" className="saludo-accion">
          <CIcon icon={cilBasket} className="me-2" />
          Ir al Punto de Venta
        </CButton>
      </SaludoHeader>
      <StatsCards stats={stats} loading={loading} error={statsError} onReintentar={cargarDatos} />
      <VentasChart data={chartData} loading={loading} error={chartError} />
    </>
  )
}

export default Dashboard
