- [ ] Task: Módulo de Compras, Entradas y Gestión de Comprobantes (Basado en DB existente)

  > **2026-10-02:** absorbida por `specs/compras-entradas.md` + `tasks/compras-entradas-tasks.md`
  > (sondeo real: la tabla se llama `comprobante` en singular — `comprobantes` no existe — y
  > ya existen `compras`, `detalle_compra` y `entradas` vacías, sin RPCs). Usar los nuevos documentos.

  **Objetivo:**
  Implementar la lógica offline-first para el registro de compras, entradas de inventario y almacenamiento de comprobantes, inspeccionando y reutilizando la estructura existente de la base de datos (especialmente la tabla `comprobantes`).

  **Paso Previo Requerido (Lectura de Esquema):**
  1. Inspeccionar la definición actual del esquema de la base de datos (ej. `src/db/schema.ts`, `prisma/schema.prisma` o la instancia de `Dexie`).
  2. Identificar la estructura exacta, nombres de columnas y tipos de datos de la tabla `comprobantes` (y tablas relacionadas de compras e inventario).
  3. Adaptar la implementación para alinearse estrictamente a dichos campos sin alterar ni crear esquemas redundantes.

  **Requisitos de Implementación:**
  1. **Gestión de Compras y Stock Local:**
     - Registrar la compra o entrada de stock en IndexedDB.
     - Actualizar la tabla de inventario local vinculada.
  2. **Almacenamiento en tabla `comprobantes`:**
     - Capturar/cargar el archivo del comprobante (vía `FileReader` como Base64, Blob o ArrayBuffer según la columna existente).
     - Insertar el registro en la tabla `comprobantes` respetando sus campos exactos y vinculándolo con el ID de la compra/entrada.
  3. **Visualización Offline:**
     - Permitir la lectura y renderizado del comprobante directamente desde IndexedDB para consulta local.
  4. **Estado de Sincronización:**
     - Asignar el estado de sincronización correspondiente (`pending` / `sync_status`) para su posterior subida al backend al recuperar señal.

  **Criterios de Aceptación:**
  - El código se adapta a los nombres de campos y tipos reales de la tabla `comprobantes` de la base de datos actual.
  - Se pueden registrar entradas de compras con su comprobante adjunto estando sin conexión.
  - El comprobante guardado puede previsualizarse en modo offline.
