# Tasks: reportes-impresion (impresión del reporte de ventas)

Spec: `specs/reportes-impresion.md`. Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: Spec + tasks — **aprobada por el usuario 2026-10-12**.
- [x] Task 2: Código — **VERIFICADO 2026-10-12**: botón "Imprimir reporte" (`data-testid="btn-imprimir-reporte"`), portal `#pagina` `.reporte-impresion` fuera de `#root` (encabezado empresa/sucursal/período/filtro/fecha + resumen + grupos por día con líneas + total general + leyenda "Reporte interno — no es comprobante fiscal"), ciclo con clase `body.imprimir-reporte` + `window.print()` + `afterprint`/retorno con guard idempotente, CSS print en `style.scss` (oculta `#root` y otros portales de body). Sin SQL.
- [x] Task 3: E2E + cierre (2026-10-12) — **TODO OK 14/14** (`Temp/opencode/test-reportes.js`, resultado `docs/e2e-resultados/ReportesImpresionTask3.json`, captura `reportes-t3-listado.png`): botón habilitado, nodo impreso poblado (encabezado, período, resumen, venta, leyenda, total general), `window.print()` invocado, limpieza de clase/nodo, segunda impresión refleja filtro "System Admin", consola limpia. lint 0 + build ✓ 3.57s.

---

Roadmap posterior: `facturas-sat` → `multibodega`.
