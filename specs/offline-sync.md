# specs/offline-sync.md — Especificación Offline-First y Sync Engine

Estado: **Módulo completo y verificado** — Fases 1, 2 y 3 (Tareas 1.1–1.3, 2.1–2.6, 3.1) cerradas el 2026-10-01. Relacionado: `tasks/offline-sync-tasks.md`.

## Objetivo

Que el POS opere sin conexión por sucursal (regla de `constitution`/AGENTS: la UI nunca bloquea por red) y sincronice hacia Supabase en segundo plano cuando vuelva la red.

## Alcance actual (Fase 1 — completa y verificada)

- **Esquema local Dexie** en `src/lib/db.js`, espejo **1:1** de las columnas de Supabase (nombres de store = nombres de tabla; índices = columnas reales, verificadas con probes REST, nunca supuestas).
- Stores locales: `productos`, `precio_producto`, `productos_sucursal`, `ventas`, `detalle_venta`, `clientes`.
  - `productos_sucursal` usa **PK compuesto `[id_sucursal+id_producto]`** (la clave natural del upsert; las respuestas RPC no traen el `id` de fila).
  - Store **local** (no existe en Supabase): `cola_sincronizacion` con `sync_status ('PENDING' | 'SYNCED' | 'CONFLICT')`, `tabla`, `operacion`, `intentos`, `timestamp` — toda transacción local lleva su evento de sync aquí.
- **Hidratación** (`src/services/catalogSyncService.js`): `hidratarCatalogo(idEmpresa, idSucursal)` llama al RPC `get_productos_admin` y guarda catálogo completo en `productos` + stock en `productos_sucursal` (transacción atómica clear+bulkPut, con `es_actual` precalculado y `id_empresa` agregado al registro). Se dispara **en fire-and-forget** desde el login y desde el montaje del POS (refresco en segundo plano; nunca bloquea la UI). `hidratarCatalogoParaSucursal` resuelve la empresa vía `empresaSeleccionada` o lookup en `sucursal`.
- **Lectura local-first en el POS** (`useBusquedaProductos`): la búsqueda filtra `db.productos` por name/sku/marca/categoria (sin red); **fallback al RPC `buscar_productos` solo si el catálogo local está vacío**. Los registros guardados son las columnas reales del producto **más** los campos derivados que el POS necesita (`marca`/`categoria` en texto, `precios[]`, `stock[]` con `es_actual`) — verificados en el E2E sin red.
- `getLocalDbStatus()` expone: conteo de productos locales y ventas con eventos `PENDING`.
- **Verificación E2E** (`%TEMP%\opencode\test-offline-search.js`): 6/6 — hidratación (5 productos), forma de registro, búsqueda con red y **búsqueda con la red cortada vía CDP respondiendo desde IndexedDB**.

## Reglas

1. Los campos locales que reflejan tablas de la BD **solo** usan nombres de columnas reales (`sku`, `name`, `id_cliente`, `subtotal`, …); los metadatos de sincronización viven únicamente en `cola_sincronizacion`.
2. Todo registro local lleva su `id_sucursal`/`id_empresa` de origen (aislamiento multisucursal).
3. Dinero en centavos enteros, igual que en BD.
4. Las lecturas críticas del POS leen primero de IndexedDB filtradas por la sucursal del dispositivo.

## Cola de sincronización (implementada — Tarea 2.1, verificada 4/4)

- Servicio: `src/services/colaSyncService.js`
  - `encolarOperacion({ tabla, operacion, id, idSucursal, datos })` → `db.cola_sincronizacion.add(...)`; devuelve la clave `++id`. Valida `tabla`, `operacion`, `idSucursal` obligatorios.
  - `contarPendientes()` → eventos con `sync_status='PENDING'` (indicador de UI + motor).
- Forma del evento: `tabla` (destino Supabase), `operacion` (`INSERT|UPDATE|DELETE`), `id_registro`, `id_sucursal` (origen, aislamiento), `datos` (payload para reproducir la operación al sincronizar), `sync_status='PENDING'`, `intentos=0`, `timestamp`.
- **Reglas:**
  1. Encolar **dentro de la misma `db.transaction`** que escribe el registro local → commit/rollback atómicos (registro + evento juntos).
  2. La **hidratación del catálogo NO se encola** (es copia de lectura; el servidor ya es dueño de esos datos).
  3. Productor actual: la **venta local** (Tarea 2.2, ver abajo). El motor que consume los `PENDING` es la Tarea 2.3.

## Venta local atómica + push inmediato (implementada — Tarea 2.2, verificada 21/21)

- **`registrarVentaLocal({idSucursal, idUsuario, idMetodoPago, efectivoRecibido, idCliente, clienteNombre, items})`** en `src/services/ventaLocalService.js`:
  - Una sola `db.transaction('rw', productos, productos_sucursal, ventas, detalle_venta, cola_sincronizacion)` → todo o nada.
  - Relee la fila del producto (coerción `Number()` del tier de precio) y valida contra el catálogo local: producto ausente → error `code='CATALOGO_LOCAL'` (no es de stock).
  - **Validación de stock acumulada**: suma por producto en el carrito (no línea por línea), mensaje `Stock insuficiente para <nombre>`.
  - `efectivoRecibido`: si es número y `< total` → error; `cambio = max(0, efectivo - total)` o `0`; dinero siempre en **centavos enteros**.
  - Escribe `ventas` (`estado:'completada'`), `detalle_venta`, **desciende `productos_sucursal.stock`** por cada producto y encola el evento PENDING dentro de la misma tx. Devuelve `{idVenta, total, cambio, idEvento}`.
- **Cobro local-first en `POSPage.jsx`** (`handleCobrar`): intenta `registrarVentaLocal`; si falla con `code !== 'CATALOGO_LOCAL'` (stock/precio/efectivo) muestra el error en el modal de cobro. Éxito → `sincronizarEvento(idEvento)` en fire-and-forget (push inmediato) + `setResultado({...venta, imprimir:true})` — **la UI nunca espera a la red**.
- **`sincronizarEvento(id)`** en `colaSyncService.js` (el push de la Tarea 2.3 se encargará del resto):
  - Solo procesa `tabla='ventas'`/`INSERT`; guard `en_vuelo` (timestamp, 30 s) contra dobles corridas; si `datos.cliente_nombre && id_empresa` → `upsert_cliente` antes.
  - Éxito → `SYNCED` + `respuesta` + `sincronizado_en`; fallo → `intentos+1` + `ultimo_error` (ej. `Failed to fetch`), **nunca lanza**. El evento offline que quedó PENDING queda listo para el motor 2.3.
- **Métodos de pago sin red**: Dexie v2 (`metodos_pago: 'id, name'`), cacheados por la hidratación (`get_metodos_pago`); `PanelPago.jsx` lee Dexie primero y refresca con el RPC cuando hay red.
- **Guard de hidratación (bug real encontrado por el E2E):** una hidratación que *arranca* offline puede *completarse* cuando vuelve la red y su `clear+bulkPut` pisaba el stock local ya descontado por ventas PENDING. Fix en `hidratarCatalogo`: **dentro de la tx**, si `cola_sincronizacion` tiene eventos `PENDING` → se conserva el `stock` local (ambos stores: `productos_sucursal` y el array `stock[]` embebido de `productos`) antes del `bulkPut`; el resto del catálogo (nombres/precios) sí se refresca. Al sincronizar todo, la siguiente hidratación converge con el servidor.

### Limitaciones conocidas (Fase 2 actual)

1. **`id_empresa: null` en el evento**: E2E no setea `empresaSeleccionada` (solo Productos lo hace) → el push de cliente (`upsert_cliente`) no funcionaría sin ella; en producción real sí está seteada al elegir empresa.
2. **Arranque sin red y sin caché** (IndexedDB vacía + sin internet): el POS no tiene catálogo (fallback RPC tampoco) → comportamiento degradado documentado; el flujo normal asume hidratación previa online.
3. **Evento de la venta offline queda `PENDING` tras reconectar** (push inmediato solo corre para ventas cobradas con red) → el motor 2.3 (timer + `online`) es quien lo despacha; verificado en el E2E.
4. Si un evento queda `PENDING` eterno (conflicto), el guard de hidratación conserva ese stock local para siempre hasta resolverlo — es intencional (servidor desactualizado hasta que el evento se aplique); la resolución entra en 2.3 (`CONFLICT`).

## Diseño del motor de sincronización (Fase 2+ — propuesta)

Alineado con **Artículo II** de `constitution.md` (prioridad local e independencia de red):

1. **Venta local atómica (`cobrar`):** ✅ implementada en la Tarea 2.2 (sección anterior). El servidor sigue siendo fuente de verdad: al sincronizar, `registrar_venta` relee precios/stock y rechaza si ya no coincide (el guard de hidratación conserva el stock local mientras haya PENDING).
2. **Motor de sincronización (`syncEngine` en segundo plano):** ✅ implementado en la Tarea 2.3 (sección siguiente).
3. **Indicador en topbar:** contador de pendientes con `CBadge`/`CSpinner` de CoreUI + botón de sincronización manual.

## Motor de sincronización (Tarea 2.3)

- **Servicio:** `src/services/syncEngineService.js`, arrancado una sola vez desde `App.jsx` (`useEffect` → `iniciarMotorSync()`), idempotente. Corre en segundo plano: **nunca bloquea la UI** (fire-and-forget, sin await en el hilo de render).
- **Disparadores:**
  1. Al iniciar la app → drena pendientes de sesiones anteriores.
  2. Evento `online` del navegador → ronda inmediata al volver la red.
  3. Temporizador de respaldo cada **30 s**.
- **`procesarCola()`** (exportada; el botón manual de la Tarea 2.4 la reutiliza):
  - Guard de no-solapamiento (`corriendo`): solo una ronda a la vez.
  - Lee `PENDING` ordenados por `timestamp` (**FIFO**) y llama a `sincronizarEvento(id)` (la misma función del push inmediato de 2.2 → una sola implementación de replay).
  - Motivos de salida por evento: `SYNCED` → sigue; `en-vuelo`/`no-pendiente`/`no-soportado` → sigue (otro hilo lo tomó); `conflict` → sigue (quedó marcado); **`sin-red` → se detiene la ronda** (no tiene sentido seguir intentando con la red caída).
- **Clasificación de fallos en `sincronizarEvento` (política de resolución):**
  - **Error de transporte** (`TypeError: Failed to fetch`, network/timeout, o `status >= 500`) → se queda `PENDING`, `intentos+1`, `ultimo_error`; el próximo disparador reintenta. **Nunca** pasa a `CONFLICT` por falta de red (regla Offline-First: offline ≠ conflicto).
  - **Rechazo de negocio** (error devuelto por el RPC: stock insuficiente en servidor, violación de FK, permisos…) → **`CONFLICT`** + `intentos+1` + `ultimo_error`. Reintentar no lo arregla; queda visible para resolución manual (UI de conflictos: fase posterior, pendiente de definir).
  - Éxito → `SYNCED` + `respuesta` + `sincronizado_en` + limpia `en_vuelo`.
- **Garantías:** entrega *at-least-once* (si el app muere entre el RPC exitoso y el `update` a `SYNCED`, se reenviaría → ventana mínima, documentada); guard `en_vuelo` (30 s) evita dobles envíos concurrentes entre el push inmediato y el motor.
- **Fuera de 2.3:** UI de resolución de `CONFLICT` (necesita política del usuario), badge/botón (Tarea 2.4), `visibilitychange` como disparador extra.

## Indicador de estado (Tarea 2.4)

- **Componente:** `src/components/common/SyncIndicator.jsx` (solo CoreUI: `CBadge`/`CButton`/`CSpinner`/`CIcon`), montado en `AppHeader.jsx` (visible en desktop y móvil, requiere sesión).
- **Estados** (selección mutuamente excluyente):
  1. **Sin conexión** (`navigator.onLine === false`) → `CBadge` danger "Sin conexión" (+ contador si hay pendientes).
  2. **Pendientes** (online con eventos `PENDING` > 0) → `CBadge` warning "N pendiente(s)".
  3. **Sincronizado** (online, 0 pendientes) → `CBadge` success "Sincronizado".
- **Actualización del contador:** `contarPendientes()` al montar + cada 5 s (barato: count sobre índice) + en los eventos `online`/`offline` + tras cada sync manual. El `CONFLICT` **no** cuenta como pendiente (resolución manual: fase posterior).
- **Botón manual "Sincronizar ahora"** (`CButton` outline + `cilReload`; `CSpinner` y deshabilitado mientras corre) → llama a `procesarCola()` (la misma ronda del motor), refresca el contador y avisa con `useToast`: éxito → success "Todo sincronizado"; siguen pendientes → danger "Quedan N por sincronizar".
- **Verificación:** 3 ventas sin red → badge "3 pendientes" (≤5 s) → reconectar → drenaje instantáneo (evento `online`) → badge "Sincronizado".

## Pendientes offline (Tarea 2.5)

Motivo: "Guardar como pendiente" llamaba `registrar_pendiente` directo → con la red caída tiraba `TypeError: Failed to fetch` (cotizaciones siguen igual, online-only — fuera de 2.5).

- **Nuevo servicio `src/services/pendienteService.js`:**
  - `crearPendienteLocal({idSucursal, idUsuario, items, total})` — tx `['rw', ventas, detalle_venta, cola_sincronizacion]`: venta `estado:'pendiente'` (misma store/índice `[id_sucursal+estado]` que la BD) + `detalle_venta` + evento INSERT con `datos.rpc='registrar_pendiente'` y `params` exactos del RPC (`p_id_sucursal`, `p_id_usuario`, `p_items[{id_producto,cantidad,id_precio_producto}]`). Devuelve `{id, total, idEvento}`.
  - `leerPendientesLocal(idSucursal)` — devuelve la **misma forma** de `get_ventas_pendientes` (`{id, fecha, total, items[{id_producto,name,sku,cantidad,id_precio_producto,subtotal,stock,precios[]}]}` — forma verificada con probe) reconstruida de `productos` + `productos_sucursal` locales.
  - `eliminarPendienteLocal(id, idSucursal)` — borra fila+detalle; si su evento INSERT **no** está `SYNCED`: lo **cancela** (borra el evento) o, si está `en_vuelo`, marca `cancelar=true` (el push lo resuelve tras confirmar); si ya existe (o pudo llegar a) el servidor → encola evento DELETE `rpc='eliminar_venta_pendiente'`. Devuelve `{idEvento?}` para push inmediato.
  - `fusionarPendientes(idSucursal, local, servidor)` — mezcla servidor ∪ locales **no sincronizados** (INSERT `PENDING`/`CONFLICT`) y limpia huérfanos locales ya `SYNCED` ausentes del servidor (sin encolar).
- **Replay (`sincronizarEvento`):** despacha por `datos.rpc` (default `'registrar_venta'` para compat con eventos 2.2): `registrar_pendiente` → RPC + **remapeo de id** con `data.id_venta` (reescribe fila local + `detalle_venta.id_venta` + `id_registro` del evento + `localStorage pos_pendiente_<sucursal>`); `eliminar_venta_pendiente` → RPC. Si el evento traía `cancelar=true`, tras el INSERT exitoso borra en servidor lo recién creado (y si ese borrado falla, encola un DELETE reintentable).
- **POS (`POSPage.jsx`):** `handlePendiente` local-first (sin RPC directo); `cargarPendientes` = lista local al instante → si hay red, fusiona con el servidor; consumo al cobrar y `handleEliminarPendiente` usan `eliminarPendienteLocal` + push (lee el id vigente de `localStorage`, que sobrevive al remapeo).
- **Garantías/límites:** sin red nada de este flujo toca Supabase; evento de creación `CONFLICT` se sigue mostrando (se puede eliminar); carrera minúscula remapeo↔cargar-pendiente documentada; cotizaciones pendientes de diseño offline.

## Comprobante con id del servidor (Tarea 2.6)

- **Problema (descubierto en 2.5):** el modal de resultado usa `resultado.id_venta` = **id local**, pero los RPCs generan otro id al sincronizar → `get_venta_detalle` no encontraba la fila (comprobante en error) **y** el folio mostrado (`id.slice(0,8)`) no coincidía con el de Historial.
- **Fix:** cuando `sincronizarEvento` remapea un id, despacha `window` `CustomEvent 'id-remapeado'` con `{idViejo, idNuevo, id_sucursal}`. `POSPage` escucha y actualiza `resultado.id_venta` si coincide. `ModalComprobante` ya refetchea en `[visible, idVenta]` → **se recupera solo**, incluso si estaba abierto en estado de error, y el folio se actualiza al del servidor.
- **Límite:** el comprobante es 100% servidor → sin red no carga (se imprime después desde Historial); si la venta nunca sincroniza, el id no cambia y el error persiste.

## Fuera de esta fase (pendiente)

- UI/flujo de resolución de `CONFLICT` (definir política con el usuario) — pendiente fuera de 2.3/2.4.
- Indicador de estado offline/sync en la UI — Tarea 2.4.
- E2E completo de venta sin red → recuperación de red → sync (Tarea 3.1).

## Datos verificados (probes REST + RPC, 2026-10-01)

- `productos`: `id, sku, name, id_empresa, id_categoria, id_marca, imagen` ✓
- `precio_producto`: `id, id_producto, id_tipo_producto, precio, min_cantidad` ✓ (no existe `id_tipo_precio`; la tabla `precios_producto` no existe)
- `productos_sucursal`: `id, id_sucursal, id_producto, stock, stock_minimo` ✓ (no existe `min_stock`)
- `ventas`: `id, id_sucursal, id_usuario, id_metodo_pago, id_cliente, fecha, total, cambio, estado, fecha_anulacion, motivo_anulacion, id_usuario_anula` ✓ (no `created_at` ni `sync_status`)
- `detalle_venta`: `id, id_venta, id_producto, cantidad, subtotal, id_precio_producto` ✓
- `clientes`: `id, id_empresa, name, nit` ✓
- Catálogos: `marca(id, name, id_empresa)`, `categoria(id, name)`, `tipo_producto(id, name, id_empresa)` ✓
- `sucursal(id, name, id_empresa)` legible por REST (usado para resolver la empresa en la hidratación) ✓
- RPC de catálogo: `buscar_productos` con `p_query='%'` devuelve el catálogo completo (`p_query=''` → `[]`); `get_productos_admin(p_id_empresa)` devuelve `{productos, categorias, marcas, proveedores, tipos_precio, unidades}` con columnas crudas + `precios[]` + `stock[]` — es la fuente de hidratación.
