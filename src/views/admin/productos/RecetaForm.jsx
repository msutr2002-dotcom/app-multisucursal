import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { CButton, CFormLabel, CFormInput, CFormSelect, CRow, CCol } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilPlus, cilTrash } from '@coreui/icons'
import { formatQ } from '../../../utils/format'

/**
 * Formulario de receta de combo (RF-C2), embebido en ModalProductos cuando el
 * switch "Contiene insumos" está activo. Sin modal propio: el padre lo valida
 * vía ref (`validar()` → string de error | null) y extrae el payload
 * (`obtenerPayload()` → { componentes, precioFinalCentavos }).
 *
 * Modo dual (Task 4): si la sucursal tiene `activar_ingredientes` (prop
 * `modoIngrediente`), los componentes son **ingredientes** (unidad base,
 * sin presentación, precio sugerido = costo). Si no, son **productos** con
 * presentación opcional (como siempre).
 */
const RecetaForm = forwardRef(
  ({ producto, productos, unidades, modoIngrediente, ingredientes }, ref) => {
    const [filas, setFilas] = useState([])
    const [nuevo, setNuevo] = useState({ id_ref: '', cantidad: '1', id_precio_producto: '' })
    const [precioFinal, setPrecioFinal] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
      // Diferido para no setear estado de forma síncrona dentro del efecto.
      const t = setTimeout(() => {
        const comps = producto?.componentes || []
        // Solo carga las filas existentes si su tipo coincide con el modo actual;
        // si el usuario alternó combo↔ingredientes, empieza vacío.
        const coincideTipo =
          comps.length === 0 || comps.some((c) => !!c.id_ingrediente) === modoIngrediente
        setFilas(
          coincideTipo
            ? comps.map((c) => ({
                tipo: c.id_ingrediente ? 'ingrediente' : 'producto',
                id_ref: c.id_ingrediente || c.id_producto_componente,
                name: c.componente || 'Componente',
                cantidad: c.cantidad,
                id_precio_producto: c.id_precio_producto || '',
              }))
            : [],
        )
        setNuevo({ id_ref: '', cantidad: '1', id_precio_producto: '' })
        const normal = precioNormalDe(producto)
        setPrecioFinal(normal ? (normal.precio / 100).toFixed(2) : '')
        setError('')
      }, 0)
      return () => clearTimeout(t)
    }, [producto, modoIngrediente])

    const precioNormalDe = (p) =>
      (p?.precios || []).find((t) => (t.tipo || '').trim().toUpperCase() === 'NORMAL')

    // D5: un combo consume HIJOS, nunca padres. Los candidatos son productos
    // vendibles (sueltos o hijos) que no sean combo (D7: combos no se anidan) ni
    // el propio producto. Los hijos se agrupan bajo su padre (<optgroup>).
    const hijosDeProducto = (id) => (productos || []).filter((p) => p.id_padre === id)
    const esPadreProducto = (p) => hijosDeProducto(p.id).length > 0

    const candidatosProducto = (productos || []).filter(
      (p) => p.id !== producto?.id && !p.contiene_insumos && !esPadreProducto(p),
    )
    const opcionesProducto = candidatosProducto
      .filter((p) => !p.id_padre)
      .sort((a, b) => a.name.localeCompare(b.name))
    const gruposProducto = (productos || [])
      .filter((p) => esPadreProducto(p))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((padre) => ({
        padre,
        hijos: candidatosProducto
          .filter((h) => h.id_padre === padre.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.hijos.length > 0)

    const opcionesIngrediente = (ingredientes || [])
      .filter((i) => i.activo !== false)
      .sort((a, b) => a.name.localeCompare(b.name))

    const productoNuevo = (productos || []).find((p) => p.id === nuevo.id_ref)
    const ingredienteNuevo = (ingredientes || []).find((i) => i.id === nuevo.id_ref)

    const tiersDe = (p) =>
      (p?.precios || []).map((t) => {
        const u = (unidades || []).find((x) => x.id === t.id_unidad_venta)
        const etiqueta = `${t.tipo}${u ? ` ${u.name}` : ''} · ${formatQ(t.precio)}${
          (t.factor ?? 1) > 1 ? ` (x${t.factor} und)` : ''
        }`
        return { ...t, etiqueta }
      })

    const etiquetaRefDe = (fila) => {
      if (fila.tipo === 'ingrediente') {
        const ing = (ingredientes || []).find((x) => x.id === fila.id_ref)
        return ing?.unidad_abrev || ing?.unidad_name || 'unidad base'
      }
      if (!fila.id_precio_producto) return 'Unidad base'
      const p = (productos || []).find((x) => x.id === fila.id_ref)
      const t = (p?.precios || []).find((x) => x.id === fila.id_precio_producto)
      return t ? `${t.tipo}${(t.factor ?? 1) > 1 ? ` (x${t.factor} und)` : ''}` : 'Unidad base'
    }

    const agregar = () => {
      setError('')
      if (!nuevo.id_ref) {
        setError(modoIngrediente ? 'Selecciona un ingrediente' : 'Selecciona un componente')
        return
      }
      const cant = parseInt(nuevo.cantidad, 10)
      if (!Number.isInteger(cant) || cant < 1) {
        setError('La cantidad debe ser un entero ≥ 1')
        return
      }
      if (filas.some((f) => f.id_ref === nuevo.id_ref)) {
        setError(
          modoIngrediente
            ? 'Ese ingrediente ya está en la receta'
            : 'Ese componente ya está en la receta',
        )
        return
      }
      const nombre = modoIngrediente
        ? ingredienteNuevo?.name || 'Ingrediente'
        : productoNuevo?.name || 'Componente'
      setFilas((prev) => [
        ...prev,
        {
          tipo: modoIngrediente ? 'ingrediente' : 'producto',
          id_ref: nuevo.id_ref,
          name: nombre,
          cantidad: cant,
          id_precio_producto: nuevo.id_precio_producto || '',
        },
      ])
      setNuevo({ id_ref: '', cantidad: '1', id_precio_producto: '' })
    }

    const quitar = (id) => setFilas((prev) => prev.filter((f) => f.id_ref !== id))

    const cambiarCantidad = (id, valor) =>
      setFilas((prev) => prev.map((f) => (f.id_ref === id ? { ...f, cantidad: valor } : f)))

    const cambiarTier = (id, valor) =>
      setFilas((prev) =>
        prev.map((f) => (f.id_ref === id ? { ...f, id_precio_producto: valor } : f)),
      )

    const aplicarSugerido = () => {
      setError('')
      if (!filas.length) {
        setError('La receta necesita al menos un componente')
        return
      }
      let suma = 0
      for (const f of filas) {
        const cant = parseInt(f.cantidad, 10)
        if (!Number.isInteger(cant) || cant < 1) {
          setError(`Cantidad inválida en ${f.name}`)
          return
        }
        if (f.tipo === 'ingrediente') {
          const ing = (ingredientes || []).find((x) => x.id === f.id_ref)
          if (!ing) {
            setError(`El ingrediente ${f.name} ya no existe`)
            return
          }
          suma += (ing.precio_compra || 0) * cant
        } else {
          const p = (productos || []).find((x) => x.id === f.id_ref)
          const t = f.id_precio_producto
            ? (p?.precios || []).find((x) => x.id === f.id_precio_producto)
            : precioNormalDe(p)
          if (!t) {
            setError(
              `El componente ${f.name} no tiene precio ${f.id_precio_producto ? 'seleccionado' : 'NORMAL'}`,
            )
            return
          }
          suma += t.precio * cant
        }
      }
      setPrecioFinal((suma / 100).toFixed(2))
    }

    const validar = () => {
      if (!filas.length) return 'La receta necesita al menos un componente'
      for (const f of filas) {
        const cant = parseInt(f.cantidad, 10)
        if (!Number.isInteger(cant) || cant < 1) return `Cantidad inválida en ${f.name}`
      }
      if (precioFinal === '') return 'Ingresa el precio final del combo (o aplica el sugerido)'
      const centavos = Math.round(parseFloat(precioFinal) * 100)
      if (!Number.isInteger(centavos) || centavos < 0) return 'Precio final inválido'
      return null
    }

    const obtenerPayload = () => ({
      componentes: filas.map((f) =>
        f.tipo === 'ingrediente'
          ? {
              id_ingrediente: f.id_ref,
              cantidad: parseInt(f.cantidad, 10),
              id_precio_producto: null,
            }
          : {
              id_producto_componente: f.id_ref,
              cantidad: parseInt(f.cantidad, 10),
              id_precio_producto: f.id_precio_producto || null,
            },
      ),
      precioFinalCentavos: Math.round(parseFloat(precioFinal) * 100),
    })

    useImperativeHandle(ref, () => ({ validar, obtenerPayload }))

    return (
      <div className="border rounded p-3 mt-2">
        <div className="fw-semibold small mb-2">
          {modoIngrediente ? 'Receta de ingredientes' : 'Receta del combo'}
        </div>
        {error && (
          <div className="alert alert-danger py-2 small" role="alert">
            {error}
          </div>
        )}

        {filas.length === 0 ? (
          <p className="text-body-secondary small">
            {modoIngrediente
              ? 'Esta receta no tiene ingredientes. Agrega al menos uno.'
              : 'Este combo no tiene componentes. Agrega al menos uno.'}
          </p>
        ) : (
          <div className="mb-3">
            {filas.map((f) => (
              <div
                key={f.id_ref}
                className="d-flex align-items-center gap-2 border-bottom py-2 small"
              >
                <span className="flex-grow-1">
                  <strong>{f.name}</strong>{' '}
                  <span className="text-body-secondary">· {etiquetaRefDe(f)}</span>
                </span>
                <CFormInput
                  type="number"
                  min="1"
                  size="sm"
                  style={{ width: '90px' }}
                  value={f.cantidad}
                  onChange={(e) => cambiarCantidad(f.id_ref, e.target.value)}
                />
                <CButton
                  size="sm"
                  color="link"
                  className="text-danger p-1"
                  onClick={() => quitar(f.id_ref)}
                >
                  <CIcon icon={cilTrash} />
                </CButton>
              </div>
            ))}
          </div>
        )}

        <CRow className="g-2 align-items-end mb-3">
          <CCol xs={12} md={modoIngrediente ? 7 : 5}>
            <CFormLabel className="small">
              {modoIngrediente ? 'Ingrediente' : 'Componente'}
            </CFormLabel>
            <CFormSelect
              size="sm"
              value={nuevo.id_ref}
              onChange={(e) =>
                setNuevo((prev) => ({ ...prev, id_ref: e.target.value, id_precio_producto: '' }))
              }
            >
              <option value="">
                {modoIngrediente ? 'Seleccionar ingrediente...' : 'Seleccionar producto...'}
              </option>
              {modoIngrediente
                ? opcionesIngrediente.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                      {i.unidad_abrev ? ` (${i.unidad_abrev})` : ''}
                    </option>
                  ))
                : [
                    opcionesProducto.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    )),
                    gruposProducto.map((g) => (
                      <optgroup key={g.padre.id} label={g.padre.name}>
                        {g.hijos.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.name}
                          </option>
                        ))}
                      </optgroup>
                    )),
                  ]}
            </CFormSelect>
          </CCol>
          <CCol xs={4} md={2}>
            <CFormLabel className="small">Cantidad</CFormLabel>
            <CFormInput
              type="number"
              min="1"
              size="sm"
              value={nuevo.cantidad}
              onChange={(e) => setNuevo((prev) => ({ ...prev, cantidad: e.target.value }))}
            />
          </CCol>
          {!modoIngrediente && (
            <CCol xs={5} md={3}>
              <CFormLabel className="small">Presentación (opcional)</CFormLabel>
              <CFormSelect
                size="sm"
                value={nuevo.id_precio_producto}
                onChange={(e) =>
                  setNuevo((prev) => ({ ...prev, id_precio_producto: e.target.value }))
                }
              >
                <option value="">Unidad base</option>
                {tiersDe(productoNuevo).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.etiqueta}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
          )}
          <CCol xs={3} md={modoIngrediente ? 3 : 2}>
            <CButton color="success" size="sm" className="w-100" onClick={agregar}>
              <CIcon icon={cilPlus} className="me-1" />
              Agregar
            </CButton>
          </CCol>
        </CRow>

        <CRow className="align-items-end g-2">
          <CCol xs={12} md={4}>
            <CButton color="secondary" size="sm" className="w-100" onClick={aplicarSugerido}>
              Aplicar precio sugerido
            </CButton>
            <small className="text-body-secondary d-block mt-1">
              {modoIngrediente
                ? 'Suma del costo de ingredientes × cantidad'
                : 'Suma de componentes × cantidad'}
            </small>
          </CCol>
          <CCol xs={6} md={4}>
            <CFormLabel className="small">Precio final (Q)</CFormLabel>
            <CFormInput
              type="number"
              step="0.01"
              min="0"
              size="sm"
              value={precioFinal}
              onChange={(e) => setPrecioFinal(e.target.value)}
              placeholder="0.00"
            />
          </CCol>
        </CRow>
      </div>
    )
  },
)

RecetaForm.displayName = 'RecetaForm'

export default RecetaForm
