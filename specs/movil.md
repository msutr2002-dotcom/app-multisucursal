# Spec: móvil (adaptación de la interfaz de operación a pantallas pequeñas)

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `movil`
**Módulos afectados:** Historial, POS, Reportes, Compras, Inventario, Productos (admin), Clientes (admin) + shell (layout/nav).

## Problema

Las vistas de operación están pensadas para escritorio. A ~390 px:

- Las tablas anchas obligan a **scroll horizontal** y dejan las **acciones (ver/anular) fuera de vista**:
  Historial 9 columnas (`HistorialPage.jsx:519`), Compras 7 (`ComprasPage.jsx:725`), Inventario 6
  (`InventarioPage.jsx:217`), carrito del POS 5 (`Carrito.jsx:59`) y **Productos (admin) 8**
  (`ProductosTabla.jsx:46`, con ACCIONES al final → hay que deslizar para editar/eliminar) y **Clientes (admin) 9**
  (`ClientesPage.jsx:353`, con Acciones al final).
- **Reportes** tiene una tabla de líneas **sin** contenedor con scroll (`ReportesPage.jsx:179`) → desborda la página.
- El **sidebar arranca abierto** y tapa el contenido en el primer render móvil (`store.js:19` + `AppSidebar.jsx:89`).
- **POS** tiene doble padding (`AppContent.jsx:22` `px-4` + `POSPage.jsx:1004` `CContainer fluid`) y la barra de cobro
  queda mal en el rango 768–991 px (`CobrarBar.jsx:8`).
- Targets táctiles pequeños e inconsistentes: `ComprasPage.jsx:774-794,871-879,1086-1094` y
  `ModalCotizaciones.jsx:99-128` usan solo `title`, sin `aria-label` (`HistorialPage.jsx:578,596` sí lo hace bien).
- En todo el repo **no existe** un patrón tabla→tarjetas; la única técnica es scroll horizontal.

## Objetivo

Que las pantallas de operación sean usables con el dedo en un teléfono (≥360 px) sin perder ninguna función,
reutilizando los patrones CoreUI/Bootstrap ya presentes. **El escritorio no debe cambiar.**

## Contexto y restricciones

- Solo componentes **CoreUI/Bootstrap** + SCSS del repo. Sin librerías externas.
- Breakpoint de referencia para móvil: **`<768px`** (Bootstrap `md`). El POS ya usa `>=992px` (`lg`) como
  umbral del panel de pago de escritorio (`POSPage.jsx:192`).
- El nav móvil ya existe (`MobileNav.jsx`, barra inferior + bottom sheet) y se reutiliza.
- Offline-First intacto: la adaptación es solo presentación; no cambia servicios, RPC ni datos.
- Sin `PRODUCT.md`/`DESIGN.md`: el código actual es la autoridad visual; se preserva la identidad.

## Decisiones

- **D1 — Tabla → tarjetas en móvil.** Para cada listado, en `<768px` se muestra una lista de **tarjetas**
  (una por fila) con etiquetas visibles y **acciones siempre visibles**; en `>=768px` se conserva la tabla
  actual sin cambios. Técnica: el bloque de tabla con `d-none d-md-block` y el de tarjetas con `d-md-none`
  (misma fuente de datos, sin lógica nueva).
- **D2 — Componente base reutilizable.** Nuevo `src/components/common/TarjetaRegistro.jsx` (CoreUI-only) para
  estandarizar la tarjeta de fila: `titulo`, `subtitulo`, `badge`, `campos=[{label, value}]`, `acciones`.
  Se reutiliza el patrón ya visto en `ModalPendientes.jsx:44-79` / `ModalCotizaciones.jsx:70-131`.
- **D3 — Acciones táctiles.** En las tarjetas móviles los botones de acción usan tamaño normal (no `size="sm"`),
  con `aria-label` y área de toque ≥44 px. Se corrigen los botones solo-icono sin `aria-label`.
- **D4 — Modales de operación como bottom sheet en móvil.** Los modales de flujo (`ModalPendientes`,
  `ModalCotizaciones`, `ConflictResolverModal`, alta de Compras, detalle de Historial, `ModalComprobanteCompra`)
  usan `alignment="bottom"` + las esquinas redondeadas ya definidas (`.modal-cobrar`), en <768px; en desktop
  siguen centrados. Se resuelve con `matchMedia` (patrón ya usado en POS) o clase SCSS.
- **D5 — Shell coherente.** El sidebar **no** arranca abierto en <992px (estado inicial según ancho, se cierra al
  navegar). POS pierde el doble padding. `CobrarBar` se muestra solo cuando la barra inferior existe (<768px) o
  se ajusta su `bottom`.
- **D6 — Sin regresión de escritorio.** Todo cambio queda contenido en media-queries/`d-md-none`; desktop intacto.
- **D7 — Offline-first y permisos intactos.** No se toca ningún servicio, RPC ni guard.

## Alcance

### Task 2 — Base móvil + shell
- `TarjetaRegistro.jsx` + estilos (SCSS) de tarjeta y de tabla móvil.
- Sidebar: estado inicial cerrado en <992px (`store.js`/`AppSidebar`), cierre al navegar en móvil.
- POS: quitar el `CContainer fluid` anidado; ajustar `CobrarBar`/`bottom`.

### Task 3 — Historial (peor caso, 9 columnas)
- Listado `HistorialPage.jsx:519-611` → tarjetas en móvil con **Ver detalle** y **Anular** visibles.

### Task 4 — POS
- Carrito (`Carrito.jsx`/`CarritoFila.jsx`) → tarjetas en móvil (producto, unidad, cantidad ±, subtotal, quitar).
- `TipoPagoToggle` con `flex-wrap`.
- Grilla "vista comida" (`ProductosGrid.jsx:66`) → 2 columnas en móvil.
- `ModalPendientes`/`ModalCotizaciones`/`ConflictResolverModal` como bottom sheet en móvil.

### Task 5 — Reportes
- Tabla de líneas (`ReportesPage.jsx:179`) dentro de `table-responsive` + cabecera de venta compacta en móvil.

### Task 6 — Compras
- Listado (`ComprasPage.jsx:725`) → tarjetas; `aria-label` en botones solo-icono; modal de alta usable en móvil.

### Task 7 — Inventario
- Listado (`InventarioPage.jsx:217`) → tarjetas (SKU, producto, categoría, stock+mínimo, precio).

### Task 8 — Productos (admin)
- Tabla (`ProductosTabla.jsx:46`) → tarjetas en móvil: producto (imagen + nombre + SKU/estado), marca,
  categoría, precio, costo, margen, stock ± y **editar/eliminar siempre visibles** (sin scroll horizontal).
- `aria-label` en botones solo-icono (eliminar, stock ±).

### Task 8b — Clientes (admin)
- Tabla (`ClientesPage.jsx:353`) → tarjetas en móvil: nombre, NIT, teléfono, mayoreo, compras, total,
  última compra, estado; acciones **Ver / Editar / Activar-Desactivar** siempre visibles.
- `aria-label` en botones solo-icono de la tabla desktop (Ver, Editar, Activar/Desactivar).

### Task 9 — Verificación y cierre
- Probe Selenium a 390×844 sobre las **7 rutas** (login `system`), sin errores de consola.
- Capturas por módulo; `impeccable detect --json` sobre los archivos tocados.
- `npx eslint` de los archivos tocados (0 nuevos) + `npm run build`.
- `memory.md` + `AGENTS.md`.

## Criterios de verificación

- V1: a 390 px cada listado muestra tarjetas; las acciones (ver/anular/editar) son visibles sin scroll horizontal.
- V2: a ≥768 px las vistas se ven **idénticas** a hoy (tablas).
- V3: a 390 px no hay scroll horizontal de página en ninguna de las 7 rutas.
- V4: el sidebar no tapa el contenido al abrir en móvil.
- V5: todo botón solo-icono tiene `aria-label`; los targets de tarjeta miden ≥44 px.
- V6: consola sin errores nuevos; build y lint (solo preexistentes).

## Fuera de alcance

- Otros módulos de administración (Usuarios, Empresas, Sucursales, Bodegas, Roles, Catálogos).
- Rediseño de tokens/tema/identidad visual; `PRODUCT.md`/`DESIGN.md`.

## Riesgos

- Duplicar DOM (tabla + tarjetas) por CSS: aceptable en listados pequeños; si una vista pagina cientos de filas,
  se evalúa render condicional con `matchMedia`.
- Los fondos resaltados de Bootstrap (`!important`) obligan a `style` inline en las tarjetas nuevas.
