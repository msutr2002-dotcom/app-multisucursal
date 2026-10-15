# Tasks: mayoreo (descuento % por cliente)

Spec: `specs/mayoreo.md`. Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: Spec + tasks — **aprobada por el usuario 2026-10-12**.
- [x] Task 2: SQL — **aplicado y VERIFICADO por probe REST 2026-10-12** (`mayoreo-bloque1.sql`; 2 fixes durante la aplicación: `constraint_not_found` inexistente → DROP/ADD simple; `%` literal en RAISE → `%%`). Probe: alta bp=1000 ✔, bp=12000 rechazado ✔, `get_clientes.descuento_bp` ✔, venta enlazada Q2.00−10% → total 180 ✔, detalle expone campos ✔, casual bp=0 ✔.
- [x] Task 3: Lado admin — **VERIFICADO 2026-10-12**: `ClientesPage.jsx` (campo "Descuento mayoreo %" con validación 0–100, badge en lista, `alternarActivo` preserva el bp) + `catalogSyncService.js` (Dexie `clientes` con `descuento_bp`).
- [x] Task 4: Lado POS — **VERIFICADO 2026-10-12**: `PanelPago.jsx` (opciones con bp, fila "Descuento mayoreo (X%) −Qn" en `ResumenPago`, total a cobrar rebajado, vuelto/faltante sobre el total final, badge "mayoreo X%", `descuentoBp` en el payload), `POSPage.jsx` (pasa bp a `registrarVentaLocal`; online recalcula el servidor), `ventaLocalService.js` (un solo redondeo por venta, campos en la fila de `ventas`, total final), `ModalComprobante.jsx` (línea de descuento) + `historialOfflineService.js` (campos en el detalle local). colaSync sin cambios (el servidor recalcula con `p_id_cliente`).
- [x] Task 5: E2E + cierre (2026-10-12) — **TODO OK 17/17** (`Temp/opencode/test-mayoreo.js`, resultado `docs/e2e-resultados/MayoreoTask5.json`, capturas `docs/capturas/mayoreo-t5-*.png`): alta 10% + badge, edición a 12.5% + badge (con polling tras recargar — lección 7), resumen/total Q1.75, comprobante con línea, casual sin descuento, servidor `descuento_bp=1250`/`n_ventas=1`/`200−25=175`, desactivar, consola limpia. lint 0 en archivos tocados (solo el preexistente aceptado `POSPage.jsx:322`) + build ✓ 14.59s.

---

Roadmap posterior: `reportes-impresion` → `facturas-sat` → `multibodega`.
