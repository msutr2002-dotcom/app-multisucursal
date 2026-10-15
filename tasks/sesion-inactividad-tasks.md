# Tasks — Cierre de sesión por inactividad

Spec: `specs/sesion-inactividad.md` (RF-SI1..SI5). Ciclo SDD: **UNA tarea a la vez** → mostrar cambios → aprobación → marcar `[x]`.

- [x] **Task 1: Servicio + hook + montaje (RF-SI1..SI5) — HECHA 2026-10-14**
  - Nuevo `src/services/sesionService.js`: `CLAVE_ACTIVIDAD='session_last_activity'`, `TIMEOUT_INACTIVIDAD_MS=900000`, `leerActividad()`, `marcarActividad(ts)`, `cerrarSesion(navigate)` (limpia `currentUser` + `empresaSeleccionada` + `session_last_activity` y navega a `/login`).
  - Nuevo `src/hooks/useCierreInactividad.js`: listeners de actividad (`passive`, throttle 1 s), `setInterval` 15 s de revisión, revisión inmediata al montar, listener `storage` (sync de actividad + logout entre pestañas), override `window.__SESSION_IDLE_MS__`.
  - `src/layout/DefaultLayout.jsx`: invocar `useCierreInactividad()` (solo área autenticada).
  - `src/components/header/AppHeaderDropdown.jsx`: logout manual usa `cerrarSesion(navigate)`.
  - `src/views/authentication/login/Login.jsx`: `marcarActividad(Date.now())` al iniciar sesión.
  - **Evidencia:** lint 0 en los 5 archivos tocados; `npm run build` ✓ (2982 módulos).

- [x] **Task 2: Verificación (CA 1-6) — HECHA 2026-10-14 (`Temp/opencode/sesion-inactividad.js`, TODO OK)**
  - Caso A (timeout 3000 ms): tras inactividad → `#/login`, `currentUser` y `session_last_activity` eliminados.
  - Caso B (timeout 5000 ms): con `mousemove` continuo 9 s → **no** cierra; al detener la actividad → cierra.
  - Caso C: marca vieja (hace 1 h) + login → **no** cierra de inmediato; marca reseteada (edad ~2.6 s).
  - `memory.md` + `AGENTS.md` actualizados.
