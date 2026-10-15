# spec.md — Especificación del sistema POS Librería

Especificación _as-built_ (describe lo que está construido hoy) del sistema POS + administración multisucursal para librería/cadena de tiendas.
Última actualización: 2026-10-01.

Documentos relacionados:

- `AGENTS.md` — reglas fijas del repo (arquitectura, comandos, convenciones, flujo SDD).
- `memory.md` — estado corriente, IDs de producción, bugs corregidos y trampas conocidas.
- `constitution.md` — existe en la raíz (movida desde `.agents/docs/`); consultarla antes de codear (AGENTS.md).

---

## 1. Propósito

Operar la venta presencial de una librería (punto de venta ágil, < 2s por venta), con administración central multisucursal: catálogos compartidos, stock por sucursal, ventas con auditoría, roles/permisos por módulo y comprobantes imprimibles. Interfaz y textos en español.

## 2. Alcance

### 2.1 Módulos implementados (con verificación E2E)

| Módulo                             | Ruta                | Estado |
| ---------------------------------- | ------------------- | ------ |
| Login / sesión                     | `#/login`           | ✅     |
| Dashboard (usuario)                | `#/dashboard`       | ✅     |
| Dashboard admin (stats globales)   | `#/admin-dashboard` | ✅     |
| Punto de venta                     | `#/pos`             | ✅     |
| Historial de ventas                | `#/historial`       | ✅     |
| Productos (CRUD + precios + stock) | `#/productos`       | ✅     |
| Catálogos                          | `#/catalogos`       | ✅     |
| Empresas                           | `#/Empresas`        | ✅     |
| Sucursales                         | `#/sucursales`      | ✅     |
| Usuarios                           | `#/usuarios`        | ✅     |
| Roles y permisos                   | `#/roles`           | ✅     |

### 2.2 Pendientes / placeholders

- **Inventario** y **Reportes**: ítems de navegación visibles con badge "Próximamente" (sin ruta/funcionalidad).
- **Factura fiscal (SAT)**: botón no visible hasta tener API; folio = `id[:8]` de la venta (sin foliado fiscal).
- **Cotizaciones**: solo crear/listar/eliminar. Falta convertir a venta (estados `aceptada`/`convertida` del enum sin usar) y editar.
- **Offline-First real (IndexedDB/Dexie + sync engine)**: **Fase 1 COMPLETA** — `src/lib/db.js` con `dexie@4.4.6` (esquema espejo 1:1 con la BD verificado por probes REST + cola `cola_sincronizacion`), hidratación del catálogo en `src/services/catalogSyncService.js` (login + montaje del POS, fire-and-forget) y **búsqueda del POS local-first** en `useBusquedaProductos` (IndexedDB primero, RPC de fallback si el catálogo local está vacío) — verificada sin red con `test-offline-search.js` (6/6). Spec: `specs/offline-sync.md`; tareas: `tasks/offline-sync-tasks.md` (1.1–1.3 [x]). Falta Fase 2: venta local atómica + motor de sync + indicador. El resto de la app sigue en `localStorage` + lecturas directas a Supabase.

## 3. Actores y roles

- **Admin** (rol administrador): `usePermission` devuelve `true` directo; puede alternar contexto de sucursal o ver consolidado global.
- **Operadores / demás roles**: restringidos a su `id_sucursal` de `users`; cada acción visible se controla por permiso.
- **Sin Supabase Auth**: login propio contra `users` (contraseña con `bcryptjs`); sesión en `localStorage` (`currentUser`).
- Permisos: `usePermission(modulo, accion)` con acciones `crear | editar | eliminar | ver`; para no-admin consulta el RPC `has_permission`.
- Módulos con permiso (registrados en 5 lugares — ver §9): `usuarios`, `empresas`, `sucursales`, `roles`, `productos`, `catalogos`, `historial`.

## 4. Arquitectura

### 4.1 Frontend

- React 19 + CoreUI 5 (solo CoreUI/Bootstrap; prohibido Tailwind/MUI) + Vite 8, Sass.
- Rutas con **HashRouter** (`http://localhost:3000/#/productos`); imports lazy en `src/routes.js`.
- Iconos: solo `@coreui/icons` verificados en terminal antes de usar.
- Tipografía: Archivo Variable + IBM Plex Mono para montos (clase `.monto`); color primario ink green `#0d7a5f`.

### 4.2 Backend (Supabase, sin código de servidor)

- URL y clave anon **hardcodeadas** en `src/lib/supabase.js` (sin `.env`); prohibido `service_role`.
- RLS: lecturas directas de tablas de negocio devuelven `[]` (bloqueadas). Excepciones legibles por REST: `empresa`, `users`, `roles`, `sucursal`.
- Todo lo demás pasa por **RPCs `SECURITY DEFINER`** con `GRANT` a `anon, authenticated`; los de venta/recuento reciben obligatoriamente `p_id_sucursal`.
- El SQL **no vive en el repo**: se aplica a mano en el SQL editor de Supabase; se recupera con `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='...';`.

### 4.3 Persistencia local (hoy)

| Clave `localStorage`                     | Contenido                         |
| ---------------------------------------- | --------------------------------- |
| `currentUser`                            | sesión: usuario + `id_sucursal`   |
| `empresaSeleccionada`                    | UUID de empresa activa (contexto) |
| `coreui-free-react-admin-template-theme` | tema claro/oscuro                 |
| `pos_carrito_<sucursal>`                 | carrito del POS                   |
| `pos_pendiente_<sucursal>`               | pendiente vinculado al carrito    |

## 5. Modelo de datos

Tablas en **singular**: `empresa`, `sucursal`, `users`, `roles`, `tipo_producto` (catálogos/tipos), `precio_producto`, `productos`, `productos_sucursal`, `ventas`, `detalle_venta`, `cotizaciones`, `detalle_cotizacion`, `clientes`, métodos de pago (vía `get_metodos_pago`).

- **Dinero siempre en centavos enteros** (Q10.50 = `1050`); formatear con `formatQ()`; prohibido decimales en BD.
- Enums:
  - `estado_venta` = `completada | pendiente | anulada` (al comparar con text: `ve.estado::text = p_estado`).
  - `estado_cotizacion` = `pendiente | aceptada | rechazada | convertida`.
- `ventas`: `id, id_sucursal, id_usuario, id_metodo_pago, id_cliente, fecha, total, cambio, estado` + auditoría de anulación (`fecha_anulacion`, `motivo_anulacion`, `id_usuario_anula`).
- `detalle_venta`: `id, id_venta, id_producto, cantidad, subtotal, id_precio_producto` (ojo: `subtotal`, no `sub_total`; `detalle_cotizacion` sí usa `sub_total NOT NULL`).
- `clientes`: `id, id_empresa, name, nit` — **por empresa, sin sucursal** (la sucursal queda en la venta).
- **Columnas verificadas por probes REST (2026-10-01):** `productos(id, sku, name, id_empresa, id_categoria, id_marca)`, `precio_producto(id, id_producto, id_tipo_producto, precio)`, `productos_sucursal(id, id_sucursal, id_producto, stock)` — **no existe** `min_stock`; `ventas` sin `created_at` ni `sync_status`; `detalle_venta(…, id_precio_producto)`. Las tablas `precios_producto` e `inventario_local` **no existen** (nombres erróneos previos; ya corregidos en `src/lib/db.js`).
- Aislamiento: toda venta/movimiento/usuario/permiso asociado a su sucursal o empresa; RLS/RPC impiden lecturas cruzadas.

## 6. Funcionalidad clave por módulo

### 6.1 Punto de venta (`#/pos`)

- Búsqueda por nombre/marca/código (RPC `buscar_productos`), selector de precio por tier (NORMAL/MAYOREO/…), carrito persistido en `localStorage`.
- **Cobro** (`PanelPago`): método de pago (Efectivo/Transferencia), efectivo recibido o "Efectivo exacto", cambio calculado en centavos, **cliente (opcional)**: input manual de nombre → `upsert_cliente` (reutiliza por `lower(name)` dentro de la empresa, param `p_name`) → `registrar_venta(..., p_id_cliente)` solo si hay nombre.
- **`registrar_venta`**: relee precios de BD (no confía en el cliente), descuenta stock atómico por sucursal (`stock >= cantidad`), calcula total/cambio, inserta venta + detalle en una sola transacción. Errores: carrito vacío, método nulo, precio inválido, stock insuficiente, efectivo < total.
- **Pendientes**: venta a medias guardada (`registrar_pendiente`); al cargarla se vincula (`pos_pendiente_<sucursal>`) y se auto-elimina al cobrar la venta; se desvincula al vaciar carrito, quitar último artículo, guardar otro pendiente o cotizar.
- **Cotizaciones**: `registrar_cotizacion` (no descuenta stock); listar/eliminar; sin conversión a venta aún.
- **Resultado**: modal `¡Venta realizada!` con botón "Imprimir comprobante" (solo ventas, no cotizaciones).

### 6.2 Historial (`#/historial`)

- Filtros: estado, rango de fechas, búsqueda por folio o usuario; paginación "Cargar más" (50).
- Detalle: fecha, usuario, método, estado, **cliente** (siempre visible; "Sin cliente" cuando aplica), renglones, total, bloque de auditoría si está anulada.
- **Anular** (permiso `historial/eliminar`): modal con motivo opcional → RPC `anular_venta` → devuelve stock exacto, guarda motivo/usuario/fecha; guards: ya anulada → error; pendiente → "usa Eliminar".
- **Editar cliente** (permiso `historial/editar`, oculto en anuladas): `upsert_cliente` + `set_venta_cliente` (vacío = quitar; valida sucursal y que no esté anulada).
- **Imprimir comprobante**: solo ventas `completada`.

### 6.3 Comprobante (`ModalComprobante`, compartido)

- Ticket: empresa (NIT, dirección), folio `id[:8]`, **cliente**, fecha, vendedor, método, productos, total, "No es factura fiscal".
- Footer: `Cerrar | Ticket 80 mm | Carta`. `imprimir(tamano)` inyecta `<style id="pagina-impresion">` (`@page size: 80mm auto / letter`) + clase `.comprobante-carta` y llama `window.print()`; limpieza al cerrar.
- Aislamiento de impresión: clase `body.imprimir-comprobante` solo mientras el modal está visible; en `@media print` todo lo que no sea el ticket → `display:none`, ruta del modal → `display:contents`, ticket → `position:fixed; top:0; width:100%` (rollo) / `170mm` (carta). **Verificado con PDFs reales: 1 página en ambos tamaños.**

### 6.4 Administración

- **Empresas / Sucursales / Usuarios**: CRUD con `*_admin` RPCs + toggle activo; usuarios con rol y sucursal.
- **Catálogos**: tipos/precios por empresa (`get/upsert/delete_catalogo`).
- **Productos**: CRUD (`create/update/delete_producto_admin`), stock por sucursal (`upsert_producto_sucursal`), precios por tier (`upsert/delete_precio_producto`), imágenes en Storage (`productos` bucket, URL pública).
- **Roles y permisos**: CRUD de roles (`create/update/delete_rol_admin`, `get_roles_con_permisos`) y matriz de permisos por módulo×acción (`get_permisos_by_rol`, `upsert_permiso`).

## 7. RPCs (inventario)

- **Ventas**: `registrar_venta(6)`, `get_ventas_historial(7)`, `get_venta_detalle(2)`, `anular_venta(4)`, `set_venta_cliente(3)`, `get_metodos_pago`, `buscar_productos`.
- **Pendientes/cotizaciones**: `registrar_pendiente`, `get_ventas_pendientes`, `eliminar_venta_pendiente`, `registrar_cotizacion`, `get_cotizaciones`, `eliminar_cotizacion`.
- **Clientes**: `upsert_cliente(p_id_empresa, p_name)`.
- **Catálogos/productos**: `get_catalogos`, `upsert_catalogo`, `delete_catalogo`, `get_productos_admin`, `create_producto_admin`, `update_producto_admin`, `delete_producto_admin`, `upsert_producto_sucursal`, `upsert_precio_producto`, `delete_precio_producto`.
- **Admin genéricos**: `create|update|delete_empresa_admin`, `toggle_empresa_activo`, `create|update|delete_sucursal_admin`, `toggle_sucursal_activo`, `create|update|delete_user_admin`, `toggle_user_activo`.
- **Roles/permisos**: `create|update|delete_rol_admin`, `get_roles_con_permisos`, `get_permisos_by_rol`, `upsert_permiso`, `has_permission`.
- **Dashboards**: `get_dashboard_stats`, `get_monthly_sales_chart`, `get_admin_dashboard_stats`.

## 8. Reglas de negocio (inviolables)

1. Aislamiento por sucursal/empresa en toda venta, stock, usuario y permiso.
2. El dinero se almacena solo en centavos enteros.
3. La UI nunca bloquea por red: las operaciones del POS deben percibirse < 2s (hoy sobre Supabase directo; Offline-First con IndexedDB está previsto).
4. `registrar_venta` relee precios y valida stock en servidor; el cliente jamás es fuente de verdad.
5. Anular venta ⇒ revertir stock + dejar auditoría; no se puede anular dos veces ni anular pendientes.
6. Vender un pendiente cargado ⇒ auto-eliminarlo; cotizar ⇒ desvincular pendiente.
7. Cliente: opcional, manual, por empresa (reutiliza nombre existente); la venta puede quedar sin cliente sin bloquearse.
8. No facturación fiscal (SAT) hasta tener API; no usar claves `service_role`.

## 9. Registrar un módulo visible (5 lugares)

1. `src/routes.js` (campo `modulo`)
2. `src/_nav.jsx` (campo `modulo`)
3. `src/hooks/useNavPermissions.js` (array `MODULOS`)
4. `src/views/admin/permisos/ModalPermisos.jsx` (array `MODULOS`)
5. `src/views/admin/permisos/RolesCard.jsx` (array `MODULOS`)

(Además `src/views/dashboard/components/MobileNav.jsx` para el menú móvil.)

## 10. Convenciones

- UI: solo CoreUI/Bootstrap; toasts `useToast()` → `showToast('success'|'danger', title, msg)`; confirmaciones `ConfirmModal` (acepta `children` para inputs).
- Estilo: sin punto y coma, comillas simples, indentación 2, ancho 100, **archivos nuevos en LF** (no re-formatear CRLF preexistentes).
- Efectos: cargar datos con `.then(callback)` (regla `react-hooks/set-state-in-effect`); setState síncrono prohibido en effect.
- Iconos: verificar existencia antes de usar (`node -e "console.log(!!require('@coreui/icons').cilX)"`).
- Verificación de columnas RPC/columnas por probes REST (ver `memory.md` → Técnicas de sondeo).

## 11. Calidad y pruebas

- `npm run build` — único check de CI (`.github/workflows/npm.yml`), ~15s.
- `npm run lint` — falla siempre por ~5.3k errores preexistentes (CRLF + hooks viejos); lintear solo archivos tocados: `npx eslint src/ruta/archivo.jsx`.
- E2E del repo (Selenium, requieren :3000 y login `system`/`system321`): `npm run test:login|test:e2e|test:edit|test:elim|test:reg`.
- Scripts de verificación fuera del repo (en `%TEMP%\opencode`): capturas por fase (`p*`), `pdf-pages.js` (PDFs reales de impresión), `e2e-cliente.js`, `test-pendiente-venta.js`.
- Sin Git local (`.git`): confirmar con el usuario antes de ediciones/reescrituras masivas.

## 12. Flujo de trabajo (SDD)

1. Consultar `constitution.md` (raíz) antes de actuar.
2. Ningún código sin especificación previa en `specs/<modulo>.md` y tarea activa en `tasks/<modulo>-tasks.md`.
3. Una tarea a la vez: mostrar cambios → verificar con el desarrollador → marcar checkbox `[x]` → avanzar.
4. Actualizar `memory.md` (estado) y `AGENTS.md` (reglas) al cerrar sesión o módulo.

---

## 13. Roadmap de Especificaciones Secundarias (Specs pendientes)

Para llevar el sistema desde su estado _as-built_ hacia el cumplimiento total de la `constitution.md`, se irán creando las siguientes especificaciones técnicas detalladas en `specs/`:

1. `specs/offline-sync.md` — **creada; Fase 1 (esquema Dexie espejo 1:1 + `dexie@4.4.6`) implementada**; diseño del motor (cola, venta local atómica, indicador) en la misma spec. Tareas en `tasks/offline-sync-tasks.md`.
2. `specs/inventario-recuentos.md`: Módulo de toma física de inventario, ajustes de stock y alertas de `min_stock`.
3. `specs/cotizaciones-conversion.md`: Flujo completo para editar y convertir cotizaciones aceptadas directamente en ventas dentro del POS.
4. `specs/reportes-ganancias.md`: Módulo de reportería analítica de ganancias brutas/netas filtradas por período y sucursal.
