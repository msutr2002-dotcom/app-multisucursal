# Tasks: stock-bodega-fuente-verdad

Spec: `specs/stock-bodega-fuente-verdad.md`. Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: Spec + tasks — este documento.
- [x] Task 2: SQL de servidor — `tasks/sql/stock-bodega-fuente-verdad.sql` (idempotente): `asegurar_bodega_principal`, backfill de Principal + copia `productos_sucursal → stock_bodega`, triggers D4 (sucursal/producto nuevos) y espejo D3, y redefinición de `upsert_stock_bodega` (D5). Entregar el bloque para que el usuario lo aplique en Supabase.
- [x] Task 3: Cliente — POS refleja la bodega seleccionada (D6): `POSPage` resuelve el stock de `db.stock_bodega` de la bodega activa y lo inyecta en el detalle/grid (`ProductoDetalle`, `ProductosGrid`), con fallback al `producto.stock` de sucursal.
- [x] Task 4: Verificación — `npm run build` ✓ y lint de archivos tocados ✓ (solo error preexistente `revisarConflictos` en `POSPage.jsx:404`). Server (REST/RPC): `stock_bodega(Principal) == productos_sucursal` en 5/5 productos de Libreria Luna (trigger/backfill OK). Cliente (probe Selenium): Dexie v11 `leerStockPorBodega` corre sin error de índice; POS detalle sigue la bodega seleccionada (badge 3 en Principal vs 5 en otra bodega; sucursal=7 ignorado). Login E2E 5/5. Nota: `CPInventario`/`CPPOS` de Ferromax no corren por falta del fixture "llave inlgesa" (el server devuelve 0 productos para esa empresa) — bloqueo ambiental, no regresión.
- [x] Task 5: Cierre — `memory.md` (entrada 2026-10-14 + roadmap) y `AGENTS.md` (regla permanente "Fuente de verdad del stock") actualizados.

## Notas de implementación

- El código de servidor no vive en el repo: el SQL se entrega para aplicar manualmente (patrón de `tasks/sql/*.sql`).
- No reescribir RPC existentes de stock (fuentes incompletas); la convergencia es vía triggers.
- Bodegas no-Principal siguen siendo delta local (D7).
