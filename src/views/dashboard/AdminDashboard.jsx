import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'
import { CAlert } from '@coreui/react'
import SaludoHeader from './components/SaludoHeader'
import AdminStatsCards from './components/AdminStatsCards'
import EmpresasResumen from './components/EmpresasResumen'
import useEstadoRed from '../../hooks/useEstadoRed'

const AdminDashboard = () => {
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const enLinea = useEstadoRed()
  const [stats, setStats] = useState({})
  // loading arranca false si monta sin red: el effect no hará fetch y el
  // spinner no quedaría girando para siempre (solo hay fetch con red).
  const [loading, setLoading] = useState(enLinea)

  const cargarDatos = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_admin_dashboard_stats')
      if (error) console.warn('get_admin_dashboard_stats sin respuesta:', error.message || error)
      else setStats(data)
    } catch (error) {
      console.warn('get_admin_dashboard_stats sin respuesta:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // Recarga al montar y cada vez que vuelve la red (RF-03 offline-first).
    // setTimeout: react-hooks v7 prohíbe setState síncrono en effect (setLoading).
    if (!enLinea) return
    setTimeout(() => cargarDatos(), 0)
  }, [enLinea])

  return (
    <>
      <SaludoHeader nombre={currentUser.name} />
      {!enLinea && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>
            Sin conexión. Las estadísticas requieren conexión al servidor — se actualizan al volver
            en línea.
          </span>
        </CAlert>
      )}
      <AdminStatsCards stats={stats} loading={loading} />
      <EmpresasResumen empresas={stats.empresas || []} loading={loading} />
    </>
  )
}

export default AdminDashboard
