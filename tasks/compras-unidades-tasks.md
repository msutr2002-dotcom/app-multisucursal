# tasks: compras-unidades (compras con selector de unidad)

Spec: `specs/compras-unidades.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Spec + tasks (2026-10-10, propuesta).
- [x] Task 2: SQL (usuario aplica) — **bloques 1 y 2 confirmados aplicados 2026-10-15** (verificado conductualmente con `Temp/opencode/probe-compras-unidades.js`):
  - [x] `ALTER TABLE detalle_compra ADD COLUMN IF NOT EXISTS id_precio_producto uuid; ADD COLUMN IF NOT EXISTS factor integer DEFAULT 1 CHECK (factor >= 1);` — **`tasks/sql/compras-unidades-bloque1.sql`** (aplicado).
  - [x] `CREATE OR REPLACE registrar_compra` — acepta `id_precio_producto` opcional por ítem, resuelve factor en servidor (audita `id_producto` del tier), inserta factor en detalle y suma stock por `cantidad × factor`. **Aplicado** (probe: `1 Paquete` ×10 → stock 9→19).
  - [x] `CREATE OR REPLACE anular_compra` — revierte `cantidad × COALESCE(factor, 1)` (líneas viejas sin factor revierten lo mismo que sumaron). **Aplicado** (probe: anular 19→9).
  - [x] `get_compras` — `items` ahora es un jsonb ARRAY por línea con `factor` + `id_precio_producto` + `unidad` (antes era un conteo; el cliente acepta ambos). **Aplicado** (probe: `items` = ARRAY con `factor=10` + `unidad="Paquete Foamy"`).
- [x] Task 3: `compraOfflineService.js`: items aceptan `id_precio_producto`; `resolverTierLocal` (importado de `trasladoService.js`) resuelve factor desde Dexie; stock local += `cantidad × factor`; detalle local guarda `id_precio_producto` + `factor`; cola empuja ambos campos. — código entregado + lint + build 2026-10-12.
- [x] Task 4: `ComprasPage.jsx`: selector de Unidad por línea (solo si tiers con factor>1), cantidad en esa unidad + equivalencia visible, precio por unidad de compra, merge por (producto, unidad), línea lista muestra `4 CAJA (48 und) × Q15.00`; lista de compras (detalle) muestra unidad/base. — código entregado + lint + build 2026-10-12.
- [x] Task 5: Sync de cola — el cliente envía `id_precio_producto` por línea en `p_items` (Task 3); rechazo server-side verificado: tier ajeno al producto → `registrar_compra` responde "Presentación inválida para el producto …" (probe 2026-10-15).
- [x] Task 6: E2E + cierre — **verificado 2026-10-15**:
  - Server (probe REST `Temp/opencode/probe-compras-unidades.js`): `registrar_compra` resuelve factor ×10 (stock 9→19), `get_compras.items` ARRAY con `factor`/`unidad`/`cantidad`, tier ajeno rechazado, `anular_compra` revierte ×factor (19→9).
  - UI (probe Selenium `Temp/opencode/probe-compras-ui.js`, usuario `system`/Libreria Luna, producto "Foamy Diamantina Lila Carta" factor 10): **10/10 OK** — sin producto no aparece el selector Unidad; al elegir un producto con presentación aparece "Paquete Foamy (×10 und)"; pista "1 Paquete Foamy = 10 und. base"; línea muestra badge "PAQUETE FOAMY" + "(20 und)" (2×10) + subtotal Q28.00 (precio por presentación). No se registró la compra (sin mutar stock).
  - Limpieza pendiente: la compra de prueba `677d8a03-72d1-4c15-9362-d0b4070e6d5e` quedó **anulada** en Libreria Luna (stock restaurado; no hay RPC delete y RLS bloquea el DELETE directo).
