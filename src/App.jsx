/**
 * App Component
 *
 * Root application component that sets up routing, theme management,
 * and lazy-loaded page components with suspense boundaries.
 *
 * Features:
 * - Client-side routing with HashRouter
 * - Theme detection from URL parameters and Redux state
 * - Lazy loading for all routes with loading spinner fallback
 * - Public routes (login, register, error pages)
 * - Protected routes wrapped in DefaultLayout
 *
 * @module App
 */

import React, { Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { useSelector } from 'react-redux'
import ProtectedRoute from './components/ProtectRoute'
import PublicRoute from './components/PublicRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { CSpinner, useColorModes } from '@coreui/react'
import { ToastProvider } from './components/common/ToastContext'
import { iniciarMotorSync } from './services/syncEngineService'
import { iniciarGestorCotizacionesOffline } from './services/cotizacionOfflineService'
import { iniciarMonitorTraslados } from './services/trasladoService'
import { precargarRutas } from './services/precargaRutasService'

// Tipografía del producto: Archivo (interfaz) + IBM Plex Mono (cifras)
import '@fontsource-variable/archivo'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './scss/style.scss'

// Containers
const DefaultLayout = React.lazy(() => import('./layout/DefaultLayout'))

// Pages
const Login = React.lazy(() => import('./views/authentication/login/Login'))
const Page404 = React.lazy(() => import('./views/error-pages/page404/Page404'))
const Page500 = React.lazy(() => import('./views/error-pages/page500/Page500'))

/**
 * Main Application Component
 *
 * Manages application-wide concerns:
 * - Theme initialization and persistence
 * - Client-side routing configuration
 * - Lazy loading with suspense fallbacks
 * - Theme detection from URL query parameters
 *
 * Theme priority:
 * 1. URL parameter (?theme=dark)
 * 2. Redux stored theme
 * 3. Browser/system preference (auto)
 *
 * @component
 * @returns {React.ReactElement} Application root with routing
 *
 * @example
 * // Standard usage in index.js
 * import App from './App'
 * ReactDOM.render(<App />, document.getElementById('root'))
 */
const App = () => {
  const { isColorModeSet, setColorMode } = useColorModes('coreui-free-react-admin-template-theme')
  const storedTheme = useSelector((state) => state.theme)

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.href.split('?')[1])
    const theme = urlParams.get('theme') && urlParams.get('theme').match(/^[A-Za-z0-9\s]+/)[0]
    if (theme) {
      setColorMode(theme)
    }

    if (isColorModeSet()) {
      return
    }

    setColorMode(storedTheme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Motor de sincronización (Offline-First 2.3): drena la cola de eventos
  // PENDING en segundo plano (arranque + evento online + timer de respaldo).
  // Gestor de cotizaciones offline (Task 1): listener `online` para los
  // borradores de `offline_quotes` (specs/offline-cotizaciones.md).
  // Monitor del espejo de traslados (RF-T5): refresco al arrancar + `online`.
  useEffect(() => {
    iniciarMotorSync()
    iniciarGestorCotizacionesOffline()
    iniciarMonitorTraslados()
    precargarRutas()
  }, [])

  return (
    <ToastProvider>
      <HashRouter>
        {/* Sin este boundary, un import() de chunk lazy que falle (p. ej. sin
            red en dev) desmontaba toda la app y dejaba la pantalla en blanco. */}
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="pt-3 text-center">
                <CSpinner color="primary" variant="grow" />
              </div>
            }
          >
            <Routes>
              <Route exact path="/login" element={<Login />} />
              <Route exact path="/error-pages/404" name="Page 404" element={<Page404 />} />
              <Route exact path="/error-pages/500" name="Page 500" element={<Page500 />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <DefaultLayout />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <Login />
                  </PublicRoute>
                }
              />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </HashRouter>
    </ToastProvider>
  )
}

export default App
