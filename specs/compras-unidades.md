# Spec: compras-unidades (compras con selector de unidad por línea)

Fecha: 2026-10-10. Estado: propuesta (pendiente aprobación).
Predecesores: `conversiones-presentaciones` (tiers con `id_unidad_venta` + `precio_producto.factor`), `traslados-unidades` (mismo patrón de factor por línea).

## Problema

Las compras registran `detalle_compra.cantidad` como entero "a secas". Si el usuario compra **4 cajas de crayones (12 und)** y escribe 4, el stock suma **4 piezas en vez de 48** — porque `registrar_compra` incrementa stock con `cantidad` sin convertir. El usuario debe andar calculando piezas a mano. Mismo problema que se resolvió en POS/traslados con el selector de unidad (Unidad/Caja/Paquete) por línea.

## Alcance

- **UI Nueva compra:** por línea, si el producto tiene presentaciones (tiers con `factor > 1`), mostrar selector **Unidad** (Unidad ×1 + presentaciones). Cantidad capturada **en esa unidad**; equivalencia visible (`1 CAJA = 12 und. base`); precio capturado **por la unidad de compra** (como factura el proveedor: Q15 por caja).
- **Stock en base:** al registrar, el stock de la sucursal incrementa **`cantidad × factor`** piezas (local y servidor). Total de la compra = `Σ cantidad × precio_unitario` (por unidad de compra, en centavos — dinero sin cambios).
- **Anulación:** revierte exactamente las mismas piezas base (factor guardado en el detalle).
- **Offline-First:** el factor se resuelve **localmente** desde Dexie (`db.productos[].precios` o `db.precio_producto`) usando el patrón `resolverTierLocal` de `trasladoService.js`; sin red la compra se registra igual (<2 s) y la cola empuja `id_precio_producto` (el servidor resuelve el factor — nunca confía en el cliente).
- **Lista / detalle de compra:** mostrar línea como `4 CAJA (48 und) × Q15.00`.
- **Fuera de alcance:** `entradas` de inventario **no se tocan** (siguen siendo ajustes manuales con motivo; las compras ya suman stock, las entradas corrigen desvíos).

## Requerimientos funcionales

- **RF-UC1 (Selector por línea):** en "Nueva compra", al elegir producto con presentaciones aparece el selector de Unidad; sin presentaciones el flujo es idéntico al actual. Máximo por línea: `floor((stock_base_actual + sumas previas de la misma compra en base)…)` no aplica (compras AGREGAN stock; no hay techo), sí validación `cantidad ≥ 1` entera.
- **RF-UC2 (Stock en base):** `registrarCompraLocal` incrementa `productos_sucursal.stock` en `cantidad × factor`; el detalle local y remoto guarda `id_precio_producto` + `factor` (foto, como en traslados).
- **RF-UC3 (Servidor resuelve factor):** `registrar_compra` acepta `id_precio_producto` opcional por línea; si viene, resuelve `factor` desde `precio_producto` (audita `id_sucursal` de la compra), guarda `factor` y suma `cantidad × factor` al stock. Líneas viejas/`factor NULL` → 1 (comportamiento actual intacto). `anular_compra` revierte `cantidad × (factor || 1)`.
- **RF-UC4 (Sync):** la cola de compras pendientes sube `id_precio_producto`; el servidor valida que el tier pertenece al producto (si no, rechaza la línea o usa factor 1 — decisión en SQL: rechazar con mensaje).
- **RF-UC5 (UX):** línea en el carrito de compra muestra unidad y base; total de compra igual que ahora (Σ línea).

## Datos / SQL

- `detalle_compra` gana: `id_precio_producto uuid NULL` (sin FK obligatoria, como en `detalle_traslado`), `factor integer NULL DEFAULT 1 CHECK (factor >= 1)`.
- `CREATE OR REPLACE registrar_compra(...)`: misma firma; en el bucle de items acepta `id_precio_producto` opcional, resuelve factor (auditoría de sucursal), calcula `cantidad_base = cantidad × factor`, inserta detalle con factor y **suma stock por `cantidad_base`**. `total` sigue recibido del cliente (Σ en unidades de compra).
- `CREATE OR REPLACE anular_compra(...)`: reversión de stock por `cantidad × (factor || 1)`.
- RPC de listado de compras: incluir `factor` + `id_precio_producto` en el jsonb de detalle (para pintar la lista).
- **Bloqueado en usuario:** se necesitan los `pg_get_functiondef` actuales de `registrar_compra`, `anular_compra` y el RPC de listado (`get_compras` o como se llame) para entregar los `CREATE OR REPLACE` completos (patrón pos-ux Task 3). Los ALTERs se entregan de una.

## Decisiones

- **D1 — Precio por unidad de compra:** el `precio_unitario` de la línea es el de la unidad elegida (Q15 por CAJA). No se guarda precio por pieza derivado (si se necesita costo/px para reportes, se deriva `precio/factor` en consulta).
- **D2 — Factor resuelto en servidor:** igual que traslados: el cliente manda `id_precio_producto`; el servidor resuelve y guarda el factor.
- **D3 — Merge de líneas:** mismo `(id_producto, id_precio_producto)` — 2 CAJA + 3 UNIDAD del mismo producto son dos líneas separadas.
- **D4 — Ingredientes (modo comida):** el selector aplica a **productos**; las líneas de ingrediente de compra (`id_ingrediente`) quedan como están por ahora.
- **D5 — Entradas manuales:** no se enlazan compras↔entradas (las compras ya suman stock; enlazarlas duplicaría).

## Validación

1. Producto con tier CAJA ×12: compra 4 CAJA → stock local +48 al instante; lista muestra `4 CAJA (48 und)`.
2. Mismo producto en otra sucursal (misma empresa) no cambia.
3. Sin red: misma compra <2 s, evento PENDING; al reconectar sube con `id_precio_producto` y el servidor suma 48.
4. Anular compra: stock revierte 48.
5. Línea sin unidad (base): comportamiento idéntico al actual (factor 1, `id_precio_producto` null).
