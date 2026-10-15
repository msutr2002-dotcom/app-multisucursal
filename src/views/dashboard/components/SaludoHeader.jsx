import React from 'react'

const SaludoHeader = ({ nombre, children }) => {
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  const fecha = new Date().toLocaleDateString('es-GT', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="mb-4 saludo-header">
      <div>
        <h2 className="mb-1">
          {saludo}, {nombre}
        </h2>
        <p className="text-body-secondary mb-0">{fecha}</p>
      </div>
      {children}
    </div>
  )
}

export default SaludoHeader
