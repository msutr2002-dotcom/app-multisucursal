# Tasks: critique-backlog (correcciones del critique 2026-10-11)

Ejecución todas a la vez autorizada por el usuario ("go"). Spec: `specs/critique-backlog.md`.
Origen: `.impeccable/critique/2026-10-11T16-58-33Z__src.md` (26/40 → objetivo 30+).

- [x] Task 1: POS flujo (P1) — autofocus + atajo `/`/F2 al buscador; conflictos por badge en vez de auto-open (`POSPage.jsx:270`); validación inline en alta de traslado.
- [x] Task 2: Carrito harden (P1) — ConfirmModal en "Vaciar" con conteo+total; deshacer (5 s) al borrar línea; `ToastContext` con acción opcional + `aria-live`.
- [x] Task 3: Idioma/jerga (P2) — etiquetas de estado legibles (Traslados/Historial); "cola PENDING" reescrito; theme switcher Claro/Oscuro/Automático; "Auto — Q…"; filtro de `err.message` técnico en `ToastContext`.
- [x] Task 4: A11y (Sam) — `aria-label` icon-only; `aria-pressed` método de pago; contraste login-tagline/stat-hero-label; `role="listbox/option"` en dropdown del buscador.
- [x] Task 5: Menores + residuos plantilla — vuelto Q0.00 neutro; Subtotal oculto si = TOTAL; icono "Limpiar"; borrar `examples.scss`, `DocsComponents.jsx`, `src/index.css`, copyright CoreUI.
- [x] Lint (archivos tocados) + `npm run build` + memory.md.

## Notas de ejecución (2026-10-11)

- **ToastContext.jsx reescrito:** 4º parámetro `accion {label,onClick}`, delay 6000 con acción, `aria-live="polite"`, filtro `esTecnico()` → mensaje genérico en español (err.message crudo del servidor ya no llega al toast).
- **useCarrito.js:** `removeItem` conserva síncrono (updater no corre síncrono — documentado en comentario); nuevo `restoreItem` para el deshacer del toast.
- **POSPage.jsx:** `revisarConflictos` solo cuenta (`conflictosCount`), badge `⚠ Conflictos (n)` con `data-testid="badge-conflictos"`; apertura vía `abrirPrimerConflicto`; `onClear` → ConfirmModal (conteo + total, "Vaciar"/danger); `onRemove` → toast "Deshacer" 5 s.
- **BuscadorProducto.jsx:** autofocus al montar; atajo global `/`/F2 (ignora INPUT/TEXTAREA); dropdown `role="listbox"` + opciones `role="option"`/`aria-selected`.
- **TrasladosPage.jsx:** `erroresAlta` state + feedback inline (`is-invalid` + texto bajo destino/producto/cantidad); `etiquetaEstado` (guion bajo → legible); aria-label en Quitar línea y No llegó; toast offline "Sin conexión: guardado en este dispositivo, se enviará al volver la red".
- **HistorialPage.jsx:** `etiquetaEstado` en badges de lista y detalle; fechas con `placeholder`+`aria-label` Desde/Hasta; Limpiar con `cilX`; aria-label en Ver detalle/Anular.
- **AppHeader.jsx:** Light/Dark/Auto → Claro/Oscuro/Automático.
- **PrecioSelector.jsx:** `Auto _ Q…` → `Automático — Q…`.
- **CarritoFila.jsx / ModalPendientes.jsx:** aria-label en todos los botones icon-only (±, cantidad, eliminar).
- **TipoPagoToggle.jsx:** `role="group"` + `aria-pressed`.
- **ResumenPago.jsx:** vuelto Q0.00 neutro (secondary, no danger); Subtotal oculto si `subtotal === total`.
- **style.scss:** contraste `.login-tagline` .75→.92, `.stat-hero-label` .85→.95.
- **Residuos plantilla:** borrados `src/scss/examples.scss`, `src/components/DocsComponents.jsx`, `src/index.css`; quitado import de examples en `App.jsx`; export DocsComponents quitado de `src/components/index.js` (rompía el build); copyright CoreUI de `index.html` → crédito corto MIT.
- Lint: solo quedó 1 error preexistente react-hooks v7 (`POSPage.jsx:286`, effect que llamaba `revisarConflictos` — patrón viejo). Build ✓ (3.25s).

Heurística esperada tras el pase: 26/40 → 30+ (P1 de flujo, prevención y recovery cerrados; a11y mejorado). Re-correr `$impeccable critique` tras aplicar.

## Ronda 2 — fixes tras re-critique (2026-10-11, veredicto del usuario: "corregir ya")

Re-critique dual-agent → **28/40 Good** (↑2), snapshot `.impeccable/critique/2026-10-11T18-44-35Z__src.md`. Fixes aplicados:

- [x] **P1 regresión:** las 3 llamadas huérfanas a `abrirConflictoCotizacion()` (POSPage.jsx:573/611/630) → `abrirPrimerConflicto()`.
- [x] **P1 badge sucursal:** `Login.jsx` select anidado ahora pide `id_sucursal(id, id_empresa, name)` y guarda `sucursalName` en la sesión (POSPage:832 ya lo lee).
- [x] **P2 PanelPago:** validación inline (`errEfectivo`/`errReferencia` con `invalid` + `aria-describedby`) + motivo de bloqueo bajo "Realizar Venta" (`role="status"`).
- [x] **P2 folio offline:** `folioLocal: !navigator.onLine` en el resultado de venta local; ModalResultadoVenta muestra "Folio local" + badge warning "Pendiente de sincronizar — sin folio oficial".
- [x] **P3 esTecnico ampliado:** cubre `Failed to fetch`, `NetworkError`, `ERR_INTERNET/NETWORK`, `is not defined`, `is not a function`, `TypeError`, `ReferenceError`.
- [x] **P3 a11y listbox:** input como `combobox` + `aria-activedescendant`/`aria-expanded`/`aria-controls`; opciones con `id`; live region "N resultados"; spinner/vacío/pista fuera del `role="listbox"`.
- [x] **P3 refoco scan→agregar:** evento `pos:focus-buscador` disparado tras Agregar; BuscadorProducto lo escucha y devuelve foco+selección al input.
- Verificación: prettier + eslint (solo el error preexistente react-hooks POSPage:286) + build ✓ 3.74s.

## Ronda 3 — fixes tras re-re-critique (2026-10-12, veredicto del usuario: "corregir ya" los 3 niveles)

Re-re-critique dual-agent → **35/40 Good parte alta** (↑7 desde 28), snapshot `.impeccable/critique/2026-10-12T01-47-55Z__src.md`. Los 7 fixes de la ronda 2 verificados (6 completos, 1 parcial). Fixes aplicados:

- [x] **P1 guard de red:** `upsert_cliente` ahora se omite si `!hayRed()` (POSPage handleCobrar) — antes el fetch colgaba antes de la venta local, violando AGENTS.md y la meta ≤2s.
- [x] **P2 folioLocal real:** `folioLocal: true` siempre en la venta local (sin depender de `navigator.onLine`) y se pone en `false` cuando llega el evento `id-remapeado` — con red y push fallido ya no miente.
- [x] **P2 deshacer re-vincula:** al borrar la última línea se captura el id del pendiente antes de desvincular; el "Deshacer" del toast lo re-vincula junto con `restoreItem` — sin pendientes huérfanos.
- [x] **P3 etiquetaEstado en ModalCotizaciones:** badges "Borrador"/"Conflicto" capitalizados, mismo patrón que Historial/Traslados.
- [x] **P3 labels visibles en fechas del Historial:** `<label>` "Desde"/"Hasta" con `htmlFor` (el placeholder de `type=date` no se renderiza en Chromium).
- [x] **P3 aria-expanded honesto:** el buscador solo anuncia `aria-expanded=true` cuando el listbox realmente existe (con resultados, sin loading).
- Verificación: prettier + eslint (solo el error preexistente react-hooks POSPage:290) + build ✓ 14.58s.

Tendencia critique `src`: **26 → 28 → 35** (objetivo Excellent ≥36).

## Ronda 4 — fixes tras critique #4 (2026-10-12, aprobados por el usuario vía question tool)

Critique dual-agent → **34/40** (↓1: los fixes ronda 3 fueron de superficie; dos dejaron hueco), snapshot `.impeccable/critique/2026-10-12T02-19-00Z__src.md` (p1_count 1). Fixes aprobados: P1 upsert (quitar await), ambos P2 (carrera folio + doble PanelPago), rename "Pendiente" + datalist.

- [x] **P1 upsert_cliente sin await:** se quitó el bloque completo del `upsert_cliente` del camino crítico de `handleCobrar` — con wifi cautiva el `await` no tenía timeout y rompía ≤2s. La cola ya repite el upsert al pushear el evento (`colaSyncService.js:295-302` con `cliente_nombre` de la venta local); evolución del fix ronda 3 (guard de red) → ahora el upsert es 100% fire-and-forget por diseño.
- [x] **P2a carrera folio:** `setResultado` se ejecuta ANTES del push de `sincronizarEvento`; buffer del último `id-remapeado` en `ultimoRemapRef` para cuando el evento llegue antes de que exista `resultado` (consumo de pendiente con awaits). El remap aplicado pone `folioLocal: false` (servidor confirmó).
- [x] **P2b doble PanelPago:** render condicional por viewport (`matchMedia('(min-width: 992px)')` + listener `change`) en vez de `d-none d-lg-block` — en móvil el PanelPago ya no queda montado oculto junto al del ModalCobrar (doble RPC de métodos de pago, doble listener de red, ids duplicados).
- [x] **Rename "Pendiente":** Carrito → botones "En espera (n)" (lista) y "Guardar venta"; PanelPago → "Guardar venta"; toast de éxito → "Venta registrada / La venta se guardó correctamente"; SyncIndicator → "Cola: N por enviar" y "Sin conexión · N por enviar".
- [x] **Datalist de clientes:** en el input Cliente (PanelPago) se sugieren nombres existentes (`datalist#pos-clientes-existentes`): Dexie `clientes` primero, refresco best-effort desde Supabase `from('clientes')` con red; `bulkPut` al caché local. Reduce erratas → duplicados permanentes en BD.
- Verificación: eslint en archivos tocados (solo el preexistente react-hooks POSPage:308) + build ✓ 4.04s.

Tendencia critique `src`: **26 → 28 → 35 → 34**. Próximo critique esperado ≥36 (P1 cerrado de raíz, P2s estructurales).
