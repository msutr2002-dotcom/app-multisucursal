import { useCallback, useEffect, useState } from 'react'
import {
  CBadge,
  CDropdown,
  CDropdownHeader,
  CDropdownItem,
  CDropdownMenu,
  CDropdownToggle,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBell, cilEnvelopeOpen } from '@coreui/icons'
import usePermission from '../../hooks/usePermission'
import { hayRed } from '../../services/redService'
import { contarTrasladosPendientes, refrescarTraslados } from '../../services/trasladoService'

/**
 * Campanita de notificaciones del header (RF-T5, Task 6).
 *
 * Punto rojo con el conteo de traslados recibidos aún en estado `enviado` para
 * la sucursal del dispositivo. La cuenta sale SIEMPRE del espejo local (Dexie),
 * así que funciona sin red. Con red, al montar se refresca el espejo desde el
 * servidor: la app arranca en el login, por eso el monitor de `App.jsx` corre
 * antes de existir sesión y este montaje cubre el hueco post-login.
 * El clic en la campanita NO navega: abre el menú de notificaciones. El aviso
 * «N traslados pendientes por aprobar» sí lleva al módulo (Movimientos); el
 * menú podrá agrupar avisos de otros módulos en el futuro.
 * Invisible sin el permiso `traslados/ver`.
 */
const CampanaTraslados = () => {
  const puedeVer = usePermission('traslados', 'ver')
  const [pendientes, setPendientes] = useState(0)
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null')
  const idSucursal = currentUser?.id_sucursal

  const refrescar = useCallback(() => {
    if (!idSucursal) return
    contarTrasladosPendientes(idSucursal)
      .then(setPendientes)
      .catch(() => {})
  }, [idSucursal])

  useEffect(() => {
    if (!puedeVer || !idSucursal) return
    refrescar()
    if (hayRed()) refrescarTraslados({ idSucursal }).catch(() => {})
    const alActualizar = () => refrescar()
    window.addEventListener('traslados-actualizados', alActualizar)
    return () => window.removeEventListener('traslados-actualizados', alActualizar)
  }, [puedeVer, idSucursal, refrescar])

  if (!puedeVer || !idSucursal) return null

  // El aviso lleva al módulo en la pestaña Movimientos (donde se aprueba);
  // si la ruta ya está montada el hash no remonta la vista, por eso además se
  // emite el evento que la propia página escucha para cambiar de pestaña.
  const irAMovimientos = () => {
    const destino = '#/traslados?tab=movimientos'
    if (window.location.hash !== destino) window.location.hash = destino
    window.dispatchEvent(new CustomEvent('traslados-ir-movimientos'))
  }

  // Lista de avisos (hoy solo traslados; el resto de módulos se sumará aquí)
  const notificaciones = []
  if (pendientes > 0) {
    notificaciones.push({
      id: 'traslados-pendientes',
      texto: `${pendientes} ${pendientes === 1 ? 'traslado pendiente' : 'traslados pendientes'} por aprobar`,
      onClick: irAMovimientos,
    })
  }

  return (
    <CDropdown variant="nav-item" placement="bottom-end" className="py-1">
      <CDropdownToggle
        caret={false}
        color="light"
        variant="ghost"
        className="position-relative"
        title="Notificaciones"
        aria-label="Notificaciones"
        data-testid="campana-traslados"
      >
        <CIcon icon={cilBell} size="lg" />
        {pendientes > 0 && (
          <CBadge
            color="danger"
            className="position-absolute top-0 start-100 translate-middle rounded-pill"
            data-testid="campana-conteo"
          >
            {pendientes}
          </CBadge>
        )}
      </CDropdownToggle>
      <CDropdownMenu>
        <CDropdownHeader>Notificaciones</CDropdownHeader>
        {notificaciones.length ? (
          notificaciones.map((n) => (
            <CDropdownItem key={n.id} onClick={n.onClick} data-testid={`notif-${n.id}`}>
              <CIcon icon={cilEnvelopeOpen} className="me-2" />
              {n.texto}
            </CDropdownItem>
          ))
        ) : (
          <CDropdownItem disabled data-testid="notif-vacio">
            Sin notificaciones pendientes
          </CDropdownItem>
        )}
      </CDropdownMenu>
    </CDropdown>
  )
}

export default CampanaTraslados
