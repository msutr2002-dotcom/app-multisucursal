---
target: src/views/admin/permisos/ModalPermisos.jsx
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\HP\\Desktop\\my-opencode\\POS-Libreria\\src\\views\\admin\\permisos\\ModalPermisos.jsx"
target_fingerprint: "sha256:80ca59a33cde71a9f499af7e94bf662a82fce05d85df14e2505aa9915145220c"
target_path: "C:\\Users\\HP\\Desktop\\my-opencode\\POS-Libreria\\src\\views\\admin\\permisos\\ModalPermisos.jsx"
timestamp: 2026-10-17T02-32-41Z
slug: src-views-admin-permisos-modalpermisos-jsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:----:|-----------|
| 1 | Visibility of System Status | 2/4 | Tras guardar, el modal se cierra pero la tarjeta del rol **no se refresca** (`Roles.jsx:234-238`): los puntos quedan viejos; el guardado son 24 RPCs con spinner indeterminado, sin progreso. |
| 2 | Match System / Real World | 3/4 | Etiquetas ya humanas (`LABELS`), secciones espejan el nav; la sigla V/C/E/D aún depende de la leyenda (`Roles.jsx:206-214`). |
| 3 | User Control and Freedom | 3/4 | Guard de cierre + confirmación de cambios funcionan; `ConfirmModal` anidado dentro del `CModal` (`ModalPermisos.jsx:321`) → riesgo de stacking en Esc/backdrop. |
| 4 | Consistency and Standards | 3/4 | `RolesCard` abandona el lenguaje de tarjeta por un `div.border.rounded` pelado (`RolesCard.jsx:44`); dos visualizaciones de permisos en un mismo flujo. |
| 5 | Error Prevention | 3/4 | El acople ver⊇escritura evita contradicciones (`ModalPermisos.jsx:91-104`), pero desmarcar Ver borra C/E/D **en silencio**. |
| 6 | Recognition Rather Than Recall | 3/4 | Etiquetas humanas + texto de ayuda, pero la sigla y el mapeo matriz↔puntos siguen exigiendo memoria. |
| 7 | Flexibility and Efficiency | 4/4 | Tri-estado por columna/sección/global, `Marcar todo`/`Limpiar`, secciones colapsables — genuinamente fuerte. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Hasta ~24 chips × 4 puntos = ~96 micro-tokens por tarjeta; muro de escaneo entre varios roles. |
| 9 | Error Recovery | 4/4 | Alerta de error + Reintentar, banner offline, re-sincronización ante error de guardado (`ModalPermisos.jsx:174`). |
| 10 | Help and Documentation | 3/4 | Texto de ayuda + leyenda + copia offline; falta explicar la dirección "apagar Ver borra C/E/D". |
| **Total** | | **30/40** | **Good — 75%** |

Ningún `n/a`; los diez aplican. (Primera corrida: 18/40 → **+12**.)

## Design Specificity Verdict

**Baja-media.** Es una matriz administrativa convencional de CoreUI armada con primitivas del framework. Lo específico viene del dominio, no del diseño: la agrupación y el orden espejan el nav real, y la única idea con firma es el vocabulario de letras V/C/E/D. No hay mundo visual ni voz tipográfica propios. Para una herramienta interna de expertos es un canje defendible; los letter-dots son lo más cercano a personalidad y deberían ser el eje, no el cromo de tabla estándar.

**Escaneo determinista (B):** CLI `impeccable detect` sobre los 3 archivos = **`[]`, 0, exit 0** (motor validado). El detector en página (Selenium + `live-server` + `detect.js`) sí reportó: `nested-cards` ×5 (`div.border.rounded` ×5 dentro del `CCard` de `Roles.jsx`) — **en alcance, PERSISTE**; `low-contrast` 3.5:1 ×3 (`div.nav-title`) y 2.7:1 ×1 (`a` de breadcrumb) — shell, fuera de alcance.

## Fix Verification (vs. la primera corrida)

1. **Etiquetas crudas → humanas — RESUELTO.** `LABELS` cubre las 24 claves, `labelDe` cae con seguridad; consumido en modal y tarjetas; ninguna clave cruda llega a la UI (verificado por probe).
2. **Protección de guardado / tipografía — RESUELTO (con salvedad).** snapshot `originalRef` + `hayCambios` + guard de cierre + `guardando` con `CSpinner` + re-sync en error; `err.menssage` corregido. Salvedad: siguen siendo 24 RPCs secuenciales sin progreso ni atomicidad.
3. **Estados contradictorios — RESUELTO.** Escritura implica `ver`; apagar `ver` limpia C/E/D (toggle y `aplicar`). Probe: `Inventario crear=true ⇒ ver=true`.
4. **Estados de lista + contraste + card anidada — PARCIAL.** Carga/vacío/error+Reintentar ✓; `.roles-perm-dot--off` ahora **≈11:1** (antes 3.2:1) ✓; **`nested-cards` PERSISTE ×5**: el contenedor dejó de ser `CCard` pero `div.border.rounded` sigue leyéndose como carta dentro del `CCard` de la página (el probe `.card .card` = 0, pero la heurística del detector considera card-like al `border`+`rounded`).
5. **Orden de secciones — RESUELTO.** Punto de Venta → Operación → Catálogos → Administración, idéntico al nav.

## Overall Impression

Salto real: de 18/40 a 30/40. Los cinco hallazgos de la primera corrida están resueltos (uno parcial), y el guardado/coherencia ya no son trampas. Lo que queda es un `P1` nuevo y muy visible (la tarjeta no refleja lo guardado) y ruido de densidad/afiramiento.

## What's Working

1. **Ergonomía de edición masiva:** tri-estado en cabecera, por sección y global + `Marcar todo`/`Limpiar` + colapso.
2. **IA fiel al dominio:** agrupación y orden = nav; secciones vacías se filtran de las tarjetas.
3. **Estados operativos robustos:** carga/vacío/error/offline + guard de cierre + re-sync ante error.

## Priority Issues

- **[P1] La tarjeta del rol queda desactualizada tras guardar.** `ModalPermisos.jsx:180` cierra el modal pero `Roles.jsx:234-238` nunca re-consulta (`onClose` solo apaga el flag). **Por qué:** los puntos que el admin acaba de cambiar siguen mostrando el estado viejo → parece que el guardado falló y se re-edita de más. **Fix:** `onClose={() => { setModalPermisosVisible(false); cargarDatos() }}` o un `onSaved`. **Command:** `$impeccable harden`.
- **[P1] Guardado secuencial de 24 RPCs sin progreso ni atomicidad.** `ModalPermisos.jsx:161-177`. **Por qué:** espera larga indeterminada; un fallo a mitad deja un permiso **parcial** persistido (solo se re-sincroniza, no se revierte). **Fix:** un RPC que reciba un arreglo JSON (transacción en servidor) y/o mostrar `n/24`. **Command:** `$impeccable harden`.
- **[P2] `nested-cards` persiste ×5.** `RolesCard.jsx:44` (carta dentro del `CCard` de la página). **Por qué:** jerarquía visual enmarañada; el detector lo marca. **Fix:** contenedor no-card (p. ej. barra de acento izquierda sin `rounded`, o lista con separadores). **Command:** `$impeccable layout`.
- **[P2] Densidad de `RolesCard`.** Hasta ~96 letter-dots por tarjeta (`RolesCard.jsx:70-88`). **Por qué:** el costo de escaneo escala mal entre reglas. **Fix:** resumen compacto ("12 módulos · 9 crear · 3 editar") y dejar la matriz como el editor. **Command:** `$impeccable distill`.
- **[P3] Afiramiento de tabla.** `CTableHeaderCell` sin `scope="col"`/caption; los `visually-hidden "No aplica"` no están ligados a una columna (`ModalPermisos.jsx:264,284`). **Fix:** `scope`/`caption`. **Command:** `$impeccable polish`.

## Persona Red Flags

- **Alex (admin):** guarda un set de permisos, el modal cierra y la tarjeta sigue con los puntos viejos → reabre y regraba, o cree que la herramienta falló. Con el spinner congelado de 24 ítems puede forzar refresh a mitad de escritura.
- **Sam (teclado/lector):** sin `scope`/caption en la matriz; "No aplica" se anuncia sin columna (`ModalPermisos.jsx:264`); el estado de permisos de la tarjeta es solo tooltip (`RolesCard.jsx:81`).
- **Jordan (ocasional):** ve "Ver" encenderse solo al activar Crear, y pierde C/E/D en silencio al desmarcar Ver — la ayuda solo cubre la mitad de la sorpresa (`ModalPermisos.jsx:202-204`).

## Minor Observations

- El spinner de carga solo aparece con `roles.length === 0` (`Roles.jsx:181`): una recarga con caché no da retroalimentación.
- `RolesCard` muestra `rol.descripcion` sin condicionar (`RolesCard.jsx:50`) → línea vacía cuando es null.
- El `catch` de `handleGuardar` (`ModalPermisos.jsx:181`) es casi código muerto (Supabase devuelve `{ error }`, no lanza).
- La búsqueda filtra solo por nombre de rol (`Roles.jsx:134-136`).
- **Deriva de docs:** `AGENTS.md` aún describe el orden agrupado como "Administración/Catálogos/Operación/Punto de Venta", opuesto al código ya correcto.
- `.roles-perm-dot--off` depende solo del contorno para la forma (el color de la letra ya contrasta).

## Questions to Consider

1. Si el set de permisos es una transacción, ¿por qué el cliente es el coordinador? Un RPC de arreglo + actualización optimista eliminaría a la vez el problema de progreso y el de la tarjeta vieja.
2. ¿La tarjeta de dots se gana su costo, o es una segunda vista más pobre de la matriz? Un resumen de conteos ("12 módulos · 9 crear") podría bajar el escaneo dejando el modal como autoridad única.
3. ¿El acople ver⊇escritura es el modelo correcto, o conviene que `Ver` sea auto-activado y visiblemente deshabilitado para que la regla se vea en vez de aprenderse?
