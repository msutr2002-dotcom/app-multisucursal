import React from 'react'
import {
  CDropdown,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
} from '@coreui/react'
import { useNavigate } from 'react-router-dom'
import { cilAccountLogout } from '@coreui/icons'
import CIcon from '@coreui/icons-react'

import Avatar from '../common/Avatar'

const AppHeaderDropdown = () => {
  const navigate = useNavigate()
  const currentUser = JSON.parse(localStorage.getItem('currentUser'))
  const handleLogout = () => {
    localStorage.removeItem('currentUser')
    navigate('/login', { replace: true })
  }
  return (
    <CDropdown variant="nav-item">
      <CDropdownToggle placement="bottom-end" className="py-0 pe-0" caret={false}>
        <Avatar name={currentUser?.name || 'U'} size="sm" />
      </CDropdownToggle>
      <CDropdownMenu className="pt-0" placement="bottom-end">
        <CDropdownHeader className="bg-body-secondary fw-semibold mb-2">
          {currentUser?.name || 'Usuario'}
        </CDropdownHeader>
        <CDropdownItem onClick={handleLogout} className="text-danger">
          <CIcon icon={cilAccountLogout} className="me-2" />
          Cerrar sesión
        </CDropdownItem>
      </CDropdownMenu>
    </CDropdown>
  )
}

export default AppHeaderDropdown
