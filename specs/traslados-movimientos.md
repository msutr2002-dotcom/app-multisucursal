# Spec: Módulo de Traslados entre Sucursales y Movimientos (recepción y verificación)

## 1. Objetivo

Que cada sucursal pueda **enviar productos a otra sucursal** (traslado) y que la sucursal destino, en **Movimientos**, verifique y **acepte** lo que llegó — permitiendo quitar productos que no llegaron o descontar cantidades parciales —, con una **campanita de notificaciones** (punto rojo) que avisa los traslados pendientes de aceptar. Todo Offline-First (IndexedDB primero) y aislado por sucursal (Art. II).

**Estado de la BD (sondeo 2026-10-05, solo lectura):** no existe nada de traslados — grep en `src` sin coincidencias, RPC `get_traslados` → 404 `PGRST202` (no existe). Tablas **nuevas** (no hay ALTERs de tablas viejas como en compras):

- `sucursal` (confirmado por REST): `id, id_empresa, name, address, tel, activo` — el anon **puede** leerla (3 filas / 2 empresas visibles) → el selector de destino se arma desde aquí **filtrando por la `id_empresa` del dispositivo**, solo `activo = true` y `id !=` mi sucursal (el cliente ve sucursales de otras empresas: filtro obligatorio, y el RPC lo valida en servidor).
- Íconos verificados en terminal: `cilBell`, `cilTransfer`, `cilTruck`, `cilArrowRight`, `cilCheckAlt` ✓.
- `AppHeader.jsx` ya monta `SyncIndicator` en `CHeaderNav` → la campanita va en un `li.nav-item` hermano.

## 2. Requerimientos Funcionales

- **RF-T1 (Envío de traslado offline-first):** El usuario de la sucursal A elige destino (sucursales de **su empresa**, ≠ A, `activo`), agrega productos del catálogo local con stock de A y cantidades enteras > 0, y registra **primero en IndexedDB** en una transacción única: fila `traslados` (`estado: 'enviado'`) + `detalle_traslado` + **descuento del stock de A** en `productos_sucursal` + evento de cola `PENDING`. La UI nunca espera Supabase (<2 s, mismo espíritu del Art. II.3). Guard local: no permite más unidades que el stock actual de A.
- **RF-T2 (Sincronización):** Con red, la cola sube a `registrar_traslado` (descuenta stock en servidor **con guard de stock suficiente** → si ya no alcanza, rechazo de negocio → fila `CONFLICT` visible con el motivo, patrón compras). Remapeo de id local→servidor (`data?.id_traslado`). **Anulación** (`anular_traslado`): solo la sucursal origen, solo estado `enviado`, solo con red y fila `SYNCED` (bloqueos con aviso, patrón `ComprasPage.abrirAnular`); revierte el stock de A.
- **RF-T3 (Movimientos — verificación y aceptación):** Pestaña Movimientos = traslados con **destino = mi sucursal** (histórico de todos los estados). El modal de verificación muestra una línea por producto con **enviada** y **recibida editable** (default = enviada):
  - `recibida = 0` → el producto **no llegó**: no suma stock en destino y el origen lo recupera.
  - `recibida < enviada` → llegó parcial: se descuenta solo la diferencia.
  - Validación `0 ≤ recibida ≤ enviada` por línea.
  - Al **aceptar**: transacción local → stock **destino += Σ recibida**, stock **origen (A) += Σ (enviada − recibida)**, `cantidad_recibida` por línea, estado final `recibido` (todo completo) o `recibido_parcial` (alguien en cero o abajo), evento cola `PENDING`. Se permite **sin red** (Art. II: la UI no se bloquea); aceptar dos veces queda bloqueado por estado.
- **RF-T4 (Estados):** `enviado` → `recibido` | `recibido_parcial` | `anulado`. `anulado` solo lo pone el origen y solo desde `enviado`.
- **RF-T5 (Campanita de notificaciones):** En `AppHeader` (junto a `SyncIndicator`), ícono `cilBell` con **punto rojo** con el conteo de traslados **recibidos en estado `enviado`** para mi sucursal. Lectura del espejo local → funciona sin red; se actualiza con: montaje del monitor (`App.jsx`, patrón `iniciarGestorCotizacionesOffline`), evento `online`, y el CustomEvent `traslados-actualizados` (emitido por alta/aceptación/anulación/refresh/sync). Clic en la campanita → abre el **menú de notificaciones** sin navegar; el aviso «N traslados pendientes por aprobar» → **sí navega al módulo** en la pestaña Movimientos (el centro podrá agrupar avisos de otros módulos en el futuro). Se muestra solo si el usuario tiene permiso `traslados/ver` (guard offline-first `usePermission`).
- **RF-T6 (UI):** Ruta `#/traslados` con pestañas CoreUI (`activeItemKey`, patrón ComprasPage):
  - **Traslados** (enviados): lista con fecha, destino, estado, ítems, badges (`sin sincronizar`, `conflicto`); botón **"Nuevo traslado"** (selector de destino + líneas producto/cantidad con stock visible + agregar); anulación con `ConfirmModal` + motivo.
  - **Movimientos** (recibidos): lista con fecha, origen, estado, ítems; botón **"Verificar/Aceptar"** (solo `enviado`) → modal de verificación RF-T3; histórico aceptados/anulados solo lectura.
  - Lectura local primero; sin red → banner de solo-lectura-local (el alta/aceptación local sigue permitida); con red → fuse servidor + filas locales `PENDING` en offset 0 sin duplicar (patrón ComprasPage).
- **RF-T7 (Permisos):** Módulo único `traslados` con las 4 acciones estándar: `ver` = ver listados + campanita; `crear` = enviar traslados; `editar` = aceptar en Movimientos; `eliminar` = anular. Cableado en los **6 puntos** (los 5 del Art. V + `MobileNav`).

## 3. Modelo de Datos Local (IndexedDB / Dexie)

Nuevo bump `db.js` **v7**:

- `traslados`: `'id, id_sucursal_origen, id_sucursal_destino, fecha, estado, sync_status'` (cabecera; nombres de sucursal/usuario resueltos desde `sucursal`/sesión, no indexados).
- `detalle_traslado`: `'id, id_traslado, id_producto'` (`cantidad_enviada`, `cantidad_recibida` sin indexar).

Reglas: `snake_case` solo entre comillas; **sin dinero** en el módulo (solo cantidades enteras → Art. III no aplica salvo la anon key); ids UUID locales con el patrón existente. La tx local que toca `productos_sucursal` DEBE listarla en las tablas del tx (lección Dexie de la Task 3 de compras).

## 4. SQL / RPCs (aplicado a mano por el usuario, como todo el SQL del repo)

**Task 1 (sondeo)** confirma: que no existan tablas/RPCs homónimas, columnas de `sucursal` (ya sondeadas) y el patrón exacto de un RPC a copiar (`pg_get_functiondef(registrar_compra)`).

**Task 1b (SQL definitivo):**

- `CREATE TABLE traslados` (`id uuid PK DEFAULT gen_random_uuid()`, `id_sucursal_origen` FK `sucursal`, `id_sucursal_destino` FK, `id_usuario` FK `users`, `fecha timestamptz DEFAULT now()`, `estado text DEFAULT 'enviado' CHECK (estado IN ('enviado','recibido','recibido_parcial','anulado'))`, `motivo_anulacion text`, `id_usuario_anula uuid`, `id_usuario_receptor uuid`, `fecha_recepcion timestamptz`, **`CHECK (id_sucursal_origen <> id_sucursal_destino)`**) + índices (`[id_sucursal_destino+estado]`, `[id_sucursal_origen+fecha]`, `fecha`).
- `CREATE TABLE detalle_traslado` (`id uuid PK`, `id_traslado` FK `ON DELETE CASCADE`, `id_producto` FK, `cantidad_enviada int CHECK (cantidad_enviada > 0)`, `cantidad_recibida int CHECK (cantidad_recibida >= 0)` NULL) + índice `id_traslado`.
- RLS **habilitado** con lectura por RPC (mismo criterio que compras: REST anon no sirve para verificar) + grants `anon, authenticated`.
- 4 RPCs (`LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`, params `p_`, `RAISE EXCEPTION`):
  1. `registrar_traslado(p_id_sucursal_origen uuid, p_id_sucursal_destino uuid, p_id_usuario uuid, p_lineas jsonb)` → valida destino ≠ origen, **misma empresa** y `activo`, líneas no vacías, `cantidad > 0`; descuenta stock por línea en `productos_sucursal` **con guard** (`stock < cantidad` → `RAISE`); devuelve `{id_traslado}`.
  2. `get_traslados(p_id_sucursal uuid, p_direccion text, p_busqueda text, p_limit int, p_offset int)` → `p_direccion ∈ ('enviados','recibidos')` (origen = yo / destino = yo); devuelve `{traslados:[{cabecera + origen + destino + usuario + lineas:[{id_producto, name, cantidad_enviada, cantidad_recibida}]}], total}` con `count(*) OVER()`.
  3. `aceptar_traslado(p_id_traslado uuid, p_id_sucursal uuid, p_id_usuario uuid, p_lineas jsonb)` → solo la sucursal destino y solo `enviado`; valida `0 ≤ recibida ≤ enviada` por línea; actualiza `detalle_traslado`, estado (`recibido`/`recibido_parcial`), `id_usuario_receptor`/`fecha_recepcion`; **stock destino += recibida** y **stock origen += (enviada − recibida)** en la misma transacción; devuelve `{id_traslado, estado}`.
  4. `anular_traslado(p_id_traslado uuid, p_id_sucursal uuid, p_id_usuario uuid, p_motivo text)` → solo el origen y solo `enviado`; revierte el stock de A; estado `anulado`; devuelve `{id_traslado}`.
- `NOTIFY pgrst, 'reload schema'` al final (lección PGRST202 de compras).

**Nota de diseño (anticipada para la Task 8):** si un traslado se crea **y** se acepta offline, hay dos eventos en cola con el mismo id local; tras el remapeo del `registrar_traslado`, `colaSyncService` debe **re-apuntar** los eventos `PENDING` posteriores de `tabla='traslados'` con ese id local al id del servidor (o `aceptar_traslado` fallaría con "no existe" → CONFLICT falso).

## 5. Reglas Inviolables (Constitución)

- **Art. II:** toda fila lleva sucursal de origen/destino explícitas; primero IndexedDB, sin bloqueos por red; cola con `sync_status`.
- **Art. III:** anon key únicamente (el módulo no maneja dinero).
- **Art. IV:** solo CoreUI/Bootstrap; iconos verificados antes de usar; al **aceptar** un traslado sube stock → la alerta `stock <= min_stock` del Inventario se reevalúa con los datos frescos (no requiere código nuevo).
- **Art. V:** actualizar los 6 puntos al crear el módulo.

## 6. Fuera de Alcance (esta iteración)

- Estados intermedios de logística (`preparado`, `en_tránsito`), rutas/costos de flete, guía de remisión impresa.
- Traslados entre empresas distintas, aprobaciones multi-nivel, resolución automática de `CONFLICT`.
- Kardex/valorización de inventario y transferencias con precio (este módulo es por cantidad).

## 7. Criterios de Aceptación Globales

1. Con la red cortada se crea un traslado: en <2 s queda visible, el stock de A baja localmente y el evento aparece `PENDING` en la cola; la lista local lo muestra.
2. Al volver la red, la cola lo sube con remapeo de id **sin duplicados**; si el stock del servidor ya no alcanza, queda `CONFLICT` con el motivo visible.
3. Con un traslado recibido se acepta **parcialmente** (0 en un producto, menos cantidad en otro): el stock de la sucursal destino sube solo lo recibido, el origen recupera lo no recibido (verificado en servidor) y el estado queda `recibido_parcial`.
4. La campanita muestra el punto rojo con el conteo de traslados `enviados` a mi sucursal (también sin red, desde el espejo), navega a Movimientos y desaparece cuando no queda ninguno `enviado`; sin permiso `traslados/ver` no se muestra.
5. Un usuario sin permiso `traslados/ver` no ve el módulo ni entra por URL (y sin flash de admin al recargar).
6. `npm run build` y lint de los archivos tocados en 0.
