# Tasks — Fix: Dashboard de admin en usuarios no admin

Spec: `specs/dashboard-rol.md` (RF-D1..D3). Ciclo SDD: **UNA tarea a la vez** → mostrar cambios → aprobación → marcar `[x]`.

- [x] **Task 1: Fix cliente — guard inverso + nav dinámico (RF-D1..D3) — VERIFICADA 2026-10-10**
  - Nuevo `src/views/dashboard/AdminDashboardRoute.jsx`: wrapper espejo de `DashboardRoute.jsx` → `rol !== 'Admin'` → `<Navigate to="/dashboard" replace />`, Admin → `<AdminDashboard />`.
  - `src/routes.js`: `/admin-dashboard` apunta al wrapper (lazy, patrón del resto).
  - `src/_nav.jsx`: `currentUser`/`isAdmin` a nivel de módulo eliminados → exporta función `obtenerNav()` que lee la sesión en cada llamada; se quita `modulo: 'dashboard'` (clave fantasma, ítem siempre visible).
  - `src/components/AppSidebar.jsx`: `obtenerNav().filter(...)` dentro del render.
  - `src/services/precargaRutasService.js`: el precalentamiento apunta a `AdminDashboardRoute` (calienta wrapper + AdminDashboard).
  - **Evidencia:** lint 0 errores/0 warnings en los 5 archivos; `npm run build` ✓ 4.32 s (chunk `AdminDashboardRoute-BdUdizZb.js`).

- [x] **Task 2: Verificación — repro del bug + regresión admin (CA 1-4) — VERIFICADA 2026-10-10 (aprobada: "si")**
  - Flujo manual/E2E: admin → logout → usuario genérico → clic "Dashboard" del sidebar → `#/dashboard` (no admin). URL directa `#/admin-dashboard` como no-admin → redirige. Admin → `#/admin-dashboard` íntacto y con ítem resaltado.
  - **Evidencia:** aprobación explícita del desarrollador ("si") el 2026-10-10; `memory.md` actualizado.
