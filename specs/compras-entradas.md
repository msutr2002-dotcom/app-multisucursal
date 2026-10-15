# Spec: Módulo de Compras, Entradas de Inventario y Almacenamiento de Comprobantes

## 1. Objetivo

Registrar la compra de mercancía a proveedores y las entradas manuales de inventario de forma Offline-First (IndexedDB primero, sincronización posterior), incrementando el stock de la sucursal activa, y persistir los comprobantes (emitidos por ventas y archivos adjuntos de compras) en la tabla `comprobante` de Supabase con espejo local para su consulta sin red.

**Estado de la BD (sondeo 2026-10-02, solo lectura):** las tablas base **ya existen vacías**, sin ningún RPC asociado:

| Tabla | Columnas confirmadas por sondeo |
| --- | --- |
| `compras` | `id`, `id_sucursal`, `id_proveedor`, `id_usuario`, `fecha`, `total`, `estado` |
| `detalle_compra` | `id`, `id_compra`, `id_producto`, `cantidad`, `precio_unitario`, `sub_total` |
| `entradas` | `id`, `id_producto`, `cantidad`, `id_usuario` |
| `comprobante` | `id`, `id_venta`, `id_cliente`, `tipo`, `numero`, `estado`, `fecha_emision` |

Notas del sondeo: no existe `comprobantes` (plural) ni `orden_compra`/`movimientos_inventario`; el catálogo de proveedores vive en `proveedor` (singular, ya con CRUD vía `upsert_catalogo`); no existen `id_empresa` ni `created_at`, ni columnas de contenido/adjunto. **Task 1 completada (2026-10-02):** el SQL del usuario + sondas de error confirmaron que las 4 tablas están **vacías**, el dinero es `integer` (centavos) en `compras.total` y `detalle_compra`, las FKs y los enums completos, y `usuarios.name`/`proveedor.name`/`productos.name` para los JOINs → el SQL definitivo (ALTERs + RPCs) quedó en `tasks/compras-entradas-tasks.md` (Task 1b).

## 2. Requerimientos Funcionales

- **RF-C1 (Registro de compra offline-first):** Registrar una compra (proveedor + líneas de producto + total) **primero en IndexedDB** en una transacción única que además incremente el stock local de `productos_sucursal` y encole el evento con `sync_status: 'PENDING'`. La UI nunca espera a Supabase.
- **RF-C2 (Entradas de inventario):** Ajuste manual de stock por producto con cantidad, motivo y usuario, con el mismo flujo local→cola→sync que la compra (incremento o decremento según signo).
- **RF-C3 (Sincronización):** Al haber red (`redService.hayRed()`), la cola sube compras/entradas pendientes a RPCs nuevos (`registrar_compra`, `registrar_entrada`) etiquetados con su `id_sucursal`; los rechazos de negocio (stock, permisos) se marcan `CONFLICT` y se muestran, los de red quedan `PENDING`.
- **RF-C4 (Almacenamiento de comprobantes en `comprobante`):**
  - Venta emitida → fila `{id_venta, tipo: 'nota_venta', numero: folio, estado}` (decisión Task 1: el enum real `tipo_comprobante` no tiene label `venta`; compra → `factura`).
  - Compra con archivo adjunto (factura/foto del proveedor, PDF o imagen, capturado vía `FileReader` → base64 con límite de tamaño) → fila vinculada a la compra; **requiere ALTER** (ver Task 1) porque hoy `comprobante` no tiene `id_compra` ni columna de contenido.
- **RF-C5 (Consulta offline de comprobantes):** Espejo local del comprobante (venta y compra) para previsualizarlo e imprimirlo sin red; el comprobante armado desde datos locales lleva la marca de agua y leyenda existente **"PENDIENTE DE SINCRONIZACIÓN FISCAL"** (reutilizar `MarcaAguaComprobante`).
- **RF-C6 (UI Compras y Entradas):** Una sola ruta `#/compras` con pestañas **Compras** (lista + "Nueva compra" con selector de proveedor del catálogo local, líneas con cantidad × precio_unitario, total en centavos, adjunto opcional) y **Entradas** (lista + "Nueva entrada" con producto, cantidad y motivo). Lectura local primero; sin red banner de solo-lectura-local y alta permitida; con red refresco desde RPC.
- **RF-C7 (Permisos):** Módulo `compras` con acciones `ver|crear|editar|eliminar`, cableado en los 5 puntos obligatorios (`routes.js`, `_nav.jsx`, `useNavPermissions.MODULOS`, `ModalPermisos.MODULOS`, `RolesCard.MODULOS`).

## 3. Modelo de Datos Local (IndexedDB / Dexie)

Nuevo bump de versión (`db.js` **v6**):

- `compras`: `'id, id_sucursal, id_proveedor, fecha, estado, sync_status'` (snapshot de líneas embebido no indexado para el ticket offline).
- `detalle_compra`: `'id, id_compra'`.
- `entradas`: `'id, id_producto, id_sucursal, fecha, sync_status'`.
- `comprobante_cache`: `'id_venta, id_compra, tipo'` (espejo del comprobante para render offline; contenido base64 no indexado).

Reglas: `snake_case` solo entre comillas (índices/columnas); dinero **siempre en centavos enteros** en todas las tablas locales y en `compras.total`/`detalle_compra.precio_unitario`/`sub_total` (tipo real confirmado en Task 1: `integer` centavos); ids UUID locales generados con el patrón existente.

## 4. RPCs / SQL requerido (aplicado a mano por el usuario, como todo el SQL del repo)

- `registrar_compra(p_id_sucursal, p_id_proveedor, p_id_usuario, p_total, p_items jsonb, ...)` → inserta compra + detalle + **suma stock** por producto en la misma transacción; devuelve el `id` definitivo (remapeo del id local, patrón ya usado por ventas).
- `get_compras(...)` → lista paginada por sucursal (mismo patrón que `get_ventas_historial`).
- `registrar_entrada(p_id_sucursal, p_id_producto, p_cantidad, p_motivo, p_id_usuario)` → inserta entrada + ajusta stock.
- `get_entradas(...)` → lista paginada por sucursal.
- `guardar_comprobante(...)` → upsert del comprobante (venta o compra) con su contenido.
- `anular_compra(p_id, p_id_sucursal, p_id_usuario, p_motivo)` → anulación lógica (`estado = 'anulada'`) con reversión de stock (decisión Task 1b: la UI "eliminar" es anulación soft-delete, sin `DELETE` físico, para conservar el historial y las FK).
- `ALTER TABLE` finales (Task 1b): `entradas` + `id_sucursal` (NOT NULL, FK a `sucursal`), `fecha`, `motivo`; `comprobante` + `id_compra` (FK a `compras`), `id_sucursal` (FK), `contenido` (text base64); `compras` + `fecha_anulacion`, `motivo_anulacion`, `id_usuario_anula` (espejo del ALTER que `ventas` ya tiene).

## 5. Reglas Inviolables (Constitución)

- **Art. II:** toda fila lleva `id_sucursal` de la sucursal activa (`empresaSeleccionada`); primero IndexedDB, sin bloqueos por red; cola con `sync_status`.
- **Art. III:** dinero en centavos + `formatQ()`; anon key únicamente.
- **Art. IV:** solo CoreUI/Bootstrap; iconos de `@coreui/icons` verificados en terminal antes de usar; alertas de stock bajo `stock <= min_stock` al mostrar productos (las compras/entradas suben stock, reevaluar el umbral).
- **Art. V:** actualizar los 5 puntos de configuración al crear el módulo.

## 6. Fuera de Alcance (esta iteración)

- Devoluciones/mermas con flujo propio, descuentos e impuestos por línea, órdenes de compra con estados multi-aprobación.
- Facturación electrónica SAT (hasta que exista API, nada impreso es fiscal).
- Conversión automática compra→venta o inventario valorizado.

## 7. Criterios de Aceptación Globales

1. Con la red cortada se puede crear una compra y una entrada: en <2 s quedan visibles, el stock local sube y ambos aparecen con `PENDING` en la cola.
2. Al volver la red, la cola los sube (remapeo de ids) y la lista con red los muestra sin duplicados.
3. El comprobante de una venta emitida queda registrado en `comprobante`; el adjunto de una compra queda vinculado y **previsualizable offline** desde IndexedDB con la leyenda de pendiente cuando corresponda.
4. Un usuario sin permiso `compras/ver` no ve el módulo ni puede entrar por URL (y sin flash de admin al recargar).
5. `npm run build` y lint de los archivos tocados en 0.
