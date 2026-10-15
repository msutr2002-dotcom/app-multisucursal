# Spec: Módulos Offline (Cotizaciones, Historial, Productos y Catálogos)

## 1. Objetivo

Convertir la aplicación en Offline-First permitiendo la consulta de productos/catálogos, emisión e impresión de cotizaciones/comprobantes temporales y consulta del historial de ventas sin conexión a internet.

## 2. Requerimientos Funcionales

- **RF-01 (Productos y Catálogos Cheados):** Al cargar la app con red, sincronizar y guardar localmente (IndexedDB) las tablas `products`, `categories`, `branches` y `inventory`.
- **RF-02 (Cotizaciones e Impresión Offline):** Permitir crear e imprimir cotizaciones locales.
- **RF-03 (Historial e Impresión de Comprobantes Offline):**
  - Consultar cotizaciones y ventas realizadas localmente.
  - Imprimir comprobantes sin red agregando la leyenda visible: _"COMPROBANTE NO FISCAL - PENDIENTE DE RED"_.
- **RF-04 (Sincronización Transparente):** Al detectar `navigator.onLine === true`, enviar la cola de transacciones locales pendientes a Supabase.

## 3. Modelo de Datos Local (IndexedDB / Dexie)

- `local_products` (id, code, name, price, stock, category_id)
- `local_catalogs` (categories, branches, taxes)
- `local_quotes` (temp_id, branch_id, items, total, status, printed_offline)
