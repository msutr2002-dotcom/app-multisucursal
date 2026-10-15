# Especificación: Username único por sucursal

## Estado objetivo
Permitir que el mismo `username` exista en **diferentes sucursales**. En lugar de unicidad global sobre `users.username`, usar unicidad compuesta `(id_sucursal, username)`.

## Restricciones (constitución)
- Aislamiento por sucursal: las reglas de unicidad deben respetar el contexto de sucursal.
- Seguridad server-side: los RPCs (`create_user_admin`, `update_user_admin`) y RLS deben seguir vigentes. No usar `service_role` desde cliente.
- Offline-first se mantiene (gestión de usuarios requiere red hoy).
- Cambios mínimos y alineados al código existente.

## Flujo afectado
- Login: actualmente `supabase.from('users').select('*').eq('username', username).maybeSingle()` — falla si hay >1 fila con mismo username (aunque pertenezcan a distintas sucursales/empresas). 
- Creación usuario: RPC `create_user_admin` falla si viola UNIQUE global de `username`.

## Solución
1. **SQL (aplicar en Supabase):**
   - Eliminar constraint UNIQUE global sobre `username` si existe: `users_username_key` (comprobar nombre real).
   - Crear UNIQUE compuesto `(id_sucursal, username)`: `users_username_sucursal_key UNIQUE (id_sucursal, username)`.
   - Verificar que admins con `id_sucursal` NULL siguen aceptables (Postgres permite múltiples NULL en UNIQUE compuesto). Si hay varios admins sin sucursal, conviene normalizar; pero típicamente hay pocos.
2. **Login (cliente):** desambiguar por contexto. Dado que para **no-Admin** se selecciona `empresa` y hay `id_sucursal` del usuario, traer candidatos por `username` (`.select('*, id_sucursal(id,id_empresa)')`) y resolver:
   - 0 → "Usuario no encontrado"
   - 1 → usarlo (validar empresa para no-Admin)
   - >1 → filtrar por contexto: si no-Admin → mismo `id_empresa` que la `empresa` seleccionada; si Admin → puede quedarse con el que corresponda o exigir selección. Con UNIQUE (id_sucursal,username) y validación por empresa, debería quedar 1.
   También evitar `.maybeSingle()` cuando potencialmente múltiples filas.

## Criterios de aceptación
- Puedo crear usuario con username `cajero` en sucursal A y `cajero` en sucursal B.
- Login con `cajero` desde la empresa/sucursal correcta funciona.
- Login con `cajero` pero empresa equivocada falla con mensaje claro (como hoy para no-Admin).
- Admin puede seguir logueando (sin selección de empresa obligatoria).
- No se rompe la edición de usuarios existentes.
