# tasks: productos padre/hijo

Spec: `specs/productos-padre-hijo.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Base de datos + RPCs.
  - Migración SQL (manual en Supabase): `productos.id_padre uuid REFERENCES productos(id) ON DELETE SET NULL` + índice `idx_productos_id_padre`.
  - `DROP FUNCTION` de las firmas viejas y recrear: `create_producto_admin` (+`p_id_padre`), `update_producto_admin` (+`p_id_padre`), `get_productos_admin` (devuelve `id_padre`).
  - Validar en RPC: mismo `id_empresa`, sin ciclos, profundidad ≤ 1.
  - Verificado: `tasks/sql/productos-padre-hijo.sql` aplicado; probe REST `probe-padre-hijo-v2.js` 10/10 (`update` C→hijo de P, `get` expone `id_padre`+`hijos`, bloqueos de "padre con hijos→hijo", "auto-padre" y "create con padre inexistente").
  - Pendiente del usuario: correr `tasks/sql/productos-padre-hijo-cleanup.sql` (borra 4 productos PROBE residuales; `delete_producto_admin` no limpia `stock_bodega`).

- [x] Task 2: Dexie v13 + sync.
  - `src/lib/db.js`: bump a v13 agregando `id_padre` al índice de `productos`.
  - `catalogSyncService`: `hidratarCatalogo` ya propaga `id_padre`/`hijos` vía spread (`...p`); no requirió cambio.
  - Verificado: probe Selenium `probe-dexie-v13.js` 6/6 — `db.verno === 13`, índice `id_padre` presente, 26 productos hidratados con propiedad `id_padre` y `hijos` (number). `npx eslint src/lib/db.js` ✓ + `npm run build` ✓.

- [x] Task 3: Admin — crear/editar padre/hijo.
  - `ModalProductos.jsx`: selector "Es variante de" (`id_padre`) + modo contenedor (con hijos: oculta precio/costo/unidades/receta y muestra aviso "agrupa N variantes"); título "Nueva Variante" al crear desde un padre.
  - `Productos.jsx`: indexa hijos por `id_padre`; lista solo raíces (padres + sueltos); `handleGuardar` envía `p_id_padre`; handlers `abrirEditar`/`abrirAgregarVariante` + `padreInicial`.
  - `ProductosTabla.jsx` / `ProductosTarjeta.jsx`: fila de padre no vendible, stock = suma de variantes, badge "N variantes" + expandible; variantes indentadas con acciones normales; sueltos con botón "Variante".
  - Verificado: `eslint` de los 4 archivos ✓ (solo CRLF preexistente), `npm run build` ✓, smoke E2E `probe-task3.js` 7/7 (modal "Es variante de"/"Producto suelto", edición sin errores de consola).

- [x] Task 4: POS — agrupar por padre.
  - `ProductosGrid.jsx`: solo raíces (una entrada por padre); tile de padre con "N variantes", precio "Desde Q…" y stock = suma de hijos (D2).
  - `POSPage.jsx`: `hijosPorPadre`/`esPadre`/`hijosDe`; `agregarDelGrid` y `seleccionarDesdeBusqueda` abren las variantes al elegir un padre (`ModalVariantes` con `opciones` = hijos + `key`).
  - `ModalVariantes.jsx`: prop `opciones` (hijos) además del modo tiers de precio.
  - Verificado: `eslint` ✓ (solo el error preexistente `revisarConflictos`), `npm run build` ✓, probe E2E `probe-task4.js` 8/8 (padre = una tile, hijo oculto, modal lista el hijo Q50.00, "Continuar" lo agrega al carrito). La venta completa + descuento de stock del hijo → Task 6.
  - Pendiente del usuario: correr `tasks/sql/productos-padre-hijo-cleanup.sql` (borra los 2 PROBE del probe).

- [x] Task 5: Combos — hijos como componentes.
  - `RecetaForm.jsx`: candidatos de componente = vendibles (sueltos o hijos) que no sean combo (D7) ni el propio producto; se **excluyen los padres** (D5); los hijos se agrupan en un `<optgroup>` con el nombre del padre.
  - Ciclos: padres excluidos + combos no anidados + self excluido ⇒ sin ciclos por construcción.
  - Verificado: `eslint` ✓ + `npm run build` ✓; probe E2E `probe-task5.js` 6/6 (el hijo aparece como opción, el padre NO es seleccionable, y el hijo está en el `<optgroup>` del padre).
  - La venta del combo (descuenta stock del hijo) → Task 6.

- [x] Task 6: Verificación final (build + lint + probe E2E).
  - `npx eslint` de archivos tocados (0 nuevos, ignorar CRLF).
  - `npm run build` ✓.
  - Probe con `allen`/`allen003`/Tasty Alitas: crear padre + hijo, verlos agrupados, vender el hijo.
  - `memory.md` + `AGENTS.md` actualizados.

- [x] Task 7: Migrar `papel-iris` (colores) a `id_padre` — alcance **datos + Admin** (aprobado).
  - Migración SQL `tasks/sql/papel-iris-a-padre.sql`: crea **un padre por grupo** de productos con `id_color` que comparten **nombre normalizado en minúsculas** (une "Hojas iris carta" vs "Hojas Iris carta"), raíz y sin color, hereda categoría/marca/imagen del grupo; enlaza los miembros como hijos. Solo grupos de ≥2; idempotente.
  - Admin: la lista pasa de N filas sueltas a **una fila de padre** expandible (ya funciona con Task 3).
  - POS: el padre abre el modal de variantes (ya funciona con Task 4); la heurística de color (`colorUtils.js`) queda como respaldo.
  - POS buscador: `useBusquedaProductos.js` deja de listar hijos (`!id_padre`); `BuscadorProducto.jsx` pinta el **padre** como una entrada con badge "N variantes", precio "Desde Q…" (mínimo de hijos) y **stock sumado** (props `esPadre`/`hijosDe`/`stockDe` desde `POSPage`); elegirlo abre las variantes.
  - Verificar: correr el SQL → Admin muestra **una** fila "Hojas Iris carta (N variantes)"; POS al buscar "iris" muestra **una** entrada del padre (no las 9) y al elegirlo abre los colores.
  - [x] `tasks/sql/papel-iris-a-padre.sql` **aplicado** por el usuario: padre `bb7aa323…` "Hojas iris carta" + 9 hijos (2 "iris" + 7 "Iris" unificados). Verificado: Admin una fila de padre expandible; POS busca "iris" → 1 entrada del padre.
  - Refinamiento aprobado: el padre en el **buscador** ya **no** abre `ModalVariantes` (era estado stale + Q0.00); `POSPage.abrirDetalleDePadre` abre el **detalle** de un hijo con stock. `ModalVariantes` solo en **modo comida**. Blindajes: `useCarrito.addItem` sin tier → no agrega; `ModalVariantes` deshabilita "Continuar" sin precio. Probe non-food ✓ (9 colores, total Q0.33).
  - **Fix (variantes sin color):** el selector del detalle solo agrupaba por **color** (`grupoColores` devolvía `[]` sin `id_color`) → en Ferromax el padre "Prueba" con hijos `Producto 1`/`Producto 2` (sin color) abría el detalle **sin** selector. Ahora `POSPage.hermanosProducto` deriva las variantes del **mismo `id_padre`** (≥2) y cae a `grupoColores` como respaldo; `ProductoDetalle` usa prop `etiquetaSelector` ("Color" si `id_color`, si no "Variante"). Probe `probe-ferro-variantes.js` (alex/Ferromax) ✓: buscar "Prueba" → detalle "Producto 2" con selector `[Producto 1, Producto 2]` etiqueta "Variante:"; cambiar → "Producto 1". Regresión Luna (`probe-detalle-padre.js`) ✓ 9 colores. eslint solo error preexistente `revisarConflictos`; build ✓.
