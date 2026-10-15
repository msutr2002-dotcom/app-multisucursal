# Tasks — POS UX (dedup cotización, permisos de botones, referencia transferencia)

**Spec:** `specs/pos-ux-permisos.md` · **Estado:** ACTIVO — UNA tarea a la vez. Marcar `[x]` solo tras aprobación del desarrollador.

---

- [x] **Task 1 — Dedup cotización (RF-P1)**
  - `PanelPago.jsx`: renombrar botón "Cotización" → "Cotizar"; eliminar el link "Ver cotizaciones" y el prop `onVerCotizaciones` (también en `ModalCobrar` y los 2 call-sites de `POSPage`). El encabezado conserva "Cotizaciones".
  - *Estado:* **COMPLETADA 2026-10-09 (código; verificación visual en Task 5)** · *Aprobación:* [x]

- [x] **Task 2 — Referencia de transferencia: frontend (RF-P3)**
  - `PanelPago.jsx`: estado `referencia`, `esTransferencia` (nombre contiene `transfer`), input "Número de referencia (obligatorio)" solo si transfer, `valido` lo exige, `cambiarMetodo` limpia, se envía en `onCobrar`. `POSPage`: `cobrarOnline` agrega `p_referencia` solo si presente; `handleCobrar` pasa `referencia` a `registrarVentaLocal`. `ventaLocalService.js`: guarda `referencia` en `ventas` y `p_referencia` condicional en el evento de cola.
  - *Estado:* **COMPLETADA 2026-10-09 (código; requiere Task 3 SQL para probar transferencia)** · *Aprobación:* [x]

- [ ] **Task 3 — SQL referencia (RF-P3, con el usuario)**
  - `SELECT pg_get_functiondef('registrar_venta'::regprocedure);` recibido 2026-10-12 → entregado **`tasks/sql/pos-ux-referencia-venta.sql`**: `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia text;` + `CREATE OR REPLACE registrar_venta` con `p_referencia text default null` (NULLIF+btrim: cadena vacía → NULL). Resto de la función idéntica al original.
  - **Verificación:** REST `registrar_venta` con `p_referencia` → 200 y columna escrita; sin el param → igual que antes.
  - *Estado:* **SQL ENTREGADO 2026-10-12 — pendiente de aplicación por el usuario** · *Aprobación:* [ ]

- [x] **Task 4 — Permisos de botones POS (RF-P2)**
  - `permisoService.verificarPermisoBotonPos` (sin fila = visible; Admin→true; red→`get_permisos_by_rol` cachea en `permpos_<rol>_<modulo>`; sin red→cache/sin cache→true — distinto de `verificarPermiso` porque una fila INEXISTENTE significa VISIBLE, no false). `ModalPermisos`: filas `pos_cotizar`/`pos_ver_cotizaciones` (solo checkbox Ver, default true al cargar, Crear/Editar/Eliminar muestran "—"). `RolesCard.MODULOS` += los dos. `POSPage`: botón "Cotizaciones" del encabezado con `pos_ver_cotizaciones`; `PanelPago`: botón "Cotizar" con `pos_cotizar` (sin permiso Guardar venta ocupa todo el ancho).
  - **Verificación:** rol sin filas → ambos visibles; desmarcar Cotizar → botón desaparece (recarga); desmarcar Ver cotizaciones → encabezado sin botón; Admin siempre los ve; lint 0.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-12 (lint solo preexistente POSPage revisarConflictos; build ✓) — verificación manual/E2E en Task 5** · *Aprobación:* [ ]

- [ ] **Task 5 — Verificación y cierre (RF-P1/P2/P3)**
  - Smoke E2E patrón repo (temp, captura en `finally`, pre-run taskkill): dedup, permiso Cotizar off/on, transferencia con referencia online y offline (cola con `p_referencia`), regresión efectivo. `npx eslint` 0; `npm run build` ✓. Actualizar `memory.md`.
  - *Estado:* pendiente · *Aprobación:* [ ]
