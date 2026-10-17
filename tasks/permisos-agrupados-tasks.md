# Tasks — Permisos del rol: agrupados por sección + selección rápida

**Spec:** `specs/permisos-agrupados.md` · **Estado:** Tasks 1–5 COMPLETADO 2026-10-16. **Fase 2 (Tasks 6–11) COMPLETADO 2026-10-17** — fixes de la crítica Impeccable (18→30/40).

---

- [x] **Task 1 — Agrupar y selección rápida (RF-PA1/PA2/PA3)**
  - `ModalPermisos.jsx` importa el catálogo compartido; CModal `scrollable`; barra superior `Marcar todo` / `Limpiar`; `thead` con checkbox tri-estado por columna (global); fila de título de sección (`bg-body-tertiary` adaptativo) con checkbox tri-estado por columna (scope sección) o `—` si no aplica; helpers `estadoColumna`/`aplicar`/`aplicarTodo`.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (capturas dark/light ✓; probe funcional: `Marcar todo`→todo `1`, `Limpiar`→todo `0`, columna Ver global→solo ver)  *Aprobación:* [x]

- [x] **Task 2 — Visualización en tarjetas de rol (RF-PA4)**
  - `modulosPermisos.js` (catálogo compartido `GRUPOS`/`MODULOS`/`SOLO_VER`/`accionesDe`/`ACCIONES`); `ModalPermisos`+`RolesCard`+`Roles` importan de ahí; `RolesCard` agrupa por sección, oculta módulos sin permiso, chip `V C E D` + `N módulos con acceso`; leyenda única en `Roles.jsx`; estilos `.roles-perm-*` en `style.scss`.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (capturas dark/light ✓, agrupación y chips correctos)  *Aprobación:* [x]

- [x] **Task 3 — Secciones colapsables (RF-PA5)**
  - `ModalPermisos.jsx`: estado `colapsados` (reset a expandido al abrir); título de sección = botón con chevron + `aria-expanded`; filas de módulos condicionadas al estado. Sin `CCollapse` (filas de tabla).
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: expandido 28 filas, Catálogos contraído 18, 3 secciones contraídas 7; `aria-expanded` true→false)  *Aprobación:* [x]

- [x] **Task 4 — Fondo solo en filas de título de sección (RF-PA6)**
  - `ModalPermisos.jsx`: `bg-body-tertiary` en las filas de título de sección (incluidas sus **celdas** `CTableDataCell`, porque el `td` de CoreUI tapa el fondo de la `<tr>` con `--cui-table-bg`); las filas de módulos quedan sin gris.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (capturas dark/light: gris solo en Administración/Catálogos/Operación/Punto de Venta)  *Aprobación:* [x]

- [x] **Task 5 — Verificación (RF-PA3/PA4/PA5/PA6)**
  - `npx eslint` de los 4 archivos tocados = 0; `npm run build` ✓; detector Impeccable ✓; capturas + probe funcional ✓ (ver Tasks 1–2). Pendiente: smoke manual del desarrollador y persistencia con `Guardar`; actualizar `memory.md`/`AGENTS.md`.
  - *Estado:* **verificado técnicamente 2026-10-16** — aprobado · *Aprobación:* [x]

---

## Fase 2 — fixes de la crítica Impeccable (P0–P2)

- [x] **Task 6 — Etiquetas humanas de módulo (RF-PA7, P0)**
  - `modulosPermisos.js`: `LABELS` + `labelDe(modulo)`; `ModalPermisos.jsx`/`RolesCard.jsx` renderizan el nombre humano (y `title` humano), nunca la clave cruda.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: "Tipos de precio"/"Cotizaciones" visibles; `tipos_precio` ausente en modal y tarjetas) · *Aprobación:* [x]

- [x] **Task 7 — Guardado protegido (RF-PA8, P1)**
  - `ModalPermisos.jsx`: snapshot original + detección de cambios; `guardando` (disable + `CSpinner`); `ConfirmModal` al cerrar con cambios; error mantiene el modal y re-sincroniza; fix `err.menssage`→`err?.message`.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: con cambios, `Cancelar` abre "Descartar cambios"; "Descartar" cierra el modal) · *Aprobación:* [x]

- [x] **Task 8 — Coherencia ver ⊇ acciones (RF-PA9, P1)**
  - `ModalPermisos.jsx`: activar escritura auto-activa `ver`; apagar `ver` apaga la escritura (toggle por fila y atajos `aplicar`).
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: Inventario `crear=true` ⇒ `ver=true`) · *Aprobación:* [x]

- [x] **Task 9 — Orden de secciones alineado al nav (RF-PA10, P2)**
  - `modulosPermisos.js`: `GRUPOS` a Punto de Venta → Operación → Catálogos → Administración.
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: orden exacto confirmado) · *Aprobación:* [x]

- [x] **Task 10 — Estados de lista, contraste y tarjetas anidadas (RF-PA11, P2)**
  - `Roles.jsx`: `cargando`/`error`(+Reintentar)/vacío distinguiendo "No hay roles" de "Sin resultados". `style.scss`: contraste AA en `.roles-perm-dot--off`. `RolesCard.jsx`: contenedor `div.border.rounded` (sin `CCard` anidada).
  - *Estado:* **CÓDIGO COMPLETO 2026-10-16** (probe: `dotOff` color `rgba(255,255,255,0.87)`/opacity `1`; `.card .card` = 0) · *Aprobación:* [x]

- [x] **Task 11 — Verificación (RF-PA7…PA11)**
  - `npx eslint` de los archivos tocados = 0; `npm run build` ✓; verificaciones funcionales (guardado, coherencia ver, contraste); re-correr `$impeccable critique`; actualizar `memory.md`/`AGENTS.md`.
  - *Estado:* **verificado 2026-10-17** — eslint ✓ · build ✓ · probe funcional ✓ (10 campos OK) · `npx eslint Roles.jsx` ✓ (fix P1 tarjeta) · 2.ª crítica **30/40** (18→30) · `memory.md`/`AGENTS.md` actualizados · *Aprobación:* [x]
