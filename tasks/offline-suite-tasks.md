# Tasks: Implementación de la Suite Offline

- [x] **Task 1: Cotizaciones e Impresión Offline**
  - Implementar la generación del PDF/Ticket HTML para cotizaciones desde los datos guardados en IndexedDB.
  - Habilitar el botón "Imprimir Cotización" sin requerir respuesta o confirmación del servidor.
  - **Implementada 2026-10-01 — pendiente de verificación** (prettier ✓ + lint 0 + build OK):
    - Nuevo `src/views/pos/components/ModalImpresionCotizacion.jsx`: ticket 80 mm / carta renderizado **100% desde props locales** (sin RPC ni `fetch`), reutilizando el CSS de impresión existente (`.comprobante-ticket` + `body.imprimir-comprobante` de `style.scss`) y el patrón `@page` + `window.print()` de `ModalComprobante`. Cabecera: empresa (mejor esfuerzo online, respaldo `sucursalName` local), "Cotización / No es factura fiscal", folio, fecha, vendedor (`currentUser` local), línea "Borrador local — pendiente de sincronizar" cuando `pendiente`, tabla con P.U. y subtotal (`formatQ`, centavos) y total.
    - **`printed_offline` (modelo del spec):** `marcarCotizacionImpresa(tempId)` en `cotizacionOfflineService.js` (campo no indexado → sin bump de versión de Dexie); se dispara al imprimir un borrador local con `navigator.onLine === false`.
    - **`guardarCotizacionOffline` ahora retorna el registro completo** (`{...registro}`, aditivo — único consumidor: `POSPage`) para armar el snapshot del ticket con `fecha`/`items` sin volver a leer IndexedDB.
    - **Botón "Imprimir cotización" en `ModalResultadoVenta`** habilitado incluso sin red (title "Se imprime desde datos locales: no requiere conexión") cuando `resultado.cotizacion` trae el snapshot; ambas ramas de `handleCotizacion` lo poblan (offline desde el registro guardado, online desde el carrito antes de limpiarlo).
    - **Impresión desde la lista `ModalCotizaciones`** (local o servidor, sin RPC): fila local ahora incluye `precio_unitario: it.offline_price` en `cargarCotizaciones` y la fila del servidor ya trae `precio_unitario` del RPC; botón `cilPrint` por fila → `handleImprimirCotizacion` en `POSPage` → mismo modal.
    - Nota de modelo: el spec nombra `local_quotes`; se **reutiliza `offline_quotes`** (store existente de cotizaciones locales, sin duplicar stores) y se le agrega `printed_offline`.
    - **Fix feedback (2026-10-01): "no aparecen las demás cotizaciones en modo offline"** — la lista solo traía borradores porque el RPC falla sin red. Nuevo espejo `quote_cache` (Dexie **v4**: `'id, id_sucursal, fecha'`) con `guardarCotizacionesEnCache` (reescribe la sucursal en cada carga **con** red) y `leerCotizacionesCache` (fallback sin red); `cargarCotizaciones` usa `null` como señal de fallo del RPC y entonces fusiona borradores + espejo. Filas del espejo se comportan como filas de servidor (impresión y eliminación igual; el borrador borrado/deleted online se limpia del espejo en la siguiente carga con red).
    - **Fix feedback (2026-10-01): acceso en móvil** — "Ver cotizaciones" solo existía dentro del modal de cobrar (requiere ítems en el carrito). Nuevo botón **"Cotizaciones" en el encabezado** de `POSPage` (junto al badge de sucursal) que llama `abrirCotizaciones()` siempre, con o sin carrito.
    - **Fix feedback (2026-10-01): "eliminar una cotización offline da error"** — al eliminar una fila del **espejo/servidor** sin red, el RPC `eliminar_cotizacion` **rechazaba la promesa** (`Failed to fetch`) y no había `try/catch` en la cadena `ConfirmModal → onConfirm` → unhandled rejection y ninguna acción visible. Arreglos en `handleEliminarCotizaciones`: (1) guard `if (!navigator.onLine)` para filas no-locales → toast *warning* "Sin conexión: solo puedes eliminar borradores locales…"; (2) RPC envuelto en `try/catch` con toast de error; (3) el `refrescarCotizaciones()` posterior ya no se `await` dentro del mismo `try` (un fallo de refresco no convierte una eliminación exitosa en toast de Error); (4) `cargarCotizaciones` protege también la lectura de `quote_cache` con `.catch([])`.

- [x] **Task 2: Módulo de Historial y Comprobantes Sin Red**
  - Crear la vista de Historial leyendo tanto de la red (si hay conexión) como de `local_quotes` (si está offline).
  - Implementar la plantilla de impresión de comprobante offline agregando la marca de agua y leyenda _"PENDIENTE DE SINCRONIZACIÓN FISCAL"_.
  - Desactivar la solicitud de folios oficiales a la API fiscal si `navigator.onLine === false`.
  - **Implementada y verificada 2026-10-02 — E2E 27/27** (`Temp\opencode\historial-offline-t2.js`; prettier ✓, lint 0 en lo tocado, build ✓):
    - **Guard de red central** `src/services/redService.js` (`hayRed`, `puedeSolicitarFolioOficial`, `AVISO_FOLIO_SIN_RED`) + `src/hooks/useEstadoRed.js`. `POSPage` (cotización/eliminación) y `HistorialPage` (detalle/anulación/cliente) consultan el guard antes de cada RPC; sin red no se pide nada, tampoco folio.
    - **Marca de agua** `src/components/common/MarcaAguaComprobante.jsx` (componente nuevo): `COMPROBANTE NO FISCAL` + leyenda exacta **"PENDIENTE DE SINCRONIZACIÓN FISCAL"** (`LEYENDA_SIN_RED` en `historialOfflineService`). Se muestra cuando el ticket se armó desde el espejo local, no por el estado de la red.
    - **`ModalComprobante` local-first**: resuelve `leerDetalleVentaLocal(id)` primero; sin red / `forzarLocal` / venta aún en cola → ticket local sin ninguna llamada al servidor; con red y venta ya sincronizada pide `get_venta_detalle` y, si no responde, cae al espejo local. Empresa y métodos de pago salen del espejo local sin red (`leerMetodosPagoLocales`).
    - **`HistorialPage`**: banner offline; **sin red** la lista completa sale del espejo local (ventas + cotizaciones de la sucursal) con filtros y paginación en memoria; **con red** es el RPC + las locales `pendienteSync` (solo en la primera página) y, si el RPC falla aun con red, cae al espejo local con aviso. Columna **Tipo**, badge **"sin sincronizar"**, filtro ventas/cotizaciones, detalle e impresión local de venta y cotización, anulación y edición de cliente deshabilitadas sin red.
    - **Fix**: `ModalResultadoVenta` ya no deshabilitaba "Imprimir comprobante" con `disabled={!enLinea}` (incompatible con RF-03); ahora avisa "sin conexión" y usa `useEstadoRed()`.
    - Sin bump de versión de Dexie. Nota de modelo: el spec dice `local_quotes`; se reutiliza `offline_quotes`.

- [x] **Task 3: Módulo de Productos Offline**
  - Configurar la estrategia de caché para la tabla `products` e `inventory`.
  - Permitir la búsqueda y filtrado de productos por texto/código utilizando exclusivamente el almacenamiento local cuando no haya conexión.

- [x] **Task 4: Módulo de Catálogos Offline**
  - Sincronizar al iniciar la app los catálogos secundarios (`categories`, `branches`, `tax_rates`, `payment_methods`).
  - Adaptar los selectores y desplegables de la UI para que lean de la memoria local en lugar de hacer `fetch()` directos a la API.
