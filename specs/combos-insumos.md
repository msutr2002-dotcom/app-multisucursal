# Spec — Combos dual (productos OFF / ingredientes ON)

**Fecha:** 2026-10-09 · **Origen:** hoja de ruta aprobada (módulo 3 de 4). Reescritura del modelo original de "insumos = productos" a **ingredientes = tabla separada, activada por toggle por sucursal** (decisión del usuario 2026-10-09). Todo el sistema debe funcionar **offline** (incluidas compras de ingredientes).

## Contexto

**Objetivo negocio:** combos/kits con receta que se venden en POS y al cobrar **expanden la receta** descontando stock de componentes. El tipo de componente depende del tipo de negocio:

| Sucursal | `activar_ingredientes` | Combo = | Componentes = | Stock se descuenta de |
|---|---|---|---|---|
| Librería | OFF (default) | Kit | Productos (cuaderno, lápiz…) | `productos_sucursal` × factor |
| Comida | ON | Receta | Ingredientes (harina, pan…) | `ingredientes_sucursal` (unidad base) |

**Decisiones aprobadas (2026-10-09):**
- **Toggle por sucursal** `activar_ingredientes` (default OFF) decide el modelo.
- **Compras** con selector `Producto | Ingrediente` cuando ON; compra de ingrediente suma stock de `ingredientes_sucursal`.
- **Precio sugerido** modo comida = suma de **costo** (`precio_compra × cantidad`); modo librería = suma de precios de venta × cantidad (como estaba).
- **Stock de ingredientes** visible/editable solo en el CRUD de Ingredientes (no en InventarioPage).
- **Offline-first total**: crear ingrediente, armar receta, vender combo y comprar ingredientes sin red → cola → sync.
- Ticket/comprobante: **1 línea por combo**. Cotizaciones **validan** sin descontar. Anulación **revierte** componentes.

**Estado previo (Task 1 SQL aplicada 2026-10-08):** `productos.contiene_insumos`, `sucursal.vender_sin_stock`, `combo_componentes` (solo `id_producto_componente`), `upsert_combo_componentes`, `registrar_venta`/`anular_venta` (expansión solo-productos), `get_productos_admin`, `registrar_cotizacion`, `set_producto_contiene_insumos`, `set_sucursal_vender_sin_stock`. Los bloques nuevos **amplían** esos objetos a dual.

**Bug known (Task 2):** `create_producto_admin` retorna `void` → el id no se extrae al crear combo en un paso. Se cierra en Bloque 9.

## Decisiones de diseño

- **D1 — Combo = producto con receta:** flag `productos.contiene_insumos`. El combo no tiene stock propio validado; su disponibilidad deriva de los componentes.
- **D2 — Receta dual en `combo_componentes`:** `id_producto` (combo) siempre; por componente: **exactamente uno** de `id_producto_componente` (modo OFF) o `id_ingrediente` (modo ON). `cantidad > 0`. `id_precio_producto` nullable **solo aplica a componentes-producto** (presentación = `cantidad × factor` unds base); componentes-ingrediente usan cantidad directa en unidad base (sin factor). CHECK XOR + índices únicos parciales.
- **D3 — Ingredientes = tabla propia:** `ingredientes` (id, name, sku, descripcion, `id_unidad` → `unidades(id)` [base g/ml/ud], `precio_compra` centavos, activo, `id_empresa`) + `ingredientes_sucursal` (stock por sucursal, espejo de `productos_sucursal`). Unidades reutilizan la tabla `unidades` existente.
- **D4 — Precio del combo = tier NORMAL** en `precio_producto` (suma editable). Sugerido: OFF = Σ(tier/NORMAL × cantidad); ON = Σ(`precio_compra` ingrediente × cantidad).
- **D5 — 1 línea en ticket:** `detalle_venta` guarda el combo; expansión a componentes solo en stock (cliente y servidor).
- **D6 — Toggle "vender sin stock" por sucursal** (existente): OFF bloquea cobro de combo con faltante; ON → ConfirmModal → stock negativo con aviso. Aplica a componentes de ambos tipos.
- **D7 — SQL con el usuario:** sondeo + patch en bloques; grants anon; sin código de servidor en repo.
- **D8 — FKs:** `combo_componentes.id_producto` → CASCADE; `id_producto_componente` → RESTRICT; `id_ingrediente` → RESTRICT. Borrar un producto/ingrediente usado en receta falla con error visible.
- **D9 — Sin recursividad:** un combo no puede ser componente de otro combo (excluido en selector).

## RF-C1 — SQL modelo dual (Task 3)

Bloques 9–18 (se entregan al usuario para aplicar en Supabase):
1. **9:** `create_producto_admin` → `RETURNS uuid` (`RETURN v_id`).
2. **10:** `sucursal.activar_ingredientes boolean NOT NULL DEFAULT false`.
3. **11:** `ingredientes` + `ingredientes_sucursal`.
4. **12:** `ALTER combo_componentes` → dual + CHECK XOR + índices únicos parciales.
5. **13:** RPCs `get_ingredientes_admin`, `upsert_ingrediente`, `set_sucursal_activar_ingredientes` (GRANT anon).
6. **14:** `upsert_combo_componentes` dual.
7. **15:** `registrar_venta`/`anular_venta` duales (producto→`productos_sucursal`×factor; ingrediente→`ingredientes_sucursal`; respetan `vender_sin_stock`).
8. **16:** `get_productos_admin` (`componentes[]` con `id_ingrediente`); `registrar_cotizacion` valida dual sin descontar.
9. **17:** `detalle_compra.id_ingrediente` + `registrar_compra` dual (suma stock ingrediente) + `anular_compra` revierte.
10. **18:** RPC de lectura de flags de sucursal activa (`get_sucursal_flags`) si no existe.

## RF-C2 — Admin dual (Task 4)

- **CRUD Ingredientes** nuevo (`IngredientesPage.jsx` + ruta + nav + permisos en los 5 lugares de AGENTS.md): nombre, código, unidad base (`unidades`), precio compra (Q→centavos), stock de la sucursal activa (editable inline).
- **`RecetaForm` dual:** lee `activar_ingredientes` de la sucursal activa → ON: selector ingredientes (unidad base, sin tier, precio sugerido = costo); OFF: selector productos con presentación opcional (actual).
- **`Productos.jsx handleGuardar` dual:** payload con `id_ingrediente` cuando corresponde.
- **`ModalSucursales`:** switch "Activar ingredientes (negocio de comida)".
- **`ComprasPage`:** selector `Producto | Ingrediente` (solo si sucursal ON); al agregar ingrediente muestra stock de `ingredientes_sucursal`.
- `ProductosTabla`: badge "Combo" (existente). Sin botón "Receta".

## RF-C3 — POS + Offline dual (Task 5)

- **Dexie v8:** `combo_componentes`, `sucursales` (flags), `ingredientes`, `ingredientes_sucursal`.
- **`catalogSyncService`:** hidrata los 4 stores nuevos; rehidrata `ingredientes_sucursal` tras anulación.
- **`comboUtils`:** `maxComboDisponible` dual (producto→`productos_sucursal`×factor; ingrediente→`ingredientes_sucursal`).
- **`ventaLocalService`:** expansión dual offline; `COMBO_SIN_STOCK` con detalle; `permitirStockNegativo` si toggle ON.
- **`compraOfflineService`:** compra de ingrediente escribe stock optimista local + encola; sync aplica stock servidor.
- **`cotizacionOfflineService`:** valida componentes duales contra espejo local (aviso, sin descontar).

## RF-C5 — POS vista comida con pestañas (Task 7)

- **Acceso:** botón/toggle "Vista comida" en el encabezado del POS, visible **solo** si la sucursal activa tiene `activar_ingredientes` ON. Alterna (en la misma ruta `#/pos`) entre la vista actual (búsqueda + detalle) y la vista comida. Estado persistido en `localStorage` por sucursal (`pos_vista_comida_<idSucursal>`).
- **Pestañas = categorías:** una pestaña por cada `categoria` distinta del catálogo local de la sucursal + pestaña "Todos". Crear una pestaña nueva = crear una categoría en Catálogos y asignársela a productos (no hay pestañas manuales).
- **Grid de tiles:** por producto activo y disponible: imagen (`ImagenProducto`), nombre, precio (tier NORMAL o más barato base, `formatQ`), badge "Combo" si `contiene_insumos`, atenuado + no cliqueable si stock de la sucursal es 0.
- **Tap = +1:** tocar un tile agrega 1 unidad al carrito con el tier **NORMAL**; tocar otra vez suma 1 (fusiona en la misma línea del carrito, clave `(idProducto, id_unidad_venta)`). Presentaciones/selectores quedan solo en la vista de búsqueda. El carrito es el mismo componente (`Carrito`/`CarritoFila`) y su stepper de cantidad ya permite reducir.
- **Búsqueda se mantiene:** `BuscadorProducto` sigue visible en vista comida (lectura de código de barras / búsqueda rápida); el grid reemplaza el área de detalle/estado vacío.
- **Recarga del grid:** se alimenta de `db.productos` (Dexie) y se refresca al entrar a la vista, en `cola-sincronizada` y al volver en línea.
- Sin cambios de backend ni SQL.

## RF-C4 — Verificación y cierre (Task 6)

- Smokes E2E patrón repo (temp, captura en `finally`, pre-run taskkill): combo OFF, combo ON, venta online/offline, faltantes OFF/ON, compra ingrediente offline→sync, cotización, anulación.
- `npx eslint` archivos tocados 0 errores; `npm run build` ✓.
- Actualizar `memory.md`; `AGENTS.md` si nace regla nueva. Verificar dashboard/login offline; gaps → `memory.md` (no bloquean).

## Criterios de aceptación

1. **OFF:** kit de productos vende, componentes bajan de `productos_sucursal`, combo intacto, ticket 1 línea.
2. **ON:** receta de ingredientes vende, ingredientes bajan de `ingredientes_sucursal`, combo intacto.
3. **Offline total:** crear ingrediente, receta, venta combo y compra de ingrediente sin red → sync sin conflicto.
4. **Precio sugerido ON** = costo de ingredientes (editable).
5. **Anulación** revierte stock correcto (producto o ingrediente) según tipo de componente.
6. **Regresión:** producto simple y con presentaciones intactos; compras de productos intactas.

## Fuera de alcance / limitaciones conocidas

- Entradas manuales de stock de ingrediente (módulo Entradas sigue solo para productos; el stock de ingrediente se edita en su CRUD).
- Combos como componentes de otros combos (D9) y recetas de nivel 2+.
- Toggle "vender sin stock" no afecta productos simples (solo componentes de combo).
- Reportes/dashboard: "unidades vendidas" cuenta el combo como 1; el stock de componentes sí baja.
- InventarioPage no muestra ingredientes (decisión del usuario).
- Reserva de stock al cotizar: no (solo validar).
