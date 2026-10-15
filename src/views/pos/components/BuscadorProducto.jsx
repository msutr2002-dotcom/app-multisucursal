import React, { useEffect, useRef, useState } from 'react'
import { CFormInput, CSpinner, CBadge } from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilSearch } from '@coreui/icons'
import { formatQ } from '../../../utils/format'
import ImagenProducto from '../../../components/common/ImagenProducto'
import { nombreColor } from '../colorUtils'

/**
 * Buscador del POS con RF-V4:
 * - Lector de barras: Enter → seleccionarPorCodigo (sku exacto, sin debounce);
 *   también auto-selección por sku exacto (ver hook).
 * - Teclado: ArrowDown/Up recorren los resultados (foco siempre en el input),
 *   Enter selecciona el resaltado (o el primero), Escape → onEscape (clear).
 * - Tras seleccionar (clic o teclado) el input recupera el foco para escanear
 *   el siguiente código sin tocar el mouse.
 */
const BuscadorProducto = ({
  query,
  setQuery,
  results,
  loading,
  coloresPorId = {},
  onSelect,
  seleccionarPorCodigo,
  onEscape,
}) => {
  const inputRef = useRef(null)
  const btnRefs = useRef([])
  const [idx, setIdx] = useState(-1)

  // El resaltado se reinicia en cada handler que cambia el contexto del
  // dropdown (escritura, selección, Escape) — sin effects ni refs en render
  // (react-hooks v7 prohíbe ambos).
  const cambiar = (valor) => {
    setIdx(-1)
    setQuery(valor)
  }

  const elegir = (p) => {
    setIdx(-1)
    onSelect(p)
    inputRef.current?.focus()
  }

  const onKeyDown = async (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return
      e.preventDefault()
      setIdx((prev) => {
        const base = prev >= 0 && prev < results.length ? prev : -1
        if (e.key === 'ArrowDown') {
          if (base === -1) return 0
          return base < results.length - 1 ? base + 1 : 0 // ciclo
        }
        if (base === -1) return 0
        if (base === 0) return results.length - 1 // ciclo al último
        return base - 1
      })
      return
    }

    if (e.key === 'Enter') {
      e.preventDefault()
      if (idx >= 0 && idx < results.length) {
        elegir(results[idx])
        return
      }
      // Lector de barras: código exacto de una vez (sin esperar el debounce)
      const ok = await seleccionarPorCodigo(query)
      if (!ok && results.length) elegir(results[0])
      return
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      setIdx(-1)
      onEscape?.()
    }
  }

  // Mantener la fila resaltada a la vista (refs en effect: permitido)
  useEffect(() => {
    if (idx >= 0) btnRefs.current[idx]?.scrollIntoView({ block: 'nearest' })
  }, [idx])

  // Autofocus al montar + atajo global "/" o F2 + evento 'pos:focus-buscador'
  // (tras "Agregar" el foco caía a <body>: el botón se desmontaba con el detalle).
  useEffect(() => {
    inputRef.current?.focus()
    const devolverFoco = (e) => {
      if (e.key !== '/' && e.key !== 'F2') return
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    const alAgregar = () => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', devolverFoco)
    window.addEventListener('pos:focus-buscador', alAgregar)
    return () => {
      window.removeEventListener('keydown', devolverFoco)
      window.removeEventListener('pos:focus-buscador', alAgregar)
    }
  }, [])

  return (
    <div style={{ position: 'relative' }}>
      <CIcon
        icon={cilSearch}
        style={{
          position: 'absolute',
          left: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 5,
          color: 'var(--pos-primary)',
          pointerEvents: 'none',
        }}
      />
      <CFormInput
        ref={inputRef}
        size="lg"
        placeholder="Buscar por nombre, marca o código..."
        value={query}
        onChange={(e) => cambiar(e.target.value)}
        onKeyDown={onKeyDown}
        style={{ paddingLeft: '2.5rem', borderColor: 'var(--pos-primary)' }}
        autoComplete="off"
        role="combobox"
        aria-expanded={query.trim().length > 0 && !loading && results.length > 0}
        aria-controls="pos-listbox-resultados"
        aria-autocomplete="list"
        aria-activedescendant={idx >= 0 ? `pos-opcion-${results[idx]?.id}` : undefined}
        aria-label="Buscar producto por nombre, marca o código"
      />

      {/* Región live: anuncia el conteo de resultados al navegar con teclado */}
      <div aria-live="polite" className="visually-hidden">
        {query.trim() && !loading
          ? results.length === 0
            ? 'Sin resultados'
            : `${results.length} resultado${results.length === 1 ? '' : 's'}`
          : ''}
      </div>

      {/* Estados fuera del listbox (un role=listbox solo debe contener options) */}
      {query.trim() && loading && (
        <div
          className="position-absolute w-100 mt-1 text-center py-3 shadow-lg bg-body"
          style={{
            zIndex: 10,
            borderRadius: '0.5rem',
            border: '1px solid var(--cui-border-color)',
          }}
        >
          <CSpinner color="success" size="sm" />
        </div>
      )}

      {query.trim() && !loading && results.length === 0 && (
        <div
          className="position-absolute w-100 mt-1 text-center text-body-secondary py-3 small shadow-lg bg-body"
          style={{
            zIndex: 10,
            borderRadius: '0.5rem',
            border: '1px solid var(--cui-border-color)',
          }}
        >
          Sin resultados para “{query}”
        </div>
      )}

      {/* Dropdown de resultados (combobox + listbox + aria-activedescendant) */}
      {query.trim() && !loading && results.length > 0 && (
        <div className="position-absolute w-100 mt-1" style={{ zIndex: 10 }}>
          <div
            id="pos-listbox-resultados"
            data-testid="resultados-busqueda"
            role="listbox"
            aria-label="Resultados de búsqueda"
            className="w-100 shadow-lg bg-body"
            style={{
              borderRadius: '0.5rem 0.5rem 0 0',
              maxHeight: '320px',
              overflowY: 'auto',
              border: '1px solid var(--cui-border-color)',
            }}
          >
            {results.map((p, i) => {
              const stock = p.stock?.find((s) => s.es_actual)?.stock ?? 0
              const precioMin = p.precios?.length ? Math.min(...p.precios.map((x) => x.precio)) : 0
              const resaltado = i === idx
              const color = nombreColor(coloresPorId, p.id_color)

              return (
                <div
                  key={p.id}
                  id={`pos-opcion-${p.id}`}
                  role="option"
                  aria-selected={resaltado}
                  ref={(el) => {
                    btnRefs.current[i] = el
                  }}
                  // Sin bg-transparent (Bootstrap lo pone !important y mataría
                  // el resaltado): el fondo se controla 100% por inline style.
                  className="w-100 text-start border-0 px-3 py-2 d-flex justify-content-between align-items-center cursor-pointer"
                  style={{
                    borderBottom: '1px solid var(--cui-border-color)',
                    backgroundColor: resaltado ? 'var(--pos-primary)' : 'transparent',
                    ...(resaltado && { color: '#fff' }),
                  }}
                  onClick={() => elegir(p)}
                  onMouseEnter={() => setIdx(i)}
                >
                  <span className="d-flex align-items-center gap-2">
                    <ImagenProducto src={p.imagen} alt={p.name} size={38} />
                    <span className="d-flex flex-column">
                      <span className="d-flex align-items-center gap-1">
                        <strong className="small">{p.name}</strong>
                        {color && (
                          <CBadge color={resaltado ? 'light' : 'info'} className="fw-normal">
                            {color}
                          </CBadge>
                        )}
                      </span>
                      <span
                        className={resaltado ? '' : 'text-body-secondary'}
                        style={{
                          fontSize: '0.75rem',
                          ...(resaltado && { color: 'rgba(255, 255, 255, 0.8)' }),
                        }}
                      >
                        {p.sku || 'Sin SKU'} · {p.marca || '—'}
                      </span>
                    </span>
                  </span>
                  <span className="d-flex align-items-center gap-2">
                    <span
                      className="fw-bold small monto"
                      style={{ color: resaltado ? '#fff' : 'var(--pos-primary)' }}
                    >
                      {formatQ(precioMin)}
                    </span>
                    <CBadge color={stock > 0 ? 'success' : 'danger'}>{stock}</CBadge>
                  </span>
                </div>
              )
            })}
          </div>

          {/* Pista de teclado fuera del listbox (un listbox solo contiene options) */}
          <div
            className="w-100 px-3 py-1 text-body-secondary bg-body"
            style={{
              fontSize: '0.72rem',
              border: '1px solid var(--cui-border-color)',
              borderTop: 'none',
              borderRadius: '0 0 0.5rem 0.5rem',
            }}
          >
            ↑↓ navegar · Enter seleccionar · Esc limpiar · / para buscar de nuevo
          </div>
        </div>
      )}
    </div>
  )
}

export default BuscadorProducto
