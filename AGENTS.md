# AGENTS.md

POS + admin multisucursal para librería/cadena de tiendas. React 19 + CoreUI 5 + Vite, backend en Supabase (sin código de servidor) y almacenamiento local Offline-First con IndexedDB (Dexie.js / Idb). Los textos de UI y comentarios están en español; el usuario se comunica en español.

---

## 📜 Gobernanza y Flujo de Trabajo (Inviolable)

1. **Constitución del Proyecto:** Antes de realizar cualquier acción, consulta `constitution.md`. Ningún código o cambio generado puede violar sus artículos (especialmente el aislamiento por sucursal, la prioridad Offline-First, el límite de 2s en registro de ventas y las normas de seguridad).
2. **Ciclo SDD (Specs y Tasks):**
   - NO se escribirá código ni se refactorizará sin una especificación previa en `specs/<modulo>.md` y una tarea activa en `tasks/<modulo>-tasks.md`.
   - Trabaja strictly en **UNA sola tarea a la vez**. Muestra los cambios, espera la verificación del desarrollador y marca el checkbox `[x]` en `tasks.md` antes de avanzar.
3. **Control de Memoria:**
   - `memory.md` (raíz) = Estado corriente (fases hechas, bugs corregidos, IDs nuevos).
   - `AGENTS.md` (raíz) = Reglas permanentes (comandos, arquitectura multisucursal, convenciones).
   - Mantén ambos archivos actualizados al finalizar cada sesión o al completar un módulo.

---

## 🏬 Arquitectura Multisucursal y de Datos (IndexedDB + Supabase)

- **Identificador de Sucursal Obligatorio (`branch_id` / `id_empresa`):**
  - Toda venta, movimiento de inventario, usuario y caja chica DEBE estar asociado explícitamente a un `branch_id` (UUID).
  - En la sesión activa (`localStorage`), la clave `empresaSeleccionada` define la sucursal sobre la cual opera el dispositivo local.
- **Offline-First por Sucursal (Cliente):**
  - Las lecturas/escrituras críticas de venta e inventario ocurren **primero en IndexedDB**, filtradas y aisladas para la sucursal configurada en el dispositivo.
  - La interfaz NUNCA debe bloquearse por latencia o falta de red.
- **Backend Central Multisucursal (Supabase):**
  - No hay `.env`: la URL y la clave anon publicable están hardcodeadas en `src/lib/supabase.js`. Queda prohibido el uso de claves `service_role`.
  - RLS y RPCs bloquean lecturas cruzadas entre sucursales. Todo acceso a datos pasa por RPCs `SECURITY DEFINER` que reciben obligatoriamente el `branch_id` como parámetro.
- **Fuente de verdad del stock (`stock-bodega-fuente-verdad`):** `stock_bodega` (por bodega×producto) es la **fuente de verdad**; `productos_sucursal` es la **caché** de stock total por sucursal y el trigger `trg_mirror_stock_bodega` la **espeja** a la bodega Principal. Los RPC de stock (venta/compra/anulación) siguen escribiendo solo `productos_sucursal` → la convergencia ocurre **por trigger**, no reescribiendo RPC (fuentes incompletas). El POS (`POSPage` → `ProductoDetalle`/`ProductosGrid`) resuelve el stock de `db.stock_bodega` de la bodega activa (fallback a `producto.stock`). En Dexie (v11) `stock_bodega` tiene índices `'[id_bodega+id_producto], id_bodega, id_producto'` (sin `id_bodega` el `.where('id_bodega')` lanza y el `catch` lo oculta → Inventario 0). **`productos_sucursal` NO tiene UNIQUE(id_sucursal,id_producto) y tiene duplicados** → en SQL usar `GROUP BY`/reconciliador, nunca `ON CONFLICT DO UPDATE` sobre filas duplicadas (`cannot affect row a second time`).
- **Color por variantes (`papel-iris`):** un producto con color es **una fila por color** en `productos` (`id_color`); no hay agrupación en BD. El selector es un **`CFormSelect` desplegable** en `ProductoDetalle.jsx` (no botones: puede haber >10 colores) y se arma en cliente con `src/views/pos/colorUtils.js` (`base(p) = nombre sin el color del final`, case-insensitive/trim) sobre `db.productos` + `db.colores` (Dexie v12); aparece **solo con ≥2 hermanos** (misma base, `id_color` no nulo) y elegir uno es `busqueda.seleccionar(hermano)`. El dropdown de `BuscadorProducto.jsx` muestra el **nombre del color como badge** por resultado (las variantes pueden compartir nombre). El color de la venta **lo deriva el servidor** en `detalle_venta.id_color` desde `productos.id_color` (el cliente NO lo envía); el comprobante lo muestra por línea (offline vía `historialOfflineService`).
- **Motor de Sincronización (Sync Engine):**
  - Cada transacción en IndexedDB lleva una cola con `sync_status` (`'PENDING' | 'SYNCED' | 'CONFLICT'`) y su `branch_id` de origen.
  - El servicio en segundo plano envía los registros pendientes a Supabase etiquetados con su sucursal correspondiente.
- **Guard de red (obligatorio para toda acción que toque el servidor):**
  - `src/services/redService.js` → `hayRed()`, `puedeSolicitarFolioOficial()` (regla central) y `AVISO_FOLIO_SIN_RED`. Sin `navigator.onLine` no se llama a ningún RPC (venta, cotización, folio, anulación, edición de cliente).
  - `src/hooks/useEstadoRed.js` → estado reactivo (`online`/`offline`) para banners, botones y titles.
  - Toda pantalla de listado o ticket **debe** tener una fuente local equivalente: con red el servidor manda y se le suman los locales pendientes de sync; sin red, filtros y paginación se aplican en memoria sobre el espejo local.
- **Impresión fiscal:** hasta que exista API de la SAT, nada impreso es fiscal. Todo comprobante armado desde IndexedDB lleva marca de agua + leyenda **"PENDIENTE DE SINCRONIZACIÓN FISCAL"** (`src/components/common/MarcaAguaComprobante.jsx`). **Excepción `facturas-sat`:** la factura simulada (`FacturaImpresion`, emisión online-only con folio server-side `A-0000000X`) se imprime en **80 mm y carta SIN marca de agua** (spec D4 aprobada) reutilizando el ciclo print de `.comprobante-ticket`; no "arreglarla" agregando la leyenda.
- **Arranque frío offline (Service Worker — `specs/offline-pwa.md`):**
  - `src/sw.js` es una **PLANTILLA** (no se registra tal cual): `vite.config.mjs` (plugin `generar-sw`) la copia a `build/sw.js` inyectando el id de cache (`pos-shell-<ts>`) y el manifiesto de assets. El registro vive en `src/index.jsx` y **solo corre con `import.meta.env.PROD`** — en :3000 (dev y E2E) **no debe** haber SW registrado.
  - Estrategia: **network-first** en navegaciones (deploys nuevos surten), **cache-first** en assets hasheados, y **solo same-origin GET** — Supabase/RLS/sync nunca se interceptan. `install` precachea shell + manifiesto + refs del HTML.
  - **`Cache.addAll` rechaza URLs duplicadas resueltas** (`InvalidStateError: duplicate requests`): `'index.html'` vs `'./index.html'` son la MISMA URL → el SW muere `installing→redundant` y Chrome desregistra. Siempre deduplicar sobre `new URL(u, self.location.href).href` antes de `addAll` (ver trampa en `tasks/offline-pwa-tasks.md`).

---

## ⚙️ Comandos del Proyecto

- `npm start` — servidor de desarrollo en http://localhost:3000. HashRouter: todas las rutas llevan el hash (`http://localhost:3000/#/productos`).
- `npm run build` — build de producción en `build/` (~15s, pasa). Es todo lo que corre CI (`.github/workflows/npm.yml`).
- `npm run lint` — corre `eslint` en todo el repo y **siempre falla: ~5.3k errores preexistentes** (≈5.2k prettier `Delete \`␍\``por finales de línea CRLF + errores de react-hooks v7 en archivos viejos). Haz lint solo de los archivos que tocaste:`npx eslint src/ruta/archivo.jsx`.
- Tests E2E: `src/e2e/*.test.js` son scripts Selenium independientes. Se corren individualmente con `npm run test:login|test:e2e|test:edit|test:elim|test:reg`. Requieren el dev server corriendo en :3000 e inician sesión con `system` / `system321`.
- E2E del módulo Traslados: `npm run test:traslados` (34) `test:traslados-ui` (31) `test:traslados-mov` (30) `test:traslados-campana` (37) `test:traslados-nav` (27) `test:traslados-sync` (32). Por defecto entran con `alex`/`alex123` (Ferromax); usan perfil Edge temporal (IndexedDB fresco) y fixture idempotente `Fixture T9 Traslados` con stock canónico forzado al inicio y en el `finally` (lección 18: una corrida muerta no contamina la base de la siguiente).
- **Suite de casos de prueba — formato estándar (78 casos, 8 módulos sin Traslados):** `npm run test:casos` corre las 9 suites `src/e2e/casos/CP*.test.js` en secuencia (resultados `docs/e2e-resultados/*.json` + capturas `docs/capturas/CP-*.png`); `npm run test:casos-informe` genera `docs/casos-prueba-formato-estandar.md` (8 campos por caso + captura). Requiere :3000. Casos fuente: `docs/casos-prueba-usuario.md`; API compartida: `src/e2e/casos/utilCasos.js` (`caso()` siempre captura y registra; `check` lanza → el primer fallo es el `motivo`; `permisoTemporal` para casos de permisos vía `upsert_permiso` con anon).
- **Sin Git local (`.git`):** Confirma siempre con el usuario antes de ediciones o reescrituras masivas.
- **E2E de functionality offline (Selenium, scripts en `C:\Users\HP\AppData\Local\Temp\opencode\`):** 11 reglas que cuestan sangre —
  1. `Network.enable` **antes** de `Network.emulateNetworkConditions` (si no, el "offline" se ignora en silencio).
  2. **Nunca** abras IndexedDB desde el script antes de que la app lo cree (`indexedDB.databases()` sí, `indexedDB.open()` no): una conexión vieja bloquea el `versionchange` de Dexie y la hidratación se cuelga.
  3. Con red, **abre una vez cada ruta lazy** que usarás offline: en el dev server el import dinámico sin red lanza `Failed to fetch dynamically imported module` y tumba todo el árbol de React.
  4. Re-setear `window.location.hash` al **mismo valor** no dispara navegación (ni render de rutas): para re-probar un guard (p. ej. `PermissionRoute`), navega antes a otra ruta (`#/dashboard`) y luego a la objetivo.
  5. El check de consola debe filtrar el ruido de la new tab de Edge (`ntp.msn.com`, `assets.msn.com`, `microsoft.*.js`): esos SEVERE no son de la app.
  6. `getText()` sobre un snapshot de `findElements` lanza `StaleElementReference` cuando React re-renderiza la tabla entre medias → try/catch por fila y `continue`.
  7. **Nunca cuentes filas de tabla justo después de un evento que dispara `recargar()`** (el spinner/vacío de la ventana de refetch hace flakiness): espera por el **badge/texto de la fila concreta**, no por el conteo.
  8. La hidratación del catálogo solo se dispara en login/POS: si un `navigate().refresh()` la interrumpe, re-llama `hidratarCatalogoParaSucursal(idSucursal)` a mano y verifica con `db.productos.get(...)`.
  9. **Pre-run: mata procesos zombi** antes de cada corrida — `taskkill //F //IM msedge.exe 2>/dev/null; taskkill //F //IM msedgedriver.exe 2>/dev/null; sleep 2` (un msedge viejo con el mismo `--user-data-dir` revienta con "failed to start: crashed / DevToolsActivePort file doesn't exist"). En scripts de temp, captura el resultado final **siempre en `finally`** antes de `quit()`.
  10. `executeScript` con una IIFE async **necesita `return` de nivel superior** (`return (async () => {...})()`): sin él el driver la evalúa como *statement* y devuelve `null` (no la promesa) — rompe cualquier `wait` condicional que lea propiedades del resultado.
  11. **`document.body.innerText` respeta `text-transform: uppercase`** de CSS: con clases `text-uppercase` el texto se lee EN MAYÚSCULAS ("#NO", "DATOS DEL COMPRADOR") — los asserts `.includes('#No')` fallan en falso. Comparar siempre en minúsculas (`cuerpo.toLowerCase().includes('…')`).

---

## 🔐 Permisos, Contexto de Sucursal y Navegación

- **Contexto de Sucursal:** Admin puede alternar entre sucursales o ver un consolidado global. Los usuarios de punto de venta (operadores) están restringidos a su `branch_id` asignado.
- **Sesión y cierre por inactividad (15 min):** la sesión vive solo en `localStorage` (`currentUser`); toda vía de cierre pasa por `cerrarSesion()` de `src/services/sesionService.js` (limpia `currentUser` + `session_last_activity` y navega a `/login`) — no borrar `currentUser` a mano. **`cerrarSesion` NO borra `empresaSeleccionada`** (`login-recordar-empresa`): es un "recuerdo" del dispositivo para prefijar el Login, no parte de la sesión (por navegador; no se comparte entre dispositivos). El reloj de inactividad lo lleva `useCierreInactividad` (montado en `DefaultLayout`, solo área autenticada); la marca persiste en `localStorage.session_last_activity` y se sincroniza entre pestañas por el evento `storage`. **`Login.jsx` debe llamar `marcarActividad()` al iniciar sesión** (si no, una marca vieja > 15 min cierra la sesión recién iniciada). Para E2E el timeout se acorta con `window.__SESSION_IDLE_MS__`.
- Checks por acción: `usePermission(modulo, accion)` (`crear|editar|eliminar|ver`); Admin devuelve `true` directo, otros roles llaman al RPC `has_permission`.
- **Los guards de permisos son offline-first** (`src/services/permisoService.js`): `PermissionRoute`, `usePermission` y `useNavPermissions` pasan por `verificarPermiso` (cache `perm_<rol>_<modulo>_<accion>` en localStorage; sin red → último conocido y, si no hay cache, **permite** — la UI no se bloquea por red; la seguridad real es server-side). Nunca llamar `has_permission`/`get_permisos_by_rol` directo en un guard sin fallback: sin red devuelve `data:null` → false → la vista queda en blanco o redirige.
- **El nav se siembra desde cache en su primer render** (`estadoInicial` en `useNavPermissions` + guard `permisos === null` en `AppSidebar`): un estado inicial `{}` con filtro `!== false` **muestra todos los módulos de admin** hasta que resuelve el RPC ("flash de admin" al recargar). Los permisos se cachean siempre que el nav o el route guard los resuelven con red.
- Agregar un módulo visible en el nav toca **5 lugares**:
  1. `src/routes.js` (campo `modulo`)
  2. `src/_nav.jsx` (campo `modulo`)
  3. `src/hooks/useNavPermissions.js` (array `MODULOS`)
  4. `src/views/admin/permisos/ModalPermisos.jsx` (array `MODULOS`)
  5. `src/views/admin/permisos/RolesCard.jsx` (array `MODULOS`)
- **Permisos individuales por catálogo:** `Catalogos.jsx` ya NO usa `usePermission('catalogos', ...)`. Cada pestaña (marcas, categorías, proveedores, unidades, tipos_precio, colores) resuelve sus propios permisos `ver`/`crear`/`editar`/`eliminar` vía `usePermission(t.key, accion)`:
  - Oculta pestañas sin `ver`; si el tab activo pierde permiso, redirige al primero disponible.
  - Oculta botón Crear sin `crear`, Editar sin `editar`, Eliminar sin `eliminar`.
  - Los arrays `MODULOS` de `ModalPermisos.jsx`, `RolesCard.jsx` y `useNavPermissions.js` incluyen ahora `colores`, `marcas`, `categorias`, `proveedores`, `unidades`, `tipos_precio` para que la matriz de permisos por rol controle cada catálogo por separado.
- **`_nav.jsx` exporta una función, no un array:** el default export es `obtenerNav()`, invocada por `AppSidebar` **en cada render**, para que el destino del ítem "Dashboard" (`/admin-dashboard` si `currentUser.id_rol.name === 'Admin'`, si no `/dashboard`) lea siempre la sesión vigente — un array a nivel de módulo queda stale tras logout/login sin recarga (bug: un no-admin aterrizaba en el dashboard de admin). Los ítems de nav se agregan **dentro** de `obtenerNav()`.
- **Los títulos de sección (`CNavTitle`, sin `to`/`modulo`) se ocultan si quedan vacíos:** `AppSidebar` no puede usar un `.filter()` plano con `if (!item.modulo) return true` (eso mostraba "Administración"/"Catálogos" **vacíos** a usuarios sin permisos). El filtrado es **consciente de sección**: se buffea el título (detectado por `!item.to`) y solo se emite si le sigue ≥1 ítem visible; si nada lo sigue, se descarta. `MobileNav.jsx` ya cumple esto por diseño (crea cada sección solo cuando tiene ítems visibles).
- **La barra inferior móvil deriva del mismo nav:** `src/views/dashboard/components/MobileNav.jsx` **no tiene lista propia** — reconstruye la barra (POS + Dashboard + `MODULOS_BARRA=['inventario','historial','compras','traslados','reportes']`) y el bottom sheet «Más» (agrupado por sección) a partir de `obtenerNav()` con el mismo filtrado que `AppSidebar` (`useNavPermissions` + `useFlagsSucursal`). Un módulo nuevo cae solo en «Más»; no es un 6.º lugar a tocar (solo añadir su `modulo` a `MODULOS_BARRA` si debe ir en la barra). Los iconos del nav son `<CIcon customClassName="nav-icon"/>`: se clonan con `{ size, customClassName: undefined }` porque con `customClassName` el prop `size` se ignora.
- **Rutas de dashboard con guard de rol (sin campo `modulo`):** `DashboardRoute.jsx` (Admin → `/admin-dashboard`) y `AdminDashboardRoute.jsx` (no-admin → `/dashboard`) son wrappers complementarios — al añadir rutas sensibles al rol, replicar este patrón en vez de confiar en que la URL no se visita a mano (`AppContent` solo aplica `PermissionRoute` si la ruta tiene `modulo`).

---

## 💻 Convenciones de Código y UI

- **Solo componentes CoreUI/Bootstrap:** Prohibido Tailwind/MUI o librerías externas de UI. Confía en el código del repo.
- **Prettier & Line Endings:** Sin punto y coma, comillas simples, indentación de 2 espacios, ancho 100. Ignora advertencias CRLF en archivos existentes; escribe archivos nuevos con LF.
- **Verificación de Iconos `@coreui/icons`:** Verifica en terminal antes de usar uno nuevo:
  `node -e "console.log(!!require('@coreui/icons').cilFoo)"`
- **Inputs numéricos editables:** para cantidades/stock/mínimo usar `src/components/common/CampoNumero.jsx` (`value`+`onCommit`+`min`/`max`), NO `CFormInput type="number"` con `parseInt(e.target.value)||1`. Aquel mantiene el texto local (permite borrar el campo), hace commit en vivo con número válido y recorta en `blur`/`Enter`. Con `type=number` el `onBlur` de React se dispara por `focusout`: en probes usar `el.blur()` real, no `dispatchEvent('blur')`.
- **Helpers compartidos:**
  - Toasts: `useToast()` de `src/components/common/ToastContext.jsx` → `showToast('success'|'danger', title, message, accion?)` (`accion` = `{label,onClick}`, p. ej. "Deshacer"; `danger` se pina al frente). Apila hasta **3** toasts, pero el **contenedor (la vista) sigue siendo el único dueño del toast y del cierre** — patrón `Empresas.jsx` + `EmpreasModal.jsx` (así el toast genérico del modal no pisa el `error.message` real; bug de roles-admin).
  - Modales de confirmación: `src/views/dashboard/components/common/ConfirmModal.jsx`.
- **Modales de formulario no toastean:** el contenedor (la vista) es el único dueño del toast y del cierre — `onSave` devuelve `{ ok } | { error }` y el modal solo cierra con `if (!resultado?.error) onClose()` (patrón `Empresas.jsx` + `EmpreasModal.jsx`). Un toast genérico en el modal **pisa** el `error.message` real del contenedor (bug de roles-admin), por lo que nunca toastear desde el modal: deja esa responsabilidad al contenedor.
- **Manejo de Dinero:** El dinero siempre se almacena en **centavos enteros** (ej. Q10.50 = `1050`). Formatea con `formatQ()` de `src/utils/format.js`. Prohibido guardar montos numéricos con decimales en BD o IndexedDB.
- **snake_case solo entre comillas (columnas/índices):** nunca se escribe una columna como variable JS (`{ id_empresa }` = `ReferenceError` en runtime; la hidratación falla y **Dexie queda vacía → vistas en blanco**). Usar el nombre del parámetro (`id_empresa: idEmpresa`) y strings solo en índices (`.where('id_empresa')`).
- **Trampas CoreUI 5 / Bootstrap:** `CCollapse` usa `visible` (NO `open`); `.bg-transparent` de Bootstrap lleva `!important` → anula resaltados con clase (usar `style={{ backgroundColor: ... }}` para filas resaltadas inline). **`useToast()` devuelve la función directamente** (`const showToast = useToast()`); NO destructurar (`const { showToast } = useToast()` → `TypeError: showToast is not a function` en runtime). **`CToaster` `push` = UN elemento** (patrón `Login.jsx`); para N toasts pasarlos como **children** (`<CToaster>{toasts}</CToaster>`) — un array en `push` es *truthy* aunque esté vacío y `React.cloneElement([])` en React 19 **no lanza**: devuelve `type: undefined` → `Element type is invalid` (revienta el render lejos del origen y por encima del `ErrorBoundary`).
- **RPC `upsert_cliente_admin` tiene sobrecarga (8 vs 9 params):** llamarlo SIEMPRE con los **9** params (incluye `p_descuento_bp`) — con 8 da `PGRST203` (ambiguous overload). Aplica a toda llamada desde E2E/probes/servicios.
- **E2E/probes del POS: `PanelPago` solo renderiza en desktop** (`matchMedia('(min-width: 992px)')`) — fijar `driver.manage().window().setRect({width:1400,height:900})` o el panel de pago (y botones Agregar/Cobrar) no existen.
- **Campo unificado de cliente (pos-cliente-unificado):** el NIT que viaja en la venta es `enlazado?.nit || nitCrudo` (D5) — un valor que **empieza con letra NO es NIT-candidato** (regex D3 `^[0-9]…`), el campo lo trata como nombre y la venta sale como CF; para probar el bloqueo D10 (NIT no en padrón) usar un NIT **numérico** no registrado.
- **Toda vista debe quedar dentro del `ErrorBoundary`** (`src/components/ErrorBoundary.jsx`, montado en `App.jsx` y `AppContent.jsx`): sin él, un `import()` de chunk lazy que falle (ej. sin red en dev) desmonta todo el árbol de React y la pantalla queda en blanco.
- **Efectos de listado con fetch del servidor → token de secuencia:** si un `useEffect` hace `await` de servidor y luego `setFilas(...)`, dos recargas solapadas (avisos de la cola) pueden completar desordenadas y la respuesta **vieja pisa a la nueva** (p. ej. desaparece el badge `conflicto`). Patrón: `const sec = ++secRef.current` al inicio del effect y `if (sec !== secRef.current) return` después de cada `await` (y en `catch`/`finally`). Ejemplo vivo: `secuenciaLista` en `TrasladosPage.jsx` (Task 9 de Traslados).
- **Conexión de vistas:** Componente en `src/views/<área>/`, import lazy + ruta en `src/routes.js`, ítem en `src/_nav.jsx`.
- **Diseño móvil (<768px):** las tablas anchas de operación se convierten en tarjetas apiladas (`src/components/common/TarjetaRegistro.jsx`: `titulo`, `subtitulo`, `badge`, `campos=[{label,value}]`, `acciones`). Técnica: bloque tabla `d-none d-md-block table-responsive` + bloque tarjetas `d-md-none lista-tarjetas` (misma fuente de datos, sin lógica nueva). Acciones siempre visibles, targets táctiles ≥44 px, `aria-label` en botones solo-icono. El escritorio no cambia: todo el contenido va en media-queries/`d-md-none`.
- **Shell móvil:** el sidebar **no** arranca abierto en <992px (estado inicial según ancho, se cierra al navegar y al cruzar el breakpoint); `CobrarBar` ajusta su `bottom` (0 en 768–991px, `3.5rem+env(safe-area-inset-bottom)` en <768px); el POS quita el `CContainer fluid` anidado para no duplicar el `px-4` de `AppContent`.
- **Modo comida del POS (`ProductosGrid.jsx`):** cards verticales estilo app de restaurante (imagen grande arriba, nombre centrado, precio abajo, badge Combo si `contiene_insumos`); fondo blanco, sombra y bordes redondeados; 2 columnas en móvil; cards compactos (imagen 56×56, menos padding, texto pequeño). Al tocar un producto con varias opciones (`precios.length > 1` o `contiene_insumos`) se abre `ModalVariantes.jsx` con lista de variantes por radio button (imagen pequeña + nombre + precio + radio a la derecha) y botón **"Continuar"** para confirmar antes de agregar al carrito. El botón "Cotizaciones" se oculta en modo comida (`esComida`) y cuando no hay permiso `pos_ver_cotizaciones`.
- **Contraste en modo oscuro:** `src/scss/style.scss` incluye reglas para mejorar legibilidad en modo oscuro — `text-body-secondary`/`text-muted` en blanco semitransparente (rgba(255,255,255,0.75)) sobre fondos oscuros; `pos-card-text`/`pos-product-name` en color oscuro (rgba(0,0,0,0.85)) sobre fondos blancos; precios en color primario (`--pos-primary`); botones secundarios con borde y texto más visibles.
