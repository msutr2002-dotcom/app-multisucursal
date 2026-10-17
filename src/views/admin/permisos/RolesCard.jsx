import React, { useState } from 'react'
import { CButton } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPen, cilTrash, cilShieldAlt, cilLockLocked } from '@coreui/icons'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { GRUPOS, SOLO_VER, ACCIONES, labelDe } from './modulosPermisos'

const RolesCard = ({ rol, onEliminar, onEditar, onPermisos, puedeEditar, puedeEliminar }) => {
  const [modalConfirmar, setModalConfirmar] = useState(false)

  const confirmarEliminar = async () => {
    // El resultado (toast éxito/error) lo comunica el contenedor (Roles.jsx).
    await onEliminar(rol)
    setModalConfirmar(false)
  }

  const permisosPorModulo = new Map((rol.permisos || []).map((p) => [p.modulo, p]))

  // Agrupa por sección y descarta módulos sin ningún permiso (evita el ruido de
  // filas en blanco). Sin fila, los botones del POS quedan visibles (ver=true).
  const secciones = GRUPOS.map((grupo) => ({
    titulo: grupo.titulo,
    filas: grupo.modulos
      .map((modulo) => {
        const p = permisosPorModulo.get(modulo)
        return {
          modulo,
          permisos: {
            ver: p ? !!p.puede_ver : SOLO_VER.has(modulo),
            crear: p ? !!p.puede_crear : false,
            editar: p ? !!p.puede_editar : false,
            eliminar: p ? !!p.puede_eliminar : false,
          },
        }
      })
      .filter(({ permisos }) => ACCIONES.some((a) => permisos[a.key])),
  }))

  const totalModulos = secciones.reduce((n, s) => n + s.filas.length, 0)
  const seccionesConAcceso = secciones.filter((s) => s.filas.length > 0)

  return (
    <>
      <div className="border rounded mb-3">
        <div className="p-3">
          <div className="d-flex align-items-center gap-3">
            <CIcon icon={cilShieldAlt} size="xl" />
            <div className="flex-grow-1">
              <h6 className="mb-0">{rol.name}</h6>
              <small className="text-body-secondary">{rol.descripcion}</small>
            </div>
          </div>

          {totalModulos === 0 ? (
            <p className="text-body-secondary small d-flex align-items-center gap-2 mt-3 mb-0">
              <CIcon icon={cilLockLocked} /> Sin permisos asignados.
            </p>
          ) : (
            <div className="mt-3">
              <div className="small text-body-secondary mb-2">
                {totalModulos} módulos con acceso
              </div>

              {seccionesConAcceso.map((seccion) => (
                <div key={seccion.titulo} className="mb-2">
                  <div className="text-uppercase text-body-secondary fw-semibold small mb-1">
                    {seccion.titulo}
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {seccion.filas.map(({ modulo, permisos }) => (
                      <span key={modulo} className="roles-perm-chip" title={labelDe(modulo)}>
                        <span>{labelDe(modulo)}</span>
                        <span className="d-inline-flex align-items-center gap-1 ms-1">
                          {ACCIONES.map((a) => (
                            <span
                              key={a.key}
                              className={
                                'roles-perm-dot ' +
                                (permisos[a.key] ? 'bg-primary text-white' : 'roles-perm-dot--off')
                              }
                              title={`${a.label}: ${permisos[a.key] ? 'sí' : 'no'}`}
                            >
                              {a.letra}
                            </span>
                          ))}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="d-flex justify-content-end gap-2 mt-3">
            {puedeEditar && (
              <CButton color="primary" size="sm" onClick={() => onEditar(rol)}>
                <CIcon icon={cilPen} className="me-1" /> Editar
              </CButton>
            )}
            {puedeEditar && (
              <CButton color="warning" size="sm" onClick={() => onPermisos(rol)}>
                <CIcon icon={cilLockLocked} className="me-1" /> Permisos
              </CButton>
            )}
            {puedeEliminar && (
              <CButton color="danger" size="sm" onClick={() => setModalConfirmar(true)}>
                <CIcon icon={cilTrash} className="me-1" /> Eliminar
              </CButton>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        visible={modalConfirmar}
        title="Confirmar eliminación"
        message={`¿Estás seguro de eliminar el rol "${rol.name}"?`}
        onConfirm={confirmarEliminar}
        onCancel={() => setModalConfirmar(false)}
      />
    </>
  )
}

export default RolesCard
