import React, { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { CContainer, CSpinner } from '@coreui/react'
import PermissionRoute from './PermissionRoute'
import ErrorBoundary from './ErrorBoundary'
import Page404 from '../views/error-pages/page404/Page404'

// routes config
import { routes } from '../routes'

// Mapa de ruta → módulo                          // ← agregar este objeto
const rutaModulo = {
  '/usuarios': 'usuarios',
  '/Empresas': 'empresas',
  '/sucursales': 'sucursales',
  '/roles': 'roles',
}

const AppContent = () => {
  const ubicacion = useLocation()
  return (
    <CContainer className="px-4" lg>
      {/* key por ubicación: al navegar, el boundary se resetea y la vista
          nueva vuelve a intentar montarse. */}
      <ErrorBoundary key={ubicacion.pathname}>
        <Suspense fallback={<CSpinner color="primary" />}>
          <Routes>
            {routes.map((route, idx) => {
              if (!route.element) return null // ← cambiar esta línea

              const modulo = route.modulo // ← agregar

              return (
                <Route // ← simplificar (sin route.element &&)
                  key={idx}
                  path={route.path}
                  exact={route.exact}
                  name={route.name}
                  element={
                    // ← ESTE ES EL CAMBIO PRINCIPAL
                    modulo ? (
                      <PermissionRoute modulo={modulo}>
                        <route.element />
                      </PermissionRoute>
                    ) : (
                      <route.element />
                    )
                  }
                />
              )
            })}
            <Route path="/" element={<Navigate to="dashboard" replace />} />
            <Route path="*" element={<Page404 />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </CContainer>
  )
}

export default React.memo(AppContent)
