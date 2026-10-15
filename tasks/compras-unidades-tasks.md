# tasks: compras-unidades (compras con selector de unidad)

Spec: `specs/compras-unidades.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Spec + tasks (2026-10-10, propuesta).
- [ ] Task 2: SQL (usuario aplica):
  - [x] `ALTER TABLE detalle_compra ADD COLUMN IF NOT EXISTS id_precio_producto uuid; ADD COLUMN IF NOT EXISTS factor integer DEFAULT 1 CHECK (factor >= 1);` — **`tasks/sql/compras-unidades-bloque1.sql`** (entregado 2026-10-12, pendiente de aplicación).
  - [x] `CREATE OR REPLACE registrar_compra` — acepta `id_precio_producto` opcional por ítem, resuelve factor en servidor (audita `id_producto` del tier), inserta factor en detalle y suma stock por `cantidad × factor`. **Entregado 2026-10-12** — en `tasks/sql/compras-unidades-bloque1.sql` (parche sobre la función original que el usuario pegó; total e ingredientes intactos).
  - [x] `CREATE OR REPLACE anular_compra` — revierte `cantidad × COALESCE(factor, 1)` (líneas viejas sin factor revierten lo mismo que sumaron). **Entregado 2026-10-12** — `tasks/sql/compras-unidades-bloque2.sql` (pendiente de aplicación; requiere bloque 1 aplicado primero).
  - [x] `get_compras` — `items` ahora es un jsonb ARRAY por línea con `factor` + `id_precio_producto` + `unidad` (antes era un conteo; el cliente acepta ambos). **Entregado 2026-10-12** — en el bloque 2.
  - *Estado bloque 2:* pendiente de aplicación por el usuario.
- [x] Task 3: `compraOfflineService.js`: items aceptan `id_precio_producto`; `resolverTierLocal` (importado de `trasladoService.js`) resuelve factor desde Dexie; stock local += `cantidad × factor`; detalle local guarda `id_precio_producto` + `factor`; cola empuja ambos campos. — código entregado + lint + build 2026-10-12.
- [x] Task 4: `ComprasPage.jsx`: selector de Unidad por línea (solo si tiers con factor>1), cantidad en esa unidad + equivalencia visible, precio por unidad de compra, merge por (producto, unidad), línea lista muestra `4 CAJA (48 und) × Q15.00`; lista de compras (detalle) muestra unidad/base. — código entregado + lint + build 2026-10-12.
- [ ] Task 5: Sync de cola — verificar que el payload de compra pendiente lleva `id_precio_producto`; manejo de rechazo server-side (tier ajeno al producto → CONFLICT con mensaje).
  - *Progreso 2026-10-12:* el cliente YA envía `id_precio_producto` por línea en `p_items` (Task 3). El rechazo server-side vive en el `CREATE OR REPLACE registrar_compra` pendiente del Task 2 (SQL bloqueado en `pg_get_functiondef`).
- [ ] Task 6: E2E + cierre — compra por caja con red y sin red: stock +N piezas, anulación revierte, lista correcta; lint + build; actualizar memory.md y AGENTS.md si aplica.
