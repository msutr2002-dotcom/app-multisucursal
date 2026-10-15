# Spec: Stock bodega como fuente de verdad (stock/bodega consistente)

**Fecha:** 2026-10-14 · **Estado:** pendiente de aprobación · **Módulo:** `stock-bodega-fuente-verdad`

## Problema (D1)

Tras el módulo `multibodega` quedaron **dos modelos de stock desincronizados**:

- **`stock_bodega`** (por bodega): es de donde **vende el POS** (`registrarVentaLocal` con `idBodega`, `ventaLocalService.js:108-139`) y de donde **lee el Inventario** cuando hay bodega seleccionada (`InventarioPage.jsx:95`).
- **`productos_sucursal`** (por sucursal): es lo que **escribe el admin** (`upsert_producto_sucursal` desde `ModalStock.jsx`) y lo que devuelve `get_productos_admin`, por lo que es lo que **muestra el POS** (`ProductoDetalle.jsx:26-27` lee `producto.stock` con `es_actual`).

La migración (`multibodega-bloque1.sql:56-85`) copió `productos_sucursal → stock_bodega` **una sola vez**. Después divergen porque:

1. **El servidor nunca vuelve a escribir `stock_bodega`.** Todos los RPC de stock (`registrar_venta` `pos-ux-referencia-venta.sql:143-151`, `registrar_compra`, `anular_compra` `compras-unidades-bloque2.sql:45-48`, etc.) mantienen **solo** `productos_sucursal`. `stock_bodega` únicamente lo toca `upsert_stock_bodega` (que casi nadie llama).
2. **`create_producto_admin` no crea filas de stock** (ni `productos_sucursal` ni `stock_bodega`) → producto nuevo sin stock en ninguna parte.
3. **`upsert_producto_sucursal`** (admin) escribe solo `productos_sucursal`, nunca la bodega.
4. **No se crea bodega al crear una sucursal** (solo la hizo la migración una vez) → sucursales nuevas sin bodega Principal.
5. La hidratación (`hidratarBodegas`) **borra y repuebla** `stock_bodega` local desde `get_stock_bodega` cuando no hay eventos `PENDING` → los descuentos locales por bodega de ventas/compras/entradas se pierden.

### Síntomas reportados (mapeo)

| Reporte | Causa |
|---|---|
| "No se puede vender, stock 0" | POS valida contra `stock_bodega` vacío/desincronizado |
| "Inventario muestra 0" | `InventarioPage` lee `stock_bodega` |
| "Producto nuevo no entra a bodega principal" | `create_producto_admin` no crea filas de stock |
| "Todos ven bodega principal / sucursal sin bodega" | no se crea Principal al crear la sucursal |
| "Al trasladar a bodega principal no aparece el producto" | `TrasladosPage.jsx:261` filtra a productos con fila en la bodega origen |
| "Compra no encuentra el producto" | `ComprasPage.jsx:188` oculta productos sin fila `productos_sucursal` |

## Objetivo (D2)

Hacer **consistente** el stock: el POS, el Inventario, Compras y Traslados deben operar sobre la misma verdad y ver el mismo número, sin tocar los RPC de servidor (cuyo código no vive en el repo). Solución: **la bodega Principal de cada sucursal refleja (`mirror`) `productos_sucursal`**, que ya mantienen todos los RPC. Así `stock_bodega(Principal) === productos_sucursal` siempre, y el POS que vende desde la Principal coincide con lo que muestra el catálogo.

## Decisiones de diseño (D)

### D3 — Principal = espejo de `productos_sucursal`

`productos_sucursal` es la única columna que **todos** los RPC de stock ya actualizan de forma atómica y correcta. En vez de reescribir (sin fuentes) cada RPC para que mueva `stock_bodega`, se agrega un **trigger** que copia `productos_sucursal.{stock, stock_minimo}` a `stock_bodega` de la **bodega Principal** de esa sucursal, en cada `INSERT`/`UPDATE`.

- Efecto: `stock_bodega(Principal)` == `productos_sucursal` (misma verdad, dos vistas).
- El POS vende desde la Principal → display (`productos_sucursal`) y venta (`stock_bodega`) coinciden.
- Bodegas **no-Principal** quedan como **delta local** (traslados internos), no persistidas por el servidor. Limitación documentada en D7.

> Nota de alcance: el texto original de la decisión del usuario era "`productos_sucursal` = caché (suma de bodegas)". La "suma" no es alcanzable hoy porque el servidor no conoce el stock de bodegas no-Principal (ningún RPC lo escribe). Con las bodegas no-Principal siendo locales, **la suma de bodegas que el servidor observa == Principal**, así que `productos_sucursal = Principal` es equivalente al caché de lo que el servidor puede ver.

### D4 — Bootstrap automático (sucursal y producto nuevos)

Triggers para que nunca falte la fila/bodega:

- **`AFTER INSERT ON sucursal`**: crear la bodega **Principal** de la sucursal + filas `stock_bodega` (0) y `productos_sucursal` (0) para todos los productos de su empresa.
- **`AFTER INSERT ON productos`**: para cada sucursal de la empresa, crear su Principal (si falta) + filas `stock_bodega` (0) y `productos_sucursal` (0). Ambos `ON CONFLICT DO NOTHING`.

### D5 — Refinamiento de `upsert_stock_bodega`

Su definición actual pone `productos_sucursal = SUM(bodegas)`, incompatible con el espejo D3 (se retroalimentaría). Se redefine para que, tras el upsert, **`productos_sucursal` solo se actualice cuando la bodega editada es la Principal** (fuente de la verdad). Sin cambios de firma.

### D6 — POS refleja la bodega seleccionada (cliente)

Hoy el POS muestra el stock de la **sucursal** (`producto.stock` con `es_actual`) y vende de `stock_bodega` de la bodega elegida. Con D3 ambos coinciden en la Principal, pero al elegir una bodega **no-Principal** el display quedaría desfasado. Se corrige el POS para que el stock mostrado (detalle, grid de comida y disponibilidad) provenga de `stock_bodega` de **la bodega seleccionada**, con fallback al caché de sucursal cuando la bodega no tenga fila.

### D7 — Alcance y limitaciones

- El espejo garantiza consistencia para la **bodega Principal** (caso por defecto; 95%+).
- Bodegas no-Principal: stock local (traslados internos/compras/entradas con `idBodega`), no sincronizado; **puede resetearse en la hidratación** (comportamiento preexistente, no empeora). No se persiste server-side en este módulo.
- No se toca el modelo Login/empresa ni los bugs laterales (guard borrar Principal, reset de `idBodegaOrigen`, selector oculto con 1 bodega, username case-insensitive) — quedan para un batch posterior.

## Cambios (cliente)

- `src/views/pos/POSPage.jsx`: resolver el stock de la bodega activa desde `db.stock_bodega` (`leerStockPorBodega`) y pasarlo al detalle/grid; al cambiar `bodegaId` recomputar el mapa.
- `src/views/pos/components/ProductoDetalle.jsx` / `ProductosGrid.jsx`: consumir el stock de la bodega activa (prop nueva) con fallback al `producto.stock` de sucursal.
- `src/services/ventaLocalService.js`: sin cambios de lógica (ya vende de `stock_bodega`); solo verificar que el `idBodega` resuelto es el de la bodega activa.

## Server (SQL entregable, no vive en repo)

Archivo `tasks/sql/stock-bodega-fuente-verdad.sql` (idempotente, se aplica en el editor SQL de Supabase):

1. `asegurar_bodega_principal(p_id_sucursal) RETURNS uuid` (idempotente).
2. **Backfill**: para cada sucursal, asegurar Principal; copiar `productos_sucursal.{stock, stock_minimo}` a `stock_bodega` (Principal) y crear filas 0 para productos sin fila.
3. Triggers D4 + el trigger espejo D3 (`AFTER INSERT OR UPDATE ON productos_sucursal`).
4. Redefinición de `upsert_stock_bodega` (D5).

## Fuera de alcance

- Reescribir los RPC de stock para mover `stock_bodega` directamente (requiere fuentes que no están en el repo).
- Persistir stock de bodegas no-Principal en el servidor.
- Bugs laterales listados en D7.

## Criterios de aceptación

- C1: Tras el SQL, cada sucursal tiene una bodega Principal y `stock_bodega(Principal).stock == productos_sucursal.stock` para todo producto con fila.
- C2: Un producto nuevo (creado en admin) aparece con fila `stock_bodega` (0) en la Principal de cada sucursal de la empresa.
- C3: Una sucursal nueva queda con Principal + filas de stock para los productos de la empresa.
- C4: Al fijar stock en el `ModalStock` (admin) el valor se refleja en la Principal y el POS puede vender ese stock.
- C5: El Inventario de la Principal muestra el mismo stock que el POS.
- C6: Con la bodega Principal, Pos muestra/vende el mismo número (sin "stock 0" falso).
- C7: Al seleccionar otra bodega, el POS muestra el stock de esa bodega (D6).
- C8: `registrar_venta`/`registrar_compra`/`anular_compra` siguen funcionando y dejan la Principal consistente (trigger).
- C9: lint 0 en archivos tocados + `npm run build` ✓.

## Riesgos

- **Recursión de triggers:** el trigger espejo escribe en `stock_bodega`, no en `productos_sucursal` → no hay ciclo. `upsert_stock_bodega` redefinido evita el ciclo con la suma (D5).
- **Doble bootstrap:** todos los `INSERT` usan `ON CONFLICT DO NOTHING`.
- **Backfill reconciliador:** solo escribe hacia `stock_bodega` (no borra) y usa `DO UPDATE` para pisar ceros obsoletos con el valor real de `productos_sucursal` (el servidor nunca escribió `stock_bodega`, así que su valor es stale/0). Ese es justamente el arreglo del "stock 0".
