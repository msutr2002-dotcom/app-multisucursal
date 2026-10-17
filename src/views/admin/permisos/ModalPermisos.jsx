import React, { useState, useEffect, useRef } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CTable,
  CTableHead,
  CTableBody,
  CTableRow,
  CTableHeaderCell,
  CTableDataCell,
  CFormCheck,
  CSpinner,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilChevronTop, cilChevronBottom } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../components/common/ToastContext'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { GRUPOS, MODULOS, SOLO_VER, accionesDe, ACCIONES, labelDe } from './modulosPermisos'

const VACIOS = { ver: false, crear: false, editar: false, eliminar: false }

const ModalPermisos = ({ visible, onClose, rol }) => {
  const showToast = useToast()
  const [permisos, setPermisos] = useState({})
  // Secciones contraídas por título (ausente = expandida).
  const [colapsados, setColapsados] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [confirmarDescarte, setConfirmarDescarte] = useState(false)
  // Snapshot de lo cargado, para saber si hay cambios sin guardar (RF-PA8).
  const originalRef = useRef(null)

  // declarado antes del effect (regla: no referenciar variables antes de declararlas)
  const cargarPermisos = async () => {
    const { data } = await supabase.rpc('get_permisos_by_rol', { p_id_rol: rol.id })
    const permisosMap = {}
    MODULOS.forEach((mod) => {
      // RF-P2: botones del POS visibles por defecto (sin fila = visible)
      const verDefault = SOLO_VER.has(mod)
      permisosMap[mod] = { ...VACIOS, ver: verDefault }
    })
    ;(data || []).forEach((p) => {
      permisosMap[p.modulo] = {
        ver: p.puede_ver,
        crear: p.puede_crear,
        editar: p.puede_editar,
        eliminar: p.puede_eliminar,
      }
    })
    setPermisos(permisosMap)
    originalRef.current = permisosMap
  }

  useEffect(() => {
    if (visible && rol) {
      // diferido con setTimeout: react-hooks v7 prohíbe funciones con setState
      // llamadas síncronas dentro del effect (mismo patrón que Catalogos/useNavPermissions)
      const t = setTimeout(() => {
        setColapsados({})
        cargarPermisos()
      }, 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rol])

  // ¿Hay cambios sin guardar respecto al snapshot? (RF-PA8)
  const hayCambios = () => {
    const orig = originalRef.current
    if (!orig) return false
    return MODULOS.some((modulo) => {
      const actual = permisos[modulo] || {}
      const base = orig[modulo] || {}
      return ['ver', 'crear', 'editar', 'eliminar'].some((k) => !!actual[k] !== !!base[k])
    })
  }

  const handleClose = () => {
    if (guardando) return
    if (hayCambios()) {
      setConfirmarDescarte(true)
      return
    }
    onClose()
  }

  const togglePermiso = (modulo, accion) => {
    setPermisos((prev) => {
      const actual = { ...prev[modulo] }
      actual[accion] = !actual[accion]
      // RF-PA9: toda escritura implica ver; apagar ver apaga la escritura.
      if (accion !== 'ver' && actual[accion]) actual.ver = true
      if (accion === 'ver' && !actual.ver) {
        actual.crear = false
        actual.editar = false
        actual.eliminar = false
      }
      return { ...prev, [modulo]: actual }
    })
  }

  const toggleGrupo = (titulo) => {
    setColapsados((prev) => ({ ...prev, [titulo]: !prev[titulo] }))
  }

  // Estado tri-estado (marcado / indeterminado / vacío) de una acción sobre un
  // conjunto de módulos. `aplica` = false cuando ningún módulo la admite.
  const estadoColumna = (modulos, accion) => {
    const aplicables = modulos.filter((m) => accionesDe(m).includes(accion))
    const total = aplicables.length
    const marcadas = aplicables.filter((m) => permisos[m]?.[accion]).length
    return {
      aplica: total > 0,
      checked: total > 0 && marcadas === total,
      indeterminate: marcadas > 0 && marcadas < total,
    }
  }

  // Selección rápida: aplica una acción a todos los módulos (de una sección o
  // de todos) que la admitan. Nunca escribe crear/editar/eliminar en SOLO_VER.
  // Respeta la coherencia ver ⊇ acciones (RF-PA9).
  const aplicar = (modulos, accion, valor) => {
    setPermisos((prev) => {
      const next = { ...prev }
      modulos.forEach((m) => {
        if (!accionesDe(m).includes(accion)) return
        const actual = { ...(prev[m] || VACIOS) }
        actual[accion] = valor
        if (accion !== 'ver' && valor) actual.ver = true
        if (accion === 'ver' && !valor) {
          actual.crear = false
          actual.editar = false
          actual.eliminar = false
        }
        next[m] = actual
      })
      return next
    })
  }

  const aplicarTodo = (valor) => {
    setPermisos((prev) => {
      const next = { ...prev }
      MODULOS.forEach((m) => {
        next[m] = { ...(prev[m] || VACIOS) }
        accionesDe(m).forEach((a) => {
          next[m][a] = valor
        })
      })
      return next
    })
  }

  const handleGuardar = async () => {
    setGuardando(true)
    try {
      for (const modulo of MODULOS) {
        const p = permisos[modulo] || VACIOS
        const { error } = await supabase.rpc('upsert_permiso', {
          p_id_rol: rol.id,
          p_modulo: modulo,
          p_puede_ver: p.ver,
          p_puede_crear: p.crear,
          p_puede_editar: p.editar,
          p_puede_eliminar: p.eliminar,
        })
        if (error) {
          showToast('danger', 'Error', `Error en ${labelDe(modulo)}: ${error.message}`)
          // Re-sincroniza con lo realmente persistido y mantiene el modal abierto.
          await cargarPermisos()
          return
        }
      }
      originalRef.current = permisos
      showToast('success', 'Éxito', 'Permisos guardados correctamente')
      onClose()
    } catch (err) {
      showToast('danger', 'Error', err?.message || 'Error inesperado')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <CModal visible={visible} onClose={handleClose} size="lg" scrollable>
      <CModalHeader onClose={handleClose}>
        <CModalTitle>Permisos del rol: {rol?.name}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <div className="d-flex justify-content-end gap-2 mb-1">
          <CButton color="primary" size="sm" onClick={() => aplicarTodo(true)}>
            Marcar todo
          </CButton>
          <CButton color="secondary" size="sm" onClick={() => aplicarTodo(false)}>
            Limpiar
          </CButton>
        </div>
        <small className="text-body-secondary d-block mb-3">
          Activar Crear, Editar o Eliminar activa Ver automáticamente.
        </small>
        <CTable>
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Módulo</CTableHeaderCell>
              {ACCIONES.map((acc) => {
                const estado = estadoColumna(MODULOS, acc.key)
                return (
                  <CTableHeaderCell key={acc.key} className="text-center">
                    {acc.label}
                    <div className="d-flex justify-content-center mt-1">
                      <CFormCheck
                        checked={estado.checked}
                        indeterminate={estado.indeterminate}
                        onChange={(e) => aplicar(MODULOS, acc.key, e.target.checked)}
                        aria-label={`Marcar ${acc.label} en todos los módulos`}
                      />
                    </div>
                  </CTableHeaderCell>
                )
              })}
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {GRUPOS.map((grupo) => (
              <React.Fragment key={grupo.titulo}>
                <CTableRow className="bg-body-tertiary">
                  <CTableDataCell className="fw-semibold bg-body-tertiary">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-reset fw-semibold d-flex align-items-center gap-2 w-100 text-start"
                      onClick={() => toggleGrupo(grupo.titulo)}
                      aria-expanded={!colapsados[grupo.titulo]}
                      aria-label={`${colapsados[grupo.titulo] ? 'Expandir' : 'Contraer'} ${grupo.titulo}`}
                    >
                      <CIcon
                        icon={colapsados[grupo.titulo] ? cilChevronBottom : cilChevronTop}
                        size="sm"
                      />
                      {grupo.titulo}
                    </button>
                  </CTableDataCell>
                  {ACCIONES.map((acc) => {
                    const estado = estadoColumna(grupo.modulos, acc.key)
                    return (
                      <CTableDataCell key={acc.key} className="text-center bg-body-tertiary">
                        {estado.aplica ? (
                          <div className="d-flex justify-content-center">
                            <CFormCheck
                              checked={estado.checked}
                              indeterminate={estado.indeterminate}
                              onChange={(e) => aplicar(grupo.modulos, acc.key, e.target.checked)}
                              aria-label={`Marcar ${acc.label} en ${grupo.titulo}`}
                            />
                          </div>
                        ) : (
                          <span className="text-body-secondary" aria-hidden="true">
                            —
                          </span>
                        )}
                        {!estado.aplica && <span className="visually-hidden">No aplica</span>}
                      </CTableDataCell>
                    )
                  })}
                </CTableRow>
                {!colapsados[grupo.titulo] &&
                  grupo.modulos.map((modulo) => (
                    <CTableRow key={modulo}>
                      <CTableDataCell>
                        {labelDe(modulo)}
                        {SOLO_VER.has(modulo) && (
                          <span className="text-body-secondary small ms-1">(botón del POS)</span>
                        )}
                      </CTableDataCell>
                      {ACCIONES.map((acc) =>
                        SOLO_VER.has(modulo) && acc.key !== 'ver' ? (
                          <CTableDataCell key={acc.key} className="text-center">
                            <span className="text-body-secondary" aria-hidden="true">
                              —
                            </span>
                            <span className="visually-hidden">No aplica</span>
                          </CTableDataCell>
                        ) : (
                          <CTableDataCell key={acc.key} className="text-center">
                            <div className="d-flex justify-content-center">
                              <CFormCheck
                                checked={permisos[modulo]?.[acc.key] || false}
                                onChange={() => togglePermiso(modulo, acc.key)}
                                aria-label={`${acc.label} ${labelDe(modulo)}`}
                              />
                            </div>
                          </CTableDataCell>
                        ),
                      )}
                    </CTableRow>
                  ))}
              </React.Fragment>
            ))}
          </CTableBody>
        </CTable>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={handleClose} disabled={guardando}>
          Cancelar
        </CButton>
        <CButton color="primary" onClick={handleGuardar} disabled={guardando}>
          {guardando ? (
            <>
              <CSpinner size="sm" className="me-2" />
              Guardando…
            </>
          ) : (
            'Guardar'
          )}
        </CButton>
      </CModalFooter>

      <ConfirmModal
        visible={confirmarDescarte}
        title="Descartar cambios"
        message="Hay cambios sin guardar. ¿Seguro que quieres descartarlos?"
        confirmText="Descartar"
        cancelText="Seguir editando"
        onConfirm={() => {
          setConfirmarDescarte(false)
          onClose()
        }}
        onCancel={() => setConfirmarDescarte(false)}
      />
    </CModal>
  )
}

export default ModalPermisos
