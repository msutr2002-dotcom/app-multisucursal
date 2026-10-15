import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CRow,
  CCol,
  CButton,
  CFormInput,
  CFormSelect,
  CSpinner,
  CAlert,
  CBadge,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilCart, cilCalendar, cilDollar, cilUser, cilPrint } from '@coreui/icons'
import { supabase } from '../../lib/supabase'
import { db } from '../../lib/db'
import { formatQ } from '../../utils/format'
import useEstadoRed from '../../hooks/useEstadoRed'
import { hayRed, AVISO_FOLIO_SIN_RED } from '../../services/redService'
import {
  leerDetalleVentaLocal,
  leerDetallesVentaLocal,
} from '../../services/historialOfflineService'
import StatCard from '../dashboard/components/StatCard'

/**
 * Fecha local YYYY-MM-DD. El `toISOString()` anterior convertía a UTC: pasadas
 * las 18:00 (GT) el "Hoy" caía en el día siguiente y el listado salía vacío.
 */
const dateInput = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(
    2,
    '0',
  )}`

const PRESETS = [
  {
    label: 'Hoy',
    rango: () => {
      const hoy = new Date()
      hoy.setHours(0, 0, 0, 0)
      return { desde: hoy, hasta: new Date() }
    },
  },
  {
    label: 'Este Mes',
    rango: () => {
      const ahora = new Date()
      const desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
      desde.setHours(0, 0, 0, 0)
      return { desde, hasta: ahora }
    },
  },
  {
    label: 'Este Año',
    rango: () => {
      const ahora = new Date()
      const desde = new Date(ahora.getFullYear(), 0, 1)
      desde.setHours(0, 0, 0, 0)
      return { desde, hasta: ahora }
    },
  },
]

const SIN_USUARIO = 'Sin usuario'

/**
 * Resuelve el nombre de quien vendio. El RPC `get_ventas_historial` ya lo
 * devuelve en `usuario`; para las ventas locales (que solo guardan `id_usuario`)
 * se usa el mapa armado con las ventas remotas del mismo periodo y, como
 * ultimo recurso, la sesion activa.
 */
const nombreUsuario = (venta, mapaUsuarios, currentUser) => {
  if (venta.usuario) return String(venta.usuario)
  if (venta.id_usuario && mapaUsuarios[venta.id_usuario]) return mapaUsuarios[venta.id_usuario]
  if (venta.id_usuario && currentUser?.id === venta.id_usuario) {
    return currentUser?.name || SIN_USUARIO
  }
  return SIN_USUARIO
}

/** Usuario en sesion, leido una sola vez para tener una referencia estable. */
const leerSesion = () => {
  try {
    return JSON.parse(localStorage.getItem('currentUser'))
  } catch {
    return null
  }
}

const COLOR_ESTADO = {
  completada: 'success',
  anulada: 'danger',
  pendiente: 'warning',
}

/** Clave de dia (fecha local) para agrupar: `2026-10-07`. */
const claveDia = (f) => dateInput(new Date(f))

/** Encabezado legible del grupo: "Martes, 07 de octubre de 2026". */
const tituloDia = (clave) => {
  const t = new Date(`${clave}T12:00:00`).toLocaleDateString('es-GT', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const horaCorta = (f) =>
  new Date(f).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })

/** Ejecuta `fn` sobre `items` con a lo mas `limite` llamadas en paralelo. */
async function conParalelismo(items, limite, fn) {
  const cola = [...items]
  const n = Math.min(limite, cola.length)
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (cola.length) await fn(cola.shift())
    }),
  )
}

/**
 * Cabecera + lineas de una venta dentro de su grupo por dia (RF-V3):
 * ID, cliente y vendedor arriba y, SIN colapsar (pedido del usuario
 * 2026-10-07), la lista de lineas siempre visible con cantidad × producto,
 * precio unitario, tipo de precio y subtotal.
 */
const FilaVenta = ({ venta, det, onReintentar }) => {
  const lineas = det?.items?.length ?? venta.items ?? null
  return (
    <>
      <div
        className="d-flex align-items-center gap-3 px-3 py-2 flex-wrap"
        data-testid="venta-bloque"
      >
        <span className="font-monospace small">{String(venta.id).slice(0, 8).toUpperCase()}</span>
        <span className="small" data-testid="venta-cliente">
          {det?.cliente || '—'}
        </span>
        <span className="small d-inline-flex align-items-center gap-1">
          <CIcon icon={cilUser} width={12} className="opacity-50" />
          {venta.usuario}
        </span>
        <span className="small text-body-secondary ms-auto">{horaCorta(venta.fecha)}</span>
        <span className="small text-body-secondary">
          {lineas != null ? `${lineas} línea${lineas === 1 ? '' : 's'}` : '—'}
        </span>
        <span className="monto">{formatQ(venta.total)}</span>
        <CBadge color={COLOR_ESTADO[venta.estado] || 'secondary'} shape="pill" className="small">
          {venta.estado}
        </CBadge>
      </div>
      <div className="px-3 py-2 bg-body-tertiary" data-testid="venta-lineas">
        {det?.cargando ? (
          <div className="text-center py-2">
            <CSpinner size="sm" />
          </div>
        ) : det?.error ? (
          <div className="d-flex align-items-center gap-2">
            <CAlert color="warning" className="py-1 small flex-grow-1 mb-0">
              {det.error}
            </CAlert>
            <CButton
              size="sm"
              color="warning"
              variant="outline"
              onClick={() => onReintentar(venta)}
            >
              Reintentar
            </CButton>
          </div>
        ) : (
          <table className="table table-sm mb-0" data-testid="tabla-lineas">
            <thead>
              <tr className="small text-uppercase text-body-secondary">
                <th>Cantidad × Producto</th>
                <th className="text-end">Precio</th>
                <th>Tipo de precio</th>
                <th className="text-end">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {(det?.items || []).map((it, i) => (
                <tr key={`${venta.id}-${i}`}>
                  <td>
                    {it.cantidad} × {it.producto}{' '}
                    {it.sku && (
                      <span className="font-monospace small text-body-secondary">{it.sku}</span>
                    )}
                  </td>
                  <td className="text-end monto">{formatQ(it.unitario)}</td>
                  <td className="small">{it.tipo || '—'}</td>
                  <td className="text-end monto">{formatQ(it.subtotal)}</td>
                </tr>
              ))}
              {!det?.items?.length && (
                <tr>
                  <td colSpan={4} className="text-center text-body-secondary small py-2">
                    Sin detalle de productos para esta venta
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

const ReportesPage = () => {
  const enLinea = useEstadoRed()
  const currentUser = useMemo(leerSesion, [])
  const idSucursal = currentUser?.id_sucursal

  const ahora = new Date()
  // RF-V3: al entrar el periodo es «Hoy» (desde = hasta = hoy local).
  const [desde, setDesde] = useState(dateInput(ahora))
  const [hasta, setHasta] = useState(dateInput(ahora))
  const [presetActivo, setPresetActivo] = useState('Hoy')
  const [ventas, setVentas] = useState([])
  const [idsLocales, setIdsLocales] = useState(() => new Set())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState(null)
  const [usuarioFiltro, setUsuarioFiltro] = useState('')
  const [detalles, setDetalles] = useState({})
  const [hidratando, setHidratando] = useState(false)
  // Reportes-impresión (RF-RI1/2): encabezado de la hoja impresa + ciclo de
  // impresión (clase en <body>, portal fuera de #root, window.print con
  // afterprint como respaldo del corte).
  const [cabecera, setCabecera] = useState({ empresa: '', sucursal: '' })
  const [imprimiendo, setImprimiendo] = useState(false)

  const listaSec = useRef(0)
  const hidrataSec = useRef(0)
  const detallesRef = useRef(detalles)
  useEffect(() => {
    detallesRef.current = detalles
  }, [detalles])

  // Nombres para el encabezado impreso: sucursal desde el espejo local y
  // empresa desde el servidor cuando hay sesión (offline queda el fallback).
  useEffect(() => {
    if (!idSucursal) return
    db.sucursales
      .get(idSucursal)
      .then((s) => {
        if (s?.name) setCabecera((c) => ({ ...c, sucursal: s.name }))
      })
      .catch(() => {})
    const idEmpresa = localStorage.getItem('empresaSeleccionada')
    if (idEmpresa) {
      Promise.resolve(supabase.from('empresa').select('name').eq('id', idEmpresa).single())
        .then(({ data }) => {
          if (data?.name) setCabecera((c) => ({ ...c, empresa: data.name }))
        })
        .catch(() => {})
    }
  }, [idSucursal])

  // RF-RI3: pinta el portal, espera a que el DOM del reporte exista y llama a
  // window.print(); afterprint (o el retorno de print en navegadores sin
  // evento) limpia clase, nodo y estado.
  useEffect(() => {
    if (!imprimiendo) return
    let hecho = false
    const limpiar = () => {
      if (hecho) return
      hecho = true
      document.body.classList.remove('imprimir-reporte')
      setImprimiendo(false)
    }
    const alAfterPrint = () => limpiar()
    window.addEventListener('afterprint', alAfterPrint)
    const t = setTimeout(async () => {
      try {
        await window.print()
      } catch {
        /* print no soportado: de todos modos se limpia */
      }
      limpiar()
    }, 250)
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', alAfterPrint)
      document.body.classList.remove('imprimir-reporte')
    }
  }, [imprimiendo])

  const iniciarImpresion = () => {
    if (!ventasFiltradas.length || imprimiendo) return
    document.body.classList.add('imprimir-reporte')
    setImprimiendo(true)
  }

  const aplicarPreset = (fn, label) => {
    const { desde: d, hasta: h } = fn()
    setDesde(dateInput(d))
    setHasta(dateInput(h))
    setPresetActivo(label)
  }

  const cambiarDesde = (valor) => {
    setDesde(valor)
    setPresetActivo('')
  }
  const cambiarHasta = (valor) => {
    setHasta(valor)
    setPresetActivo('')
  }

  // Listado: locales (IndexedDB) + servidor (si hay red), sin duplicar.
  // Token de secuencia: dos periodos solapados no pisan la respuesta nueva.
  useEffect(() => {
    const sec = ++listaSec.current
    ;(async () => {
      if (!idSucursal) {
        setCargando(false)
        return
      }
      setCargando(true)
      setError(null)
      try {
        const desdeISO = new Date(desde + 'T00:00:00')
        const hastaISO = new Date(hasta + 'T23:59:59.999')

        const locales = await db.ventas
          .where('[id_sucursal+fecha]')
          .between([idSucursal, desdeISO.toISOString()], [idSucursal, hastaISO.toISOString()])
          .toArray()
        const idsLoc = new Set(locales.map((v) => v.id))

        let remotas = []
        if (enLinea) {
          const { data, error: err } = await supabase.rpc('get_ventas_historial', {
            p_id_sucursal: idSucursal,
            p_estado: null,
            p_desde: desdeISO.toISOString(),
            p_hasta: hastaISO.toISOString(),
            p_busqueda: null,
            p_limite: 500,
            p_offset: 0,
          })
          if (sec !== listaSec.current) return
          if (err) {
            setError(
              'Sin respuesta del servidor, se muestran solo las ventas locales: ' + err.message,
            )
          } else {
            remotas = (data?.ventas || []).filter((v) => !idsLoc.has(v.id))
          }
        }

        if (sec !== listaSec.current) return
        setIdsLocales(idsLoc)
        setVentas(
          [...remotas, ...locales].sort((a, b) =>
            String(b.fecha || '').localeCompare(String(a.fecha || '')),
          ),
        )
      } catch (e) {
        if (sec !== listaSec.current) return
        setError(String(e?.message || e))
      } finally {
        if (sec === listaSec.current) setCargando(false)
      }
    })()
  }, [idSucursal, desde, hasta, enLinea])

  // Al cambiar el periodo se limpia la cache de detalle y se cancela
  // cualquier hidratacion en vuelo (evita datos del periodo viejo).
  useEffect(() => {
    hidrataSec.current += 1
    setDetalles({})
  }, [desde, hasta, idSucursal])

  // Detalle de TODAS las ventas listadas, para el RESUMEN y para las cabeceras
  // de cada bloque: locales en una sola pasada (IndexedDB) y remotas con
  // tope de 5 paralelas (RPC `get_venta_detalle`). Cancelado si cambia el
  // periodo. Sin red nunca se llama al servidor (redService).
  // OJO: `ventas` es crudo (sin la flag `esLocal`, que recién agrega
  // `ventasConUsuario`); el origen local se decide con `idsLocales`.
  useEffect(() => {
    const sec = ++hidrataSec.current
    if (!ventas.length) return
    ;(async () => {
      const pendientes = ventas.filter((v) => !detallesRef.current[v.id]?.items)
      if (!pendientes.length) return

      setHidratando(true)
      setDetalles((d) => {
        const next = { ...d }
        pendientes.forEach((v) => {
          if (!next[v.id]) next[v.id] = { cargando: true }
        })
        return next
      })
      try {
        const locales = pendientes.filter((v) => idsLocales.has(v.id))
        if (locales.length) {
          const datos = await leerDetallesVentaLocal(locales.map((v) => v.id))
          if (sec !== hidrataSec.current) return
          setDetalles((d) => ({ ...d, ...datos }))
        }

        const remotas = pendientes.filter((v) => !idsLocales.has(v.id))
        if (remotas.length && hayRed()) {
          await conParalelismo(remotas, 5, async (v) => {
            if (sec !== hidrataSec.current) return
            try {
              const { data, error: err } = await supabase.rpc('get_venta_detalle', {
                p_id: v.id,
                p_id_sucursal: idSucursal,
              })
              if (sec !== hidrataSec.current) return
              if (err) throw new Error(err.message)
              setDetalles((d) => ({
                ...d,
                [v.id]: { items: data?.items || [], cliente: data?.cliente || null },
              }))
            } catch (e) {
              if (sec !== hidrataSec.current) return
              setDetalles((d) => ({ ...d, [v.id]: { error: String(e?.message || e) } }))
            }
          })
        } else if (remotas.length) {
          if (sec !== hidrataSec.current) return
          setDetalles((d) => {
            const next = { ...d }
            remotas.forEach((v) => {
              next[v.id] = { error: AVISO_FOLIO_SIN_RED }
            })
            return next
          })
        }
      } finally {
        if (sec === hidrataSec.current) setHidratando(false)
      }
    })()
  }, [ventas, idsLocales, idSucursal])

  // `id_usuario` -> nombre, armado con las ventas remotas del periodo.
  const mapaUsuarios = useMemo(() => {
    const mapa = {}
    ventas.forEach((v) => {
      if (v.id_usuario && v.usuario) mapa[v.id_usuario] = String(v.usuario)
    })
    return mapa
  }, [ventas])

  // Cada venta con su usuario resuelto y su bandera de origen local.
  const ventasConUsuario = useMemo(
    () =>
      ventas.map((v) => ({
        ...v,
        usuario: nombreUsuario(v, mapaUsuarios, currentUser),
        esLocal: idsLocales.has(v.id),
      })),
    [ventas, mapaUsuarios, idsLocales, currentUser],
  )

  // Filtro por usuario: solo se listan quienes venda(ron) en el periodo.
  const usuarios = useMemo(() => {
    const nombres = [...new Set(ventasConUsuario.map((v) => v.usuario))].sort((a, b) =>
      a.localeCompare(b),
    )
    return nombres
  }, [ventasConUsuario])

  // Ventas visibles tras el filtro de usuario.
  const ventasFiltradas = useMemo(
    () =>
      usuarioFiltro
        ? ventasConUsuario.filter((v) => v.usuario === usuarioFiltro)
        : ventasConUsuario,
    [ventasConUsuario, usuarioFiltro],
  )

  // Un grupo por dia (descendente), con total de completadas y badge de
  // anuladas: es la vista del sistema viejo (Image 4).
  const gruposDia = useMemo(() => {
    const mapa = new Map()
    ventasFiltradas.forEach((v) => {
      const k = claveDia(v.fecha)
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k).push(v)
    })
    return [...mapa.entries()].map(([dia, items]) => {
      const completadas = items.filter((v) => v.estado === 'completada')
      const total = completadas.reduce((s, v) => s + (v.total || 0), 0)
      return {
        dia,
        ventas: items,
        count: completadas.length,
        anuladas: items.length - completadas.length,
        total,
      }
    })
  }, [ventasFiltradas])

  // Caja RESUMEN (RF-V3): clientes atendidos (n° de ventas completadas),
  // unidades vendidas (suma de cantidades de las lineas) y total cobrado.
  // Unidades queda en «cargando» hasta tener el detalle de todas.
  const resumen = useMemo(() => {
    const completadas = ventasFiltradas.filter((v) => v.estado === 'completada')
    const total = completadas.reduce((s, v) => s + (v.total || 0), 0)
    let unidades = 0
    let completo = true
    completadas.forEach((v) => {
      const det = detalles[v.id]
      if (det?.items) {
        unidades += det.items.reduce((s, it) => s + (it.cantidad || 0), 0)
      } else {
        completo = false
      }
    })
    const conError = completadas.filter((v) => detalles[v.id]?.error).length
    return { clientes: completadas.length, total, unidades, completo, conError }
  }, [ventasFiltradas, detalles])

  /**
   * Recarga el detalle de una venta cuando la hidratacion automatica fallo
   * (botón «Reintentar» bajo la linea de la venta). Las lineas se muestran
   * siempre: no hay colapsar/expandir.
   */
  const cargarDetalle = async (venta) => {
    setDetalles((d) => ({ ...d, [venta.id]: { cargando: true } }))
    try {
      if (venta.esLocal) {
        const local = await leerDetalleVentaLocal(venta.id)
        setDetalles((d) => ({
          ...d,
          [venta.id]: { items: local?.items || [], cliente: local?.cliente || null },
        }))
        return
      }
      if (!hayRed()) {
        setDetalles((d) => ({ ...d, [venta.id]: { error: AVISO_FOLIO_SIN_RED } }))
        return
      }
      const { data, error: err } = await supabase.rpc('get_venta_detalle', {
        p_id: venta.id,
        p_id_sucursal: idSucursal,
      })
      if (err) throw new Error(err.message)
      setDetalles((d) => ({
        ...d,
        [venta.id]: { items: data?.items || [], cliente: data?.cliente || null },
      }))
    } catch (e) {
      setDetalles((d) => ({ ...d, [venta.id]: { error: String(e?.message || e) } }))
    }
  }

  if (!idSucursal) {
    return (
      <p className="text-body-secondary text-center py-4 mb-0">No se encontró la sucursal activa</p>
    )
  }

  return (
    <>
      <CCard className="mb-3">
        <CCardHeader>
          <CRow className="align-items-center mb-2">
            <CCol xs={12} md={6}>
              <h5 className="mb-2">Reportes de Ventas</h5>
            </CCol>
            <CCol xs={12} md={6} className="d-flex justify-content-md-end">
              <CButton
                color="secondary"
                variant="outline"
                disabled={!ventasFiltradas.length || cargando || imprimiendo}
                onClick={iniciarImpresion}
                data-testid="btn-imprimir-reporte"
              >
                <CIcon icon={cilPrint} className="me-2" />
                Imprimir reporte
              </CButton>
            </CCol>
          </CRow>
          <CRow className="align-items-end g-2">
            <CCol xs={12} md="auto" className="d-flex gap-1 flex-wrap">
              {PRESETS.map((p) => (
                <CButton
                  key={p.label}
                  size="sm"
                  color="primary"
                  variant={presetActivo === p.label ? undefined : 'outline'}
                  onClick={() => aplicarPreset(p.rango, p.label)}
                  data-testid={`preset-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {p.label}
                </CButton>
              ))}
            </CCol>
            <CCol xs={6} md={2}>
              <CFormInput
                type="date"
                value={desde}
                onChange={(e) => cambiarDesde(e.target.value)}
                label="Desde"
                data-testid="input-desde"
              />
            </CCol>
            <CCol xs={6} md={2}>
              <CFormInput
                type="date"
                value={hasta}
                onChange={(e) => cambiarHasta(e.target.value)}
                label="Hasta"
                data-testid="input-hasta"
              />
            </CCol>
            <CCol xs={12} md={4}>
              <CFormSelect
                value={usuarioFiltro}
                onChange={(e) => setUsuarioFiltro(e.target.value)}
                label="Usuario"
                disabled={cargando || usuarios.length === 0}
              >
                <option value="">Todos los usuarios ({usuarios.length})</option>
                {usuarios.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </CFormSelect>
            </CCol>
          </CRow>
        </CCardHeader>
        <CCardBody>
          {error && (
            <CAlert color="warning" className="mb-3">
              {error}
            </CAlert>
          )}

          {cargando ? (
            <div className="text-center py-5">
              <CSpinner color="primary" />
            </div>
          ) : (
            <>
              <CCard className="mb-4" data-testid="resumen">
                <CCardHeader className="py-2">
                  <strong className="text-uppercase small">Resumen</strong>
                </CCardHeader>
                <CCardBody>
                  <CRow className="g-3">
                    <CCol xs={12} md={4} data-testid="resumen-clientes">
                      <StatCard title="Clientes atendidos" value={resumen.clientes} />
                    </CCol>
                    <CCol xs={12} md={4} data-testid="resumen-unidades">
                      <StatCard
                        title="Unidades vendidas"
                        value={resumen.unidades}
                        loading={!resumen.completo}
                      />
                    </CCol>
                    <CCol xs={12} md={4} data-testid="resumen-total">
                      <StatCard title="Total cobrado" value={formatQ(resumen.total)} mono />
                    </CCol>
                  </CRow>
                  {!resumen.completo && (hidratando || resumen.conError > 0) && (
                    <p className="small text-body-secondary mb-0 mt-2" data-testid="resumen-aviso">
                      {hidratando
                        ? 'Calculando unidades vendidas…'
                        : `Detalle no disponible para ${resumen.conError} venta${
                            resumen.conError === 1 ? '' : 's'
                          }: las unidades pueden estar incompletas.`}
                    </p>
                  )}
                </CCardBody>
              </CCard>

              {gruposDia.length === 0 ? (
                <div className="text-center py-5 text-body-secondary">
                  <CIcon icon={cilDollar} width={36} className="mb-2 opacity-50" />
                  <p className="mb-0">No hay ventas en el período seleccionado</p>
                </div>
              ) : (
                gruposDia.map((g) => (
                  <CCard key={g.dia} className="mb-3" data-testid="dia-grupo">
                    <CCardHeader className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-2">
                        <CIcon icon={cilCalendar} width={18} className="text-primary" />
                        <strong data-testid="dia-titulo">{tituloDia(g.dia)}</strong>
                        {g.anuladas > 0 && (
                          <CBadge color="danger" shape="pill" className="small">
                            {g.anuladas} anulada{g.anuladas === 1 ? '' : 's'}
                          </CBadge>
                        )}
                      </div>
                      <div className="d-flex gap-3 small text-body-secondary">
                        <span>
                          <strong className="text-body">{g.count}</strong> venta
                          {g.count === 1 ? '' : 's'}
                        </span>
                        <span className="monto">
                          <strong className="text-body">{formatQ(g.total)}</strong>
                        </span>
                      </div>
                    </CCardHeader>
                    <CCardBody className="p-0">
                      {g.ventas.map((v) => (
                        <FilaVenta
                          key={v.id}
                          venta={v}
                          det={detalles[v.id]}
                          onReintentar={cargarDetalle}
                        />
                      ))}
                    </CCardBody>
                  </CCard>
                ))
              )}
            </>
          )}
        </CCardBody>
      </CCard>

      {!cargando && ventasFiltradas.length > 0 && (
        <p className="text-body-secondary small text-center mb-0" data-testid="pie-reportes">
          <CIcon icon={cilCart} width={12} className="me-1 opacity-50" />
          {ventasFiltradas.length} venta{ventasFiltradas.length === 1 ? '' : 's'} en el período ·
          detalle de productos visible en cada venta
        </p>
      )}

      {/* Hoja de impresión (RF-RI2/3): portal fuera de #root para que el CSS
          print pueda ocultar el shell con una sola regla. Solo existe mientras
          `imprimiendo` está activo. */}
      {imprimiendo &&
        createPortal(
          <div className="reporte-impresion p-3" data-testid="reporte-impresion">
            <div className="text-center mb-3">
              <div className="fw-bold fs-5">{cabecera.empresa || 'Negocio'}</div>
              {cabecera.sucursal && <div>{cabecera.sucursal}</div>}
              <div className="fw-bold text-uppercase mt-2">Reporte de ventas</div>
              <div className="small">
                Período: {desde} al {hasta} ·{' '}
                {usuarioFiltro ? `Usuario: ${usuarioFiltro}` : 'Todos los usuarios'}
              </div>
              <div className="small">
                Generado:{' '}
                {new Date().toLocaleString('es-GT', { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>

            <div className="border rounded p-2 mb-3">
              <strong className="text-uppercase small">Resumen</strong>
              <div className="small mt-1">
                Clientes atendidos: {resumen.clientes} · Unidades vendidas:{' '}
                {resumen.completo ? resumen.unidades : 'incompletas'} · Total cobrado:{' '}
                {formatQ(resumen.total)}
              </div>
            </div>

            {gruposDia.map((g) => (
              <div key={g.dia} className="mb-3" style={{ breakInside: 'avoid' }}>
                <div className="fw-bold border-bottom pb-1">
                  {tituloDia(g.dia)} — {g.count} venta{g.count === 1 ? '' : 's'} ·{' '}
                  {formatQ(g.total)}
                  {g.anuladas > 0 ? ` · ${g.anuladas} anulada${g.anuladas === 1 ? '' : 's'}` : ''}
                </div>
                {g.ventas.map((v) => (
                  <div key={v.id} className="small mb-2" style={{ breakInside: 'avoid' }}>
                    <div className="d-flex gap-3 flex-wrap">
                      <span className="font-monospace">
                        {String(v.id).slice(0, 8).toUpperCase()}
                      </span>
                      <span>{detalles[v.id]?.cliente || '—'}</span>
                      <span>{v.usuario}</span>
                      <span className="text-body-secondary">{horaCorta(v.fecha)}</span>
                      <span className="ms-auto fw-bold">{formatQ(v.total)}</span>
                      <span className="text-uppercase text-body-secondary">{v.estado}</span>
                    </div>
                    {detalles[v.id]?.items?.length > 0 && (
                      <table className="table table-sm small mb-0">
                        <tbody>
                          {detalles[v.id].items.map((it, i) => (
                            <tr key={`${v.id}-${i}`}>
                              <td>
                                {it.cantidad} × {it.producto}
                              </td>
                              <td className="text-end">{formatQ(it.unitario)}</td>
                              <td className="text-end">{formatQ(it.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            ))}

            <div className="d-flex justify-content-between fw-bold border-top pt-2">
              <span>Total general</span>
              <span>{formatQ(resumen.total)}</span>
            </div>
            <div className="text-center small mt-3" data-testid="leyenda-reporte">
              Reporte interno — no es comprobante fiscal
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export default ReportesPage
