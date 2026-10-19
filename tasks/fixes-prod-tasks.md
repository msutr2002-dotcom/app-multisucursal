# Tasks — Fixes de producción (`fixes-prod`)

**Spec:** `specs/fixes-prod.md` · **Estado:** COMPLETADO (Tasks 1–7 aprobadas, F6–F10).

---

- [x] **Task 1 — F6: inactividad robusta (visibilitychange/focus/pageshow)**
  - `src/hooks/useCierreInactividad.js`: `revisar()` se ejecuta además del interval en `document.visibilitychange` (solo al volver a `visible`), `window.focus` y `window.pageshow`; listeners limpiados en el cleanup.
  - Probe `Temp/opencode/verify-fixes-prod.js`: override 2 s + marca vieja + `focus` → `currentUser:null`, hash `#/login` ✓.
  - *Estado:* verificado — **APROBADO** · *Aprobación:* [x]

- [x] **Task 2 — F7: `hidratarBodegas` despacha `cola-sincronizada`**
  - `src/services/catalogSyncService.js`: al terminar de escribir `stock_bodega`/`bodegas` emite `cola-sincronizada` (`detail.tabla='stock_bodega'`).
  - Probe: listener recibe el evento (`{eventoStockBodega:true}`) ✓.
  - *Estado:* verificado — **APROBADO** · *Aprobación:* [x]

- [x] **Task 3 — F8: tombstones de DELETE en `fusionarPendientes` + refresco en `cola-sincronizada`**
  - `src/services/pendienteService.js`: excluye del `servidor` los ids con evento `DELETE` no `SYNCED`.
  - `src/views/pos/POSPage.jsx`: refresca pendientes en el listener `cola-sincronizada` (`tabla='ventas'`).
  - Probe: `fusionarPendientes` con tombstone → `contieneBorrado:false` ✓.
  - *Estado:* verificado — **APROBADO** · *Aprobación:* [x]

- [x] **Task 4 — Verificación + docs**
  - `npx eslint` de tocados = 0 nuevos; `npm run build` ✓. `memory.md` + `AGENTS.md` actualizados (F6–F10).
  - Verificado en build de **producción** (`vite preview` :4174): F6 cierra sesión tras inactividad (`focus` → `#/login`), F7 emite `cola-sincronizada(tabla:'stock_bodega')` al hidratar en login, Service Worker registrado y controlando, 0 errores SEVERE de la app.
  - *Estado:* completo — **APROBADO** · *Aprobación:* [x]

---

- [x] **Task 5 — F9: Inventario hidrata su espejo + reacciona a eventos**
  - `src/views/inventario/InventarioPage.jsx`: `cargar({ hidratar })`; al montar/cambiar empresa-bodega con red → `hidratarCatalogoParaSucursal` y luego leer Dexie; `cola-sincronizada` → re-leer (sin bucle); `online` → re-hidratar; token de secuencia; usar `enLinea` para el aviso offline.
  - Probe `verify-fp3.js`: espejo vaciado → Inventario hidrata 36 productos ✓.
  - *Estado:* verificado — **APROBADO** · *Aprobación:* [x]

- [x] **Task 6 — F10: combos sin stock propio (disponibilidad derivada)**
  - `Productos.jsx`: mapa `disponibilidadPorId` (reusa `disponibilidadCombo` de `pos/comboUtils.js` con `componentes` + stock de sucursal) y pasarlo a la tabla/tarjeta.
  - `ProductosTabla.jsx` / `ProductosTarjeta.jsx`: para `contiene_insumos`, mostrar "Disponible: N" y ocultar `− n +`/modal de stock.
  - `InventarioPage.jsx`: combo → "Disponible: N" (badge), sin "Stock bajo"; contenedor → suma de hijos.
  - `ModalStock.jsx`: guard defensivo (no guardar combos).
  - Probe `verify-fp6.js`: combo `748Disponible (combo)` sin botones en Admin; producto normal conserva `−/+` ✓.
  - *Estado:* verificado — **APROBADO** · *Aprobación:* [x]

- [x] **Task 7 — Verificación F9/F10 + docs**
  - Probe E2E: crear producto → aparece en Inventario sin recargar; combo muestra "Disponible: N" sin botones de stock ✓.
  - `npx eslint` de tocados = 0 nuevos; `npm run build` ✓; `memory.md` + `AGENTS.md` actualizados.
  - *Estado:* completo — **APROBADO** · *Aprobación:* [x]
