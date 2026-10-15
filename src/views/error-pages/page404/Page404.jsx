import React from 'react'
import { useNavigate } from 'react-router-dom'
import { CButton, CCol, CContainer, CRow } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilArrowLeft, cilBasket } from '@coreui/icons'

const Page404 = () => {
  const navigate = useNavigate()
  return (
    <div className="d-flex flex-row align-items-center py-5">
      <CContainer>
        <CRow className="justify-content-center">
          <CCol md={6}>
            <div className="text-center">
              <div className="display-3 fw-bold text-body-secondary mb-2">404</div>
              <h4 className="mb-2">Página no encontrada</h4>
              <p className="text-body-secondary mb-4">
                La ruta que buscas no existe o no tienes acceso a ella.
              </p>
              <div className="d-flex gap-2 justify-content-center flex-wrap">
                <CButton color="primary" onClick={() => navigate('/dashboard')}>
                  <CIcon icon={cilArrowLeft} className="me-2" />
                  Volver al panel
                </CButton>
                <CButton color="secondary" variant="outline" onClick={() => navigate('/pos')}>
                  <CIcon icon={cilBasket} className="me-2" />
                  Ir al Punto de Venta
                </CButton>
              </div>
            </div>
          </CCol>
        </CRow>
      </CContainer>
    </div>
  )
}

export default Page404
