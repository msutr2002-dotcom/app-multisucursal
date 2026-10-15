import React from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CTable,
  CTableHead,
  CTableBody,
  CTableRow,
  CTableHeaderCell,
  CTableDataCell,
  CBadge,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBuilding } from '@coreui/icons'

const EmpresasResumen = ({ empresas, loading }) => {
  return (
    <CCard className="mb-4">
      <CCardHeader>
        <CIcon icon={cilBuilding} className="me-2" />
        <strong>Resumen de Empresas</strong>
      </CCardHeader>
      <CCardBody>
        {loading ? (
          <div className="text-center py-4">
            <CSpinner color="primary" />
          </div>
        ) : (
          <CTable hover responsive>
            <CTableHead>
              <CTableRow>
                <CTableHeaderCell>Empresa</CTableHeaderCell>
                <CTableHeaderCell>Usuarios</CTableHeaderCell>
                <CTableHeaderCell>Sucursales</CTableHeaderCell>
                <CTableHeaderCell>Estado</CTableHeaderCell>
              </CTableRow>
            </CTableHead>
            <CTableBody>
              {empresas.map((emp) => (
                <CTableRow key={emp.id}>
                  <CTableDataCell>{emp.name}</CTableDataCell>
                  <CTableDataCell>
                    <CBadge color="info">{emp.total_usuarios}</CBadge>
                  </CTableDataCell>
                  <CTableDataCell>
                    <CBadge color="warning">{emp.total_sucursales}</CBadge>
                  </CTableDataCell>
                  <CTableDataCell>
                    <CBadge color={emp.activo ? 'success' : 'danger'}>
                      {emp.activo ? 'Activa' : 'Inactiva'}
                    </CBadge>
                  </CTableDataCell>
                </CTableRow>
              ))}
            </CTableBody>
          </CTable>
        )}
      </CCardBody>
    </CCard>
  )
}

export default EmpresasResumen
