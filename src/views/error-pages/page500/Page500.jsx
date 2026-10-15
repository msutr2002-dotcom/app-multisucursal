import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton, CCol, CContainer, CRow } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilReload, cilArrowLeft } from '@coreui/icons'

const Page500 = () => {
  const navigate = useNavigate()
  return (
    <div className="d-flex flex-row align-items-center py-5">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={6}>
            <div className="text-center">
              <div className="display-3 fw-bold text-body-secondary mb-2">500</div>
              <h4 className="mb-2">Error del servidor</h4>
              <p className="text-body-secondary mb-4">
                Algo falló en el servidor. Intenta de nuevo en unos segundos.
              </p>
              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <CButton color="primary" onClick={() => window.location.reload()}>
                  <CIcon icon={cilReload} className="me-2" />
                  Reintentar
                </CButton>
                <CButton color="secondary" variant="outline" onClick={() => navigate('/dashboard')}>
                  <CIcon icon={cilArrowLeft} className="me-2" />
                  Volver al panel
                </CButton>
              </div>
            </div>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Page500
