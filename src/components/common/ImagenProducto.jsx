import React, { useState } from 'react'
import { CModal, CModalHeader, CModalTitle, CModalBody } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilInbox } from '@coreui/icons'

const ImagenProducto = ({
  src,
  alt = '',
  size = 36,
  radius = 8,
  className = '',
  ampliable = false,
}) => {
  const [error, setError] = useState(false)
  const [abierto, setAbierto] = useState(false)
  const mostrarImagen = src && !error

  const abrir = (e) => {
    if (!ampliable || !mostrarImagen) return
    e.stopPropagation() // no dispara el clic del elemento padre (ej. fila/botón)
    setAbierto(true)
  }

  return (
    <>
      <div
        className={`d-flex align-items-center justify-content-center overflow-hidden ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'rgba(13, 122, 95, 0.12)',
          flexShrink: 0,
          cursor: ampliable && mostrarImagen ? 'zoom-in' : 'default',
        }}
        onClick={abrir}
        title={ampliable && mostrarImagen ? 'Clic para ampliar' : undefined}
      >
        {mostrarImagen ? (
          <img
            src={src}
            alt={alt}
            onError={() => setError(true)}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }}
          />
        ) : (
          <CIcon icon={cilInbox} style={{ width: Math.round(size * 0.5), color: '#0d7a5f' }} />
        )}
      </div>

      {ampliable && (
        <CModal visible={abierto} onClose={() => setAbierto(false)} size="lg" alignment="center">
          <CModalHeader onClose={() => setAbierto(false)}>
            <CModalTitle>{alt || 'Imagen'}</CModalTitle>
          </CModalHeader>
          <CModalBody className="text-center">
            <img
              src={src}
              alt={alt}
              onError={() => setAbierto(false)}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
            />
          </CModalBody>
        </CModal>
      )}
    </>
  )
}

export default ImagenProducto
