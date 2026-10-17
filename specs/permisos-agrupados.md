# Spec — Permisos del rol: agrupados por sección + selección rápida

**Fecha:** 2026-10-16 · **Origen:** pedido del desarrollador — "en permisos puedes agruparlos por módulo y colocar una opción para de seleccionar rápido todos".

## Contexto

La matriz de permisos (`src/views/admin/permisos/ModalPermisos.jsx`) lista **24 módulos en una sola tabla plana** (sin secciones) y solo permite marcar casilla por casilla. Para un rol con muchos permisos eso es tedioso y difícil de escanear.

El nav (`src/_nav.jsx`) ya organiza los módulos en **secciones** (títulos `CNavTitle`): Operación, Catálogos, Administración — más `pos` (Punto de Venta) y los botones `pos_cotizar` / `pos_ver_cotizaciones`. La agrupación de la matriz debe **espejar esa IA** para que el admin reconozca la organización.

Alcance: **solo cliente** — `src/views/admin/permisos/ModalPermisos.jsx`. **Sin cambios de schema, RPC ni `permisoService`.** `MODULOS` (RolexCard) y el resto de arrays no cambian de contenido: el conjunto de claves sigue siendo el mismo (24).

## RF-PA1 — Agrupar por sección

- `GRUPOS` = 4 secciones que espejan el nav, en su orden (**RF-PA10**): Punto de Venta (el nav lo pone arriba de las secciones), Operación, Catálogos y Administración.
  1. **Punto de Venta**: `pos`, `pos_cotizar`, `pos_ver_cotizaciones`
  2. **Operación**: `inventario`, `historial`, `compras`, `traslados`, `reportes`, `facturacion`
  3. **Catálogos**: `productos`, `ingredientes`, `clientes`, `catalogos`, `colores`, `marcas`, `categorias`, `proveedores`, `unidades`, `tipos_precio`
  4. **Administración**: `usuarios`, `empresas`, `sucursales`, `bodegas`, `roles`
- `MODULOS = GRUPOS.flatMap(g => g.modulos)` (única fuente; mismo set que hoy).
- La tabla muestra una **fila de título de sección** antes de sus módulos (título en negrita). El nombre de cada módulo se muestra con `labelDe(modulo)` (**RF-PA7**) y la nota "(botón del POS)" para `SOLO_VER`.

## RF-PA2 — Selección rápida "todos"

Tres niveles de atajo, todos **tri-estado** (marcado / indeterminado / vacío) y respetando `SOLO_VER`:

- **Por columna global** (thead): un checkbox bajo cada encabezado `Ver` / `Crear` / `Editar` / `Eliminar` que marca/desmarca esa acción en **todos** los módulos aplicables.
- **Por sección + columna** (fila de título): un checkbox bajo cada acción que la marca/desmarca en **todos los módulos de esa sección**.
- **Todo de un golpe** (barra superior de la tabla): botones `Marcar todo` y `Limpiar` que aplican a **todas las acciones de todos los módulos aplicables**.

Reglas:
- `accionesDe(modulo)` = `['ver']` para `SOLO_VER` (`pos_cotizar`, `pos_ver_cotizaciones`), si no `['ver','crear','editar','eliminar']`. Un atajo **nunca** escribe `crear/editar/eliminar` en un módulo `SOLO_VER`.
- Cuando una columna no aplica a ninguna fila de la sección (p.ej. `Crear` en una sección 100% `SOLO_VER`) se muestra `—` en vez de un checkbox muerto.
- Clic sobre un checkbox indeterminado → marca todo (comportamiento nativo del navegador).
- Los contadores de estado usan `permisos[modulo]?.[accion]` (tolerante a estado de carga).

## RF-PA3 — Sin regresiones

- `cargarPermisos`, `togglePermiso`, `handleGuardar` y los RPC `get_permisos_by_rol` / `upsert_permiso` **no cambian** (mismo payload: `p_puede_*` por módulo).
- El modal conserva `size="lg"`; se añade `scrollable` para mantener el encabezado/pie fijos con 24 filas + 4 títulos.
- El contenedor (`Roles.jsx`) sigue siendo el dueño del toast/cierre; el modal no toastea.

## RF-PA4 — Visualización en las tarjetas de rol (`RolesCard`)

Origen: pedido del desarrollador — "también puedes mejorar la visualización de los permisos" (captura de "Gestión de Roles y Permisos"). Hoy cada rol lista una pared de `CBadge color="info"` con `modulo:` + texto, todas del mismo azul, incluidas filas sin permisos (`usuarios:` a secas).

- **Catálogo compartido:** nuevo `src/views/admin/permisos/modulosPermisos.js` exporta `GRUPOS`, `MODULOS`, `SOLO_VER`, `accionesDe`; `ModalPermisos` y `RolesCard` dejan de duplicar la lista.
- **Agrupación:** la tarjeta agrupa por las mismas 4 secciones (rótulo en mayúsculas) y **oculta los módulos sin ningún permiso** (y las secciones vacías).
- **Chip por módulo:** nombre (`_`→espacio, capitalizado) + 4 bolitas `V C E D` (`roles-perm-dot`): rellena (`bg-primary text-white`) = concedido, vacía (`roles-perm-dot--off`) = sin permiso; `title` con la acción.
- **Leyenda** `V Ver · C Crear · E Editar · D Eliminar` + `N módulos con acceso`.
- **Sin fila** para `pos_cotizar`/`pos_ver_cotizaciones` ⇒ se muestran con `ver` (default visible, igual que en runtime).
- Rol sin ningún permiso ⇒ "Sin permisos asignados." (con candado).
- Estilos en `src/scss/style.scss` (`.roles-perm-chip`, `.roles-perm-dot`, `.roles-perm-dot--off`) usando variables `--cui-*` (se adaptan al modo oscuro).

## RF-PA5 — Secciones colapsables (modal)

Origen: pedido del desarrollador — "puedes hacer estos colapsables por módulo?".

- Cada **fila de título de sección** es un botón (`btn-link`, sin subrayado, `text-reset`) con chevron (`cilChevronTop` expandida / `cilChevronBottom` contraída) y `aria-expanded`/`aria-label`.
- Al contraer, **se dejan de renderizar** las filas de módulos de esa sección (los checkboxes de la fila de título siguen visibles y operativos).
- Estado local `colapsados` (ausente = expandida); se **reinicia a expandido** cada vez que se abre el modal.
- No se usa `CCollapse` (no anima bien en filas de tabla); se condiciona el render.

## RF-PA6 — Fondo de las filas de título de sección (modal)

Origen: pedido del desarrollador — "solo en donde aparece el nombre de Administración, Catálogos, Operación y Punto de Venta".

- **Solo** las filas de título de sección llevan el fondo gris `bg-body-tertiary`.
- Las filas de módulos conservan el fondo por defecto (sin gris).
- El fondo se aplica a las **celdas** (`CTableDataCell`) además de a la `<tr>`: CoreUI pinta `background-color: var(--cui-table-bg)` en el `td` y este tapa el fondo de la fila. `bg-body-tertiary` es `!important` y gana.
- El thead (encabezados Ver/Crear/…) conserva su estilo por defecto.

## Cambios de la crítica Impeccable (2026-10-16)

Origen: corrida `$impeccable critique` sobre `ModalPermisos.jsx` (18/40). El desarrollador aprobó **todo (P0–P2)** y **alinear el orden al nav**. Alcance: mismo módulo, sin cambios de RPC/schema.

### RF-PA7 — Etiquetas humanas de módulo (P0)

- `modulosPermisos.js` exporta `LABELS` (clave→nombre humano) y `labelDe(modulo)` = `LABELS[modulo] ?? modulo.replace(/_/g,' ')` (fallback).
- `ModalPermisos.jsx` y `RolesCard.jsx` dejan de renderizar la clave cruda (`pos cotizar`, `tipos precio`): usan `labelDe(modulo)`. El `title` de la tarjeta pasa a ser el nombre humano, nunca la clave.
- Nombres: `tipos_precio`→"Tipos de precio", `pos`→"Punto de venta", `pos_cotizar`→"Cotizaciones", `pos_ver_cotizaciones`→"Ver cotizaciones", `categorias`→"Categorías", `facturacion`→"Facturación", etc. La sección "Punto de Venta" da el contexto de los botones del POS.

### RF-PA8 — Guardado protegido (P1)

- `ModalPermisos.jsx` guarda un **snapshot original** al cargar y calcula si hay **cambios sin guardar**.
- Al guardar: estado `guardando` → `Guardar` y `Cancelar` deshabilitados + `CSpinner` dentro del botón. No se puede doble-enviar.
- Cerrar con cambios pendientes (X, ESC, backdrop o `Cancelar`) abre un `ConfirmModal` "Descartar cambios sin guardar"; solo cierra si el usuario confirma.
- Error en `upsert_permiso`: se mantiene el modal abierto, toast con el módulo exacto y **re-sincronización** de `cargarPermisos()` para reflejar lo realmente persistido. Se corrige el typo `err.menssage` → `err?.message || 'Error inesperado'`.
- Sigue siendo **secuencial** (sin cambios de RPC); la protección es UI.

### RF-PA9 — Coherencia `ver ⊇ acciones` (P1)

- Toda acción de escritura (`crear`/`editar`/`eliminar`) **implica** `ver`: si se activa una, se auto-activa `Ver`.
- Apagar `Ver` apaga también `crear`/`editar`/`eliminar` (no se puede construir el estado contradictorio "oculto pero operable").
- Aplica tanto al `togglePermiso` por fila como al atajo `aplicar(..., 'ver', false)` / `aplicar(..., 'crear'|'editar'|'eliminar', true)`. `Marcar todo`/`Limpiar` siguen coherentes.

### RF-PA10 — Orden de secciones alineado al nav (P2)

- `GRUPOS` se reordena a **Punto de Venta → Operación → Catálogos → Administración**, el mismo orden en que el nav presenta "Punto de Venta" y sus secciones (`_nav.jsx`), para que el admin encuentre los módulos donde los ve en el sidebar. (Ver RF-PA1.)

### RF-PA11 — Estados de lista, contraste y tarjetas anidadas (P2)

- `Roles.jsx`: estado `cargando` (spinner mientras `get_roles_con_permisos` resuelve), estado `error` (con botón **Reintentar**), y estado vacío distinguiendo "No hay roles" de "Sin resultados para «query»".
- `.roles-perm-dot--off` (style.scss): subir contraste a AA — usar `var(--cui-body-color)` y quitar `opacity: 0.6` (el detector midió 3.2:1 con `--cui-secondary-color`).
- `RolesCard.jsx`: dejar de anidar `CCard` dentro de la `CCard` de `Roles.jsx` (regla `nested-cards`); el contenedor por rol pasa a `div.border.rounded` con padding equivalente.

## Criterios de aceptación

1. El modal muestra 4 filas de sección (Administración, Catálogos, Operación, Punto de Venta) con sus módulos debajo.
2. El checkbox de columna en el `thead` marca/desmarca esa acción en todos los módulos y pasa a indeterminado con selección parcial.
3. El checkbox de una sección afecta solo a los módulos de esa sección.
4. `Marcar todo` marca `ver` en los 24 módulos y `crear/editar/eliminar` solo donde aplican; `Limpiar` los deja en vacío (incluido `ver` de los botones del POS).
5. Guardar persiste exactamente el estado mostrado (mismos RPC que hoy).
6. `npx eslint src/views/admin/permisos/ModalPermisos.jsx` 0 errores nuevos; `npm run build` ✓.
7. Las tarjetas agrupan por sección, ocultan los módulos sin permiso y muestran el chip `V C E D`; un rol sin permisos dice "Sin permisos asignados."
8. `npx eslint src/views/admin/permisos/{RolesCard,ModalPermisos,modulosPermisos}.jsx` 0 errores nuevos; `npm run build` ✓ (modo claro y oscuro).
9. Cada sección se contrae/expande con el chevron; `aria-expanded` cambia y las filas de esa sección desaparecen (24 módulos + 4 títulos = 28 filas expandidas).
10. Modal y tarjetas muestran nombres humanos (`Tipos de precio`, `Cotizaciones`), nunca claves crudas (`tipos_precio`, `pos_cotizar`).
11. `Guardar` se deshabilita y muestra spinner mientras persiste; no hay doble envío; cerrar con cambios sin guardar pide confirmación (X/ESC/backdrop/`Cancelar`).
12. No se puede dejar `ver=false` con `crear`/`editar`/`eliminar` encendido (ni por fila ni por atajos).
13. El orden de secciones del modal y las tarjetas es Punto de Venta → Operación → Catálogos → Administración.
14. La lista de roles muestra spinner (carga), "No hay roles"/"Sin resultados" (vacío) y alerta con **Reintentar** (error); `.roles-perm-dot--off` cumple contraste AA y no hay `CCard` anidada.
15. `npx eslint` de los archivos tocados = 0; `npm run build` ✓.

## Fuera de alcance

- Los arrays `MODULOS` de `useNavPermissions`/`routes.js`/`_nav.jsx` no cambian (mismo set de claves).
- Nuevos módulos/permisos ni cambios de RPC/schema (el guardado sigue secuencial).
- Reordenar o renombrar módulos del nav (solo se alinea la matriz al nav, no al revés).
- Nuevos estados visuales de las tarjetas más allá del contenedor sin anidar; la copia de las observaciones menores (placeholder, etiqueta "Nuevo rol", chevron, prop muerta) es opcional y no bloquea.
