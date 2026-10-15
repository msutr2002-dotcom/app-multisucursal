import React from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody, CModalFooter, CButton } from '@coreui/react'

const ConfirmModal = ({
  visible,
  title = 'Confirmar eliminación',
  message,
  children,
  confirmText = 'Eliminar',
  cancelText = 'Cancelar',
  confirmColor = 'danger',
  onConfirm,
  onCancel,
}) => {
  return (
    <CModal visible={visible} onClose={onCancel}>
      <CModalHeader onClose={onCancel}>
        <CModalTitle>{title}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        {message}
        {children}
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={onCancel}>
          {cancelText}
        </CButton>
        <CButton color={confirmColor} onClick={onConfirm}>
          {confirmText}
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ConfirmModal
