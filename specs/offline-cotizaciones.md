# Spec: Cotizaciones Offline, Comprobantes y Resolución de Conflictos UI

## 1. Objetivo

Permitir a los usuarios generar cotizaciones sin conexión a internet, sincronizarlas automáticamente cuando vuelva la red, resolver conflictos de stock/precios mediante una interfaz visual (UI) y gestionar la emisión de comprobantes bajo las limitaciones de conectividad.

## 2. Requerimientos Funcionales

- **RF-01 (Cotización Offline):** Guardar cotizaciones localmente (IndexedDB / LocalStorage / PWA) asignando un ID temporal UUID cuando no haya conexión (`navigator.onLine === false`).
- **RF-02 (Resolución de Conflictos UI):** Al volver la red y sincronizar, si un producto de la cotización sufrió un cambio de precio o se quedó sin stock en el servidor, abrir un **Modal/UI de Conflictos**.
  - Mostrar lado a lado: _Valor Guardado Offline_ vs. _Valor Actual del Servidor_.
  - Opciones para el usuario: "Aceptar precio/stock del servidor", "Cancelar cotización" o "Ajustar manualmente".
- **RF-03 (Comprobante sin red - Limitación Documentada):**
  - **REGLA DE NEGOCIO:** La generación de comprobantes fiscales/oficiales **requiere conexión obligatoria** a la API/Supabase para obtener el folio/correlativo oficial.
  - Si el usuario intenta emitir un comprobante offline, la UI debe mostrar un **Aviso Informativo Claro** (Banner/Modal):
    > _"Cotización guardada localmente. El comprobante oficial no puede ser emitido sin red y quedará en estado 'Pendiente de emisión' hasta recuperar la conexión."_

## 3. Modelo de Datos Local / Estado

- **Tabla/Colección Local (`offline_quotes`):**
  - `temp_id` (UUID local)
  - `branch_id`
  - `items` (Array de productos: id, qty, offline_price)
  - `status` (`'pending_sync'`, `'conflict'`, `'synced'`)
  - `receipt_status` (`'pending_network'`, `'issued'`)

## 4. Criterios de Aceptación

- [x] Las cotizaciones creadas sin red no se pierden al recargar la aplicación.
- [x] El modal de resolución de conflictos detecta discrepancias de precio >= 0.01 y stock menor al solicitado.
- [x] No se permite la generación de folios fiscales o comprobantes finales si `navigator.onLine` es `false`. Se genera un pre-comprobante con marca de agua "NO VÁLIDO - PENDIENTE DE RED".
