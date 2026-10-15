import React from 'react'
import { CAlert, CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilWarning } from '@coreui/icons'

/**
 * Red de seguridad para la UI (offline-suite): cualquier error de render —
 * en particular un `import()` de ruta lazy que falle sin red — desmontaba
 * TODO el árbol de React y dejaba la app en blanco. Este boundary atrapa el
 * error, muestra un mensaje reintentable y permite navegar a otras rutas.
 * Se monta en App (árbol raíz) y en AppContent (reset por ubicación).
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturó un error de render:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="text-center py-5">
          <CIcon icon={cilWarning} width={36} className="text-danger mb-2" />
          <CAlert color="danger" className="mx-auto" style={{ maxWidth: '32rem' }}>
            No se pudo cargar esta vista.
            <div className="small mt-1 mb-0">
              {String(this.state.error?.message || this.state.error).slice(0, 200)}
            </div>
          </CAlert>
          <CButton color="primary" onClick={() => this.setState({ error: null })}>
            Reintentar
          </CButton>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
