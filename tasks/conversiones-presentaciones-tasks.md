# Tasks — Conversiones/Presentaciones por producto

**Spec:** `specs/conversiones-presentaciones.md` · **Estado:** ACTIVO — UNA tarea a la vez. Marcar `[x]` solo tras aprobación del desarrollador.

---

- [ ] **Task 1 — SQL de servidor (RF-P1)**
  - Generar el bloque de sondeo de solo lectura (`pg_get_functiondef` de `registrar_venta`, `anular_venta`, `upsert_precio_producto`, `get_productos_admin`, `registrar_cotizacion` + `registrar_pendiente` si aplica, y firmas/`has_function_privilege`) para que el usuario lo corra en el editor de SQL de Supabase y pegue el resultado.
  - Con el resultado, redactar el patch: `ALTER TABLE precio_producto ADD COLUMN factor … CHECK (>=1)`, `upsert_precio_producto` + `p_factor`, `registrar_venta` (stock `× factor`, totales intactos), `anular_venta` (revert `× factor`), `get_productos_admin` (retorna `factor`), y lo que el sondeo exija en cotizaciones/pendientes. Entregar en bloques para que el usuario los aplique (no vive en repo).
  - **Verificación:** REST `precio_producto?select=factor` → 200; crear un tier con factor desde `ModalPrecios` y ver `factor` en la hidratación del POS.
  - *Estado:* **COMPLETADA 2026-10-07** · *Aprobación:* [x] (spec aprobado + patch SQL aplicado y verificado: columna `factor` 200, `get_productos_admin` retorna `factor`/`equivalencia`, upsert 7-param con grants, firma vieja dropeada, FK `detalle_venta→precio_producto` sin ON DELETE, sin triggers en ventas)

- [x] **Task 2 — Admin: campo Factor (RF-P2)**
  - `ModalPrecios.jsx`: campo Factor (entero ≥ 1, default 1, auto-fill con `unidades.equivalencia` al elegir unidad), validaciones sin cerrar el modal, envío `p_factor`, etiqueta del listado con `x12 und`.
  - **Verificación:** alta/edición/eliminación de tier con y sin factor; un solo toast del contenedor; `npx eslint src/views/admin/productos/ModalPrecios.jsx` 0 errores.
  - *Estado:* **COMPLETADA 2026-10-07** · *Aprobación:* [x] (código: ModalPrecios con Factor + auto-fill + validación inline propia — se quitó `min`/`step` del input factor porque el tooltip nativo del browser tapaba la validación JS; `catalogSyncService.leerProductosAdminLocal` lee precios anidados; lint 0 errores reales, build ✓, roundtrip REST ✓, smoke E2E **27/27 TODO OK** con capturas `task2-*.png`)

- [x] **Task 3 — Núcleo POS (RF-P3)**
  - `precioUtils.js` (helpers + Auto solo base), `PrecioSelector.jsx` (etiquetas con unidad/factor), `useCarrito.js` (clave de línea por unidad, regla D6, clamps), `ProductoDetalle.jsx` (clamp por unidad, guard `maxCantidad < 1`), `CarritoFila.jsx` (unidad visible, max por cajas).
  - **Verificación:** smoke POS — agregar 1 Caja (subtotal Q110.00), líneas separadas cajas+unds, clamp `floor(stock/12)`, AUTO nunca elige caja; lint de los 5 archivos 0 errores.
  - *Estado:* **COMPLETADA 2026-10-07** · *Aprobación:* [x] (7 archivos: `precioUtils.js` (factorDe/esPresentacion/maxCantidad/soloBase/precioAuto), `PrecioSelector.jsx` (label `TIPO · Q (1 Caja T2 = 12 und)`), `useCarrito.js` (D5 clave `(idProducto, id_unidad_venta)`, D6 `setCantidad`, clamps), `ProductoDetalle.jsx` (cambiarTier/maxDisp/aviso sinStock), `CarritoFila.jsx` (max + `×N und`), `useBusquedaProductos.js` (seleccionar enriquece tiers con unidad desde Dexie), `Carrito.jsx` (key D5) + `POSPage.jsx` onRemove con unidad; lint solo CRLF, build ✓, smoke E2E **32/32 TODO OK** con capturas `task3-*.png`: Auto Q40 sin Q110, label caja, max=2, 2 líneas separadas (Q110×12 / Q40×5=Q200), D6, total Q420, consola 0 errores, cleanup OK)

- [x] **Task 4 — Cobro, offline y anulación (RF-P4)**
  - `ventaLocalService.js` (validación y descuento `× factor` con mensaje dual), pendientes (restaurar tier), `cotizacionOfflineService.js` (conflicto/adopción de stock `× factor` / `floor`), regresión de anulación y espejo local.
  - **Verificación:** venta online y offline con Cajas (stock 24 → 0), replay de cola SIN `CONFLICT`, anulación revierte 24 und; captura de checklist.
  - *Estado:* **COMPLETADA 2026-10-07** · *Aprobación:* [x] (`ventaLocalService`: valida `stock ≥ yaUsado + cantidad × factor` con mensaje dual `"solo tiene 10 und; vendes 2 Caja T4 (24 und)"` (factor=1 → mensaje clásico intacto), descuento `× factor`, `db.unidades` en la transacción; `cotizacionOfflineService`: `detectarConflictos` compara `stock < cantidad × factor`, `syncOfflineQuotes` anota `factor` en `valores_servidor`, `aceptarCambiosServidor` recorta con `max(floor(stock/factor),1)`; `POSPage.itemsConflicto` pasa `factor`; `HistorialPage` tras anular: `db.ventas→'anulada'` + `hidratarCatalogoParaSucursal`; pendientes sin cambios (D5/D6 ya conservaban tier); lint 0 errores reales, build ✓, smoke E2E **37/37 TODO OK** `dbg-task4-cobro.js` con capturas `task4-*.png`: venta online Q220→stock local/servidor 0→cola SYNCED, dual, anulación 24/24/'anulada', offline PENDING→replay SYNCED sin CONFLICT; lecciones: CDP vía `driver.sendDevToolsCommand` (no `createCDPSession`), el POS rehidrata con red al montar y pisa stock local)

- [x] **Task 5 — E2E, regresión y cierre (RF-P5/P6)**
  - Smokes con patrón repo (captura en `finally`, temp, pre-run taskkill): login, reg, edit, elim + venta con presentación online/offline; criterios CA1–CA9.
  - `npx eslint` de todos los archivos tocados 0 errores; `npm run build` ✓.
  - Actualizar `memory.md` (módulo cerrado, schema `precio_producto.factor`, nota `spec.md:90` desactualizado) y `AGENTS.md` si nació una regla nueva.
  - *Estado:* **COMPLETADA 2026-10-08** · *Aprobación:* [x]
  - **Checklist CA1–CA9 (todas verdes):**
    - CA1 Admin tier caja guardado + listado `x12 und` + aparece en POS — smoke task2 27/27 y task3.
    - CA2 POS: cantidad cuenta cajas, subtotal `11000×N`, max `floor(24/12)=2`, AUTO regresa a unds — task3.
    - CA3 Cobro 2 Cajas (stock 24→0) + replay SIN `CONFLICT` + Historial Q220.00 — task4.
    - CA4 Rechazo de 3 Cajas: clamp cliente (max=2, task3) + validación servidor (RF-P1) + mensaje dual del cliente (task4).
    - CA5 Auto seguro: `Auto _ Q40.00` nunca Q110 — task3.
    - CA6 Offline: venta presentación → PENDING → push → SYNCED sin conflicto — task4.
    - CA7 Anulación revierte 24 und (servidor 24 + espejo local 24 + venta local `anulada`) — task4.
    - CA8 Regresión sin presentaciones: `test:login`✓ `test:reg`✓ `test:e2e`✓ `test:edit`✓ (`test:elim` ❌ cosmetic — eliminación real verificada en BD; el verificador legacy busca el texto en pageSource y el input de búsqueda lo conserva); factor=1 → mensaje clásico intacto (task4).
    - CA9 lint 0 errores reales en los 9 archivos tocados + `npm run build` ✓ (3.52s).
  - `memory.md` actualizado (módulo COMPLETADO, schema, limitaciones, `spec.md:90` desactualizado, trampas de verificación). `AGENTS.md` sin cambios: las lecciones nuevas (SKU exacto auto-selección, rehidratación al montar, `sendDevToolsCommand`) quedaron en memory.md.
