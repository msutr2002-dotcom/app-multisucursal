# Tasks: Username único por sucursal

## Task 1: Crear spec
- [x] specs/usuarios-username-unique-per-sucursal.md creada

## Task 2: SQL en Supabase (aplicado por usuario)
Bloque SQL a ejecutar **en Supabase → SQL Editor**:

```sql
-- 1. Eliminar UNIQUE global de username (si existe)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key;

-- 2. Crear UNIQUE compuesto por sucursal + username
ALTER TABLE users ADD CONSTRAINT users_username_sucursal_key UNIQUE (id_sucursal, username);
```

Notas:
- Si existen duplicados actuales (mismo username en misma sucursal), el ADD CONSTRAINT fallará. Limpiar duplicados antes.
- Si hay usuarios Admin con id_sucursal NULL: Postgres permite múltiples NULLs; no viola UNIQUE compuesto.

- [x] SQL aplicado y verificado (usuario confirma)

## Task 3: Ajustar Login para desambiguar por sucursal/empresa
Modificar `src/views/authentication/login/Login.jsx`:
- En `heandleLogin`, buscar candidatos por `username` (sin `.maybeSingle()`) incluyendo `id_sucursal(id,id_empresa)`.
- Resolver candidato según contexto (Admin vs no-Admin + empresa seleccionada).
- Mostrar mensajes claros: "Usuario no encontrado..." o "No pertenece a esta empresa..." según corresponda.
- Evitar que `.maybeSingle()` cause "no encontrado" cuando hay duplicados en otras sucursales.

- [x] Código modificado y verificado sintácticamente
- [x] Build OK
- [x] Prueba manual: mismo username en 2 sucursales diferentes, login en cada una funciona

## Task 3b: Corrección de 3 bugs reportados tras la primera versión de Task 3
- [x] Login: validación de contraseña **primero** (contra todos los candidatos) y resolución de candidato con **fallback a Admin** — el Admin ingresa con cualquier empresa (o sin empresa seleccionada).
- [x] Login: `currentUser.id_sucursal` ahora guarda el **UUID plano** (`id_sucursal.id`); el select anidado lo convertía en objeto y la revalidación `.eq('id', <objeto>)` rompía el login de todos los no-Admin ("No pertenece a esta empresa") y dejaba la sesión con un id_sucursal inválido.
- [x] Login: código muerto eliminado (`isAdminContext`, revalidación redundante post-password).
- [x] Eliminar usuario: `handleEliminar` captura `error` del RPC `delete_user_admin` y muestra el motivo real (antes se ignoraba); `UsuariosCard` solo muestra "Eliminado correctamente" si la operación no falló.
- [x] Verificación manual de los 3 escenarios por el usuario

## Task 4: Verificación final
- [x] Crear usuario mismo username en sucursal distinta (UI) → OK, no error "único"
- [x] Login ambas sucursales → OK
- [x] No rompe login existente
- [x] Lint limpio en archivos tocados

## SQL adicional FK (eliminación de usuarios con historial)
- [x] Aplicado: todas las FKs hacia `users` ahora son `ON DELETE SET NULL` y las columnas `DROP NOT NULL` — eliminar un usuario deja historial con `id_usuario = NULL` (traslados y otras tablas).
