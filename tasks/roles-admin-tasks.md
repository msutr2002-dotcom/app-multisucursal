# Tasks — Fix: Gestión de Roles

Spec: `specs/roles-admin.md` (RF-R1..R4). Ciclo SDD: **UNA tarea a la vez** → mostrar cambios → aprobación → marcar `[x]`.

- [x] **Task 1: Fix cliente — toast real + sin falso éxito (RF-R1..R3) — VERIFICADA 2026-10-07 (aprobada: "listo")**
  - `Roles.jsx`: `handleGuardar` devuelve siempre `{ok}`/`{error}` (guard no-Admin → `{error:'sin-permisos'}`, patrón `Empresas.jsx:45-80`); éxito → toast "Rol creado/editado correctamente" (arreglar `'...'`); error → toast con `resultado.error.message`; `handleEliminar` chequea el error (éxito → toast + recarga, fallo → toast danger sin fingir); `cargarDatos` toastea el error del listado.
  - `ModalRoles.jsx`: `handleSubmit` deja de toastear → solo `if (!resultado?.error) onClose()` (patrón `EmpreasModal.jsx:43-49`); reset del form diferido con `setTimeout(0)` (evita `set-state-in-effect`).
  - `RolesCard.jsx`: `confirmarEliminar` ya no celebra "eliminado correctamente" a ciegas; el resultado lo comunica el contenedor.
  - **Evidencia:** el usuario vio el **mensaje literal del servidor** en el toast (`function row_to_json() does not exist`) — antes salía el genérico "No se pudo guardar el rol". Lint 0 errores/0 warnings en los 3 archivos (238 `Delete ␍` CRLF preexistentes); `npm run build` ✓ 3.01 s. Trampas lint: mover `cargarDatos` arriba activó `set-state-in-effect` (callee con `async/await`) → reescrito en estilo `.then`; `exhaustive-deps` con `eslint-disable-next-line` (patrón del repo).

- [x] **Task 2: Diagnóstico SQL + fix de servidor (RF-R4) — VERIFICADA 2026-10-07**
  - **Causa raíz:** `create_rol_admin` y `update_rol_admin` usaban `RETURNING row_to_json(*)` (inválido) → `function row_to_json() does not exist` en el INSERT/UPDATE. Grants y RLS estaban bien (`anon_execute=true`, `SECURITY DEFINER`).
  - **SQL aplicado por el usuario 2026-10-07:** ambas funciones recreadas con `json_build_object('id','name','descripcion')`, `SET search_path = public`, trim + guard de nombre vacío, aviso de duplicado ("ya existe un rol llamado \"%\"") y "rol no encontrado" en update si no hay fila. `delete_rol_admin`/`get_roles_con_permisos` sanos → intactos.
  - **Evidencia (probes REST con anon key):** `p_name="   "` → `P0001: el nombre del rol es obligatorio`; `p_name="Admin"` → `ya existe un rol llamado "Admin"`; y **el usuario creó roles reales desde la UI** (lista final: Admin, Gerente, Vendedor, Subgerente — antes era Usuario/Admin/Gerente).

- [x] **Task 3: Verificación E2E (smoke `dbg-roles-fix.js`) — VERIFICADA 2026-10-07 (aprobada: "si")**
  - Login `system`/`system321` → `#/roles`: crear rol → **un solo** toast "Rol creado correctamente" + modal cerrado + rol en la lista (espera por texto); duplicado → toast con el **mensaje literal del servidor** (`ya existe un rol llamado "FixRoles …"`) + **modal abierto** + sin genérico; editar → "Rol editado correctamente" + descripción en la tarjeta; eliminar → ConfirmModal → "Rol eliminado correctamente" + desaparece; consola 0 errores (el 400 del duplicado es el caso negativo esperado → filtrado con comentario).
  - **Evidencia:** `dbg-roles-fix.js` **16/16** (2 corridas verdes) → captura `roles-fix-final.png` (siempre en `finally`); limpieza de roles de prueba en `finally` (0 residuos). lint 0 errores reales; build ✓.
