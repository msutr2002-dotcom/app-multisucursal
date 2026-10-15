import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  CModal,
  CModalHeader,
  CModalTitle,
  CModalBody,
  CModalFooter,
  CButton,
  CForm,
  CFormLabel,
  CFormInput,
  CFormSelect,
  CFormTextarea,
  CFormSwitch,
  CRow,
  CCol,
} from '@coreui/react'
import { useToast } from '../../../components/common/ToastContext'
import ImagenProducto from '../../../components/common/ImagenProducto'
import RecetaForm from './RecetaForm'
import { supabase } from '../../../lib/supabase'

const ESTADOS = ['disponible', 'agotado', 'descontinuado']
const TIPOS = ['bien', 'servicio']
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB

const vacio = {
  name: '',
  sku: '',
  descripcion: '',
  id_categoria: '',
  id_marca: '',
  id_proveedor: '',
  id_color: '',
  precio_compra: '',
  tipo: 'bien',
  estado: 'disponible',
  id_unidad_compra: '',
  id_unidad_venta: '',
  precio_inicial: '',
  imagen: '',
  contiene_insumos: false,
  tipo_receta: 'producto',
}

const ModalProductos = ({
  visible,
  onClose,
  onSave,
  producto,
  opciones,
  productos,
  modoIngrediente,
  ingredientes,
}) => {
  const showToast = useToast()
  const [f, setF] = useState(vacio)
  const [archivo, setArchivo] = useState(null) // archivo elegido (todavía sin subir)
  const recetaRef = useRef(null)

  // Al abrir: cargar datos (editar) o dejar vacío (crear); limpiar archivo anterior
  useEffect(() => {
    if (!visible) return undefined
    // Diferido para no setear estado de forma síncrona dentro del efecto.
    const t = setTimeout(() => {
      setArchivo(null)
      if (producto) {
        setF({
          name: producto.name || '',
          sku: producto.sku || '',
          descripcion: producto.descripcion || '',
          id_categoria: producto.id_categoria || '',
          id_marca: producto.id_marca || '',
          id_proveedor: producto.id_proveedor || '',
          id_color: producto.id_color || '',
          precio_compra:
            producto.precio_compra != null ? (producto.precio_compra / 100).toFixed(2) : '',
          tipo: producto.tipo || 'bien',
          estado: producto.estado || 'disponible',
          id_unidad_compra: producto.id_unidad_compra || '',
          id_unidad_venta: producto.id_unidad_venta || '',
          precio_inicial: '',
          imagen: producto.imagen || '',
          contiene_insumos: producto.contiene_insumos ?? false,
          // El tipo de receta se infiere de los componentes existentes:
          // si alguno trae id_ingrediente → receta de ingredientes.
          tipo_receta: (producto.componentes || []).some((c) => c.id_ingrediente)
            ? 'ingrediente'
            : 'producto',
        })
      } else {
        setF(vacio)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [visible, producto])

  // Vista previa: si hay archivo nuevo, usa su URL local; si no, la imagen guardada
  const preview = useMemo(
    () => (archivo ? URL.createObjectURL(archivo) : f.imagen || ''),
    [archivo, f.imagen],
  )

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setF((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  // Dos toggles mutuamente excluyentes: combo de PRODUCTOS o receta de
  // INGREDIENTES. Encender uno apaga el otro; apagar el activo quita la receta.
  const cambiarTipoReceta = (tipo) => (e) => {
    const activo = e.target.checked
    setF((prev) => ({
      ...prev,
      contiene_insumos: activo ? true : prev.tipo_receta === tipo ? false : prev.contiene_insumos,
      tipo_receta: activo ? tipo : prev.tipo_receta,
    }))
  }

  // Validar el archivo elegido
  const handleArchivo = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('danger', 'Error', 'El archivo debe ser una imagen')
      e.target.value = ''
      return
    }
    if (file.size > MAX_BYTES) {
      showToast('danger', 'Error', 'La imagen no puede superar 2 MB')
      e.target.value = ''
      return
    }
    setArchivo(file)
  }

  const quitarImagen = () => {
    setArchivo(null)
    setF((prev) => ({ ...prev, imagen: '' }))
  }

  // Sube el archivo al bucket 'productos' de Supabase Storage y devuelve la URL pública
  const subirImagen = async () => {
    const ext = (archivo.name.split('.').pop() || 'png').toLowerCase()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage
      .from('productos')
      .upload(path, archivo, { upsert: false })
    if (error) throw error
    const { data } = supabase.storage.from('productos').getPublicUrl(path)
    return data.publicUrl
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // RF-C2: si el switch de combo está ON, la receta es obligatoria
    let receta = null
    if (f.contiene_insumos) {
      const errReceta = recetaRef.current?.validar()
      if (errReceta) {
        showToast('danger', 'Error', errReceta)
        return
      }
      receta = recetaRef.current?.obtenerPayload()
    }

    // 1) Subir imagen si se eligió una nueva
    let imagenFinal = f.imagen || null
    if (archivo) {
      try {
        imagenFinal = await subirImagen()
      } catch (err) {
        showToast('danger', 'Error al subir imagen', err.message)
        return
      }
    }

    // 2) Guardar producto (create o update) con la URL final + receta opcional
    const resultado = await onSave({ ...f, imagen: imagenFinal, receta })

    if (resultado?.error) {
      showToast('danger', 'Error', resultado.error)
    } else {
      showToast(
        'success',
        'Éxito',
        producto
          ? f.contiene_insumos
            ? 'Producto y receta guardados'
            : 'Producto editado'
          : f.contiene_insumos
            ? 'Producto y receta creados'
            : 'Producto creado',
      )
      onClose()
    }
  }

  return (
    <CModal visible={visible} onClose={onClose} size="lg">
      <CModalHeader onClose={onClose}>
        <CModalTitle>{producto ? 'Editar Producto' : 'Nuevo Producto'}</CModalTitle>
      </CModalHeader>
      <CForm onSubmit={handleSubmit}>
        <CModalBody>
          <CRow>
            <CCol md={7} className="mb-3">
              <CFormLabel>Nombre *</CFormLabel>
              <CFormInput name="name" value={f.name} onChange={handleChange} required />
            </CCol>
            <CCol md={5} className="mb-3">
              <CFormLabel>SKU</CFormLabel>
              <CFormInput name="sku" value={f.sku} onChange={handleChange} />
            </CCol>
          </CRow>

          <div className="mb-3">
            <CFormLabel>Descripción</CFormLabel>
            <CFormTextarea
              name="descripcion"
              value={f.descripcion}
              onChange={handleChange}
              rows={2}
            />
          </div>

          {/* ===== IMAGEN ===== */}
          <div className="mb-3">
            <CFormLabel>Imagen</CFormLabel>
            <div className="d-flex align-items-center gap-3">
              <ImagenProducto src={preview} alt="Vista previa" size={76} radius={10} />
              <div>
                <CFormInput type="file" accept="image/*" onChange={handleArchivo} />
                <small className="text-body-secondary d-block mt-1">PNG o JPG, máximo 2 MB</small>
                {(f.imagen || archivo) && (
                  <CButton size="sm" color="link" className="p-0 mt-1" onClick={quitarImagen}>
                    Quitar imagen
                  </CButton>
                )}
              </div>
            </div>
          </div>

          <CRow>
            <CCol md={3} className="mb-3">
              <CFormLabel>Categoría</CFormLabel>
              <CFormSelect name="id_categoria" value={f.id_categoria} onChange={handleChange}>
                <option value="">Sin categoría</option>
                {(opciones.categorias || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Marca</CFormLabel>
              <CFormSelect name="id_marca" value={f.id_marca} onChange={handleChange}>
                <option value="">Sin marca</option>
                {(opciones.marcas || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Proveedor</CFormLabel>
              <CFormSelect name="id_proveedor" value={f.id_proveedor} onChange={handleChange}>
                <option value="">Sin proveedor</option>
                {(opciones.proveedores || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Color</CFormLabel>
              <CFormSelect name="id_color" value={f.id_color} onChange={handleChange}>
                <option value="">Sin color</option>
                {(opciones.colores || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
          </CRow>

          <CRow>
            <CCol md={3} className="mb-3">
              <CFormLabel>Precio compra (Q)</CFormLabel>
              <CFormInput
                type="number"
                step="0.01"
                min="0"
                name="precio_compra"
                value={f.precio_compra}
                onChange={handleChange}
                placeholder="0.00"
              />
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Unidad compra</CFormLabel>
              <CFormSelect
                name="id_unidad_compra"
                value={f.id_unidad_compra}
                onChange={handleChange}
              >
                <option value="">—</option>
                {(opciones.unidades || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Unidad venta</CFormLabel>
              <CFormSelect name="id_unidad_venta" value={f.id_unidad_venta} onChange={handleChange}>
                <option value="">—</option>
                {(opciones.unidades || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            <CCol md={3} className="mb-3">
              <CFormLabel>Tipo</CFormLabel>
              <CFormSelect name="tipo" value={f.tipo} onChange={handleChange}>
                {TIPOS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
          </CRow>

          <CRow>
            <CCol md={4} className="mb-3">
              <CFormLabel>Estado</CFormLabel>
              <CFormSelect name="estado" value={f.estado} onChange={handleChange}>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
            {!producto && (
              <CCol md={4} className="mb-3">
                <CFormLabel>Precio inicial Normal (Q)</CFormLabel>
                <CFormInput
                  type="number"
                  step="0.01"
                  min="0"
                  name="precio_inicial"
                  value={f.precio_inicial}
                  onChange={handleChange}
                  placeholder="0.00 (opcional)"
                />
              </CCol>
            )}
          </CRow>

          {/* ===== COMBOS / RECETAS ===== */}
          <div className="mb-3">
            <CFormSwitch
              label="Es Combo/Kit (arma con productos vendibles)"
              checked={f.contiene_insumos && f.tipo_receta === 'producto'}
              onChange={cambiarTipoReceta('producto')}
            />
            <small className="text-body-secondary d-block mt-1 mb-2">
              Ej. Combo Alitas = 12 alitas + cocacola + papas. Al venderlo se descuenta el stock de
              sus componentes; el combo no tiene stock propio.
            </small>
            {modoIngrediente && (
              <>
                <CFormSwitch
                  label="Tiene ingredientes (arma con insumos)"
                  checked={f.contiene_insumos && f.tipo_receta === 'ingrediente'}
                  onChange={cambiarTipoReceta('ingrediente')}
                />
                <small className="text-body-secondary d-block mt-1">
                  Ej. Hamburguesa = pan + carne + lechuga. Al venderlo se descuenta el stock de sus
                  ingredientes.
                </small>
              </>
            )}
            {f.contiene_insumos && (
              <RecetaForm
                key={f.tipo_receta}
                ref={recetaRef}
                producto={producto}
                productos={productos}
                unidades={opciones.unidades}
                modoIngrediente={f.tipo_receta === 'ingrediente'}
                ingredientes={ingredientes}
              />
            )}
          </div>
        </CModalBody>
        <CModalFooter>
          <CButton color="secondary" type="button" onClick={onClose}>
            Cancelar
          </CButton>
          <CButton color="primary" type="submit">
            {producto ? 'Guardar Cambios' : 'Crear Producto'}
          </CButton>
        </CModalFooter>
      </CForm>
    </CModal>
  )
}

export default ModalProductos
