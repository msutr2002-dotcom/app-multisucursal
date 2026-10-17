# Tasks — Fixes de producción (`fixes-prod`)

**Spec:** `specs/fixes-prod.md` · **Estado:** ACTIVO — UNA tarea a la vez. Marcar `[x]` solo tras aprobación del desarrollador.

---

- [ ] **Task 1 — F6: inactividad robusta (visibilitychange/focus/pageshow)**
  - `src/hooks/useCierreInactividad.js`: `revisar()` se ejecuta además del interval en `document.visibilitychange` (solo al volver a `visible`), `window.focus` y `window.pageshow`; listeners limpiados en el cleanup.
  - Probe `Temp/opencode/verify-fixes-prod.js`: override 2 s + marca vieja + `focus` → `currentUser:null`, hash `#/login` ✓.
  - *Estado:* verificado — pendiente de aprobación · *Aprobación:* [ ]

- [ ] **Task 2 — F7: `hidratarBodegas` despacha `cola-sincronizada`**
  - `src/services/catalogSyncService.js`: al terminar de escribir `stock_bodega`/`bodegas` emite `cola-sincronizada` (`detail.tabla='stock_bodega'`).
  - Probe: listener recibe el evento (`{eventoStockBodega:true}`) ✓.
  - *Estado:* verificado — pendiente de aprobación · *Aprobación:* [ ]

- [ ] **Task 3 — F8: tombstones de DELETE en `fusionarPendientes` + refresco en `cola-sincronizada`**
  - `src/services/pendienteService.js`: excluye del `servidor` los ids con evento `DELETE` no `SYNCED`.
  - `src/views/pos/POSPage.jsx`: refresca pendientes en el listener `cola-sincronizada` (`tabla='ventas'`).
  - Probe: `fusionarPendientes` con tombstone → `contieneBorrado:false` ✓.
  - *Estado:* verificado — pendiente de aprobación · *Aprobación:* [ ]

- [ ] **Task 4 — Verificación + docs**
  - `npx eslint` de tocados = 0 nuevos; `npm run build` ✓. `memory.md` + `AGENTS.md` **pendientes** (al aprobar).
  - *Estado:* pendiente de aprobación · *Aprobación:* [ ]
