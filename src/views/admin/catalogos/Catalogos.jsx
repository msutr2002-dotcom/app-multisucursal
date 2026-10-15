import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilPen, cilTrash, cilWarning } from '@coreui/icons'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CButton,
  CNav,
  CNavItem,
  CNavLink,
  CBadge,
  CAlert,
} from '@coreui/react'
import ModalCatalogo from './ModalCatalogo'
import ConfirmModal from '../../dashboard/components/common/ConfirmModal'
import { useToast } from '../../../components/common/ToastContext'
import usePermission from '../../../hooks/usePermission'
import useEstadoRed from '../../../hooks/useEstadoRed'
import { leerCatalogosLocales } from '../../../services/catalogSyncService'

const TABS = [
  { key: 'marcas', label: 'Marcas' },
  { key: 'categorias', label: 'Categorías' },
  { key: 'proveedores', label: 'Proveedores' },
  { key: 'unidades', label: 'Unidades de Medida' },
  { key: 'tipos_precio', label: 'Tipos de Precio' },
]

const MAPA_TABLA = {
  marcas: 'marca',
  categorias: 'categoria',
  proveedores: 'proveedor',
  unidades: 'unidades',
  tipos_precio: 'tipo_producto',
}

const NOMBRES = {
  marcas: 'Marca',
  categorias: 'Categoría',
  proveedores: 'Proveedor',
  unidades: 'Unidad',
  tipos_precio: 'Tipo de Precio',
}

const Catalogos = () => {
  const empresaId = localStorage.getItem('empresaSeleccionada')
  const puedeCrear = usePermission('catalogos', 'crear')
  const puedeEditar = usePermission('catalogos', 'editar')
  const puedeEliminar = usePermission('catalogos', 'eliminar')
  const showToast = useToast()
  const enLinea = useEstadoRed()
  const [sinConexion, setSinConexion] = useState(false)

  const [tab, setTab] = useState('marcas')
  const [datos, setDatos] = useState({})
  const [modal, setModal] = useState({ abierto: false, item: null })
  const [aEliminar, setAEliminar] = useState(null)

  const cargar = async () => {
    if (!empresaId) {
      showToast('danger', 'Error', 'No se encontró la empresa activa')
      return
    }
    if (!enLinea) {
      setSinConexion(true)
      try {
        const local = await leerCatalogosLocales(empresaId)
        setDatos(local)
      } catch (e) {
        showToast('danger', 'Error', String(e?.message || e))
      }
      return
    }
    setSinConexion(false)
    const { data, error } = await supabase.rpc('get_catalogos', { p_id_empresa: empresaId })
    if (error) {
      showToast('danger', 'Error', error.message)
      return
    }
    setDatos(data)
  }

  useEffect(() => {
    setTimeout(() => cargar(), 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enLinea])

  const config = TABS.find((t) => t.key === tab)
  const lista = datos[tab] || []

  const handleGuardar = async (campos, item) => {
    if (!enLinea) return { error: 'Sin conexión: no se pueden guardar catálogos' }
    const { error } = await supabase.rpc('upsert_catalogo', {
      p_tabla: MAPA_TABLA[tab],
      p_id: item?.id ?? null,
      p_id_empresa: empresaId,
      p_campos: campos,
    })
    if (error) return { error: error.message }
    await cargar()
    return null
  }

  const handleEliminarConfirm = async () => {
    if (!enLinea) {
      showToast('warning', 'Sin conexión', 'No se pueden eliminar registros sin red')
      return
    }
    const { error } = await supabase.rpc('delete_catalogo', {
      p_tabla: aEliminar.tabla,
      p_id: aEliminar.item.id,
    })
    setAEliminar(null)
    if (error) {
      showToast('danger', 'Error', error.message)
    } else {
      showToast('success', 'Éxito', 'Registro eliminado')
      cargar()
    }
  }

  return (
    <CCard>
      <CCardHeader>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
          <h5 className="mb-0">Catálogos</h5>
          {puedeCrear && enLinea && (
            <CButton
              color="primary"
              className="text-nowrap"
              onClick={() => setModal({ abierto: true, item: null })}
            >
              <CIcon icon={cilPlus} className="me-2" />
              {NOMBRES[tab]}
            </CButton>
          )}
        </div>
        <CNav variant="tabs">
          {TABS.map((t) => (
            <CNavItem key={t.key}>
              <CNavLink
                active={tab === t.key}
                onClick={() => setTab(t.key)}
                style={{ cursor: 'pointer' }}
              >
                {t.label}
              </CNavLink>
            </CNavItem>
          ))}
        </CNav>
      </CCardHeader>

      {sinConexion && (
        <CAlert color="warning" className="d-flex align-items-start gap-2 rounded-0 mb-0 small">
          <CIcon icon={cilWarning} className="mt-1" />
          <span>Sin conexión. Catálogos desde almacenamiento local — solo lectura.</span>
        </CAlert>
      )}

      <CCardBody>
        {config?.global && (
          <p className="small text-body-secondary mt-0 mb-3">
            Los tipos de precio son comunes para todas las empresas.
          </p>
        )}

        {lista.length === 0 ? (
          <p className="text-body-secondary text-center py-4 mb-0">
            {sinConexion
              ? 'No hay datos en el almacenamiento local.'
              : `Crea el primer registro con el botón «${NOMBRES[tab]}».`}
          </p>
        ) : (
          lista.map((item) => (
            <div
              key={item.id}
              className="border rounded p-3 mb-2 d-flex justify-content-between align-items-center flex-wrap gap-2"
            >
              <div>
                <strong>{item.name}</strong>
                {tab === 'proveedores' && (
                  <div className="small text-body-secondary">
                    {[item.address, item.email, item.tel].filter(Boolean).join(' · ') ||
                      'Sin datos de contacto'}
                  </div>
                )}
                {tab === 'unidades' && (
                  <div className="small text-body-secondary d-flex align-items-center gap-2 mt-1">
                    {item.abreviatura && (
                      <CBadge color="light" className="border text-dark">
                        {item.abreviatura}
                      </CBadge>
                    )}
                    <CBadge color={item.activo ? 'success' : 'secondary'}>
                      {item.activo ? 'Activa' : 'Inactiva'}
                    </CBadge>
                  </div>
                )}
              </div>

              <div className="d-flex gap-1">
                {puedeEditar && enLinea && (
                  <CButton
                    size="sm"
                    color="primary"
                    variant="outline"
                    title="Editar"
                    onClick={() => setModal({ abierto: true, item })}
                  >
                    <CIcon icon={cilPen} />
                  </CButton>
                )}
                {puedeEliminar && enLinea && (
                  <CButton
                    size="sm"
                    color="danger"
                    variant="outline"
                    title="Eliminar"
                    onClick={() => setAEliminar({ item, tabla: MAPA_TABLA[tab] })}
                  >
                    <CIcon icon={cilTrash} />
                  </CButton>
                )}
              </div>
            </div>
          ))
        )}
      </CCardBody>

      <ModalCatalogo
        visible={modal.abierto}
        onClose={() => setModal({ abierto: false, item: null })}
        onSave={handleGuardar}
        tipo={tab}
        item={modal.item}
      />

      <ConfirmModal
        visible={!!aEliminar}
        message={`¿Eliminar "${aEliminar?.item?.name}"? Esta acción no se puede deshacer.`}
        onConfirm={handleEliminarConfirm}
        onCancel={() => setAEliminar(null)}
      />
    </CCard>
  )
}

export default Catalogos
