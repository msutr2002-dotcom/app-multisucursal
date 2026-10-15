import React from 'react'
import { CButton, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilBan, cilList } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import TarjetaRegistro from '../../../components/common/TarjetaRegistro'

const fechaCorta = (iso) => {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-GT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return String(iso).slice(0, 10)
  }
}

/**
 * Versión tarjeta del listado de Clientes para móvil (<768px): nombre, NIT,
 * teléfono, mayoreo, compras, total, última compra y estado, con acciones
 * Ver / Editar / Activar-Desactivar visibles (evita el scroll horizontal de
 * la tabla de 9 columnas).
 */
const ClientesTarjeta = ({ clientes, puedeEditar, onVerDetalle, onEditar, onAlternarActivo }) => (
  <>
    {clientes.map((c) => {
      const activo = c.activo !== false
      return (
        <TarjetaRegistro
          key={c.id}
          titulo={c.name}
          subtitulo={`${c.nit || 'Sin NIT'} · ${c.telefono || 'Sin teléfono'}`}
          badge={
            <div className="d-flex gap-1 flex-wrap justify-content-end">
              <CBadge color={activo ? 'success' : 'secondary'}>
                {activo ? 'Activo' : 'Inactivo'}
              </CBadge>
              {c.descuento_bp > 0 && <CBadge color="info">{c.descuento_bp / 100}%</CBadge>}
            </div>
          }
          campos={[
            {
              label: 'Compras',
              value: c.n_ventas ?? 0,
            },
            {
              label: 'Total gastado',
              value: <strong className="monto">{formatQ(c.total_gastado || 0)}</strong>,
            },
            {
              label: 'Última compra',
              value: fechaCorta(c.ultima_compra),
            },
            {
              label: 'Acciones',
              value: (
                <div className="d-flex gap-1">
                  <CButton
                    size="sm"
                    color="light"
                    variant="outline"
                    aria-label={`Ver detalle de ${c.name}`}
                    onClick={() => onVerDetalle(c)}
                  >
                    <CIcon icon={cilList} className="me-1" />
                    Ver
                  </CButton>
                  {puedeEditar && (
                    <>
                      <CButton
                        size="sm"
                        color="light"
                        variant="outline"
                        aria-label={`Editar ${c.name}`}
                        onClick={() => onEditar(c)}
                      >
                        <CIcon icon={cilPen} className="me-1" />
                        Editar
                      </CButton>
                      <CButton
                        size="sm"
                        color="light"
                        variant="outline"
                        aria-label={activo ? `Desactivar ${c.name}` : `Activar ${c.name}`}
                        onClick={() => onAlternarActivo(c)}
                      >
                        <CIcon icon={cilBan} className="me-1" />
                        {activo ? 'Desactivar' : 'Activar'}
                      </CButton>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      )
    })}
  </>
)

export default ClientesTarjeta
