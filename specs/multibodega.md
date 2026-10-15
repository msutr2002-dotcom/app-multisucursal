# Spec: Multibodega — Bodegas dentro de sucursal

**Fecha:** 2026-10-13 · **Estado:** pendiente de aprobación · **Módulo:** `multibodega`

## Problema (D1)

Hoy el stock se maneja a **un solo nivel**: sucursal (`productos_sucursal` con PK `[id_sucursal+id_producto]`). Una sucursal con bodega principal, trasera, vitrina, etc. no puede dividir su stock. El POS vende del total de la sucursal sin control de origen.

## Objetivo (D2)

Cada sucursal tendrá **varias bodegas** (principal, trasera…) con stock dividido. El POS vende desde una bodega elegida; compras/entradas reciben en bodega elegida; traslados mueven stock **entre bodegas de la misma sucursal** y **entre sucursales** (con bodega origen/destino). El inventario filtra por bodega específica.

## Decisiones de diseño (D)

### D3 — Tablas nuevas (SQL)

```sql
-- Bodegas por sucursal
CREATE TABLE bodega (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_sucursal UUID NOT NULL REFERENCES sucursal(id),
  name TEXT NOT NULL,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activa BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(id_sucursal, name)
);

-- Stock por bodega (unidades base)
CREATE TABLE stock_bodega (
  id_bodega UUID NOT NULL REFERENCES bodega(id),
  id_producto UUID NOT NULL REFERENCES productos(id),
  stock INTEGER NOT NULL DEFAULT 0,
  stock_minimo INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (id_bodega, id_producto)
);
```

`productos_sucursal` **se conserva** como caché del stock TOTAL (suma de bodegas) para compatibilidad con el código existente (dashboard, reportes, RPCs viejos).

### D4 — Migración (una sola vez)

Al ejecutar el SQL:
1. Para cada sucursal que tenga filas en `productos_sucursal`, crear una bodega **"Principal"** (`es_principal = true`).
2. Copiar cada fila `productos_sucursal.{stock, stock_minimo}` a `stock_bodega` apuntando a la bodega Principal de esa sucursal.
3. `productos_sucursal` queda intacto (caché).

### D5 — Store Dexie v10

```js
db.version(10).stores({
  bodegas: 'id, id_sucursal, name',
  stock_bodega: '[id_bodega+id_producto], id_producto',
})
```

### D6 — Selector de bodega en POS (flujo aprobado)

- **Default:** bodega `es_principal = true` de la sucursal del dispositivo — el cajero **no elige nada** en el 95% de las ventas (flujo más rápido).
- **Cambio manual:** dropdown visible en el POS (cabecera o PanelPago) para cambiar a otra bodega cuando se necesita vender de ella.
- **Persistencia:** `localStorage.bodegaSeleccionada` (id de bodega); si no existe o no es válida → bodega Principal.
- **Al cambiar de bodega:** rehidrata el stock visible en el carrito y el catálogo (re-llena `productos[].stock[]` desde `stock_bodega` de la bodega elegida).
- **Venta:** `registrarVentaLocal` descuenta de `stock_bodega` de la bodega seleccionada. Se mantiene el guard de stock contra la bodega elegida.
- **Offline-first:** la bodega se resuelve localmente; sin red no hay cambio.

### D6b — Panel de stock por producto en POS

El componente `ProductoDetalle.jsx` (panel "En Tienda | Otras Bodegas") se actualiza para mostrar el **desglose por bodega de la misma sucursal**:

```
┌─────────────────────┬──────────────────────┐
│  En Bodega Principal │  Otras Bodegas       │
├─────────────────────┼──────────────────────┤
│  Disponible: 6      │  2  Trasera           │
│  Otras ventas: 0    │  1  Vitrina           │
│  En tránsito:       │                       │
└─────────────────────┴──────────────────────┘
```

- **Columna izquierda ("En Bodega X"):** stock de la bodega seleccionada actualmente en el POS + otras ventas del producto en la sesión + en tránsito.
- **Columna derecha ("Otras Bodegas"):** stock de las demá bodegas de la **misma sucursal** (nombre de bodega + cantidad).
- El panel de **otras sucursales** (el actual) se mantiene como sección separada o se fusiona debajo.
- Los datos vienen de `stock_bodega` (hidratado localmente).

### D7 — Compras / Entradas

- El formulario de compra y de entrada gana un **selector de bodega** (default: Principal).
- `registrarCompraLocal` suma stock a `stock_bodega` de la bodega elegida (además de actualizar `productos_sucursal` como caché).
- `registrarEntradaLocal` igual: suma a la bodega elegida.

### D8 — Traslados (internos + entre sucursales)

- **Internos (misma sucursal):** nuevo tipo `traslado_interno` — origen y destino son bodegas de la misma sucursal. Se registra y acepta en el dispositivo (sin red requerida, es una operación local).
- **Entre sucursales (existente):** se extiende con `id_bodega_origen` y `id_bodega_destino` opcionales. Si no se especifica bodega → se usa la Principal de cada sucursal (compatibilidad).
- La UI de Traslados gana un selector de bodega origen y destino.
- El stock se descuenta/suma en `stock_bodega` correspondiente.

### D9 — Inventario

- `InventarioPage.jsx` gana un **dropdown de bodega** (default: Principal).
- Siempre muestra el stock de **una bodega específica** (no el total).
- El badge de stock bajo evalúa `stock_bodega.stock <= stock_bodega.stock_minimo`.
- El selector de bodega se agrega a la vista (arriba de la tabla).

### D10 — RPCs Supabase

| RPC | Props | Descripción |
|---|---|---|
| `get_bodegas(p_id_sucursal)` | `p_id_sucursal` | Lista bodegas activas de la sucursal |
| `create_bodega(p_id_sucursal, p_name, p_es_principal)` | — | Crea bodega (solo admin) |
| `update_bodega(p_id, p_name, p_es_principal, p_activa)` | — | Actualiza bodega (solo admin) |
| `get_stock_bodega(p_id_bodega)` | `p_id_bodega` | Stock de una bodega (productos habilitados) |
| `upsert_stock_bodega(p_id_bodega, p_id_producto, p_stock, p_stock_minimo)` | — | Ajuste manual de stock (admin) |
| `registrar_traslado_interno(p_id_bodega_origen, p_id_bodega_destino, p_items, p_motivo)` | — | Traslado interno (sin red requerida) |
| `aceptar_traslado_interno(p_id_traslado, p_items_recibidos)` | — | Acepta traslado interno |

Los RPCs existentes (`registrar_venta`, `registrar_compra`, `registrar_entrada`) se **extienden** con `p_id_bodega` opcional. Si no se envía → Principal (compatibilidad con clientes viejos).

### D11 — Admin de bodegas

- CRUD de bodegas en `src/views/admin/` (nueva vista o sección dentro de Sucursales).
- Permite: crear, editar nombre, marcar/desmarcar Principal, desactivar.
- Solo una bodega Principal por sucursal (al marcar una, se desmarcan las demás).
- Guard: no desactivar la bodega Principal.

### D12 — Compatibilidad y rollback

- `productos_sucursal` sigue funcionando como caché (dashboard, reportes, RPCs viejos no se rompen).
- Si un RPC recibe `p_id_bodega` → usa `stock_bodega`; si no → usa `productos_sucursal` (Principal).
- Los clientes viejos (sin selector de bodega) venden de la Principal por defecto.

## Fuera de alcance

- Conteo cíclico / auditoría de bodegas.
- Traslados con unidades de presentación (módulo `traslados-unidades` aparte).
- Permisos específicos por bodega (los permisos actuales por módulo/acción se mantienen).

## Criterios de aceptación

- C1: Cada sucursal tiene al menos una bodega "Principal" tras la migración.
- C2: El POS permite elegir bodega y el stock se descuenta de esa bodega.
- C3: Compras y entradas reciben stock en la bodega elegida.
- C4: Traslados internos mueven stock entre bodegas de la misma sucursal.
- C5: Traslados entre sucursales soportan bodega origen/destino.
- C6: Inventario filtra por bodega específica.
- C7: Admin puede crear/editar/desactivar bodegas.
- C8: Sin red, el POS vende de la bodega seleccionada (offline-first).
- C9: `productos_sucursal` se mantiene como caché (dashboard y reportes no se rompen).
- C10: lint 0 en archivos tocados + build ✓.
