# Tasks: Arranque Frío Offline (Service Worker)

- [x] **Task 1: SW + plugin de build + registro en producción** (aprobada 2026-10-10; lint 0 ×3, build ✓, `node --check build/sw.js` OK, manifiesto con 110 assets + index.html, guard anti-token pendiente)
  - Plugin `generar-sw` en `vite.config.mjs` (`apply: 'build'`, `enforce: 'post'`) que emite `sw.js` con manifiesto de archivos del bundle, cache id de build, instalación (precache shell + assets + refs de index.html), `fetch` network-first para navegaciones y cache-first solo para assets same-origin GET, `activate` que limpia caches viejos.
  - Registro `./sw.js` solo con `import.meta.env.PROD` en `src/index.jsx` (silencioso si falla).
  - Verificar: lint de los archivos tocados + `npm run build`.
  - **Fix durante verificación (Task 2):** `Cache.addAll` lanza `InvalidStateError: duplicate requests` — `'index.html'` (bundle) vs `'./index.html'` y `assets/x.js` vs `./assets/x.js` resuelven a la MISMA URL → el SW moría en `installing→redundant` y Chrome desregistraba. Corregido deduplicando sobre URL absoluta (`new URL(u, self.location.href)`) antes de `addAll`.

- [x] **Task 2: Verificación E2E de arranque frío + documentación** (2026-10-10 — **11/11 OK**)
  - Script `Temp\opencode\arranque-frio.js` contra `vite preview` :4173 con perfil Edge fresco: FASE1 login con red → SW `activated` + `controller` + **113 recursos** precacheados; FASE2 CDP offline → **recarga fría → la app arranca en `#/dashboard` con sesión** (sin ErrorBoundary) + chunk lazy `#/historial` resuelto por cache-first; FASE3 reconexión + consola sin errores JS reales; FASE4 **:3000 sin SW registrado** (0 registraciones).
  - Artefactos: `docs/e2e-resultados/ArranqueFrio.json` + `docs/capturas/offline-arranque-frio.png`. Preview detenido tras la corrida.
  - Trampas vistas: (a) zombies msedge/msedgedriver previos revientan la sesión (pre-run kill obligatorio); (b) `executeScript` con IIFE async sin `return` de nivel superior devuelve `null` (el driver lo evalúa como statement, no expresión).
