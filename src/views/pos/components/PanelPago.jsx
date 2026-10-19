import React, { useState, useEffect, useRef } from 'react'
import {
  CCard,
  CCardBody,
  CFormInput,
  CFormLabel,
  CButton,
  CRow,
  CCol,
  CSpinner,
  CAlert,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'
import { cilBasket, cilClipboard, cilBookmark, cilUserFollow } from '@coreui/icons'
import { supabase } from '../../../lib/supabase'
import { db } from '../../../lib/db'
import { formatQ } from '../../../utils/format'
import { hayRed } from '../../../services/redService'
import { verificarPermisoBotonPos } from '../../../services/permisoService'
import { useToast } from '../../../components/common/ToastContext'
import { hidratarClientes, leerClientesLocal } from '../../../services/catalogSyncService'
import { consultarContribuyente } from '../../../services/satFelService'
import TipoPagoToggle from './TipoPagoToggle'
import ResumenPago from './ResumenPago'

// pos-cliente-unificado D3 + pos-nit-sat-contribuyente D1: el campo único detecta
// NIT por forma (empieza con dígito; dígitos/guiones/espacios; termina en dígito o K/k).
// NITs reales GT: 1234567-0, 87654321-K.
const ES_NIT = /^[0-9][0-9\- ]{2,13}[0-9kK]$/i
const esNit = (t) => ES_NIT.test(t.trim())
const normalizarNit = (t) => t.replace(/\s+/g, '').toUpperCase()

// pos-cliente-unificado: UN solo campo «Cliente (opcional)» que acepta NIT o
// nombre (spec pos-cliente-unificado D2–D9). Detección por forma; auto-match
// local por NIT (D4); NIT crudo conservado en la venta (D5); check debounced
// al padrón SAT (D6); badge combinado (D7); sin campo #pos-nit (D8).
const PanelPago = ({
  carrito,
  onCobrar,
  onPendiente,
  onCotizacion,
  procesando = false,
  errorCobro = null,
  onReintentar,
  cliente = '',
  onClienteChange,
  nitCliente = '',
  onNitChange,
}) => {
  const { items, total } = carrito

  const [metodos, setMetodos] = useState([])
  const [metodoId, setMetodoId] = useState(null)
  const [cargandoMetodos, setCargandoMetodos] = useState(true)
  const [metodosError, setMetodosError] = useState(false)
  const [recibido, setRecibido] = useState('') // en quetzales con decimales
  const [referencia, setReferencia] = useState('') // RF-P3: transferencia
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  // Opciones del datalist (activas): sucursal del dispositivo + heredados.
  // Cada opción trae su texto visible "Nombre (NIT)" para que el cajero
  // distinga homónimos (RF-CL6).
  const [opciones, setOpciones] = useState([])
  // pos-cliente-unificado D6: token de secuencia del check SAT (las
  // respuestas viejas se descartan; el estado efectivo se deriva más abajo).
  const secSatRef = useRef(0)
  // pos-ux-permisos RF-P2: botón "Cotizar" visible salvo que el admin lo
  // desmarque (pos_cotizar, default true)
  const [puedeCotizar, setPuedeCotizar] = useState(true)
  const [registrandoNuevo, setRegistrandoNuevo] = useState(false)
  const showToast = useToast()

  useEffect(() => {
    const u = JSON.parse(localStorage.getItem('currentUser'))
    verificarPermisoBotonPos(u?.id_rol?.id, u?.id_rol?.name, 'pos_cotizar').then(setPuedeCotizar)
  }, [])

  const empresa = localStorage.getItem('empresaSeleccionada')
  const sucursalId = JSON.parse(localStorage.getItem('currentUser') || '{}')?.id_sucursal || null

  const aOpciones = (filas) =>
    filas.map((c) => ({
      id: c.id,
      name: c.name,
      nit: c.nit || '',
      descuento_bp: c.descuento_bp || 0,
      texto: c.nit ? `${c.name} (${c.nit})` : c.name,
    }))

  // Opciones local-first: Dexie primero (sin red), refresco vía RPC
  // get_clientes con heredados (nunca lectura directa de la tabla: los
  // heredados pueden pertenecer a otras empresas y RLS los bloquearía).
  useEffect(() => {
    if (!empresa || !sucursalId) return
    let vivo = true
    const refrescar = () =>
      leerClientesLocal(empresa, sucursalId, { heredados: true })
        .then((filas) => {
          if (vivo) setOpciones(aOpciones(filas))
        })
        .catch(() => {})
    refrescar()
    if (hayRed()) {
      hidratarClientes(empresa, sucursalId)
        .then(refrescar)
        .catch(() => {})
    }
    return () => {
      vivo = false
    }
  }, [empresa, sucursalId])

  // RF-03: sin red la cotización se guarda como borrador local (Task 2).
  useEffect(() => {
    const alVolver = () => setEnLinea(true)
    const alCortar = () => setEnLinea(false)
    window.addEventListener('online', alVolver)
    window.addEventListener('offline', alCortar)
    return () => {
      window.removeEventListener('online', alVolver)
      window.removeEventListener('offline', alCortar)
    }
  }, [])

  // Carga métodos de pago local-first: IndexedDB primero (cobro sin red),
  // refresco desde Supabase en paralelo (si falla se usa el caché).
  // P0: tras ~2.5s sin datos, se muestra estado de error con retry en vez
  // de "Cargando..." para siempre (deadlock contradictorio).
  const cargarMetodos = () => {
    setCargandoMetodos(true)
    setMetodosError(false)
    const timeout = setTimeout(() => {
      setCargandoMetodos(false)
      setMetodosError(true)
    }, 2500)

    const aplicar = (lista) => {
      if (!Array.isArray(lista) || !lista.length) return
      clearTimeout(timeout)
      setCargandoMetodos(false)
      setMetodosError(false)
      setMetodos(lista)
      setMetodoId(
        (prev) =>
          prev ?? (lista.find((m) => m.name?.toLowerCase() === 'efectivo') || lista[0])?.id ?? null,
      )
    }

    db.metodos_pago
      .toArray()
      .then(aplicar)
      .catch(() => {})

    supabase
      .rpc('get_metodos_pago')
      .then(({ data, error }) => {
        if (error) throw error
        aplicar(data)
        if (Array.isArray(data) && data.length) {
          db.metodos_pago.bulkPut(data).catch(() => {})
        }
      })
      .catch((err) => {
        clearTimeout(timeout)
        setCargandoMetodos(false)
        setMetodosError(true)
        console.warn('Métodos de pago desde caché local:', err?.message || err)
      })
  }

  useEffect(() => {
    // setTimeout: la regla react-hooks/set-state-in-effect prohíbe llamar
    // funciones con setState directo desde el effect (patrón del repo).
    const t = setTimeout(() => cargarMetodos(), 0)
    return () => clearTimeout(t)
  }, [])

  const metodoActual = metodos.find((m) => m.id === metodoId)
  const esEfectivo = metodoActual?.name?.toLowerCase() === 'efectivo'
  // RF-P3: la transferencia exige número de referencia
  const esTransferencia = metodoActual?.name?.toLowerCase().includes('transfer') ?? false

  // Cambiar de método limpia la referencia (evita arrastres entre métodos)
  const cambiarMetodo = (id) => {
    setMetodoId(id)
    setReferencia('')
  }

  // Quetzales (input) → centavos enteros. El recibido es OPCIONAL: si se deja
  // vacío la venta cobra por el total (se usa solo cuando no dan el monto
  // exacto o hay que calcular vuelto).
  const recibidoCentavos = Math.round((parseFloat(recibido) || 0) * 100)

  // Resolución de los dos modos (RF-CL6/CL7): texto exacto de opción →
  // enlazado (id real, suma historial); si no → casual (cliente_nombre,
  // sin perfil, solo imprime en el ticket).
  const textoCliente = cliente.trim()
  const enlazado = opciones.find((o) => o.texto === textoCliente) || null
  // pos-cliente-unificado D3: derivación del NIT del campo único.
  const nitCrudo = esNit(textoCliente) ? normalizarNit(textoCliente) : null

  // pos-cliente-unificado D4: auto-match local por NIT. Si el campo contiene
  // un NIT que existe en `opciones`, se completa al texto de la opción
  // (enlazado). Se ejecuta también cuando `opciones` se hidrata después del
  // keystroke (Dexie + RPC en paralelo).
  useEffect(() => {
    if (!nitCrudo || enlazado) return
    const porNit = opciones.find((o) => o.nit && o.nit.toLowerCase() === nitCrudo.toLowerCase())
    if (porNit && porNit.texto !== textoCliente) onClienteChange?.(porNit.texto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nitCrudo, opciones])

  // pos-cliente-unificado D6: check debounced al padrón SAT (400 ms). Solo si
  // hay un NIT que validar (enlazado o crudo) y hay red. Fire-and-forget: no
  // bloquea el cobro; el bloqueo real es server-side en emitirFactura (D10).
  // Token de secuencia descarta respuestas viejas. El estado efectivo se
  // deriva (sin setState síncrono en el effect): resSat guarda la última
  // respuesta; si el NIT cambió, se muestra 'pendiente' hasta la nueva.
  const nitParaSat = enlazado?.nit || nitCrudo || null
  const [resSat, setResSat] = useState(null) // { nit, estado, nombre } | null
  useEffect(() => {
    const sec = ++secSatRef.current
    if (!nitParaSat || !enLinea) return
    const t = setTimeout(() => {
      consultarContribuyente(nitParaSat)
        .then((r) => {
          if (sec !== secSatRef.current) return
          setResSat({
            nit: nitParaSat,
            estado: r.ok ? 'ok' : r.noEnPadron ? 'no-registrado' : 'error',
            nombre: r.contribuyente?.nombre || null,
          })
        })
        .catch(() => {
          if (sec === secSatRef.current) setResSat({ nit: nitParaSat, estado: 'error' })
        })
    }, 250)
    return () => clearTimeout(t)
  }, [nitParaSat, enLinea])
  const estadoSat = !nitParaSat
    ? null
    : !enLinea
      ? 'sin-red'
      : resSat?.nit === nitParaSat
        ? resSat.estado
        : 'pendiente'
  // pos-nit-sat-contribuyente D2: nombre oficial del contribuyente devuelto
  // por la SAT (solo si el NIT consultado sigue siendo el actual).
  const nombreSat = resSat?.nit === nitParaSat && resSat.estado === 'ok' ? resSat.nombre : null

  // Mayoreo (RF-MY4): el % vive en el perfil del cliente enlazado; se aplica
  // al total de la venta. Mismo redondeo que el servidor (round half-up).
  const descuentoBp = enlazado?.descuento_bp || 0
  const descuentoMonto = descuentoBp > 0 ? Math.round((total * descuentoBp) / 10000) : 0
  const totalCobrar = total - descuentoMonto

  // Vuelto/faltante se calculan sobre el total YA con mayoreo aplicado.
  const cambio = esEfectivo && recibidoCentavos >= totalCobrar ? recibidoCentavos - totalCobrar : 0
  const falta =
    esEfectivo && recibidoCentavos > 0 && recibidoCentavos < totalCobrar
      ? totalCobrar - recibidoCentavos
      : 0

  // Vacío (0) = válido; con monto, tiene que alcanzar el total (anti-typo).
  // RF-P3: transferencia sin referencia → no se puede cobrar.
  const valido =
    items.length > 0 &&
    !!metodoId &&
    (!esEfectivo || recibidoCentavos === 0 || recibidoCentavos >= totalCobrar) &&
    (!esTransferencia || referencia.trim().length > 0)

  // Validación inline (mismo patrón que Traslados): el porqué se dice junto al
  // campo, no solo apagando el botón.
  const errEfectivo =
    esEfectivo && recibidoCentavos > 0 && recibidoCentavos < totalCobrar
      ? `El recibido debe ser ${formatQ(totalCobrar)} o más (o déjalo vacío para cobrar el total)`
      : null
  const errReferencia =
    esTransferencia && referencia.trim().length === 0
      ? 'Escribe el número de la transferencia para poder cobrar'
      : null
  const motivoBloqueo = !items.length
    ? 'Agrega al menos un producto al carrito'
    : metodosError && !metodos.length
      ? 'No se pudieron cargar los métodos de pago — pulsa Reintentar'
      : !metodoId
        ? 'Elige un método de pago'
        : errEfectivo || errReferencia || null

  // NIT opcional: al escribir un nombre aparece el campo; si el NIT existe
  // (sucursal o heredado) auto-llena el nombre con su identidad.
  // "Registrar cliente nuevo" (explícito): crea el perfil en la sucursal vía
  // upsert_cliente (requiere red; queda fuera del camino crítico de cobro).
  // pos-cliente-unificado D9: se oculta cuando el campo contiene un NIT crudo
  // (no se parte un NIT en nombre/apellido).
  const registrarNuevo = async () => {
    if (registrandoNuevo || !textoCliente || esNit(textoCliente) || !sucursalId) return
    if (!hayRed()) {
      showToast('warning', 'Sin conexión', 'Registrar cliente nuevo requiere conexión')
      return
    }
    const palabras = textoCliente.split(/\s+/)
    const nombre = palabras[0]
    const apellido = palabras.slice(1).join(' ')
    setRegistrandoNuevo(true)
    try {
      const { data: idNuevo, error } = await supabase.rpc('upsert_cliente', {
        p_id_sucursal: sucursalId,
        p_nombre: nombre,
        p_apellido: apellido || null,
        p_nit: nitCliente.trim() || null,
      })
      if (error) throw error
      const nitTexto = nitCliente.trim()
      const texto = nitTexto ? `${textoCliente} (${nitTexto})` : textoCliente
      setOpciones((prev) =>
        prev.some((o) => o.id === idNuevo)
          ? prev
          : [...prev, { id: idNuevo, name: textoCliente, nit: nitTexto, descuento_bp: 0, texto }],
      )
      if (texto !== textoCliente) onClienteChange?.(texto)
      showToast('success', 'Cliente registrado', 'Cliente vinculado a la venta')
    } catch (err) {
      showToast('danger', 'Error', String(err?.message || err))
    } finally {
      setRegistrandoNuevo(false)
    }
  }

  // pos-cliente-unificado D8: el estado nitCliente (POSPage) queda como
  // derivado del campo único — si el texto es NIT-candidato se sincroniza;
  // si no, se limpia (evita un NIT huérfano al cambiar de cliente).
  const alCambiarCliente = (valor) => {
    onClienteChange?.(valor)
    onNitChange?.(esNit(valor) ? normalizarNit(valor) : '')
  }

  const handleCobrar = () => {
    onCobrar({
      idMetodoPago: metodoId,
      efectivoRecibidoCentavos: esEfectivo && recibidoCentavos > 0 ? recibidoCentavos : null,
      cambioCentavos: esEfectivo && recibidoCentavos > 0 ? cambio : null,
      // D5 + pos-nit-sat-contribuyente D3: con NIT crudo, si la SAT devolvió
      // el nombre oficial del contribuyente se usa ese (ej. Maria Ana Sofia
      // Lopez Morales); si no, el nombre casual queda vacío.
      cliente: enlazado ? enlazado.name : nitCrudo ? nombreSat || '' : textoCliente,
      idCliente: enlazado?.id ?? null,
      // pos-cliente-unificado D5 + Facturas-SAT D10: el NIT crudo se conserva
      // aunque no esté en la lista local (emitirFactura lo rechaza si el SAT
      // no lo registra). Antes se perdía → la venta salía CF sin bloqueo.
      nitCliente: enlazado?.nit || nitCrudo,
      descuentoBp,
      referencia: esTransferencia ? referencia.trim() : null,
    })
  }

  return (
    <CCard className="border-0 shadow-sm">
      {/* ===== Header teal ===== */}
      <div className="p-3 text-white" style={{ backgroundColor: 'var(--pos-primary)' }}>
        <div className="text-uppercase small" style={{ letterSpacing: '0.05em' }}>
          Total a cobrar
        </div>
        <div className="fs-2 fw-bold lh-sm monto monto-sobre-color">{formatQ(totalCobrar)}</div>
        {descuentoMonto > 0 && (
          <div className="small mt-1">
            Mayoreo {descuentoBp / 100}% — ahorro de {formatQ(descuentoMonto)}
          </div>
        )}
      </div>

      <CCardBody>
        {/* ===== Tipo de pago ===== */}
        <div className="mt-3">
          <CFormLabel className="text-body-secondary small text-uppercase">Tipo de pago</CFormLabel>
          <TipoPagoToggle
            metodos={metodos}
            value={metodoId}
            onChange={cambiarMetodo}
            cargando={cargandoMetodos}
            error={metodosError}
            onReintentar={cargarMetodos}
          />
        </div>

        {/* ===== Efectivo recibido (solo si es efectivo) ===== */}
        {esEfectivo && (
          <div className="mt-3">
            <CFormLabel className="text-body-secondary small text-uppercase">
              Efectivo recibido
            </CFormLabel>
            <CFormInput
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              className="monto"
              value={recibido}
              invalid={!!errEfectivo}
              aria-describedby={errEfectivo ? 'err-efectivo' : undefined}
              onChange={(e) => setRecibido(e.target.value)}
            />
            {errEfectivo && (
              <div id="err-efectivo" className="text-danger small mt-1">
                {errEfectivo}
              </div>
            )}
          </div>
        )}

        {/* ===== Número de referencia (solo transferencia, RF-P3) ===== */}
        {esTransferencia && (
          <div className="mt-3">
            <CFormLabel className="text-body-secondary small text-uppercase">
              Número de referencia (obligatorio)
            </CFormLabel>
            <CFormInput
              placeholder="Ej. 000123-AB"
              value={referencia}
              disabled={procesando}
              invalid={!!errReferencia}
              aria-describedby={errReferencia ? 'err-referencia' : undefined}
              onChange={(e) => setReferencia(e.target.value)}
            />
            {errReferencia && (
              <div id="err-referencia" className="text-danger small mt-1">
                {errReferencia}
              </div>
            )}
          </div>
        )}

        {/* ===== Cliente (opcional, dos modos: casual / enlazado) ===== */}
        <div className="mt-3">
          <CFormLabel className="text-body-secondary small text-uppercase" htmlFor="pos-cliente">
            Cliente (opcional)
          </CFormLabel>
          <CFormInput
            id="pos-cliente"
            list="pos-clientes-existentes"
            placeholder="NIT o nombre del cliente (opcional)"
            value={cliente}
            onChange={(e) => alCambiarCliente(e.target.value)}
            disabled={procesando}
          />
          {opciones.length > 0 && (
            <datalist id="pos-clientes-existentes">
              {opciones.map((o) => (
                <option key={o.id} value={o.texto} />
              ))}
            </datalist>
          )}
          {nombreSat && (
            <div
              className="small mt-1 fw-semibold"
              style={{ color: 'var(--cui-primary, #321fdb)' }}
              data-testid="nombre-contribuyente-sat"
            >
              {nombreSat}
            </div>
          )}
          {textoCliente && (
            <div
              className="small mt-1 d-flex align-items-center gap-2 flex-wrap"
              data-testid="badge-cliente"
            >
              {enlazado ? (
                <span className="text-success">
                  ✓ {enlazado.name}
                  {enlazado.nit ? ` (${enlazado.nit})` : ''} — suma historial
                  {enlazado.descuento_bp > 0 ? ` · mayoreo ${enlazado.descuento_bp / 100}%` : ''}
                  {estadoSat === 'ok' && ' · SAT ✓'}
                  {estadoSat === 'no-registrado' && (
                    <span className="text-warning-emphasis"> · ⚠ NIT no en padrón SAT</span>
                  )}
                </span>
              ) : nitCrudo ? (
                <span
                  className={
                    estadoSat === 'no-registrado' ? 'text-warning-emphasis' : 'text-body-secondary'
                  }
                  data-testid="badge-nit-crudo"
                >
                  {estadoSat === 'ok' &&
                    'Cliente casual · NIT registrado en SAT — se puede facturar'}
                  {estadoSat === 'no-registrado' &&
                    '⚠ NIT no en padrón SAT — si pide factura se bloqueará'}
                  {(estadoSat === 'sin-red' || estadoSat === null) &&
                    'Sin conexión — el NIT se validará al facturar'}
                  {estadoSat === 'error' && 'No se pudo verificar el SAT — se validará al facturar'}
                  {estadoSat === 'pendiente' && 'Verificando NIT en el padrón SAT…'}
                </span>
              ) : (
                <>
                  <span className="text-body-secondary">
                    Cliente nuevo/casual: va en el ticket, sin perfil.
                  </span>
                  <CButton
                    size="sm"
                    color="link"
                    className="p-0"
                    disabled={registrandoNuevo || !enLinea}
                    onClick={registrarNuevo}
                  >
                    {registrandoNuevo ? (
                      <CSpinner size="sm" />
                    ) : (
                      <>
                        <CIcon icon={cilUserFollow} className="me-1" />
                        Registrar cliente nuevo
                      </>
                    )}
                  </CButton>
                </>
              )}
            </div>
          )}
        </div>

        {/* ===== Resumen ===== */}
        <ResumenPago
          subtotal={total}
          total={totalCobrar}
          descuentoBp={descuentoBp}
          descuentoMonto={descuentoMonto}
          cambio={cambio}
          falta={falta}
          esEfectivo={esEfectivo}
          conRecibido={recibidoCentavos > 0}
        />

        {/* ===== Error de cobro (inline, no solo toast) ===== */}
        {errorCobro && !procesando && (
          <CAlert
            color="danger"
            className="mt-3 d-flex align-items-center justify-content-between"
            role="alert"
          >
            <span className="small">{errorCobro}</span>
            {onReintentar && (
              <CButton color="danger" size="sm" variant="outline" onClick={onReintentar}>
                Reintentar
              </CButton>
            )}
          </CAlert>
        )}

        {/* ===== Realizar Venta ===== */}
        <CButton
          color="success"
          size="lg"
          className="w-100 mt-3"
          disabled={!valido}
          onClick={handleCobrar}
        >
          {procesando ? (
            <>
              <CSpinner size="sm" className="me-2" />
              Procesando...
            </>
          ) : (
            <>
              <CIcon icon={cilBasket} className="me-2" />
              Realizar Venta
            </>
          )}
        </CButton>
        {!valido && !procesando && motivoBloqueo && (
          <div className="text-body-secondary small mt-1 text-center" role="status">
            {motivoBloqueo}
          </div>
        )}

        {/* ===== Botones secundarios (Fase 10) ===== */}
        <CRow className="mt-2 g-2">
          {puedeCotizar && (
            <CCol xs={6}>
              <CButton
                color="secondary"
                variant="outline"
                className="w-100"
                disabled={!items.length || procesando}
                title={
                  !enLinea
                    ? 'Sin conexión: se guardará como borrador local; el comprobante oficial quedará "Pendiente de emisión"'
                    : undefined
                }
                onClick={onCotizacion}
              >
                <CIcon icon={cilClipboard} className="me-1" />
                Cotizar
              </CButton>
            </CCol>
          )}
          <CCol xs={puedeCotizar ? 6 : 12}>
            <CButton
              color="warning"
              variant="outline"
              className="w-100"
              disabled={!items.length || procesando}
              title="Guardar esta venta para cobrarla después"
              onClick={onPendiente}
            >
              <CIcon icon={cilBookmark} className="me-1" />
              Guardar venta
            </CButton>
          </CCol>
        </CRow>
      </CCardBody>
    </CCard>
  )
}

export default PanelPago
