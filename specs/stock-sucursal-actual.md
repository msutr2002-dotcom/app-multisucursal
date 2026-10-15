# Spec: Modal de Stock limitado a la sucursal actual

## 1. Objetivo

El modal "Stock — {producto}" (`src/views/admin/productos/ModalStock.jsx`) lista hoy **todas** las sucursales de la empresa, lo que permite (y sugiere) editar stock de sucursales donde el dispositivo no opera. Requerimiento del desarrollador: **solo debe aparecer la sucursal en donde estoy**.

## 2. Requerimientos Funcionales

- **RF-01 (Propiedad del contexto):** `Productos.jsx` pasa `idSucursalActual` (ya derivado de `currentUser?.id_sucursal`) a `ModalStock` — el mismo patrón de `ProductosTabla`, `ModalPrecios` e `IngredientesPage`.
- **RF-02 (Filtro):** `ModalStock` limita la lista a `idSucursalActual` (filtro server-side `.eq('id', …)` además del filtro de empresa existente). La fila mostrada se puebla desde `producto.stock` como hoy.
- **RF-03 (Fallback admin global):** si el usuario no tiene `id_sucursal` (ej. `system` sin sucursal asignada), se conserva el comportamiento actual (todas las sucursales de la empresa) — no hay "donde estoy" que aplicar.
- **RF-04 (Guardado):** el loop de `upsert_producto_sucursal` solo itera las filas visibles → nunca escribe otras sucursales desde este modal. Botón "Guardar Stock" deshabilitado si no hay filas.
- **RF-05 (Compatibilidad E2E):** el caso **CP-PROD-007** sigue válido: exige columnas Sucursal/Stock/Mínimo, ≥1 fila y editar la primera — todo aplica con una sola fila. Sin cambios en `docs/casos-prueba-usuario.md` ni en la suite.

## 3. Restricciones

- Solo CoreUI/existing patterns; lint solo de archivos tocados; sin bump de Dexie ni toques a servicios (el modal es 100% servidor).
- La columna "Sucursal" se conserva aunque haya una fila (mantiene el layout y el contrato del caso CP-PROD-007).

## 4. Fuera de alcance

- ModalPrecios / ingredientes / traslados (otras vistas multi-sucursal).
- Permisos de edición (ya cubiertos por `puedeEditar` del contenedor).
