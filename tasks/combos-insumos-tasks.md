# Tasks — Combos dual (productos OFF / ingredientes ON)

**Spec:** `specs/combos-insumos.md` · **Estado:** ACTIVO — UNA tarea a la vez. Marcar `[x]` solo tras aprobación del desarrollador.

---

- [x] **Task 1 — SQL base (RF-C1 original)**
  - Bloques 1–7 + 8 aplicados y verificados 2026-10-08: `productos.contiene_insumos`, `sucursal.vender_sin_stock`, `combo_componentes` (solo-productos), `upsert_combo_componentes`, `registrar_venta`/`anular_venta` (expansión productos), `get_productos_admin`, `registrar_cotizacion`, `set_producto_contiene_insumos`, `set_sucursal_vender_sin_stock`.
  - *Estado:* **COMPLETADA 2026-10-08** · *Aprobación:* [x]

- [x] **Task 2 — Admin OFF: toggle + RecetaForm embebido**
  - Código completo 2026-10-08: `ModalProductos` (switch + RecetaForm embebido + fix checkbox `type==='checkbox'?checked:value`), `RecetaForm.jsx` (ref `validar`/`obtenerPayload`), `Productos.jsx handleGuardar` (crear/editar + receta + flag + precio NORMAL), `ProductosTabla` (badge Combo), `ModalSucursales` (switch `vender_sin_stock`), `Sucursales.jsx` (setter).
  - Bug cerrado en Task 3 Bloque 9 (`create_producto_admin RETURNS uuid`).
  - *Estado:* **COMPLETADA 2026-10-08** · *Aprobación:* [x]

- [x] **Task 3 — SQL modelo dual completo (RF-C1)**
  - Bloques 9–18 aplicados y confirmados por el usuario 2026-10-09 ("success. No rows returned" en todos): `create_producto_admin RETURNS uuid`, `sucursal.activar_ingredientes`, `ingredientes`+`ingredientes_sucursal`, `combo_componentes` dual (CHECK XOR + índices únicos parciales), RPCs `get_ingredientes_admin`/`upsert_ingrediente`/`set_sucursal_activar_ingredientes`/`set_ingrediente_stock`, `upsert_combo_componentes` dual, `registrar_venta`/`anular_venta` duales, `get_productos_admin`+`registrar_cotizacion` duales, `detalle_compra.id_ingrediente`+`registrar_compra`+`anular_compra` duales, `get_sucursal_flags`.
  - *Estado:* **COMPLETADA 2026-10-09** · *Aprobación:* [x]

- [x] **Task 4 — Admin dual (RF-C2)**
  - Código completo 2026-10-09: `IngredientesPage.jsx` CRUD (ruta/nav/permisos 5 lugares, icono `cilLeaf`), `RecetaForm` dual (modoIngrediente/ingredientes, payload dual id_ingrediente/id_producto_componente), `ModalProductos` 2 toggles mutuamente excluyentes (`f.tipo_receta` producto|ingrediente), `Productos` carga flags+ingredientes, `ModalSucursales` switch `activar_ingredientes`, `ComprasPage` selector Producto|Ingrediente, `compraOfflineService` dual (stock optimista ingrediente). Fixes: `CForm` import, unidades vacías→fetch `unidades`.
  - *Estado:* **COMPLETADA 2026-10-09 (aprobada por prueba manual del usuario)** · *Aprobación:* [x]

- [ ] **Task 5 — POS + Offline dual (RF-C3)**
  - Dexie v8 (`combo_componentes`, `sucursales`, `ingredientes`, `ingredientes_sucursal`). `catalogSyncService` hidrata 4 stores. `comboUtils` dual. `ventaLocalService` expansión dual. `compraOfflineService` stock optimista ingrediente. `cotizacionOfflineService` valida dual.
  - **Verificación:** smoke POS — combo ON descuenta ingredientes (combo intacto), máximo dual, OFF bloquea, ON vende negativo, compra ingrediente offline→sync, cotización avisa; lint 0 errores.
  - *Estado:* pendiente (se retoma tras Task 7) · *Aprobación:* [ ]

- [ ] **Task 6 — Cierre (RF-C4)**
  - Smokes E2E patrón repo (captura en `finally`, temp, pre-run taskkill): combo OFF, combo ON, venta online/offline, faltantes OFF/ON, compra ingrediente offline→sync, cotización, anulación. `npx eslint` 0 errores; `npm run build` ✓. Actualizar `memory.md`; verificar dashboard/login offline y anotar gaps.
  - *Estado:* pendiente (se retoma tras Task 7) · *Aprobación:* [ ]

- [ ] **Task 7 — POS vista comida con pestañas (RF-C5)**
  - Código completo 2026-10-09: toggle "Vista comida" en POSPage (visible solo `activar_ingredientes` ON, persistido en localStorage `pos_vista_comida_<id>`), `ProductosGrid.jsx` (tiles: ImagenProducto 48px, nombre, precio NORMAL/base con `formatQ`, badge Combo si `contiene_insumos`, botón `disabled` si stock 0), pestañas = categorías del catálogo local (`CNav` tabs + "Todos"), tap = `agregarDelGrid` → `addItem(..., 1, null)` (fusiona línea existente), refresco en `cola-sincronizada`/`online`. `BuscadorProducto` se mantiene visible; `selected` (detalle) tiene prioridad sobre el grid.
  - **Verificación:** sucursal ON → botón visible → pestañas por categoría → tap suma 1/1 → carrito reduce → sin stock atenuado → sucursal OFF → botón oculto → vista normal intacta; lint 0 errores.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-09 — pendiente aprobación por prueba manual** · *Aprobación:* [ ]
