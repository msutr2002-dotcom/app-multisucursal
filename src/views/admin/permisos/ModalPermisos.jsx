import React, { useState, useEffect } from 'react'
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
} from '@coreui/react'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../components/common/ToastContext'

const MODULOS = [
  'usuarios',
  'empresas',
  'sucursales',
  'bodegas',
  'roles',
  'pos',
  'productos',
  'ingredientes',
  'clientes',
  'catalogos',
  'historial',
  'compras',
  'traslados',
  'inventario',
  'reportes',
  'facturacion',
  // pos-ux-permisos RF-P2: botones del POS, solo casilla Ver (default true)
  'pos_cotizar',
  'pos_ver_cotizaciones',
]

// Estos módulos solo tienen casilla Ver (default true al cargar: sin fila el
// botón es visible; el admin lo oculta desmarcando)
const SOLO_VER = new Set(['pos_cotizar', 'pos_ver_cotizaciones'])

const ModalPermisos = ({ visible, onClose, rol }) => {
  const showToast = useToast()
  const [permisos, setPermisos] = useState({})

  // declarado antes del effect (regla: no referenciar variables antes de declararlas)
  const cargarPermisos = async () => {
    const { data } = await supabase.rpc('get_permisos_by_rol', { p_id_rol: rol.id })
    const permisosMap = {}
    MODULOS.forEach((mod) => {
      // RF-P2: botones del POS visibles por defecto (sin fila = visible)
      const verDefault = SOLO_VER.has(mod)
      permisosMap[mod] = { ver: verDefault, crear: false, editar: false, eliminar: false }
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
  }

  useEffect(() => {
    if (visible && rol) {
      // diferido con setTimeout: react-hooks v7 prohíbe funciones con setState
      // llamadas síncronas dentro del effect (mismo patrón que Catalogos/useNavPermissions)
      const t = setTimeout(() => cargarPermisos(), 0)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, rol])

  const togglePermiso = (modulo, accion) => {
    setPermisos((prev) => ({
      ...prev,
      [modulo]: { ...prev[modulo], [accion]: !prev[modulo][accion] },
    }))
  }

  const handleGuardar = async () => {
    try {
      for (const modulo of MODULOS) {
        const { error } = await supabase.rpc('upsert_permiso', {
          p_id_rol: rol.id,
          p_modulo: modulo,
          p_puede_ver: permisos[modulo].ver,
          p_puede_crear: permisos[modulo].crear,
          p_puede_editar: permisos[modulo].editar,
          p_puede_eliminar: permisos[modulo].eliminar,
        })
        if (error) {
          showToast('danger', 'Error', `Error en ${modulo}: ${error.message}`)
          return
        }
      }
      showToast('success', 'Éxito', 'Permisos guardados correctamente')
      onClose()
    } catch (err) {
      showToast('danger', 'Error', err.menssage)
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} size="lg">
      <CModalHeader onClose={onClose}>
        <CModalTitle>Permisos del rol: {rol?.name}</CModalTitle>
      </CModalHeader>
      <CModalBody>
        <CTable>
          <CTableHead>
            <CTableRow>
              <CTableHeaderCell>Módulo</CTableHeaderCell>
              <CTableHeaderCell>Ver</CTableHeaderCell>
              <CTableHeaderCell>Crear</CTableHeaderCell>
              <CTableHeaderCell>Editar</CTableHeaderCell>
              <CTableHeaderCell>Eliminar</CTableHeaderCell>
            </CTableRow>
          </CTableHead>
          <CTableBody>
            {MODULOS.map((modulo) => (
              <CTableRow key={modulo}>
                <CTableDataCell>
                  {modulo.replace(/_/g, ' ')}
                  {SOLO_VER.has(modulo) && (
                    <span className="text-body-secondary small ms-1">(botón del POS)</span>
                  )}
                </CTableDataCell>
                <CTableDataCell>
                  <CFormCheck
                    checked={permisos[modulo]?.ver || false}
                    onChange={() => togglePermiso(modulo, 'ver')}
                    aria-label={`Ver ${modulo}`}
                  />
                </CTableDataCell>
                <CTableDataCell>
                  {SOLO_VER.has(modulo) ? (
                    <span className="text-body-secondary">—</span>
                  ) : (
                    <CFormCheck
                      checked={permisos[modulo]?.crear || false}
                      onChange={() => togglePermiso(modulo, 'crear')}
                    />
                  )}
                </CTableDataCell>
                <CTableDataCell>
                  {SOLO_VER.has(modulo) ? (
                    <span className="text-body-secondary">—</span>
                  ) : (
                    <CFormCheck
                      checked={permisos[modulo]?.editar || false}
                      onChange={() => togglePermiso(modulo, 'editar')}
                    />
                  )}
                </CTableDataCell>
                <CTableDataCell>
                  {SOLO_VER.has(modulo) ? (
                    <span className="text-body-secondary">—</span>
                  ) : (
                    <CFormCheck
                      checked={permisos[modulo]?.eliminar || false}
                      onChange={() => togglePermiso(modulo, 'eliminar')}
                    />
                  )}
                </CTableDataCell>
              </CTableRow>
            ))}
          </CTableBody>
        </CTable>
      </CModalBody>
      <CModalFooter>
        <CButton color="secondary" onClick={onClose}>
          Cancelar
        </CButton>
        <CButton color="primary" onClick={handleGuardar}>
          Guardar
        </CButton>
      </CModalFooter>
    </CModal>
  )
}

export default ModalPermisos
