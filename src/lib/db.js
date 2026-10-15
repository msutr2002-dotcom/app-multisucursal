import Dexie from 'dexie'

export const db = new Dexie('PosLibreriaDB')

// Esquema v1 alineado 1:1 con las columnas de Supabase (probes REST 2026-10-01):
// los nombres de store son los de las tablas y los índices, los de las columnas reales.
db.version(1).stores({
  // productos: id, sku, name, id_empresa, id_categoria, id_marca
  productos: 'id, sku, name, id_empresa, id_categoria, id_marca, [id_empresa+sku]',

  // precio_producto: id, id_producto, id_tipo_producto, precio
  precio_producto: 'id, id_producto, id_tipo_producto, [id_producto+id_tipo_producto]',

  // productos_sucursal: id, id_sucursal, id_producto, stock, stock_minimo
  // PK compuesto = clave natural con la que hace upsert el RPC (la respuesta no incluye el id de fila)
  productos_sucursal: '[id_sucursal+id_producto], id_producto',

  // ventas: id, id_sucursal, id_usuario, id_metodo_pago, id_cliente, fecha, total,
  //         cambio, estado, fecha_anulacion, motivo_anulacion, id_usuario_anula
  ventas:
    'id, id_sucursal, id_usuario, id_metodo_pago, id_cliente, fecha, estado, [id_sucursal+fecha], [id_sucursal+estado]',

  // detalle_venta: id, id_venta, id_producto, cantidad, subtotal, id_precio_producto
  detalle_venta: 'id, id_venta, id_producto, id_precio_producto',

  // clientes: id, id_empresa, name, nit
  clientes: 'id, id_empresa, name',

  // Cola local (no existe en Supabase): eventos de sincronización con su estado
  cola_sincronizacion: '++id, tabla, operacion, sync_status, timestamp, intentos',
})

// v2 (Tarea 2.2): métodos de pago cacheados para poder cobrar sin red.
db.version(2).stores({
  metodos_pago: 'id, name',
})

// v3 (Task 1, specs/offline-cotizaciones.md): borradores de cotización sin red.
// Colección local `offline_quotes` (id_sucursal = branch_id del spec).
db.version(3).stores({
  offline_quotes: 'temp_id, id_sucursal, status, receipt_status',
})

// v4 (offline-suite): espejo de solo lectura de `get_cotizaciones` para que
// la lista "Ver cotizaciones" muestre TODAS las cotizaciones (servidor +
// borradores) también sin red. Se reescribe en cada carga online.
db.version(4).stores({
  quote_cache: 'id, id_sucursal, fecha',
})

// v5 (offline-suite Task 4): catálogos secundarios para que los selectores y
// desplegados funcionen sin red.
db.version(5).stores({
  categorias: 'id, id_empresa, name',
  marcas: 'id, id_empresa, name',
  unidades: 'id, id_empresa, name',
  tipos_precio: 'id, id_empresa, name',
  proveedores: 'id, id_empresa, name',
})

// v6 (compras-entradas Task 2): espejo local de compras, entradas y comprobantes.
// Espejo 1:1 de las columnas reales confirmadas en Task 1 (dinero en centavos);
// sync_status alimenta la cola (Art. II). Nota: comprobante_cache lleva `id`
// como PK además de los índices del spec §3 porque IndexedDB rechaza claves
// nulas y id_venta/id_compra puede ser null según el tipo de comprobante.
db.version(6).stores({
  compras: 'id, id_sucursal, id_proveedor, fecha, estado, sync_status',
  detalle_compra: 'id, id_compra',
  entradas: 'id, id_producto, id_sucursal, fecha, sync_status',
  comprobante_cache: 'id, id_venta, id_compra, tipo',
})

// v7 (traslados-movimientos Task 2): espejo local de traslados entre sucursales.
// cantidad_enviada/cantidad_recibida no se indexan; sync_status alimenta la cola.
db.version(7).stores({
  traslados: 'id, id_sucursal_origen, id_sucursal_destino, fecha, estado, sync_status',
  detalle_traslado: 'id, id_traslado, id_producto',
})

// v8 (combos-insumos Task 4/5): ingredientes (modelo dual OFF=productos /
// ON=ingredientes), su stock por sucursal, la receta dual y los flags de
// sucursal (vender_sin_stock / activar_ingredientes) para decidir el modo
// del RecetaForm y el cobro sin red.
db.version(8).stores({
  ingredientes: 'id, id_empresa, name, activo',
  ingredientes_sucursal: '[id_ingrediente+id_sucursal], id_sucursal',
  combo_componentes:
    'id, id_producto, [id_producto+id_producto_componente], [id_producto+id_ingrediente]',
  sucursales: 'id, name',
})

// Facturas-SAT (spec facturas-sat D7): espejo local de las facturas EMITIDAS
// con su payload completo de impresión (folio + detalle de la venta), para
// ver/reimprimir sin red. La emisión siempre es online (correlativo server-side).
db.version(9).stores({
  facturas: 'id, id_sucursal, fecha, [id_sucursal+fecha]',
})

// Multibodega (spec multibodega D5): bodegas dentro de sucursal y su stock.
db.version(10).stores({
  bodegas: 'id, id_sucursal, name',
  stock_bodega: '[id_bodega+id_producto], id_producto',
})

// stock-bodega-fuente-verdad Task 3: se añade el índice `id_bodega` (faltaba)
// para que `leerStockPorBodega` (`.where('id_bodega').equals(...)`) funcione.
// Sin él la query lanzaba SchemaError y el Inventario/POS caían al catch → 0.
db.version(11).stores({
  stock_bodega: '[id_bodega+id_producto], id_bodega, id_producto',
})

// catalogos-colores: catálogo global de colores cacheado para los selectores
// offline (mismo patrón que tipos_precio: id_empresa es solo etiqueta local).
db.version(12).stores({
  colores: 'id, id_empresa, name',
})

export const getLocalDbStatus = async () => {
  const productosCount = await db.productos.count()
  const ventasPendientesSync = await db.cola_sincronizacion
    .where('sync_status')
    .equals('PENDING')
    .filter((evento) => evento.tabla === 'ventas')
    .count()

  return {
    productosLocales: productosCount,
    ventasPendientesSync,
  }
}
