import React from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody } from '@coreui/react'
import PanelPago from './PanelPago'

const ModalCobrar = ({
  visible,
  onClose,
  carrito,
  onCobrar,
  onPendiente,
  onCotizacion,
  procesando,
  errorCobro,
  onReintentar,
  cliente,
  onClienteChange,
  nitCliente,
  onNitChange,
}) => (
  <CModal
    alignment="bottom"
    visible={visible}
    onClose={onClose}
    className="modal-cobrar"
    scrollable
  >
    <CModalHeader onClose={onClose}>
      <CModalTitle className="fs-6 fw-bold">Cobrar venta</CModalTitle>
    </CModalHeader>
    <CModalBody className="p-0">
      <PanelPago
        carrito={carrito}
        onCobrar={onCobrar}
        onPendiente={onPendiente}
        onCotizacion={onCotizacion}
        procesando={procesando}
        errorCobro={errorCobro}
        onReintentar={onReintentar}
        cliente={cliente}
        onClienteChange={onClienteChange}
        nitCliente={nitCliente}
        onNitChange={onNitChange}
      />
    </CModalBody>
  </CModal>
)

export default ModalCobrar
