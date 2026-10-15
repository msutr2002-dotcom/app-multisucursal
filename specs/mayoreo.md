# Spec: Módulo Mayoreo (descuento % por cliente)

## Contexto
Hereda de `specs/clientes.md`. Cada cliente por sucursal puede tener un descuento mayorista (`descuento_bp`, centésimas de porcentaje: 10% = 1000). El descuento se aplica al **total de la venta** cuando el cliente está **enlazado** (`id_cliente` presente en la venta). Los clientes casual (sin perfil) y heredados no tienen descuento. Money: centavos enteros siempre.

## Decisiones cerradas (2026-10-12)
- **D1 Ticket:** productos a precio normal + línea "Descuento mayoreo (X%) −Qn" al final. `detalle_venta` **no cambia** (subtotales full); la cabecera de `ventas` guarda `descuento_bp` y `descuento_monto`.
- **D2 Alcance:** % sobre el total de la venta; sin exclusiones (mayoreo v2 puede añadirlas).
- **D3 Redondeo:** un solo redondeo por venta: `descuento_monto = round(total_full * descuento_bp / 10000)` en centavos (misma fórmula cliente y servidor → sincronía offline exacta).
- **D4 Autorización:** el % se edita en el modal de Clientes con permiso `clientes:editar` (Admin bypass incluido). Rango 0–100% (bp 0–10000); input en % con 1 decimal.
- **D5 Heredados:** no editables (regla de clientes) → descuento siempre 0; no aparecen en ClientesPage.
- **D6 Camino crítico ≤2s:** cálculo 100% local (Dexie lleva `descuento_bp`); sin RPC extra en el cobro.
- **D7 Sync:** `registrar_venta` con `p_id_cliente` **recalcula el descuento en el servidor** desde la BD (no confía en el cliente offline); total final se corrige en sync si el bp local estaba stale.
- **D8 Fuera de alcance v1:** cotizaciones y pendientes no aplican descuento; reportes de mayoreo (quién compró en mayoreo, ranking); listas de precios por tier; exclusiones producto/categoría.

## RF-MY1–7
- RF-MY1: `clientes.descuento_bp integer NOT NULL DEFAULT 0 CHECK (0..10000)`; `upsert_cliente_admin` acepta `p_descuento_bp`; `get_clientes` lo devuelve.
- RF-MY2: ClientesPage modal: campo "Descuento mayoreo %" (number, 0–100, step 0.1); lista muestra badge "10%" cuando > 0.
- RF-MY3: Dexie `clientes` lleva `descuento_bp` (hidratación en login/POS); `leerClientesLocal` lo expone.
- RF-MY4: PanelPago: al resolver un cliente enlazado con bp > 0, `ResumenPago` muestra fila "Descuento mayoreo (X%)" en verde/negativo y total a cobrar rebajado; se envía `descuentoBp` al cobrar (local) y se resetea al borrar cliente o vender.
- RF-MY5: `registrarVentaLocal` acepta `descuentoBp`; calcula `descuento_monto` sobre el total full; guarda `descuento_bp`/`descuento_monto` en la fila de `ventas`; total final = full − descuento. Cola de sync envía solo `p_id_cliente` (el servidor recalcula).
- RF-MY6: `registrar_venta` (server): con `p_id_cliente`, busca `descuento_bp` del cliente (0 si null); total = sum(subtotales full) − `round(total * bp / 10000)`; persiste `descuento_bp`/`descuento_monto`; `get_venta_detalle` los devuelve para el ticket.
- RF-MY7: Comprobante (online y local) imprime la línea "Descuento mayoreo (X%) −Qn" cuando `descuento_monto > 0`.

## Validación (E2E Task 6 mayoreo)
- Cliente con 10% + venta enlazada Q100 → total Q90, venta con `descuento_bp=1000`, `descuento_monto=1000`; ticket con línea de descuento; stock y detalle sin cambios.
- Misma venta casual → total full, descuento 0.
- Cliente con 0% → comportamiento idéntico al actual.
- Redondeo: total Q19.99 con 10% → descuento Q2.00 (round half-up en centavos).
- Cambiar el % y vender de nuevo → usa el % nuevo.
