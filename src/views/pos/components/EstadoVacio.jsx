import React from 'react'
import { CCard, CCardBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch } from '@coreui/icons'

const EstadoVacio = () => (
  <CCard className="mt-3 border-0 shadow-sm">
    <CCardBody className="text-center py-5">
      <CIcon
        icon={cilSearch}
        width={48}
        height={48}
        style={{ color: 'var(--pos-primary)', opacity: 0.4 }}
      />
      <p className="mt-3 mb-1 fw-semibold">Busca un producto para ver su detalle</p>
      <p className="text-body-secondary small mb-0">Puedes buscar por nombre o marca</p>
    </CCardBody>
  </CCard>
)

export default EstadoVacio
