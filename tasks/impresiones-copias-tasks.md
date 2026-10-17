# Tasks — Impresiones/Copias (consumo de papel por hoja)

**Spec:** `specs/impresiones-copias.md` · **Estado:** CERRADO — Tasks 1–5 `[x]` (2026-10-16).

**Prerrequisitos (no son tareas de este módulo):**
- Aplicar `tasks/sql/fix-upsert-combo-componentes.sql` (Task 8 de `combos-insumos`).
- Crear los productos-papel en Admin (`bien`, unidad base hoja, tier "Por unidad" factor 1 + tier Resma factor 500).

---

- [x] **Task 1 — Hidratar `combo_componentes` en Dexie**
  - `src/services/catalogSyncService.js` → en `hidratarCatalogo`, extraer `p.componentes` de
    cada producto y `bulkPut` en `db.combo_componentes` (agregar `id_producto: p.id`),
    limpiando el store dentro de la misma transacción.
  - Include `db.combo_componentes` en la transacción rw.
  - Verificación: login Luna → `db.combo_componentes.count() = 1`, `db.productos = 32`; eslint 0; build ✓.
  - *Estado:* **COMPLETADA 2026-10-16** · *Aprobación:* [x]

- [x] **Task 2 — Helper `disponibilidadCombo` (cliente)**
  - Nuevo helper (`src/views/pos/comboUtils.js`):
    `disponibilidadCombo(idProducto, { componentesPorProducto, stockPorProducto, ingredientesPorId })`.
  - `requerido = cantidad × factor` (producto; `factor` viene en la fila del componente) o
    `cantidad` (ingrediente); `disponible = min(floor(stock/requerido))`; 0 si falta receta o un componente no alcanza.
  - Verificación Node: 750/(1×1)=750; stock 0→0; sin receta→0; factor 500 con 750→1; ingrediente 10/3→3; eslint 0.
  - *Estado:* **COMPLETADA 2026-10-16** · *Aprobación:* [x]

- [x] **Task 3 — POS: usar disponibilidad derivada**
  - `POSPage.jsx`: carga `combo_componentes` (map por `id_producto`) + stock de componentes
    (`stockBodega`) + `ingredientes_sucursal`; `disponibilidadDe(p)` devuelve la
    disponibilidad derivada si `p.contiene_insumos`.
  - `ProductoDetalle.jsx`: badge "Disponible: N" y habilitación de "Agregar" con la disponibilidad; mensaje "Sin componentes" para combos.
  - `ProductosGrid.jsx`: ya suma la disponibilidad de los hijos (recibe el mapa derivado).
  - `BuscadorProducto.jsx`: fila hoja usa `stockDe` derivado. `abrirDetalleDePadre`: primer hijo con disp > 0.
  - Verificación navegador: combo "Copias normal" (stock propio 98) → disponibilidad 750.
  - *Estado:* **COMPLETADA 2026-10-16** · *Aprobación:* [x]

- [x] **Task 4 — Padre contenedor: disponibilidad = suma de hijos**
  - El stock del padre (POS) usa la suma de `disponibilidadDe` de sus hijos (D5): `ProductosGrid.jsx`
    (línea del `reduce` de hijos) y `BuscadorProducto.jsx` (entrada de padre), ambos con el mapa derivado.
  - *Estado:* **COMPLETADA 2026-10-16** · *Aprobación:* [x]

- [x] **Task 5 — Verificación + docs**
  - Probe E2E `Temp/opencode/verify-task5.js` (system/Libreria Luna): dropdown POS "Copias normal → **750**"; `ProductoDetalle` badge **"Disponible: 750"**; con CDP `emulateNetworkConditions offline=true` (`navigator.onLine=false`) la disponibilidad sigue **750** (Dexie, sin red).
  - Helper (Node, `verify-task34.js`): `disponibilidadCombo` = 750; stock 0 → 0; sin receta → 0; factor 500 con 750 → 1.
  - ✅ Criterios 1, 2, 4, 5 cubiertos. Criterio 3 ("vender 10 → 740") = autoridad del servidor (`registrar_venta`) + expansión offline de combos = Task 5 de `combos-insumos` (**fuera de alcance**, D6).
  - `npx eslint` de tocados = 0 nuevos (queda 1 preexistente `set-state-in-effect` en `revisarConflictos`); `npm run build` ✓.
  - `memory.md` y `AGENTS.md` actualizados.
  - *Estado:* **COMPLETADA 2026-10-16** · *Aprobación:* [x]
