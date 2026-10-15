# Spec — Fix: Gestión de Roles (alta/edición con error real)

**Fecha:** 2026-10-07 · **Origen:** bug reportado por el desarrollador — "no me funciona la de agregar más roles" (ve toast de error). Confirmado con preguntas en sesión: **"Sale toast de error"**.

## Contexto

Diagnóstico hecho por solo-lectura (código + REST con la anon key):

1. `Roles.jsx:44-48` — el guard `currentUser?.id_rol?.name !== 'Admin'` hace `return` **sin devolver `{ error }`** → `ModalRoles.jsx:38` interpreta `undefined` como éxito y cierra con "Rol creado correctamente" **sin crear nada** (mismo patrón ya corregido en `Empresas.jsx:46-49`).
2. **Toast genérico tapa al real:** `ToastContext` admite **un solo toast**. `Roles.jsx:64` muestra el `error.message` del RPC y acto seguido `ModalRoles.jsx:39` lo **pisa** con "No se pudo guardar el rol" → el usuario nunca ve la causa.
3. `Roles.jsx:68` tiene copy sin rellenar: `showToast('success', 'Éxito', '...')`.
4. `Roles.jsx:39-42` (`handleEliminar`) ignora el error del RPC y `RolesCard.jsx:38` siempre celebra "Rol eliminado correctamente" — aunque el delete falle (p. ej. FK `users.id_rol`).
5. `cargarDatos()` (`Roles.jsx:77-80`) descarta el `error` del listado → lista vacía en silencio si `get_roles_con_permisos` falla.
6. Servidor: `roles` solo tiene `id, name, descripcion` (sin `id_empresa`); `create_rol_admin`, `update_rol_admin` y `delete_rol_admin(p_id)` **existen** y son llamables con anon. **Causa raíz del toast de error = pendiente de confirmar** con el SQL de solo lectura de la Task 1 (firma real, `GRANT EXECUTE`, RLS o `UNIQUE(name)`).

Patrón canónico del repo a replicar: **el contenedor es dueño único del toast y del cierre** (`Empresas.jsx:45-80` + `EmpreasModal.jsx:43-49` → `if (!resultado?.error) onClose()`).

Alcance: `src/views/admin/permisos/Roles.jsx`, `ModalRoles.jsx`, `RolesCard.jsx` + bloque SQL de Supabase (si la Task 1 lo confirma). **Sin cambios de schema DX.**

---

## RF-R1 — Mensaje de error real, un solo toast

- `ModalRoles.handleSubmit` **no toastea**: solo cierra si el guardado funcionó (patrón `EmpreasModal.jsx:43-49`).
- `Roles.jsx handleGuardar` es el **único** dueño del toast:
  - Éxito → `success` + "Rol creado correctamente" / "Rol editado correctamente" (arreglar el `'...'`).
  - Error RPC → `danger` + **`resultado.error.message`** (el texto real del servidor) y el modal **permanece abierto**.
  - Guard no-Admin → `danger` + "No tienes permisos…" **y** `return { error: 'sin-permisos' }` (hoy devuelve `undefined` = falso éxito).
- `cargarDatos` → si el RPC del listado falla, `danger` con el mensaje (lista vacía ya no es silenciosa).

## RF-R2 — Falso éxito eliminado

- `handleGuardar` devuelve siempre `{ ok: true }` o `{ error: <motivo> }` (contrato de `Empresas.jsx`).
- El modal **nunca** cierra ni anuncia éxito cuando `resultado.error` está presente (creación y edición).

## RF-R3 — Eliminar honesto

- `Roles.jsx handleEliminar` chequea `resultado.error`: con error → `danger` con el mensaje y **no** recarga como si nada; sin error → `success` + "Rol eliminado correctamente" + `cargarDatos()`.
- `RolesCard.confirmarEliminar` deja de toastear a ciegas: el resultado lo comunica el contenedor (misma separación que RF-R1). El `ConfirmModal` solo cierra.

## RF-R4 — Diagnóstico y fix de servidor (si aplica)

- Task 1 entrega el bloque de **solo lectura** (firmas + `has_function_privilege('anon'|'authenticated')` + constraints + RLS de `roles`); el desarrollador lo corre en el SQL editor y pega el resultado.
- Según el resultado, una de:
  - **Falta `GRANT EXECUTE`** → bloque SQL: `GRANT EXECUTE ON FUNCTION create_rol_admin/update_rol_admin/delete_rol_admin TO anon, authenticated;` (patrón de grants del repo: `TO anon, authenticated`, sin `service_role`).
  - **`SECURITY INVOKER` + RLS solo-SELECT** → preferencia del repo: crear/ajustar la función como `SECURITY DEFINER SET search_path = public` con validación interna (mismo estilo de los RPCs de compras/traslados) en vez de policies amplias; entregar el bloque SQL.
  - **`UNIQUE(name)` u otro constraint** → el fix es de cliente (el mensaje real ya basta: "duplicate key value violates unique constraint…") + trim de `name` antes de enviar.
  - **Firma distinta a `(p_name, p_descripcion)`** → ajustar los params del RPC en `handleGuardar`.
- El SQL se aplica con el usuario en el editor (el SQL no vive en el repo, `spec.md:65`).

---

## Criterios de aceptación

1. **Alta de rol con éxito:** modal cierra, un solo toast éxito con mensaje correcto, el rol aparece en la lista sin recargar a mano.
2. **Alta con error (rol duplicado o fallo server):** el modal **sigue abierto**, un solo toast `danger` con el **mensaje literal del servidor**, y al reintentar se ve de nuevo.
3. **Guard no-Admin (defensivo):** devuelve `{error}`, no hay falso éxito.
4. **Eliminar:** éxito → toast + desaparece de la lista; fallo (FK/permiso) → toast danger y el rol **sigue** en la lista.
5. `npx eslint src/views/admin/permisos/{Roles,ModalRoles,RolesCard}.jsx` 0 errores; `npm run build` ✓.

## Fuera de alcance

- `Usuarios.jsx`/`ModalUsuarios.jsx` tienen la misma clase de bug (`alert()`, falso éxito) → **pendiente aparte**, no se tocan aquí.
- `ModalPermisos.jsx` (matriz de permisos) y `ModalRoles.MODULOS` no cambian; el catálogo de módulos no se toca.
- Nueva UI de administración de permisos por rol (ya cubierta por el módulo existente).
