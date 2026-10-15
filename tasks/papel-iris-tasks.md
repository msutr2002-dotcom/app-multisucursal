# tasks: papel-iris (selector de color por variantes en el POS)

Spec: `specs/papel-iris.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Spec + tasks + diagnóstico de datos (2026-10-15, ejecutado por el usuario).
  - [x] `specs/papel-iris.md` + `tasks/papel-iris-tasks.md`.
  - [x] `tasks/sql/papel-iris-diagnostico.sql` — resultados: `color(id uuid, name text)`;
        `detalle_venta` SIN `id_color`; defs vivas de `registrar_venta`/`get_venta_detalle`
        obtenidas; **ningún grupo de ≥2 colores** (casi todos los productos sin `id_color`).
- [x] Task 2: SQL (usuario aplica 2026-10-15) — **`tasks/sql/papel-iris.sql`**:
  - [x] `detalle_venta` + columna `id_color uuid` (FK `color(id)`, sin `ON DELETE`).
  - [x] `CREATE OR REPLACE registrar_venta`: deriva `id_color` desde `productos.id_color`
        al insertar el detalle (firma/defaults intactos).
  - [x] `CREATE OR REPLACE get_venta_detalle`: agrega `id_color` + `color` por línea.
  - [x] `GRANT`/`NOTIFY pgrst`.
- [x] Task 3: Cliente — selector en el POS.
  - [x] `src/views/pos/colorUtils.js` (`nombreColor`, `nombreBase`, `grupoColores`).
  - [x] `POSPage.jsx`: mapa `db.colores` (recargado en `cola-sincronizada`/`online`) + memo
        `coloresHermanos` + props `colores`/`onCambiarColor`/`coloresPorId`.
  - [x] `ProductoDetalle.jsx`: **selector desplegable** (`CFormSelect`, `aria-label="Color"`;
        stock 0 rotulado "(sin stock)") en vez de swatches — soporta muchos colores; al
        cambiar llama `onCambiarColor` → `busqueda.seleccionar`.
  - [x] `BuscadorProducto.jsx`: badge con el nombre del color en cada resultado del dropdown
        (las variantes con nombre compartido se distinguen).
  - Verificado: eslint solo preexistente `revisarConflictos` (POSPage:425); build ✓.
- [x] Task 4: Persistencia y comprobante.
  - [x] `ventaLocalService.js`: `id_color` en `db.detalle_venta.bulkAdd` (desde el producto).
  - [x] `pendienteService.js`: `id_color` al guardar el detalle local del pendiente.
  - [x] `historialOfflineService.js` + `ModalComprobante.jsx`: mostrar el color por línea
        (solo si el nombre del producto no lo incluye ya, para no duplicar).
  - Verificado: eslint de los 4 = 0; build ✓ 3.48s.
- [x] Task 5: E2E + cierre (2026-10-15) — `Temp/opencode/probe-papel-iris.js` **14/14 OK**:
      fixtures inyectados en Dexie (2 variantes **"Iris E2E"** de nombre compartido con
      `id_color` + `db.colores` + precios + `productos_sucursal`); el dropdown de resultados
      muestra el color de cada variante; el detalle muestra el selector (2 opciones, activo
      Amarillo), cambio a Verde → stock 5→8 y precio Q10→Q12; `detalle_venta.id_color` guardado
      en la venta local (`11111111-…`); smoke server: `get_venta_detalle` y `registrar_venta`
      ejecutan (compilan). No muta datos del servidor. `memory.md` actualizado.
