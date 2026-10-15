# Tasks: Cotizaciones Offline y Resolución de Conflictos UI

- [x] **Task 1: Almacenamiento Local de Cotizaciones (PWA / Offline Manager)**
  - Implementar o configurar la capa de persistencia local (IndexedDB o cliente local) para guardar la cotización con `status: 'pending_sync'`.
  - Crear un listener del evento `window.addEventListener('online')` para desencadenar la sincronización.
  - **Verificada 2026-10-01 por el desarrollador** (prettier ✓ + lint 0 + build OK):
    - `src/lib/db.js`: **v3** con store `offline_quotes: 'temp_id, id_sucursal, status, receipt_status'` (colección local del spec; `branch_id` del spec = `id_sucursal`, convención del repo; `fecha` y `total` se guardan sin indexar).
    - Nuevo `src/services/cotizacionOfflineService.js`: `guardarCotizacionOffline({idSucursal, idUsuario, items})` → borrador con `temp_id` UUID, `status:'pending_sync'`, `receipt_status:'pending_network'`, snapshot de items con `offline_price` en centavos + `total`; `listarCotizacionesOffline(idSucursal)` (más recientes primero); `actualizarCotizacionOffline(tempId, cambios)`; `eliminarCotizacionOffline(tempId)`.
    - `sincronizarCotizacionesOffline()` = punto de extensión que hoy solo cuenta `pending_sync` (la Task 3 hará la verificación de precio/stock y marcará `conflict`; la Task 5 enviará `registrar_cotizacion` y marcará `synced`).
    - `iniciarGestorCotizacionesOffline()` idempotente (patrón de `iniciarMotorSync`) con `window.addEventListener('online', …)` → `sincronizarCotizacionesOffline()`, montado en `App.jsx` junto al motor.
    - Aún **sin montar en POSPage** (Task 2 conecta el guardado desde la pantalla de venta).

- [x] **Task 2: UI de Limitación Documentada (Comprobante Sin Red)**
  - En la pantalla de cotización/venta, desactivar el botón "Emitir Comprobante Oficial" si no hay red.
  - Mostrar el Banner/Tooltip informativo sobre la limitación documentada.
  - Permitir guardar un "Borrador de Cotización Local" con el estado `receipt_status: 'pending_network'`.
  - **Verificada 2026-10-01 por el desarrollador** (prettier ✓ + lint 0 + build OK):
    - **Borrador local (RF-01):** `POSPage.handleCotizacion` con `navigator.onLine === false` → `guardarCotizacionOffline(...)` con snapshot `precio` en centavos + name/sku (cierre de modales, `carrito.clear()`, `desvincularPendiente()` igual que el flujo online; la lista se refresca al abrir `Ver cotizaciones`, cuyo `cargarCotizaciones` ahora tolera offline) → `setResultado({titulo: '¡Cotización guardada localmente!', avisoComprobante: true})`.
    - **Banner RF-03:** constante única `AVISO_COMPROBANTE_SIN_RED` (texto exacto del spec) exportada desde `cotizacionOfflineService.js` y consumida por `ModalResultadoVenta` (banner `CAlert` con `resultado.avisoComprobante && !enLinea`) y por `ConflictResolverModal` (Task 4, ya la reutiliza).
    - **Botón comprobante sin red:** `ModalResultadoVenta` — "Imprimir comprobante" con `disabled={!enLinea}` + `title` "El comprobante oficial requiere conexión a internet" (listeners `online`/`offline`).
    - **Tooltip en pantalla de cotización:** `PanelPago` — botón "Cotización" con `title` cuando `!enLinea`: "Sin conexión: se guardará como borrador local; el comprobante oficial quedará 'Pendiente de emisión'".
    - **Borradores listados en `ModalCotizaciones` (añadido 2026-10-01 por feedback del desarrollador — antes era "fuera de alcance"):** `cargarCotizaciones` fusiona los locales `offline_quotes` (excluye los `synced`, que ya trae la remota) con `get_cotizaciones` vía `Promise.all`; con red caída la lista muestra solo los locales (antes quedaba vacía). Estados locales: `borrador` (badge `info`) y `conflicto` (badge `danger`); fila local se elimina con `eliminarCotizacionOffline(c.id)` sin RPC (ConfirmModal "Eliminar borrador") y las de conflicto abren el `ConflictResolverModal` con botón "Resolver" (`onResolver` → `handleResolverCotizacion`: cierra la lista y monta el registro local).

- [x] **Task 3: Algoritmo de Detección de Conflictos en Sincronización**
  - Crear la función `syncOfflineQuotes()` que verifique el stock y precio actual de Supabase/API contra la cotización local.
  - Si hay discrepancias, cambiar el estado local de la cotización a `'conflict'` e interrumpir el guardado directo.
  - **Verificada 2026-10-01 por el desarrollador** (prettier ✓ + lint 0 + build OK):
    - `syncOfflineQuotes()` en `cotizacionOfflineService.js`: lee `offline_quotes` con `status='pending_sync'` → refresca el catálogo desde Supabase (`hidratarCatalogoParaSucursal`, que tira de `get_productos_admin`) → por cada cotización compara `offline_price` vs el tier actual (`id_precio_producto`) y `stock` de `productos_sucursal` vs `cantidad` usando **`detectarConflictos`** (>= Q0.01 o stock < cantidad) — función pura **movida desde `ConflictResolverModal` al servicio** (el modal la importa; capa vista→servicio, no al revés).
    - Si hay discrepancias → `actualizarCotizacionOffline(temp_id, { status: 'conflict', valores_servidor: [{id_producto, precio, stock}] })` (valores listos para el modal); **"interrumpir el guardado directo"** = las Task 5 solo envían `pending_sync`, los `conflict` esperan resolución.
    - Sin red o sin catálogo fresco (`hidratarCatalogoParaSucursal` falla o devuelve 0) → **no marca nada** y sale: la red caída no es conflicto (regla de la Fase 2).
    - `sincronizarCotizacionesOffline()` (la que llama el listener `online`) ahora ejecuta `syncOfflineQuotes()` y reporta `{pendientes, sincronizadas: 0, conflictos}`; la Task 5 agregará el envío aquí.
    - Sin cambios de backend (solo lectura por RPCs existentes).

- [x] **Task 4: Componente UI - Modal de Resolución de Conflictos**
  - Diseñar el Modal `ConflictResolverModal.tsx` (o equivalente).
  - Mostrar la comparación visual (ej. _Precio Local: $10.00 vs. Precio Servidor: $12.00_).
  - Agregar los botones de acción: "Aceptar cambios del servidor", "Editar cotización" o "Descartar".
  - **Verificada 2026-10-01 por el desarrollador** (prettier ✓ + lint 0 + build OK): `src/views/pos/components/ConflictResolverModal.jsx` (`.jsx` — el repo no usa TS).
    - Comparativa lado a lado por producto: *Guardado offline* vs *Servidor* (precio con `formatQ` en centavos + stock + stock registrado), badges "Precio cambió"/"Stock insuficiente", "Diferencia: Qx.xx (sube/baja)" y "Solo N disponibles".
    - Detección con criterio de aceptación (>= Q0.01 y stock < cantidad) en la función pura exportada `detectarConflictos(items)` reutilizable por la Task 3.
    - Acciones del footer: **Descartar** (danger outline), **Editar cotización** (secondary, `cilPen`), **Aceptar cambios del servidor** (primary, recibe los items anotados) — deshabilitadas con `cargando`.
    - **RF-03 incluida:** `navigator.onLine` con listeners `online`/`offline`; sin red → `CAlert` con el texto exacto de la regla de negocio + botón "Emitir comprobante oficial" deshabilitado (título "No se permite generar folios fiscales sin conexión") + **pre-comprobante con marca de agua "NO VÁLIDO - PENDIENTE DE RED"** (folio local, detalle y total); con red → `onEmitirComprobante()` (Task 5) y badge `receipt_status`.
    - Componente presentacional puro: **sin montar** (la Tasks 1/3 aportan el origen de datos) y **sin cambios de backend**.

- [x] **Task 5: Finalización y Emisión Post-Sincronización**
  - Una vez resueltos los conflictos y restaurada la red, enviar la cotización a Supabase, obtener el folio oficial del comprobante y actualizar el registro local a `status: 'synced'`.
  - **Verificada 2026-10-01 por el desarrollador** (prettier ✓ + lint 0 + build OK):
    - **Envío:** `enviarCotizacionesPendientes()` manda cada `pending_sync` con el RPC existente `registrar_cotizacion` (sin backend nuevo) → `status:'synced'` + `id_cotizacion` (folio oficial) + `receipt_status:'issued'`. Clasificación con `clasificarFallo` (exportado de `colaSyncService.js` sin cambiar su lógica; misma regla Fase 2): `'red'` → corta la ronda y sigue pendiente; `'negocio'` → `status:'conflict'` + `error_servidor` terminal.
    - **Ronda completa:** `sincronizarCotizacionesOffline()` = `syncOfflineQuotes` (Task 3) + envío + `CustomEvent 'cotizaciones-revisadas'` (la UI abre el modal RF-02).
    - **Resolución (RF-02):** `aceptarCambiosServidor(tempId)` adopta `valores_servidor` (precio actual + cantidad recortada al stock; si no quedan artículos borra el borrador) y devuelve a `pending_sync` → re-sync en segundo plano. "Descartar" → `eliminarCotizacionOffline` con `ConfirmModal`. "Editar" → carga los items al carrito POS (tiers de `db.productos` con fallback al `offline_price` guardado) y borra el borrador.
    - **Modal montado en `POSPage`:** `ConflictResolverModal` abre el primer conflicto al montar y tras cada `'cotizaciones-revisadas'` (uno a la vez con `prev ?? conflicto`; llamada inicial diferida con `setTimeout` por la regla `set-state-in-effect`), `itemsConflicto` transformado (`offline`/`servidor`) y **`errorServidor`** como `CAlert` danger nueva en el modal para rechazos de negocio (toast dedup con `avisadosConflictosRef`).
    - **`onEmitirComprobante`:** solo online → corre la ronda de sync; si quedó `synced` muestra el folio oficial y el badge pasa a "Emitido"; si quedó `conflict` avisa con el motivo; sin folio → "se reintentará al volver la red".
  - _CA verificada 2026-10-01:_ sin red guardar borrador → reconectar → auto-sync → (o abre modal de conflicto si hubo cambios de precio/stock → resolver) → envío → folio oficial + badge "Emitido"; sin red el botón de comprobante está deshabilitado con el aviso RF-03 y existe el pre-comprobante con marca de agua; los borradores locales se listan en `ModalCotizaciones` (feedback extra: añadido y verificado junto a la Task 2).

> **Módulo offline-cotizaciones: CERRADO 2026-10-01** — Tasks 1–5 verificadas por el desarrollador; CAs de `specs/offline-cotizaciones.md` marcados `[x]`.
