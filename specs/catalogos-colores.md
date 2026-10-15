# Spec: Catálogo de Colores + color en producto

**Fecha:** 2026-10-15 · **Estado:** pendiente de aprobación · **Módulo:** `catalogos-colores`

## Contexto

El usuario tiene una tabla `color` en Supabase y quiere administrarla (como el resto de
catálogos) y **asignar un color a cada producto**. Hoy no hay pestaña "Colores" en
Catálogos, y el formulario de producto no expone `productos.id_color`.

## Hallazgos (probes REST 2026-10-15)

- `color` tiene **solo** `(id, name)`; es **global** (sin `id_empresa`), igual que
  `tipo_producto`. `anon` **no** la puede leer por RLS → todo acceso pasa por RPC.
- `productos.id_color` **ya existe** (FK a `color`), pero ningún RPC lo escribe/lee.
- RPC vigentes implicados (viven **solo** en Supabase, no en el repo):
  - `get_catalogos(p_id_empresa)` → devuelve `{marcas, unidades, categorias, proveedores, tipos_precio}` (sin `colores`).
  - `upsert_catalogo(p_tabla, p_id, p_id_empresa, p_campos)` / `delete_catalogo(p_tabla, p_id)`.
  - `get_productos_admin(p_id_empresa)` → `{productos, categorias, marcas, proveedores, unidades}` (producto sin `id_color`).
  - `create_producto_admin(...)` / `update_producto_admin(p_id, ...)` (reciben campos explícitos, sin `p_id_color`).

## Decisiones

- **D1 — Un producto = un color.** Se usa `productos.id_color` (nullable). No hay
  variantes multi-color.
- **D2 — `color` es global.** No se agrega `id_empresa` a la tabla; en el cache local
  `id_empresa` es solo etiqueta (mismo patrón que `tipos_precio`).
- **D3 — Colores offline = solo lectura** (igual que el resto de catálogos: sin red no
  se crean/editan/eliminan).
- **D4 — Se conserva la firma y el cuerpo de los RPC**; solo se añaden `colores`,
  `p_id_color` y el `select` de `color`. Se parte de la definición viva (Task 1 la
  extrae con `pg_get_functiondef`).

## Alcance

### Servidor (SQL, `tasks/sql/catalogos-colores.sql`)

1. `get_catalogos` → añadir `'colores'` al JSON: `select id, name from color order by name`.
2. `upsert_catalogo` → aceptar `p_tabla = 'color'` (insert/update solo `name`).
3. `delete_catalogo` → aceptar `p_tabla = 'color'`.
4. `get_productos_admin` → incluir `id_color` (y `color_name`) en cada producto.
5. `create_producto_admin` / `update_producto_admin` → nuevo `p_id_color uuid default null`,
   persistido en `productos.id_color`.

### Cliente

6. `db.js` **v12**: store `colores: 'id, id_empresa, name'`.
7. `catalogSyncService.js`:
   - `hidratarCatalogo`: cachear `colores` (desde `get_catalogos`, junto a `tipos_precio`) + `db.colores` en la transacción.
   - `sincronizarCatalogosSecundarios`: cachear `colores` también.
   - `leerCatalogosLocales`: devolver `colores`.
8. `Catalogos.jsx`: pestaña "Colores" (`TABS`, `MAPA_TABLA.colores = 'color'`, `NOMBRES.colores = 'Color'`).
9. `ModalCatalogo.jsx`: `NOMBRES.colores` (solo `name`; el formulario genérico ya sirve).
10. `ModalProductos.jsx`: `vacio.id_color=''`, prefill en edición, `<CFormSelect name="id_color">` con `opciones.colores`.
11. `Productos.jsx`: `opciones.colores` (online desde `get_productos_admin`; offline desde `local.colores`); `p_id_color: datos.id_color || null` en `base`.

## Fuera de alcance

- `color_name` en tablas/listados (se muestra solo en el selector; el catálogo ya lista los colores).
- Multi-color / color por variante.
- El resto del backlog (compras unidades, papel iris, móvil).

## Criterios de aceptación

- C1: aparece la pestaña "Colores"; crear/editar/eliminar funciona online.
- C2: el formulario de producto muestra el selector "Color"; al guardar persiste en `productos.id_color` (verificable por REST).
- C3: al reabrir un producto, el color se prefija.
- C4: sin red, Catálogos muestra Colores desde Dexie y el selector de producto los lista.
- C5: `npx eslint` de los archivos tocados = 0 errores reales (solo CRLF preexistente); `npm run build` ✓.

## Riesgos

- Definición viva copiada mal → se valida el dump y se conserva el cuerpo salvo lo mínimo.
- Overloads: si el RPC tiene varias firmas, `pg_get_functiondef` devuelve varias filas; se identifica por `pg_get_function_arguments`.
- `productos` store de Dexie es schemaless: `id_color` persistirá sin cambio de índice; solo hace falta el store nuevo `colores`.
