# Spec: clientes (modelo por sucursal, NIT como identidad)

Fecha: 2026-10-12. Estado: propuesta v2 — **reemplaza el diseño por empresa v1** (decisiones cerradas con el usuario en sesión).
Orden del roadmap aprobado: **clientes → mayoreo (descuento % por cliente) → reportes (impresión) → facturas SAT simuladas → multibodega**.

## Problema

Hoy `clientes` solo tiene nombre (upsert mínimo del POS y edición desde el detalle del Historial). Sin NIT/teléfono/dirección no hay identidad de cliente, sin pantalla de administración ni historial por cliente no se pueden detectar clientes frecuentes para el mayoreo.

## Decisiones de diseño (v2 — por sucursal, NIT como identidad)

- **D1 (fila = sucursal):** una fila de `clientes` = **UNA sucursal** (`id_sucursal`). La misma persona puede existir en varias sucursales/empresas como filas separadas.
- **D2 (NIT = identidad por sucursal):** `UNIQUE (id_sucursal, lower(nit)) WHERE nit IS NOT NULL`. Nombre+apellido **NO** son únicos (homónimos con NIT distinto permitidos). **Crear un nombre ya existente en la sucursal exige NIT** (si no, el RPC unifica por nombre solo cuando es único en la sucursal; homónimos >1 → error pidiendo NIT).
- **D3 (nombre y apellido separados):** el formulario pide **Nombre** y **Apellido**; la columna `name` se mantiene materializada (`nombre + ' ' + apellido`) para compatibilidad con el datalist/historial.
- **D4 (heredados = Opción B):** los clientes existentes (nombre único, sin sucursal) se migran con `id_sucursal NULL` = **heredados**: visibles SOLO en el datalist del POS, **NO** en ClientesPage, **NO** editables, **NO** reasignables por nadie (el usuario administra empresas/sucursales/roles/permisos — no los clientes de las sucursales).
- **D5 (NIT opcional):** ventas rápidas no exigen NIT; NIT solo si el cliente pide factura.
- **D6 (dos modos en el POS):**
  - Campo **Cliente vacío/opcional** por defecto.
  - Al escribir un nombre aparece un input **NIT (opcional)**.
  - **NIT escrito** → auto-llenado local del nombre desde Dexie (SAT API real = futuro módulo `facturas-sat`); sin match → texto libre casual, no crea registro.
  - **Casual** (texto sin elegir del desplegable) → guarda `cliente_nombre` en `ventas` (nueva columna), sin perfil, no suma stats, sí imprime en ticket.
  - **Enlazado** (elegir del desplegable, que se muestra como "Nombre (NIT)", o "Registrar cliente nuevo") → `id_cliente` real, suma historial.
- **D7 (flujo real):** NO piden nombre al llegar; lo preguntan después de los productos; propósito **depende de la venta** → el cliente es opcional.
- **D8 (facturación):** factura simulada **sin** marca "SIMULACIÓN — NO FISCAL" (decisión del usuario); la marca **"PENDIENTE DE SINCRONIZACIÓN FISCAL"** (AGENTS.md, comprobantes IndexedDB) **sigue**.
- **D9 (bug a eliminar):** el `upsert_cliente` a ciegas por nombre de `colaSyncService.js` se **elimina** (mezclaba homónimos en toda la empresa, sin NIT/sucursal).

## Alcance

- **Extensión de `clientes`:** `id_sucursal uuid NULL`, `nombre`, `apellido`, `nit`, `telefono`, `direccion`, `activo boolean`.
- **Extensión de `ventas`:** `cliente_nombre text NULL` (venta casual; defensivo si la migración ya existe).
- **Pantalla Clientes** (`#/clientes`): CRUD por **la sucursal de la sesión** (`id_sucursal` del usuario actual); lista con búsqueda (nombre/NIT), stats (Compras / Total / Última), badge Inactivo, acciones Editar/Ver detalle/Desactivar. Form: Nombre + Apellido (obligatorios) + NIT/Tel/Dirección (opcionales). **Los heredados NO aparecen.**
- **Detalle del cliente:** últimas ventas POS (`get_ventas_by_cliente`).
- **Integración POS (camino crítico intacto ≤2s):** PanelPago con UX condicional (D6). Escritura online con guard de red; enlazado/marcado de `id_cliente` y `cliente_nombre` ocurren **después** del registro local de la venta (fire-and-forget igual que hoy).
- **Offline-First:** lectura local-first (espejo Dexie por sucursal + heredados para el datalist); CRUD online con guard de red. Sin cola de sincronización para este catálogo.
- **Hidratación:** `hidratarClientes(idEmpresa, idSucursal)` en login/refresh vía `get_clientes(..., p_incluir_heredados: true)`.

## Requerimientos funcionales

- **RF-CL1 (CRUD por sucursal):** alta/edición de `nombre`+`apellido` (+NIT/tel/dirección) **limitados a la sucursal de la sesión**; NIT único por sucursal; homónimos sin NIT → error pidiendo NIT; homónimos con NIT distinto → filas separadas permitidas.
- **RF-CL2 (Historial):** lista de ventas por cliente + stats en la lista general.
- **RF-CL3 (Soft delete):** `activo=false` oculta del datalist POS y de la lista por defecto; nunca borrado físico.
- **RF-CL4 (Aislamiento):** toda operación filtrada/validada por `id_sucursal`; heredados (`id_sucursal NULL`) solo llegan al datalist (`p_incluir_heredados: true`), jamás a ClientesPage ni a la edición.
- **RF-CL5 (Búsqueda):** nombre o NIT, en servidor (con red) y en memoria (espejo local).
- **RF-CL6 (Datalist con identidad):** muestra "Nombre (NIT)" para que el cajero distinga homónimos; admite texto libre (casual) sin obligar a registrar.
- **RF-CL7 (Auto-llenado por NIT):** NIT escrito → lookup local en Dexie → nombre auto-llenado; sin match → solo casual.

## Datos / SQL

- **`tasks/sql/clientes-bloque2.sql`** (idempotente, reemplaza/supersede `clientes-bloque1.sql`):
  - Drops defensivos de sobrecargas previas (`registrar_venta` ×2, `upsert_cliente`, `upsert_cliente_admin`, `get_clientes`) con firma exacta (lección: `CREATE OR REPLACE` no cambia firmas → 42725).
  - ALTER `clientes` (+`id_sucursal`,`nombre`,`apellido`,`nit`,`telefono`,`direccion`,`activo`), backfill split de `name` (split en primer espacio), ALTER `ventas` (+`cliente_nombre`), índice `clientes_sucursal_nit_uk`.
  - `upsert_cliente(p_id_sucursal, p_nombre, p_apellido, p_nit)`: NIT→match, sin NIT→match único o error homónimos, crea con sucursal (POS).
  - `upsert_cliente_admin(p_id, p_id_sucursal, ...)`: anti-homónimo + NIT dup (admin).
  - `get_clientes(p_id_sucursal, p_busqueda, p_incluir_inactivos, p_incluir_heredados, p_limite, p_offset)`: lista + stats + `es_heredado`.
  - `get_ventas_by_cliente(p_id_cliente, p_limite, p_offset)`.
  - `registrar_venta(..., p_id_cliente, p_cliente_nombre)` canónica 8 params (body pos-ux + `cliente_nombre`).
  - `get_venta_detalle` parcheado con `coalesce(cl.name, ve.cliente_nombre, '')`.
  - `NOTIFY pgrst, 'reload schema'`.
- **Pendiente usuario:** aplicar `clientes-bloque2.sql` en SQL Editor (Tasks 3–5 en runtime dependen de él).

## Dexie

- Store `clientes` (sin bump de versión): campos no indexados `id_sucursal/nombre/apellido/nit/telefono/direccion/activo`; el filtrado por sucursal/heredados se hace **en memoria** en `leerClientesLocal(idEmpresa, idSucursal, {heredados, busqueda, incluirInactivos})`.

## Fuera de alcance (módulos siguientes)

- Mayoreo (`descuento_pct` + aplicación en el cobro) — `mayoreo`.
- Impresión de reportes/facturas — `reportes-impresion`, `facturas-sat` (incluye API SAT real para auto-llenado por NIT).
- Cambios de flujos de venta/cotización más allá del datalist.
- Borrado físico; reasignación de heredados.

## Validación

1. Alta en sucursal A → NO visible en sucursal B ni en el consolidado global; NIT repetido en otra sucursal → permitido.
2. Mismo nombre+NIT en una sucursal → unifica (update); mismo nombre sin NIT y homónimos >1 → error "ingrese NIT".
3. Clientes preexistentes → solo en datalist del POS; no aparecen en `#/clientes` ni se editan.
4. Venta casual → `ventas.cliente_nombre` impreso en ticket, 0 en stats; venta enlazada → suma stats.
5. NIT escrito → nombre auto-llenado desde Dexie; NIT sin match → solo casual.
6. Desactivar → sale del datalist, historial conserva vínculo.
7. Sin red → lista desde Dexie; CRUD/ventas online muestran aviso (guard `hayRed()`).
