# Tasks: catalogos-colores

**Módulo:** `catalogos-colores` · **Spec:** `specs/catalogos-colores.md`

## Task 1 — Extraer definiciones vivas de los RPC (bloqueada por el usuario)
- [x] El usuario corrió `tasks/sql/catalogos-colores-diagnostico.sql` y entregó las definiciones de `get_catalogos` (sql/jsonb), `upsert_catalogo`, `delete_catalogo`, `get_productos_admin` (plpgsql/json), `create_producto_admin` (14 args), `update_producto_admin` (13 args). `color` = `(id, name)`, global.

## Task 2 — Escribir `tasks/sql/catalogos-colores.sql`
- [x] `get_catalogos`: añade `colores` (`select id, name from color order by name`).
- [x] `upsert_catalogo` / `delete_catalogo`: aceptan `p_tabla = 'color'` (global; delete bloquea si hay productos que lo usan).
- [x] `get_productos_admin`: incluye `id_color` (+ `color` nombre) por producto, y `colores` entre los catálogos.
- [x] `create_producto_admin` / `update_producto_admin`: nuevo `p_id_color uuid DEFAULT NULL` → `productos.id_color`. **Firma recreada** (`DROP` de la vieja + `CREATE` de la nueva, 15/14 args) para evitar overload ambiguo (PGRST203).
- [x] `SECURITY DEFINER` + `SET search_path`, `GRANT` a `anon, authenticated`, `NOTIFY pgrst` (cuerpo conservado salvo lo mínimo).

## Task 3 — Aplicar SQL y verificar por REST
- [x] Usuario aplicó `tasks/sql/catalogos-colores.sql` en Supabase.
- [x] `get_catalogos` devuelve `colores` (Azul, Negro, Plateado, rojo, Rosa, Verde…); `get_productos_admin` trae `id_color`/`color`.
- [x] `update_producto_admin` con `p_id_color` persiste y `get_productos_admin` lo refleja; revertir a `null` funciona.
- [x] `delete_catalogo 'color'` bloquea en uso ("hay productos que lo usan") y borra cuando no lo está; el color eliminado desaparece de `get_catalogos`.
- [x] `create_producto_admin` resuelve con/sin `p_id_color` (sin `PGRST202/203`); valida antes de insertar.

## Task 4 — Cliente: cache local (Dexie v12 + sync)
- [x] `src/lib/db.js`: `db.version(12).stores({ colores: 'id, id_empresa, name' })`.
- [x] `src/services/catalogSyncService.js`: `hidratarCatalogo` cachea `colores`; `sincronizarCatalogosSecundarios` también (retorna `colores`); `leerCatalogosLocales` devuelve `colores`.

## Task 5 — Cliente: UI Catálogos
- [x] `Catalogos.jsx`: `TABS` (+ nota de catálogo global) + `MAPA_TABLA.colores='color'` + `NOMBRES.colores='Color'`; nota `config.nota` genérica.
- [x] `ModalCatalogo.jsx`: `NOMBRES.colores='Color'` (solo nombre).

## Task 6 — Cliente: color en producto
- [x] `ModalProductos.jsx`: `vacio.id_color=''`, prefill en edición, selector "Color" (fila Categoría/Marca/Proveedor a `md={3}` + Color).
- [x] `Productos.jsx`: `opciones.colores` (online desde `get_productos_admin`/`get_catalogos`; offline desde `local.colores`) + `p_id_color` en `base`.

## Task 7 — Verificar
- [x] `npx eslint` de los archivos tocados: 0 errores reales nuevos (solo CRLF preexistente en `Catalogos.jsx`/`ModalCatalogo.jsx`; el `react-hooks/set-state-in-effect` de `ModalCatalogo.jsx:41` es preexistente — el diff solo agrega `NOMBRES.colores`).
- [x] `npm run build` ✓ (19.40s).
- [x] Probe REST (`Temp/opencode/probe-colores.js`, 11/11 TODO OK): crear color → asignarlo a "Copias DPI" → `get_productos_admin.id_color` coincide → borrado bloqueado en uso → revertir a `null` → borrar color → desaparece de `get_catalogos`. Probe 2: `create_producto_admin` con/sin `p_id_color` resuelve y valida.
- [x] `memory.md` actualizado.
