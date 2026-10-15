# Spec: Recordar la última empresa seleccionada en el Login (mismo dispositivo)

**Fecha:** 2026-10-14 · **Estado:** implementado · **Módulo:** `login-recordar-empresa`

## Problema (L1)

Al iniciar sesión se elige una empresa, pero **al reabrir el Login (tras logout o cierre por inactividad de 15 min) el selector vuelve a "Selecciona tu empresa"**, obligando a elegirla de nuevo.

Causa: `src/services/sesionService.js` (`cerrarSesion`, línea 41) **borra** `empresaSeleccionada` de `localStorage`. El Login (`Login.jsx:33`) la lee para prefijar el `<select>`, así que al borrarla se pierde el recuerdo.

## Decisión (L2)

`cerrarSesion` deja de borrar `empresaSeleccionada`: sólo limpia la sesión (`currentUser`) y la marca de actividad (`session_last_activity`). La empresa queda recordada **en el mismo navegador/dispositivo** y el Login la prefija.

- **Alcance:** sólo cliente. NO se cubren otros dispositivos/navegadores (cada navegador tiene su propio `localStorage`); para eso haría falta persistirlo en Supabase (fuera de alcance por decisión del usuario).

## Cambios

- `src/services/sesionService.js`: quitar `localStorage.removeItem('empresaSeleccionada')` de `cerrarSesion` + docstring.
- `src/views/authentication/login/Login.jsx`: eliminar el `handleLogout` **muerto** (no se usa en el JSX) que también borraba `empresaSeleccionada` — evita una vía de cierre que contradiga la nueva regla.

## Criterios de aceptación

- C1: Tras logout manual, al volver al Login la empresa elegida sigue seleccionada.
- C2: Tras cierre por inactividad, igual.
- C3: `currentUser` y `session_last_activity` sí se limpian (la sesión muere; sólo se conserva el recuerdo de la empresa).
- C4: lint 0 en archivos tocados + `npm run build` ✓.

## Riesgos

- Si en el mismo dispositivo entra después un usuario de otra empresa, verá la empresa previa prefijada; puede cambiarla (y si no pertenece, el Login ya muestra "No pertenece a esta empresa").
- `localStorage` puede purgarse (p. ej. iOS Safari tras días sin uso): comportamiento del navegador, no del código.
