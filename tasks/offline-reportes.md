# Tasks: Implementación de la Suite Offline

- [x] **Task 1: Cotizaciones e Impresión Offline**
  - Implementar la generación del PDF/Ticket HTML para cotizaciones desde los datos guardados en IndexedDB.
  - Habilitar el botón "Imprimir Cotización" sin requerir respuesta o confirmación del servidor.

- [x] **Task 2: Módulo de Historial y Comprobantes Sin Red**
  - Crear la vista de Historial leyendo tanto de la red (si hay conexión) como de `local_quotes` (si está offline).
  - Implementar la plantilla de impresión de comprobante offline agregando la marca de agua y leyenda _"PENDIENTE DE SINCRONIZACIÓN FISCAL"_.
  - Desactivar la solicitud de folios oficiales a la API fiscal si `navigator.onLine === false`.

- [x] **Task 3: Módulo de Productos Offline**
  - Configurar la estrategia de caché para la tabla `products` e `inventory`.
  - Permitir la búsqueda y filtrado de productos por texto/código utilizando exclusivamente el almacenamiento local cuando no haya conexión.

- [x] **Task 4: Módulo de Catálogos Offline**
  - Sincronizar al iniciar la app los catálogos secundarios (`categories`, `branches`, `tax_rates`, `payment_methods`).
  - Adaptar los selectores y desplegables de la UI para que lean de la memoria local en lugar de hacer `fetch()` directos a la API.

---

# Tasks: Módulos de Reportes e Inventario

- [x] **Task: Módulo de Lectura y Resumen de Inventario (Consulta Read-Only)**
  - Crear `src/views/inventario/InventarioPage.jsx`: tabla con SKU, Nombre, Stock, Categoría, Precio
  - Búsqueda local por nombre/SKU, filtro por categoría, paginación cada 25 filas
  - Badge rojo "Stock bajo" cuando `stock <= stock_minimo`
  - Sin botones de edición/eliminación (solo consulta)
  - 100% offline desde IndexedDB (db.productos + db.productos_sucursal + db.categorias)

- [x] **Task: Módulo de Reportes de Ventas con Filtros por Fecha (Offline-First)**
  - Crear `src/views/reportes/ReportesPage.jsx`: tarjetas con Total, Transacciones, Promedio
  - Filtros rápidos: Hoy, Este Mes, Este Año + selector de rango personalizado
  - Tabla desglosada de ventas del período
  - 100% offline desde IndexedDB (db.ventas, filtro por `[id_sucursal+fecha]`)
  - Cableado en los 5 lugares: routes.js, _nav.jsx, useNavPermissions.js, ModalPermisos.jsx, RolesCard.jsx
  - Precarga de chunks añadida en precargaRutasService.js