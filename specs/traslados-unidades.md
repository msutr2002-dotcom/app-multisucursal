# Espec: Traslados con unidades/presentaciones

Extiende `specs/traslados-movimientos.md` y `specs/conversiones-presentaciones.md`. El stock sigue estando **siempre en unidades base** (`productos_sucursal.stock`); esta spec solo permite capturar/mostrar cantidades en la unidad del tier de precio (`precio_producto.id_unidad_venta` + `factor`), igual que el POS.

## Alcance
- Líneas de traslado (alta y aceptación) con selector de unidad (tiers del producto: Unidad base + presentaciones Caja/Paquete…).
- Cantidad digitada en la unidad elegida; descuento/suma de stock en base (`cantidad × factor`).
- RPCs y `detalle_traslado` guardan `id_precio_producto` + `factor` por línea (auditable, compatible con líneas viejas = factor 1).
- Offline-First total (cola de sync conserva `id_precio_producto` por línea).
- **Fuera de alcance:** dinero/valorización en traslados; bodegas (módulo multibodega aparte).

## Requisitos funcionales
- **RF-U1 (alta):** en "Nuevo traslado", tras elegir producto se muestra selector de unidad con los tiers del producto del catálogo local (mismo modelo que el POS; reutilizar `PrecioSelector` o su data). Default = Unidad (factor 1).
- **RF-U2 (cantidad en unidad):** la cantidad se captura en la unidad elegida. Máximo permitido = `floor(stockBase / factor)` menos ya usado en otras líneas del mismo producto (en base).
- **RF-U3 (stock mostrado):** el selector de producto sigue mostrando stock base; junto al selector de unidad se muestra la equivalencia (`1 Caja = 12 und`) y el máximo en esa unidad (`Máx: 8 Cajas`).
- **RF-U4 (total):** "Total: N unidades" = Σ (cantidad × factor) en base. En la lista de traslados, cada línea muestra `2 Caja (24 und)`.
- **RF-U5 (aceptación):** el receptor ve las líneas con su unidad; ingresa `cantidad_recibida` en esa misma unidad (0 ≤ recibida ≤ enviada). Stock destino += recibida × factor; origen += (enviada − recibida) × factor (parcial).
- **RF-U6 (anulación):** origen recupera `cantidad_enviada × factor`.
- **RF-U7 (offline):** `detalle_traslado` local lleva `id_precio_producto` + `factor`; cola envía `p_lineas` con `id_precio_producto`; el **servidor resuelve el factor** desde `precio_producto` (nunca confía en el factor del cliente).

## Decisiones
- **D1:** el factor se **persiste** en `detalle_traslado` al registrar (foto del dato) y el servidor valida que el tier pertenece al producto y recalcula `factor` desde `precio_producto` en el momento del RPC.
- **D2:** `aceptar_traslado` y `anular_traslado` **no cambian de firma** — usan el `factor` ya guardado en el detalle (recibida siempre en la unidad de la línea).
- **D3:** líneas viejas (sin `id_precio_producto`) quedan con `factor = 1` → comportamiento idéntico al actual (compat total).
- **D4:** un producto **sin tiers** o con solo Unidad → selector puede quedar oculto/deshabilitado con la unidad base; flujo idéntico a hoy.
- **D5:** el total monetario de la lista de traslados no existe (módulo sin dinero) — solo totales en unidades base.

## Esquema (SQL, lo aplica el usuario)
```sql
ALTER TABLE detalle_traslado
  ADD COLUMN IF NOT EXISTS id_precio_producto uuid REFERENCES precio_producto(id),
  ADD COLUMN IF NOT EXISTS factor integer NOT NULL DEFAULT 1 CHECK (factor >= 1);
```
RPCs: `registrar_traslado` acepta por línea `id_precio_producto` (opcional), resuelve factor, valida `stock ≥ cantidad × factor`, descuenta `× factor` e inserta detalle con factor. `aceptar_traslado`/`anular_traslado`: matemática `× factor` desde el detalle. `get_traslados` retorna `id_precio_producto`, `factor`, `unidad` (join a `unidades`).

## Criterios de aceptación
- Traspasar 2 Cajas (factor 12) descuenta 24 unidades base del origen; la lista dice "2 Caja (24 und)".
- Receptor acepta 1 Caja → destino +12, origen devuelve 12 (parcial).
- Aceptar más de lo enviado → rechazo del servidor.
- Sin tiers: el traslado funciona igual que hoy (factor 1).
- Línea vieja (factor 1) se anula/recibe igual.
- Offline: venta/traslado sin red registra factor en Dexie y sincroniza con id_precio_producto.
- `registrar_traslado` con `id_precio_producto` de otro producto → error del servidor.
