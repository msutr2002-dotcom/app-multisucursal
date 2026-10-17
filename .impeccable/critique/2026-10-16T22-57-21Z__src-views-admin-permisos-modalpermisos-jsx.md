---
target: src/views/admin/permisos/ModalPermisos.jsx
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\HP\\Desktop\\my-opencode\\POS-Libreria\\src\\views\\admin\\permisos\\ModalPermisos.jsx"
target_fingerprint: "sha256:514009db77787e01469315e3ecdd77dbbd79dc192a3690c2ed54e1ef40410493"
target_path: "C:\\Users\\HP\\Desktop\\my-opencode\\POS-Libreria\\src\\views\\admin\\permisos\\ModalPermisos.jsx"
timestamp: 2026-10-16T22-57-21Z
slug: src-views-admin-permisos-modalpermisos-jsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:----:|-----------|
| 1 | Visibility of System Status | 2 | Sin spinner/disable durante el bucle de guardado de 21 RPCs; sin señal de "cambios sin guardar". Toast de éxito/error sí existe. |
| 2 | Match System / Real World | 2 | Etiquetas = claves crudas de BD (`pos cotizar`, `tipos precio`) en el modal y en el `title` de las tarjetas. |
| 3 | User Control and Freedom | 2 | Colapsar/Cancelar existen, pero cerrar por X/ESC/backdrop descarta ediciones sin aviso; sin deshacer. |
| 4 | Consistency and Standards | 2 | "No aplica" = `—` en el modal vs 3 puntos siempre-apagados en la tarjeta; caja de texto distinta. |
| 5 | Error Prevention | 1 | Se puede construir `ver=false` con `editar/eliminar=true`; sin guardado idempotente; error a mitad del bucle deja estado parcial. |
| 6 | Recognition Rather Than Recall | 2 | Sin mapa módulo→ubicación en el nav; la leyenda `V C E D` vive en otra parte de la página. |
| 7 | Flexibility and Efficiency | 3 | Aceleradores reales: tri-estado de columna, tri-estado por sección, "Marcar todo"/"Limpiar", secciones colapsables. |
| 8 | Aesthetic and Minimalist Design | 2 | Tres alcances de "seleccionar todo" superpuestos + rejilla expandida por defecto (~21×4) = muro; el colapso mitiga. |
| 9 | Error Recovery | 1 | Error a mitad del bucle deja estado parcial; `catch` usa `err.menssage` (typo → `undefined`); error del RPC limpia la lista. |
| 10 | Help and Documentation | 1 | Única ayuda inline `(botón del POS)`; sin tooltip de qué controla cada permiso ni de las contradicciones. |
| **Total** | | **18/40** | **Poor — 45%** |

Ningún heurístico `n/a`; los diez aplican. (Assessment A propuso 16; la síntesis sube Visibilidad y Match a 2 por el toast existente y el idioma español, manteniendo el resto.)

## Design Specificity Verdict

**Mayormente intercambiable de categoría, con dos islas propias.** El modal es un `CTable` + `CModal` + `CFormCheck` de CoreUI sin identidad de producto: sin iconos de módulo (el nav *sí* los tiene en `_nav.jsx` y no se reutilizan), sin contexto de empresa/sucursal, sin encabezado más allá del nombre del rol, y con etiquetas derivadas de claves de BD vía `modulo.replace(/_/g, ' ')` (`ModalPermisos.jsx:214`). Se lee literalmente `usuarios`, `pos cotizar`. Podría verse idéntico en cualquier admin CoreUI. Lo propio son (a) el modelo tri-estado + por-sección + global (`ModalPermisos.jsx:75–110,190–208`) y (b) el sistema de chips/puntos `V C E D` (`RolesCard.jsx:78–96` + `style.scss`). Nada dice "librería", "multisucursal" ni "POS" salvo las claves de módulo, y no hay anotación `id_empresa`/`branch_id` — ausencia notable para un producto multisucursal.

**Escaneo determinista (Assessment B):** el CLI `impeccable detect` sobre los tres archivos devolvió **`[]`, 0 hallazgos, exit 0** (el motor 4.0.0 se validó con un archivo señuelo que sí devolvió 2). El **detector en página** (Selenium + `live-server` + `detect.js`) sí encontró, en el DOM renderizado:
- `low-contrast` **3.2:1** en `span.roles-perm-dot.roles-perm-dot--off` (`RolesCard.jsx:85`) — **en alcance**; coincide con la preocupación de accesibilidad de A.
- `nested-cards` ×5 "Card inside card" en `div.card.mb-3` (`RolesCard.jsx:52` dentro del `CCard` de `Roles.jsx:128`) — **en alcance**.
- `low-contrast` 3.5:1 (×3, `div.nav-title`) y 2.7:1 (`a`) — shell/sidebar, **fuera de alcance**.
La brecha estático-vs-runtime es esperable: el escáner de archivos es regex/texto y no calcula contraste renderizado ni anidamiento de tarjetas.

**Overlays:** la inyección mutable funcionó; el overlay **está visible en la pestaña [Human]** con badges amarillos "LOW CONTRAST TEXT" y "NESTED CARDS" (10 overlays, 9 visibles). Live-server detenido; temporales limpiados.

## Overall Impression

La lista de roles es compacta y confiable; el modal es donde el diseño falla. En cuanto se abre, un muro de gris con ~84 checkboxes sin orientación, y el momento de mayor apuesta —guardar un cambio de permisos— ocurre sin spinner, sin botón deshabilitado y sin resumen de lo cambiado. La mayor oportunidad: hacer que la copia y el guardado estén a la altura de la responsabilidad de la pantalla.

## What's Working

1. **Aceleradores de usuario avanzado genuinos.** Tri-estado (`estadoColumna`, `:75–84`) + por sección + global + colapso: diseño deliberado y no genérico para una matriz grande.
2. **Seguridad estructural en la selección masiva.** `aplicar`/`aplicarTodo` pasan por `accionesDe` (`:88–110`), así que `pos_cotizar`/`pos_ver_cotizaciones` nunca reciben crear/editar/eliminar: la regla de dominio se garantiza por estructura, no por disciplina.
3. **Chips `V C E D` + reassure offline.** `RolesCard` comprime un rol en chips escaneables con leyenda en la lista (`Roles.jsx`), y el banner offline nombra la consecuencia exacta.

## Priority Issues

- **[P0] Claves crudas de BD como etiquetas de usuario.** `ModalPermisos.jsx:214` (`pos cotizar`, `tipos precio`), `title={modulo}` en `RolesCard.jsx:79`. **Por qué importa:** la copia es el producto; es ambiguo y poco profesional en la pantalla donde se otorga acceso. **Fix:** mapa `LABELS` en `modulosPermisos.js` y renderizar nombres humanos ("Punto de venta – cotizar", "Tipos de precio"); quitar el `title` con la clave. **Command:** `$impeccable clarify`.

- **[P1] Sin protección ni estado durante el guardado de 21 RPCs.** `handleGuardar` (`:112–133`) no deshabilita Guardar ni muestra spinner; un error a mitad deja estado parcial; `catch` imprime `err.menssage` (typo). **Por qué importa:** permisos = alto riesgo; un doble clic o una petición caída corrompe el rol sin rollback ni mensaje claro. **Fix:** estado "sucio" → confirmar al cerrar; deshabilitar + spinner al guardar; escribir en lote o hacer rollback de fallos parciales; corregir el typo. **Command:** `$impeccable harden`.

- **[P1] Estados de permiso contradictorios posibles.** Nada impide `ver=false` con `editar/eliminar=true` (`:219–235`); columnas independientes. **Por qué importa:** roles donde el módulo no aparece en el nav pero las acciones siguen alcanzables: bug silencioso de seguridad/UX. **Fix:** auto-activar y bloquear `Ver` cuando alguna acción de escritura está encendida, con hint de la dependencia. **Command:** `$impeccable harden`.

- **[P2] Sin estados de carga/vacío/error en la lista + a11y de contraste.** `Roles.jsx` no muestra nada mientras carga, nada cuando `rolesFiltrados.length === 0`, y un error del RPC limpia la lista dejando solo un toast transitorio. El detector confirma `roles-perm-dot--off` a 3.2:1 y `nested-cards` ×5. **Por qué importa:** estados en blanco = usuario perdido; el punto apagado no cumple WCAG AA; las tarjetas anidadas ensucian la jerarquía visual. **Fix:** "No hay roles"/"Sin resultados para «query»", skeleton de carga, reintento persistente; subir contraste del punto apagado; aplanar `CCard` anidada. **Command:** `$impeccable polish`.

- **[P2] El orden de secciones contradice el nav.** `modulosPermisos.js` ordena Administración → Catálogos → Operación → Punto de Venta, pero `_nav.jsx` ordena Operación → Catálogos → Administración con POS arriba. **Por qué importa:** el usuario escanea esperando el orden del nav y no encuentra el módulo; la promesa "espejo del nav" es falsa. **Fix:** alinear el orden o documentar la intención distinta. **Command:** `$impeccable layout`.

## Persona Red Flags

- **Alex (usuario avanzado, teclado-primero):** guardar no da progreso durante 21 RPCs secuenciales (`:112–133`) → doble clic = doble envío; sin deshacer si "Marcar todo" fue un error; el orden de secciones que no coincide con el nav agrega costo de escaneo. Falta el acelerador que todo admin quiere: "copiar permisos de otro rol".
- **Sam (accesibilidad):** `.roles-perm-dot` es un círculo de 1.1rem con letras ~11px; on/off difieren por relleno vs borde *y* `opacity` en el apagado → contraste bajo y dependiente del relleno/color (el detector mide 3.2:1, bajo el 4.5:1). Las celdas `—` (`:204,222`) no llevan `sr-only`, el lector de pantalla no recibe nada. La tabla no tiene `<caption>`/`scope` y el `CTable` del modal no tiene contenedor responsive → overflow horizontal en pantallas angostas.
- **Jordan (primerizo):** "pos cotizar"/"tipos precio" son opacos; no se explica si desmarcar "Ver" oculta un módulo, un botón o ambos; la sigla `V C E D` de las tarjetas necesita la leyenda de otra zona de la página.

## Minor Observations

- Chevron invertido vs convención: `cilChevronTop` cuando está expandido, `cilChevronBottom` cuando colapsado (`ModalPermisos.jsx:184`).
- El colapso es abrupto, sin transición (`:210`) — declarado intencional.
- Placeholder de búsqueda `"Buscar..."` genérico; filtra solo `rol.name`; etiqueta del botón solo `"Rol"` (debería ser "Nuevo rol").
- `RolesCard` acepta `onRecargar` y nunca lo usa (`RolesCard.jsx:10`) — prop muerta.
- `handleGuardar` reescribe crear/editar/eliminar=false para módulos SOLO_VER en cada guardado (`:118–121`).
- Las tarjetas muestran 3 puntos siempre-apagados para los dos módulos-botón del POS (`RolesCard.jsx:82–93`), insinuando "denegado" donde el modal dice "no aplica".

## Questions to Consider

1. Si `Ver` está apagado y `Editar` encendido, ¿qué hace el producto realmente — qué capa gana? ¿Y por qué la UI permite construir un estado que no puede honrar?
2. Es un POS multisucursal. ¿Los roles/permisos son globales, por empresa o por sucursal? La superficie no muestra contexto alguno, ¿es verdad de producto o un hueco donde caerá un admin de sucursal?
3. Tres alcances de "seleccionar todo" para la misma acción: ¿cuál es el modelo mental principal y podría un solo gesto reemplazar a los otros dos?
