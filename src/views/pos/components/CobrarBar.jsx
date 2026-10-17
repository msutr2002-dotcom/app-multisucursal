import React from 'react'
import { CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBasket } from '@coreui/icons'
import { formatQ } from '../../../utils/format'

const CobrarBar = ({ count, total, onClick }) => (
  <div className="cobrar-bar d-lg-none">
    <CButton
      color="success"
      size="lg"
      className="w-100 d-flex justify-content-between align-items-center px-4"
      style={{ borderRadius: '2rem' }}
      disabled={count === 0}
      onClick={onClick}
    >
      <span className="d-flex align-items-center gap-2">
        <CIcon icon={cilBasket} />
        Cobrar
        <CBadge color="light" className="text-dark">
          {count}
        </CBadge>
      </span>
      <strong className="fs-5 monto monto-sobre-color">{formatQ(total)}</strong>
    </CButton>
  </div>
)

export default CobrarBar
