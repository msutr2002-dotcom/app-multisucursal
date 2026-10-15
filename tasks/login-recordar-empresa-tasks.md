# Tasks: login-recordar-empresa

Spec: `specs/login-recordar-empresa.md`. Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: `sesionService.cerrarSesion` deja de borrar `empresaSeleccionada` (conserva el recuerdo por dispositivo).
- [x] Task 2: eliminado el `handleLogout` muerto de `Login.jsx` (vía de cierre inconsistente).
- [x] Task 3: Verificación — lint 0 + `npm run build` ✓ 3.83s + probe: `cerrarSesion` limpia `currentUser`/actividad y conserva `empresaSeleccionada`; el Login la prefija (4 opciones).
- [x] Task 4: Cierre — `memory.md` + `AGENTS.md` actualizados.
