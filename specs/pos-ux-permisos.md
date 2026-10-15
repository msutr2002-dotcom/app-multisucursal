# Spec — POS UX: botones duplicados, permisos de botones y referencia de transferencia

**Fecha:** 2026-10-09 · **Origen:** feedback del usuario en la prueba de la vista comida (módulo `combos-insumos` Task 7). Tres features independientes del modelo dual; no tocan combos ni ingredientes.

## Contexto

1. El POS muestra "Cotización" **dos veces** con significados distintos: el botón del encabezado "Cotizaciones" abre la **lista**; el botón grande del panel "Cotización" **crea** una cotización del carrito; y el link "Ver cotizaciones" del panel **también** abre la lista (duplicado real).
2. No existe forma de ocultar botones del POS por empresa/rol (ej. una empresa de comida no necesita cotizaciones). El sistema de permisos ya soporta módulos/acciones por rol y se reutiliza.
3. Un pago por **transferencia** necesita **número de referencia** y hoy no hay campo (solo existe "Efectivo recibido" para efectivo).

## Decisiones aprobadas (2026-10-09)

- **D1 — Dedup cotización:** el link "Ver cotizaciones" del `PanelPago` se elimina (el encabezado es la única entrada a la lista); el botón grande se renombra **"Cotizar"** (crea del carrito).
- **D2 — Botones controlables:** solo **"Cotizar (crear)"** y **"Ver cotizaciones"** (encabezado). Se ocultan vía **permisos por rol** (sección POS en Roles → Permisos). Como los roles son por empresa, sirve también por empresa (no otorgar = oculto para esa empresa).
- **D3 — Visible por defecto:** si un rol **no tiene fila** de permiso para el botón, el botón **se ve** (compatibilidad con instalaciones actuales; solo se ocultan los que un admin desmarca explícitamente).
- **D4 — Referencia de transferencia:** input "Número de referencia" en `PanelPago` **solo cuando el método de pago es transferencia** (detección por nombre `transfer`), **obligatorio** (sin él no se puede cobrar). Se guarda en `ventas.referencia` y viaja al RPC `registrar_venta` como `p_referencia` (SQL con el usuario).
- **D5 — Sin SQL nuevo para permisos:** se reutiliza `permiso`/`upsert_permiso`/`get_permisos_by_rol` con dos módulos nuevos sintéticos: `pos_cotizar` y `pos_ver_cotizaciones` (acción efectiva: `puede_ver`).

## RF-P1 — Dedup de cotización (Task 1)

- `PanelPago`: botón "Cotización" → **"Cotizar"**; eliminar el link "Ver cotizaciones".
- El encabezado del POS conserva "Cotizaciones" (abre la lista; también es la entrada en móvil, donde el panel vive en un modal).

## RF-P2 — Permisos de botones POS (Task 4)

- **Módulos sintéticos** `pos_cotizar` y `pos_ver_cotizaciones` (solo checkbox **Ver** aplica; en `ModalPermisos` las 3 columnas restantes quedan deshabilitadas para estas filas).
- **Default true:** al cargar el modal, estos dos módulos arrancan en `true` si el servidor no tiene fila (D3); una fila existente manda.
- **Resolución offline-first** con regla "sin fila = visible": helper `verificarPermisoBotonPos` en `permisoService.js` — Admin → true; con red → `get_permisos_by_rol` (sin fila → true, con fila → `puede_ver`; cachea en localStorage con la clave `perm_<rol>_<modulo>_ver`); sin red → cache, sin cache → true.
- `POSPage`/`PanelPago`: botón "Cotizar" y botón "Cotizaciones" del encabezado se renderizan solo con su permiso (hooks con el helper).
- `RolesCard`: los dos módulos entran al array `MODULOS` (el badge solo aparece si ya existe fila — igual que hoy).
- **No** se agregan a `useNavPermissions`/`routes`/`_nav` (no son módulos de navegación).

## RF-P3 — Número de referencia en transferencia (Tasks 2–3)

- **UI (`PanelPago`):** si el método seleccionado contiene `transfer` en el nombre → input "Número de referencia (obligatorio)". `valido` exige `referencia.trim()` no vacío. Se limpia al cambiar de método. El estado vive en `PanelPago` (cada mount desktop/móvil es independiente, igual que `metodoId`).
- **Flujo:** `onCobrar({...ya existente, referencia})` → `POSPage.handleCobrar` → `registrarVentaLocal({..., referencia})`.
- **`ventaLocalService`:** guarda `referencia` (texto o null) en la fila `ventas` y en el evento de cola **solo si no está vacía** (`p_referencia` omitido si es null → compatible con el RPC viejo mientras no se aplique el SQL).
- **SQL (con el usuario, Task 3):** `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia text;` + `CREATE OR REPLACE registrar_venta` con parámetro nuevo `p_referencia text default null` que lo almacena. Se pide al usuario el `pg_get_functiondef` actual antes de entregar el reemplazo (la función ya fue reescrita en el módulo dual; no se asume su cuerpo).
- Fuera de alcance de esta task: mostrar la referencia en comprobantes/historial (queda para cierre si el usuario lo pide).

## Criterios de aceptación

1. El panel ya no muestra "Ver cotizaciones"; el botón grande dice "Cotizar"; el encabezado conserva "Cotizaciones".
2. Rol sin filas `pos_cotizar`/`pos_ver_cotizaciones` → ambos botones visibles; admin desmarca "Cotizar" → el botón desaparece para ese rol; "Ver cotizaciones" desmarcado → desaparece el del encabezado.
3. Método transferencia → input de referencia obligatorio; sin referencia no cobra; con referencia la venta local la guarda y el evento cola lleva `p_referencia`.
4. Efectivo/tarjeta → sin input de referencia; ventas existentes sin referencia intactas.
5. `npx eslint` archivos tocados 0 errores; `npm run build` ✓.

## Fuera de alcance

- Referencia en comprobante/historial/reportes (posible cierre).
- Ocultar otros botones (Pendiente, Vaciar, Cliente) — el usuario eligió solo los dos de cotización; el patrón queda listo para agregar más módulos sintéticos después.
- Selector de tamaño/variantes al tocar un tile del grid (papas grandes) — decisión pendiente del usuario (producto aparte vs selector).
