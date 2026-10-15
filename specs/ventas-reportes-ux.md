# Spec — Correcciones UX: Ventas (POS) y Reportes

**Fecha:** 2026-10-07 · **Origen:** correcciones solicitadas por el desarrollador al cerrar Traslados (`tasks/traslados-movimientos-tasks.md` Task 9 `[x]`). Decisiones confirmadas con preguntas en sesión (3 de 3).

## Contexto

1. El switch **"Efectivo exacto"** del panel de cobro quita tiempo al vender → **eliminarlo por completo** (solo queda el input "Efectivo recibido").
2. El panel de detalle completo al seleccionar un producto entorpece el flujo de venta → **plegarlo detrás de un "Ver detalle"** (estilo «Ver / Ocultar» del sistema viejo, Images 2-3): vista compacta nombre + precio + Agregar, la info completa detrás del toggle.
3. El módulo de **Reportes** debe entrar con **las ventas de hoy** y presentarse como el sistema viejo (Image 4): ventas **agrupadas por día**, detalle por venta (cliente/vendedor/líneas) y caja **RESUMEN** (clientes atendidos, unidades vendidas, total cobrado).

Sin cambios de BD ni RPCs. Alcance: `src/views/pos/*` y `src/views/reportes/ReportesPage.jsx`.

---

## RF-V1 — Efectivo exacto eliminado (`PanelPago.jsx`)

- Quitar el `CFormSwitch` "Efectivo exacto", el estado `exacto`, `handleExacto` y cualquier referencia (`value={exacto ? …}`, `disabled={exacto}`).
- El input **"Efectivo recibido"** es siempre la única fuente: `recibidoCentavos = Math.round((parseFloat(recibido) || 0) * 100)`.
- **El recibido es OPCIONAL (decisión del desarrollador 2026-10-07):** con el campo **vacío** la venta se realiza directo por el total (el monto solo se escribe cuando no dan el exacto o hay que calcular vuelto). Con monto escrito se aplica la guarda `recibido ≥ total` (anti-tipo) y se muestra Falta/Vuelto. Sin monto: no se muestra "Vuelto" ni "Falta".
- `handleCobrar` envía `efectivoRecibidoCentavos = null` cuando el campo está vacío (mismo caso que no-efectivo; `registrarVentaLocal` acepta `null` y guarda `cambio = 0`; `registrar_venta` ya recibe `null` para tarjeta).
- No se tocan: métodos de pago, cliente, cola de sincronización, montos en centavos.

## RF-V2 — Detalle de producto estilo sistema viejo (`ProductoDetalle.jsx` + `POSPage.jsx`)

> Decisión del desarrollador 2026-10-07 (3ª iteración): **arriba SIEMPRE visibles** los controles de venta (título, precio, cantidad, total, Agregar y el cuadro de stock); el enlace **"Ver / Ocultar"** alterna únicamente el **detalle** (imagen + descripción + marca), plegado por defecto.

- **Siempre visibles (arriba), en este orden (Image 1):**
  1. **Título centrado, bold:** `{sku} - {name}`.
  2. **Columna izquierda:** `Precio:` (dropdown, ver abajo) y debajo `Cantidad: [input] total: {formatQ(precio×cantidad)} [Agregar]` (un solo renglón, con wrap).
  3. **Columna derecha:** cuadro/tabla **`En Tienda | Otras Bodegas`** con encabezado en `--pos-primary` y texto blanco. *En Tienda:* filas `Disponible:` (stock de la sucursal actual) y `Mínimo:` (`stock_minimo`). *Otras Bodegas:* cada sucursal distinta como `{stock} | {sucursal}`; vacío → `—`. (Las filas "Otras ventas"/"En tránsito" del sistema viejo **no existen** en nuestro modelo → se omiten en vez de inventar datos.)
- **`Ver / Ocultar`** (link centrado, texto fijo) alterna el panel de detalle:
  - **Detalle (plegado por defecto):** panel gris (`bg-body-tertiary`) con imagen a la izquierda (o placeholder "Sin imagen") y a la derecha descripción centrada + `Marca:` + `Categoría:`.
- **Selector de precios = dropdown estilo sistema viejo:** `CFormSelect` con label **"Precio:"** y opciones `TIPO _ Q. precio (mín. N)` — primera opción **`Auto _ Q. x (según cantidad)`** (value `''` = override `null`). El orden es el del arreglo `precios` (tal cual están ordenados). La selección manual **se mantiene** al cambiar la cantidad (igual que el sistema viejo).
- `Cantidad`: `CFormInput` numérico (1..max stock); cambia el `total` en vivo. **Agregar** mete `{cantidad, override}` al carrito (mismo `onAgregar`), luego `busqueda.clear()` cierra el detalle.
- **Cabecera resaltada (4ª iteración, feedback del usuario):** franja `.pos-detalle-header` con **pastilla SKU** (ícono código de barras) en la esquina izquierda y **pastillas Stock/Marca/Categoría** en la derecha; título del producto centrado en negrita debajo.
- **Modo oscuro (mismo feedback):** la franja usa la clase `.pos-detalle-header` definida en `style.scss` — en `color-mode(dark)` su fondo pasa a `#0f2c22` (verde muy oscuro) para que el título (texto blanco del tema) sea legible. **No** se modifica el token global `--pos-primary-soft` (lo usa `TipoPagoToggle` con texto verde encima). Verificado en E2E: banda `rgb(15,44,34)`, título `rgba(255,255,255,.87)`.
- El estado plegado/extendido **resetea al cambiar de producto** (`key={selected.id}` → remount: `abierto=false`, `cantidad=1`, override `null`).
- Sin romper: carrito, pendientes vinculados, cotizaciones, flujo de cobro. `StockPorSucursal.jsx` queda sin uso en este flujo (el cuadro superior lo reemplaza).

## RF-V3 — Reportes estilo sistema viejo + default «Hoy» (`ReportesPage.jsx`)

- **Al entrar: `desde = hasta = hoy`** (el preset "Hoy" queda activo por defecto; hoy ya no es "mes en curso").
- Las ventas se muestran **agrupadas por día** (encabezado de grupo con la fecha), y cada venta como bloque: cabecera con **ID, cliente y vendedor**, y sus **líneas** (cantidad × producto, precio, tipo de precio aplicado) **siempre visibles — sin colapsar** (pedido del usuario 2026-10-07: "quita el de colapsar, para que muestre los productos a la hora de mandar un reporte").
- Caja **RESUMEN** (al estilo Image 4): **Clientes atendidos** (n° de ventas), **Unidades vendidas** (suma de líneas), **Total cobrado** (suma de totales).
- Se conserva todo lo actual: filtros de fecha/usuario, fuente local-first (IndexedDB + servidor con aviso si falla), badges de estado, detalle de venta (`ventaAbierta`/`leerDetalleVentaLocal`), permisos y `formatQ` en centavos.

**Notas de implementación (RF-V3):**

- `dateInput` ahora arma la fecha en **zona local**; con `toISOString()` (UTC) el preset «Hoy» cruzaba la medianoche GT (pasadas las 18:00 el rango apuntaba al día siguiente y la lista salía vacía).
- El preset activo queda resaltado (sólido vs outline); al tocar un date input a mano se desmarca.
- **RESUMEN = ventas completadas** del período filtrado (las anuladas se excluyen de clientes/unidades/total y solo aparecen como badge en su día).
- **Unidades vendidas** exige el detalle de cada venta listada: hidratación en segundo plano tras cargar la lista — locales en **una sola pasada IndexedDB** (`leerDetallesVentaLocal`, nuevo bulk) y remotas con tope de **5 en paralelo** (RPC `get_venta_detalle`), cancelada si cambia el periodo (token de secuencia). Hasta cuadrar, la tarjeta muestra `loading` («—»); si algún detalle falla se avisa bajo el RESUMEN.
- **Tipo de precio**: se resuelve desde `producto.precios` vía `id_precio_producto` del renglón local. El RPC `get_venta_detalle` **no expone** ese campo → para ventas cuyo renglón no está en el dispositivo la columna queda «—» (sin cambios de BD/RPC, regla del proyecto).
- **Cliente**: viene del detalle (IndexedDB o RPC); vacío → «—».
- Corrección clave: el efecto de hidratación decide el origen con **`idsLocales`**, no con `v.esLocal` — `ventas` es la fila cruda y la flag `esLocal` la agrega recién `ventasConUsuario` (con `v.esLocal` la venta local se clasificaba como remota: offline el RESUMEN quedaba en «—» y el bloque marcaba error).
- `historialOfflineService.leerDetalleVentaLocal` ahora delega en el bulk `leerDetallesVentaLocal` (mismo contrato + campo `tipo`, aditivo).
- **Sin colapsar (2026-10-07):** se eliminó el toggle/chevron de cada bloque; las líneas se renderizan siempre bajo la cabecera. Si la hidratación automática de una venta falla, bajo sus líneas aparece el aviso con botón **«Reintentar»** (`cargarDetalle`). El pie ya no dice "toca una fila…".

## RF-V4 — Lector de barras + navegación con teclado (`BuscadorProducto.jsx`, `useBusquedaProductos.js`)

> Feedback del usuario 2026-10-07: al escanear un código con el lector de barras el producto debe abrirse **de una vez**; además debe poder navegarse el listado con el teclado/flechas.

- **Lector de barras (Enter):** `Enter` en el input dispara `seleccionarPorCodigo(query)` → búsqueda **inmediata** de coincidencia **exacta** de `sku` (IndexedDB local, fallback RPC `buscar_productos`) que llama a `seleccionar()` **sin esperar el debounce de 300ms**. Sin coincidencia exacta y con resultados visibles → selecciona la fila resaltada (o la primera).
- **Auto-selección sin Enter:** cuando el texto coincide exactamente con un `sku` (≥3 caracteres) en la búsqueda ya ejecutada (300ms), el producto se selecciona solo — cubre lectores configurados sin Enter.
- **Navegación con teclado:** `ArrowDown`/`ArrowUp` recorren los resultados en ciclo, con fila resaltada (fondo `--pos-primary` + texto blanco, visible en ambos temas). El foco **permanece en el input** (scroll `block: 'nearest'`). `Enter` selecciona la fila resaltada; `Escape` → `clear()` (limpia el texto y cierra el detalle).
- Tras cualquier selección (clic o teclado) el input **recupera el foco** y queda vacío → se escanea el siguiente código sin tocar el mouse.
- Pie del dropdown: `↑↓ navegar · Enter seleccionar · Esc limpiar` + `data-testid="resultados-busqueda"` (apoyo E2E).
- Sin cambios de BD/RPC; búsqueda local-first y selección existente intactas (`onSelect` sigue siendo `seleccionar`).

---

## Criterios de aceptación globales

- `npx eslint` 0 en los archivos tocados; `npm run build` ✓.
- Flujo de cobro en efectivo sin el switch; venta completa OK.
- Producto seleccionado → compacto; Ver detalle → panel completo; Agregar funciona en ambas vistas.
- Reportes al entrar = solo ventas de hoy + RESUMEN con los 3 números correctos (verificados contra el listado).
