# Tasks: clientes (modelo por sucursal, NIT como identidad)

Spec: `specs/clientes.md` (v2 por sucursal). Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: Spec + tasks (2026-10-12) — aprobada por el usuario. **Reescrita v2 por sucursal** tras las decisiones de diseño de la sesión (spec v1 por empresa superseded).
- [x] Task 2: SQL (usuario aplica):
  - [x] `SELECT pg_get_functiondef('upsert_cliente'::regproc);` + firma de `registrar_venta` + `get_ventas_historial`/`get_venta_detalle` — recibidos 2026-10-12.
  - [x] Entregado `tasks/sql/clientes-bloque1.sql` (v1 por empresa) — **SUPERSEDIDO** por bloque2.
  - [x] Entregado **`tasks/sql/clientes-bloque2.sql`** (v2 por sucursal, idempotente, con drops de sobrecargas previas incluida la de pos-ux ya aplicada).
  - [x] Aplicado por el usuario 2026-10-12 + **2 fixes**: `clientes-bloque2-fix-get-clientes.sql` (la sección 6 no se había creado) y corrección del **bug de precedencia OR/AND en el WHERE** de `get_clientes` (parentesis aplicados en el maestro y en el fix).
- [x] Task 3: Service + hidratación — **VERIFICADO 2026-10-12** (ver detalle arriba): `hidratarClientes(idEmpresa, idSucursal)` + `leerClientesLocal(idEmpresa, idSucursal, {heredados,…})`; `Login.jsx` pasa `id_sucursal`.
- [x] Task 4: `ClientesPage.jsx` — **VERIFICADO 2026-10-12**: form Nombre+Apellido, `upsert_cliente_admin` v2, lista sin heredados, ruta/nav/permisos en los 5 lugares.
- [x] Task 5: Integración POS (dos modos) — **VERIFICADO 2026-10-12**: datalist "Nombre (NIT)", NIT opcional con autollenado, badge enlazado/casual, "Registrar cliente nuevo" explícito, `p_id_cliente`/`p_cliente_nombre` en venta local y online, upsert ciego eliminado de colaSync, HistorialPage split nombre.
- [x] Task 6: E2E + cierre (2026-10-12) — **TODO OK 26/26** (`test-clientes.js`, resultado `docs/e2e-resultados/ClientesTask6.json`, capturas `docs/capturas/clientes-t6-*.png`): altas con NIT, homónimo sin NIT rechazado, homónimo con NIT distinto, búsqueda, editar, detalle, desactivar + "Ver inactivos", datalist POS (activo como "Nombre (NIT)", inactiva ausente), NIT autollenado → enlazado, venta casual (`cliente_nombre` en servidor) y enlazada (`id_cliente` con n_ventas=1), consola sin SEVERE. lint 0 en archivos tocados + build ✓ 4.79s.

**Nota:** Tasks 3–5 v1 compilan (build ✓ 3.88s, lint 0) pero son del diseño por empresa y quedan **reemplazadas** por la reescritura v2; el runtime depende de `clientes-bloque2.sql`.

---

Roadmap posterior (specs al cerrar este módulo): `mayoreo` (descuento % por cliente) → `reportes-impresion` → `facturas-sat` (PDF GT simulado, marca "PENDIENTE DE SINCRONIZACIÓN FISCAL" pero sin "SIMULACIÓN — NO FISCAL") → `multibodega`.
