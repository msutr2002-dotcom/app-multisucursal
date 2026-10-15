# Spec — Fix: Dashboard de admin visible en usuarios no admin

**Fecha:** 2026-10-10 · **Origen:** bug reportado por el desarrollador — *"me aparece el dashboard del admin en un usuario genérico que no es admin"*. Reproducción confirmada con preguntas en sesión: **"al hacer clic en 'Dashboard' del menú"**.

## Contexto

Diagnóstico hecho por solo-lectura:

1. **`src/routes.js:27`** — la ruta `/admin-dashboard` **no tiene campo `modulo`** → `AppContent.jsx:40` la monta **sin `PermissionRoute`** (el guard solo se aplica si `route.modulo` existe). Cualquier usuario que llegue a la URL ve `AdminDashboard`.
2. **`src/views/dashboard/AdminDashboard.jsx`** — cero checks de rol internos; llama al RPC global `get_admin_dashboard_stats` y renderiza `AdminStatsCards` (Empresas/Usuarios/Sucursales) + `EmpresasResumen`.
3. **`src/views/dashboard/DashboardRoute.jsx:7`** — solo existe la flecha **Admin → `/admin-dashboard`**; **falta la inversa** (un no-admin que llega a `/admin-dashboard` no es expulsado).
4. **`src/_nav.jsx:78-85`** — `isAdmin` se calcula **una sola vez, a nivel de módulo**, al importar `_nav`. Logout/login en la misma carga de página deja el estado **stale**: si un admin cierra sesión y entra un usuario genérico, el ítem "Dashboard" del sidebar **sigue apuntando a `/admin-dashboard`** → clic → dashboard de admin. (**Causa raíz de la reproducción reportada.**)
5. **`src/components/AppSidebar.jsx:37`** — único consumidor de `_nav` (`import navigation from '../_nav'`), por lo que el array stale se filtra pero nunca se recalcula.
6. `src/views/dashboard/components/MobileNav.jsx:17` sí calcula `isAdmin` en cada render → el nav móvil ya es correcto (referencia del patrón a seguir).
7. El ítem Dashboard lleva `modulo: 'dashboard'`, una clave **fantasma**: `'dashboard'` no existe en `MODULOS` (`useNavPermissions.js:6-20`) → `permisos['dashboard'] === undefined` → `undefined !== false` → el sidebar nunca puede ocultarlo. Debe ser visible siempre para todos los roles, así que el campo `modulo` sobra y confunde.

Patrón canónico del repo a replicar: **wrapper de ruta que lee la sesión y redirige** (el mismo que ya usa `DashboardRoute.jsx`).

Alcance: `src/views/dashboard/AdminDashboardRoute.jsx` (nuevo), `src/routes.js`, `src/_nav.jsx`, `src/components/AppSidebar.jsx`. **Sin cambios de schema, RPCs ni RLS** (el servidor ya es la barrera real vía RLS; esto es corregir la UI).

---

## RF-D1 — Guard inverso en `/admin-dashboard`

- Nuevo wrapper `src/views/dashboard/AdminDashboardRoute.jsx` (espejo simétrico de `DashboardRoute.jsx`):
  - Lee `currentUser` de `localStorage`.
  - Si `currentUser?.id_rol?.name !== 'Admin'` → `<Navigate to="/dashboard" replace />`.
  - Si es Admin → renderiza `<AdminDashboard />`.
- `src/routes.js` apunta `/admin-dashboard` al wrapper (mismo estilo lazy que `DashboardRoute`).
- **Sin bucles:** las condiciones son complementarias (`=== 'Admin'` vs `!== 'Admin'`), igual que el par `Login.jsx:133` / `DashboardRoute.jsx:7`.
- Se mantiene la misma fuente de verdad de rol que todo el repo: `currentUser.id_rol.name === 'Admin'` (Login, DashboardRoute, `_nav`, `permisoService.js:34`).

## RF-D2 — Nav del sidebar calculado en cada render (sin estado stale)

- `_nav.jsx` deja de evaluar `currentUser`/`isAdmin` a nivel de módulo: exporta una **función** (`obtenerNav()`) que construye el array leyendo la sesión actual en cada llamada.
- `AppSidebar.jsx` la invoca dentro del render (`const navigation = obtenerNav()`) → tras cualquier login/logout el ítem "Dashboard" apunta a la ruta correcta del rol vigente.
- `MobileNav.jsx` ya era dinámico → sin cambios.

## RF-D3 — Ítem Dashboard sin módulo fantasma

- Se elimina `modulo: 'dashboard'` del ítem Dashboard en `_nav.jsx`: al no tener `modulo`, el filtro de `AppSidebar.jsx:61` (`if (!item.modulo) return true`) lo muestra **siempre**, que es exactamente el comportamiento deseado (todo rol ve su dashboard) y deja de depender de una clave inexistente en `MODULOS`.
- No se agrega `'dashboard'` a `MODULOS` ni a los otros 4 puntos de módulos (no es un módulo con permisos `ver/crear/editar/eliminar`).

---

## Criterios de aceptación

1. **Reproducción del bug:** con un admin logueado, cerrar sesión y entrar con un usuario genérico **sin recargar** → clic en "Dashboard" del sidebar → aterriza en `#/dashboard` (dashboard de sucursal), **nunca** en `#/admin-dashboard`.
2. **URL directa:** usuario no-admin escribe `#/admin-dashboard` → redirigido a `#/dashboard` (incluye recarga de página).
3. **Admin intacto:** `system`/`system321` → sigue llegando a `#/admin-dashboard` con sus métricas globales; el ítem del sidebar le sigue quedando resaltado en esa ruta.
4. `npx eslint src/_nav.jsx src/components/AppSidebar.jsx src/routes.js src/views/dashboard/AdminDashboardRoute.jsx` → 0 errores nuevos; `npm run build` ✓.
5. `memory.md` actualizado al cerrar la sesión con el bug corregido.

## Fuera de alcance

- `rutaModulo` muerto en `AppContent.jsx:11-16` (nunca se usa) → limpieza aparte, no relacionada con el rol.
- Seguridad real: sigue siendo server-side (RLS/RPCs). Este fix es **UI/honestidad de la vista**, no un mecanismo de seguridad (consistente con el diseño offline-first ya aprobado del repo).
- `Dashboard.jsx` y `AdminDashboard.jsx` en sí (comportamiento, métricas, estética) → no se tocan.
- El nav de `MobileNav.jsx` y la lógica de login (`Login.jsx:133`) → ya correctos.
