# Spec — Conversiones/Presentaciones por producto (vender en Caja/Paquete/Libra)

**Fecha:** 2026-10-07 · **Origen:** hoja de ruta aprobada (módulo 2 de 4: 1) fix roles ✓, 2) conversiones, 3) combos, 4) multibodega). Pregunta de alcance resuelta con el usuario: **"Por presentación del producto"** — cada producto define sus presentaciones con su factor (1 Caja = 12 und, 1 Paquete = 100 und, 1 Libra = 30 und); el POS vende en la presentación elegida y descuenta el equivalente en unidades base.

## Contexto

**Objetivo negocio:** venta en presentaciones múltiples con **precio propio por presentación**. El stock sigue midiendo **unidades base** (lo que ya existe en `productos_sucursal`, compras, traslados e InventarioPage no cambia); al cobrar, 2 Cajas × 12 = 24 und descontadas.

**Sondeo REST (2026-10-07, anon key; PostgREST valida columnas aunque RLS vacíe filas — control con columna inexistente devuelve 42703):**

- `precio_producto(id, id_producto, id_tipo_producto, precio, min_cantidad, id_unidad_venta)` ✓ existe. `precio_producto.factor` ✗ **no existe**.
- `unidades(id, name, abreviatura, equivalencia, activo)` ✓ existe; `equivalencia` solo se captura en `ModalCatalogo.jsx` y **no se consume en ninguna lógica**.
- No existen `presentaciones`, `bodega`, `stock_bodega` (los módulos 3 y 4 los crearán).
- `spec.md:90` quedó desactualizado (no lista `min_cantidad`/`id_unidad_venta`; nota para `memory.md`).

**Código actual:**

- `precioUtils.js` — `precioNormal/precioAuto/calcularTier` comparan `min_cantidad` y `precio` **sin unidades**: un tier de caja competiría contra unds y el Auto podría asignar precio-de-caja a N unidades.
- `useCarrito.js` — líneas identificadas **solo por `idProducto`** (fusión indiscriminada), `setCantidad` resetea el override a AUTO (línea 76), clamp `cantidad ≤ stock` en base (líneas 52/57/75).
- `ProductoDetalle.jsx` — **sí conserva** el override al cambiar cantidad (línea 39, "igual que el sistema viejo"); clamp `max(Math.max(stock,1))`; `PrecioSelector` etiqueta `TIPO _ Q precio (mín. N)` sin unidad.
- Cobro: **dos caminos con la misma forma de payload** — online `supabase.rpc('registrar_venta', params)` (`POSPage.jsx:251`) y Offline-First `registrarVentaLocal` (`POSPage.jsx:281` → `ventaLocalService.js`); ambos envían `p_items: [{id_producto, cantidad, id_precio_producto}]` **sin precio** (el servidor relee precios: `spec.md:97/138`) y validan/descuentan stock en base.
- `ventaLocalService.js:85/128` — `stock < yaUsado + cantidad` y `stock −= cantidad` (base). `pendienteService`/`cotizacionOfflineService` reutilizan la misma forma de items (`{id_producto, cantidad, id_precio_producto, subtotal}`); `historialOfflineService.js:214` calcula `unitario = subtotal / cantidad`.

**Modelo elegido — la presentación es un tier:** toda venta referencia `id_precio_producto` y el servidor hace `precio × cantidad`, así que cada presentación **debe** ser un tier con su propio precio (`CAJA · Q110.00`), su `id_unidad_venta` (el campo ya existe y ya se captura en `ModalPrecios.jsx`) y un **`factor` nuevo = unidades base por 1 unidad de venta**. Un tier con `factor = 1` es un tier normal: los productos sin presentaciones quedan intactos. Si el precio de caja se derivara de `precio_und × 12`, el dinero no sería exacto en centavos enteros (Q110/12) — por eso precio por presentación es obligatorio, no derivado.

## Decisiones de diseño

- **D1 — Factor por tier (por producto):** `precio_producto.factor integer NOT NULL DEFAULT 1 CHECK (factor >= 1)`. `unidades.equivalencia` queda solo como **default al capturar** la unidad en `ModalPrecios` (fuente de verdad = el factor del tier).
- **D2 — Unidad coherente siempre:** la `cantidad` de una línea cuenta en la unidad del tier seleccionado. El modo **Auto solo compite entre tiers base (factor = 1)**. Si un producto solo tiene tiers de presentación, Auto cae al primero de ellos (cantidad = 1 caja).
- **D3 — Payload sin cambios de forma:** `p_items` sigue `{id_producto, cantidad (en unidades del tier), id_precio_producto}`; el subtotal `precio × cantidad` ya es correcto. Solo el **stock** se convierte: cliente `floor`, servidor exacto (`× factor`).
- **D4 — Stock siempre en base:** inventario, compras, traslados e InventarioPage no cambian. Clamp cliente `maxCantidad = floor(stock / factor)`; servidor `stock ≥ cantidad × factor`.
- **D5 — Identidad de línea:** clave `(idProducto, unidad del tier)` — **no** se fusionan líneas de distinta unidad (2 Cajas + 5 und = 2 líneas).
- **D6 — Override en edición:** al cambiar cantidad **se conserva** el override si su tier es presentación (con AUTO se cambiaría de unidad a mitad de edición); los tiers base mantienen el reset a AUTO de hoy. (`ProductoDetalle` ya conserva; el cambio es en `useCarrito.setCantidad`/fusión.)
- **D7 — SQL con el usuario:** el patch se entrega en bloques para el editor de SQL (no vive en repo, `spec.md:65`); la Task 1 levanta primero `pg_get_functiondef` de las funciones a tocar.

## RF-P1 — SQL de servidor (Task 1)

1. Sondeo (solo lectura, lo corre el usuario): `pg_get_functiondef` de `registrar_venta`, `anular_venta`, `upsert_precio_producto`, `get_productos_admin`, `registrar_cotizacion` (y `registrar_pendiente` si toca stock). El usuario pega el resultado.
2. Patch según el sondeo:
   - `ALTER TABLE precio_producto ADD COLUMN factor integer NOT NULL DEFAULT 1 CHECK (factor >= 1);`
   - `upsert_precio_producto` + parámetro `p_factor` (default 1) en INSERT/UPDATE.
   - `registrar_venta`: unir tier → factor; validación y descuento de stock `cantidad × factor` (**totales siguen `precio × cantidad`**, sin tocar el cálculo de dinero).
   - `anular_venta`: reversión de stock `cantidad × factor`.
   - `get_productos_admin`: incluir `factor` en las filas de precios (la hidratación lo propaga a Dexie **sin cambios de schema** — `precios` viaja anidado en la fila de producto).
   - Solo si el sondeo lo exige: `registrar_cotizacion`/`registrar_pendiente` con la misma conversión de stock.
3. Verificación: REST `precio_producto?select=factor` → 200; tier con factor creado desde la UI y visible en el POS.

Garantías: `DEFAULT 1` ⇒ ventas/tiers históricos y productos sin presentaciones **no cambian de significado**.

## RF-P2 — Admin: captura de factor (Task 2)

- `ModalPrecios.jsx`: campo **Factor** — entero ≥ 1, default 1; visible/obligatorio cuando hay `id_unidad_venta`; auto-relleno desde `unidades.equivalencia` al elegir la unidad (si trae valor); etiqueta "Unidades base por 1 unidad de venta". Guard envía `p_factor`.
- Validación: vacío / 0 / negativo / decimal → error **sin cerrar** el modal (el contenedor es dueño del toast, patrón `Empresas.jsx`).
- Listado de tiers del producto: mostrar unidad/factor — `CAJA · desde 1 · x12 und`.
- Alta/edición/eliminación existentes siguen funcionando sin presentaciones (regresión).

## RF-P3 — Núcleo POS (Task 3)

- `precioUtils.js`: helpers `factorDe(tier)` (= `tier.factor || 1`), `esPresentacion(tier)`, `maxCantidad(stock, factor) = Math.floor(stock / factor)`; `precioNormal/precioAuto` filtran a tiers base con fallback D2; `calcularTier` conserva contrato (override → ese tier; null → Auto).
- `PrecioSelector.jsx`: etiquetas con presentación — `CAJA · Q110.00 (1 Caja = 12 und)`; la opción Auto solo compite en tiers base.
- `useCarrito.js`: clave de línea `(idProducto, unidad)` (D5); `setCantidad` con regla D6; fusión solo misma unidad (distinta → línea nueva); clamps con `maxCantidad`; `recalc` siempre coherente tier↔unidad.
- `ProductoDetalle.jsx`: clamp por la unidad del tier (`max` y `cambiarCantidad`); si `maxCantidad < 1` para la presentación elegida → Agregar deshabilitado con aviso ("Stock insuficiente para 1 Caja: requiere 12 und, hay 5"); al cambiar de tier se conserva el número y se recorta al nuevo máximo.
- `CarritoFila.jsx`: muestra la unidad (`×12 und` o su abreviatura) junto al precio unitario; `max` y botones ± respetan `maxCantidad`.
- Datos: `factor` llega en `producto.precios` (Dexie sin cambios); catálogo viejo sin `factor` → `factorDe` = 1.

## RF-P4 — Cobro, offline y anulación (Task 4)

- `ventaLocalService.registrarVentaLocal`: validación `stock ≥ yaUsado + cantidad × factor` con mensaje de ambas unidades ("solo tiene 5 und; vendes 1 Caja (12 und)"); descuento `− cantidad × factor`; `detalle_venta.cantidad` queda en unidades del tier; `p_items` sin cambios de forma.
- Vía online (`POSPage.jsx:251`) y replay de cola (`colaSyncService`): payload idéntico → la conversión la hace el servidor (RF-P1).
- Pendientes (`pendienteService` + `useCarrito.loadItems`): ítems pasan tal cual (subtotal ya en la unidad del tier); al restaurar se conserva el tier vigente si sigue en el catálogo.
- Cotizaciones (`cotizacionOfflineService`): conflicto de stock `servidor.stock < cantidad × factor` y adopción de stock con `floor(stock / factor)` (mín. 1); dinero sin cambios (subtotal = precio × cantidad ya es correcto).
- Historial/espejo local: `unitario = subtotal / cantidad` queda coherente (precio por caja); sin cambios de schema.
- Anulación: el revert del servidor es ×factor (RF-P1); verificar que el espejo local no descuadre.

## RF-P5 — Regresión intacta sin presentaciones

Producto solo con tiers base (factor 1): **mismas reglas de hoy** — AUTO resetea al cambiar cantidad en el carrito, fusión por producto, clamps, y los E2E existentes (`test:login|test:reg|test:edit|test:elim`) verdes.

## RF-P6 — Verificación

- `npx eslint <archivos tocados>` → 0 errores; `npm run build` ✓.
- Smokes E2E con el patrón del repo (captura final **siempre en `finally`**, PNG en temp, pre-run `taskkill` de msedge/msedgedriver): login, venta con presentación online y offline, edit, elim, anulación; stock post-venta y post-anulación verificado.
- Checklist de criterios de aceptación con captura.

## Criterios de aceptación

1. **Admin:** crear tier `CAJA` con unidad Caja, factor 12, precio Q110.00 → se guarda, se lista con `x12 und` y aparece en el POS.
2. **POS:** al elegir CAJA la cantidad cuenta **cajas**, subtotal = `11000 × N` centavos, máximo `floor(stock/12)`; volver a AUTO regresa a unidades.
3. **Cobro con 2 Cajas (stock 24):** stock queda en 0; venta local + replay servidor sin `CONFLICT`; Historial muestra `2` a Q110.00 = Q220.00.
4. **Stock insuficiente:** 3 Cajas con 24 und → rechazo en el cliente **y** en el servidor.
5. **Auto seguro:** Auto nunca selecciona tier de presentación; producto con tiers base + caja sigue vendiendo unds en AUTO.
6. **Offline:** venta con presentación sin red → cola → push → SIN conflicto de stock (factor bien convertido).
7. **Anulación:** revierte stock exacto (24 und).
8. **Regresión:** producto sin presentaciones se comporta igual (smokes existentes verdes).
9. Lint 0 errores/0 warnings en archivos tocados y build ✓.

## Fuera de alcance / limitaciones conocidas

- Tabla global de conversiones nueva: **no** — `unidades.equivalencia` queda como seed default; la fuente de verdad es `precio_producto.factor` (decisión del usuario: por presentación del producto).
- Stock por bodega (módulo 4) y combos como producto (módulo 3).
- "Unidades vendidas" en reportes/dashboard suma `detalle.cantidad` → contará **unidades de presentación** (2 Cajas = 2). Limitación documentada; ajuste posterior opcional.
- Cambios a `registrar_cotizacion` solo si el sondeo demuestra que toca stock.
- `spec.md` no se edita aquí (nota en `memory.md`: `spec.md:90` está desactualizado).
