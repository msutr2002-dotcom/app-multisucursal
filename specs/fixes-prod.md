# Spec — Fixes de producción: inactividad, refresco de stock en POS y refresco de pendientes

**Fecha:** 2026-10-16 · **Estado:** ACTIVO · **Módulo:** `fixes-prod`
**Depende de:** `sesion-inactividad`, `stock-bodega-fuente-verdad`, `multibodega`, `impresiones-copias`

## Contexto

Reportes del desarrollador tras desplegar a producción:

1. **El cierre de sesión por inactividad (15 min) no funciona en producción** (sí en dev).
2. **Al crear un producto con stock, al ir al POS no aparece actualizado hasta refrescar la página.**
3. **Al eliminar una venta pendiente, sigue apareciendo en la lista hasta refrescar la página** (sin refrescar, la venta eliminada permanece en "Pendientes").

---

## Bugs y decisiones

### F6 — Inactividad: depende solo de un `setInterval` (frágil en pestañas en segundo plano/congeladas)

- **Dónde:** `src/hooks/useCierreInactividad.js`.
- **Causa:** la única comprobación periódica es un `setInterval` de 15 s. En producción la pestaña suele quedar **oculta/minimizada**; Chrome **congela o estrangula** los timers de pestañas en segundo plano (Memory/Energy Saver llegan a pausarlos por completo). Al volver, el primer `mousemove`/`keydown` del usuario **reinicia** `ultimaActividad` antes de que el interval tenga ocasión de disparar `revisar()` → la sesión **nunca** se cierra. En dev la pestaña queda enfocada y sin interacción → el interval dispara.
- **Fix (robusto, sigue siendo 100 % cliente):**
  - Además del interval, ejecutar `revisar()` en eventos que no requieren que el timer haya corrido: `visibilitychange` (al volver a **visible**) y `focus`/`pageshow` de la ventana. Así, al reabrir/enfocar la pestaña se compara contra la marca persistida **antes** de que la interacción del usuario la reinicie.
  - Mantener el reinicio por actividad tal cual (RF-SI1). Sin aviso previo (RF-SI4 sigue igual).
  - El override `window.__SESSION_IDLE_MS__` se conserva (RF-SI5) para E2E.

### F7 — POS: `stock_bodega` no se re-lee tras la hidratación (race `hidratarBodegas` fire-and-forget)

- **Dónde:** `src/services/catalogSyncService.js` (`hidratarCatalogoParaSucursal` → `hidratarBodegas`) y `src/views/pos/POSPage.jsx` (`recargarStockBodega`).
- **Causa:** `hidratarCatalogoParaSucursal` hace `await hidratarCatalogo(...)` (productos/precios) pero llama `hidratarBodegas(idSucursal)` **sin `await`** (fire-and-forget). El POS, al terminar la hidratación del catálogo, dispara `cola-sincronizada` → `recargarStockBodega()` lee `db.stock_bodega` **antes** de que `hidratarBodegas` haya terminado de escribirla → el mapa de stock queda viejo (p. ej. el producto nuevo sale con stock 0) hasta refrescar la página. `hidratarBodegas` termina en silencio y **no** emite ningún evento.
- **Fix:** `hidratarBodegas` despacha `cola-sincronizada` (`detail.tabla='stock_bodega'`) al terminar de escribir `stock_bodega`/`bodegas`. Los listeners (POS `recargarStockBodega`, grid) re-leen Dexie con los datos frescos. No hay bucle (ningún listener vuelve a llamar `hidratarBodegas`).

### F8 — Pendientes: `fusionarPendientes` resucita del servidor una venta recién eliminada

- **Dónde:** `src/services/pendienteService.js` (`fusionarPendientes`) y `src/views/pos/POSPage.jsx` (`handleEliminarPendiente`).
- **Causa:** al eliminar un pendiente **ya sincronizado**, `eliminarPendienteLocal` borra la fila local y encola un evento `DELETE` (`eliminar_venta_pendiente`) que se empuja en segundo plano. `handleEliminarPendiente` llama enseguida `refrescarPendientes()` → `cargarPendientes` lee `get_ventas_pendientes` **antes** de que el DELETE haya llegado al servidor → la lista del servidor aún trae el pendiente, y `fusionarPendientes` **no conoce el tombstone local** (solo mira eventos `INSERT`) → lo vuelve a añadir. Solo desaparece al recargar (cuando el DELETE ya se sincronizó).
- **Fix:**
  - `fusionarPendientes`: recolectar también los eventos `DELETE` de `ventas` con `sync_status !== 'SYNCED'` (tombstones) y **excluir del servidor** los ids en esa lista (se devuelven solo los no borrados).
  - `POSPage`: refrescar la lista de pendientes también en `cola-sincronizada` (para que, al sincronizarse el DELETE, el contador/lista queden consistentes sin recargar).

## Fuera de alcance

- Expansión offline de combos (Task 5 de `combos-insumos`).
- Cualquier cambio de schema/RPC/RLS.
- Polling/WebSocket de pendientes: el refresco es por eventos locales + recargas ya existentes.

## Criterios de aceptación

1. Con `__SESSION_IDLE_MS__` corto, una sesión que supera el timeout se cierra **aunque** el chequeo se dispare al volver la pestaña a primer plano (`visibilitychange`) o al enfocar la ventana, sin que la interacción lo reinicie antes.
2. Tras crear un producto con stock, al entrar al POS aparece con su stock correcto **sin** refrescar la página.
3. Al eliminar una venta pendiente sincronizada, desaparece de la lista **sin** refrescar la página (y no reaparece por la fusión con el servidor).
4. `npx eslint` de los archivos tocados = 0 nuevos; `npm run build` ✓.
5. `memory.md` y `AGENTS.md` actualizados.

## Riesgos

- F6: `focus`/`visibilitychange` podrían disparar `cerrarSesion` con marca vieja justo al reabrir una pestaña que el usuario sí estaba usando en otra pestaña activa → la sincronización entre pestañas (`storage` + `marcarActividad`) mantiene la marca compartida, así que una pestaña activa refresca la marca de todas.
- F7: un evento extra `cola-sincronizada` provoca una segunda lectura de Dexie (barato) y no re-dispara hidratación (sin bucle).
- F8: un DELETE encolado que falle de forma permanente (negocio) dejaría el tombstone; el pendiente ya se borró localmente y el server lo conservaría, pero la UI no lo muestra (igual que el objetivo). Se mitiga porque los fallos de red no pasan a terminal.
