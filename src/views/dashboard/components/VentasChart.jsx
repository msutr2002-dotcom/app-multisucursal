import React from 'react'
import { CCard, CCardBody, CCardHeader, CSpinner } from '@coreui/react'
import { CChart } from '@coreui/react-chartjs'
import { formatQ } from '../../../utils/format'

const VentasChart = ({ data, loading, error }) => {
  const totalMes = data?.reduce((sum, item) => sum + (item.total || 0), 0) || 0

  return (
    <CCard className="mb-4">
      <CCardHeader className="d-flex justify-content-between align-items-center">
        <strong>Ventas del mes</strong>
        <span className="monto fw-semibold">{formatQ(totalMes)}</span>
      </CCardHeader>
      <CCardBody>
        {loading ? (
          <div className="text-center py-5">
            <CSpinner color="primary" />
          </div>
        ) : error ? (
          <p className="text-danger text-center py-4 mb-0">
            No se pudieron cargar las ventas del mes. Revisa la conexión e intenta de nuevo.
          </p>
        ) : totalMes === 0 ? (
          // Sin datos: antes el eje mostraba ticks "Q0.01" con gráfica vacía.
          <p className="text-body-secondary text-center py-4 mb-0">
            Sin ventas registradas este mes.
          </p>
        ) : (
          <CChart
            type="bar"
            data={{
              labels: data?.map((item) => item.dia) || [],
              datasets: [
                {
                  label: 'Ventas',
                  data: data?.map((item) => item.total) || [],
                  backgroundColor: '#0d7a5f',
                  borderRadius: 4,
                },
              ],
            }}
            options={{
              responsive: true,
              plugins: {
                legend: {
                  display: false,
                },
                tooltip: {
                  callbacks: {
                    label: (context) => formatQ(context.parsed.y),
                  },
                },
              },
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    callback: (value) => formatQ(value),
                  },
                },
              },
            }}
          />
        )}
      </CCardBody>
    </CCard>
  )
}

export default VentasChart
