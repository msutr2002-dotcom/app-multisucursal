# Spec: Arranque Frío Offline (Service Worker / Shell Precacheado)

## 1. Objetivo

Que la aplicación pueda **iniciarse sin red** en una sesión nueva (cerrar la ventana/pestaña y recargar con el navegador offline) después de haberla visitado una vez con conexión. Actualmente el offline garantizado solo cubre la sesión viva (IndexedDB) pero no el arranque frío: sin red, el navegador no recibe el HTML/JS/CSS y la app no carga.

## 2. Requerimientos Funcionales

- **RF-01 (Registro SOLO en producción):** El service worker (SW) se registra únicamente cuando `import.meta.env.PROD` es verdadero (build/preview). En el servidor de desarrollo **no se registra nunca** (protégelo: HMR, hidratación y la suite E2E sobre :3000 quedan intactas).
- **RF-02 (Generación del manifiesto en build):** Un plugin propio en `vite.config.mjs` (`apply: 'build'`) genera `sw.js` dentro de `build/` con la lista exacta de archivos del bundle (chunks/assets hasheados). Sin dependencias nuevas: código propio del repo (cumple Art. IV.1 de la Constitución; herramienta de build, no UI).
- **RF-03 (Precaché en `install`):** El SW, al instalarse, guarda en Cache Storage: `./`, `./index.html`, todos los archivos del manifiesto y los recursos referenciados en `index.html` (`favicon.svg`, `manifest.json`), con `cache: 'reload'` para evitar respuestas 304 de la caché HTTP.
- **RF-04 (Estrategias de `fetch`, solo same-origin y GET):**
  - Solicitudes de **navegación**: *network-first* con fallback al shell cacheado (así un deploy nuevo surta efecto al tener red y el offline abra la última versión conocida).
  - **Assets estáticos** (JS/CSS/imagenes del bundle): *cache-first* (son inmutables por hash de contenido).
  - Todo lo **cross-origin** (Supabase) y los métodos no-GET se ignoran y van a la red tal cual → la lectura de datos sigue siendo IndexedDB + RPC como hoy; el SW **no interfiere con RLS ni con la cola de sincronización**.
- **RF-05 (Activación limpia):** El nombre de cache incluye un identificador de build; en `activate` se eliminan los caches con otro nombre. `skipWaiting()` + `clients.claim()` para activarse sin esperar cierres de pestaña.
- **RF-06 (Registro relativo):** `navigator.serviceWorker.register('./sw.js')` (resuelto contra el documento) → funciona igual en raíz o en subdirectorio gracias a `base: './'`. Errores de registro tragados con `.catch` (nunca rompen la app).

## 3. Restricciones

- **RNF-OFF-01:** No modifica ningún camino caliente del POS: el registro ocurre en `load` y el SW no intercepta datos ni RPC (RNF-06 de la Constitución: venta <2s intacta).
- **RNF-OFF-02:** Nuevos archivos con estilo del repo (LF, sin punto y coma, comillas simples, 2 espacios, ancho 100); lint solo de archivos tocados.
- **RNF-OFF-03:** La suite E2E existente y la verificación offline 64/64 se corren sobre el dev server → no cambian resultados (RF-01).

## 4. Fuera de alcance

- Manifest PWA instalable / prompts de instalación (el `manifest.json` de CoreUI se precachea por referencia, pero no se trabaja en installabilidad).
- Cache de respuestas de Supabase (prohibido: los datos son de IndexedDB, congelar la API violaría sincronización/RLS).
- Soporte offline del arranque en desarrollo (solo producción).

## 5. Verificación (Task 2)

1. `npm run build` → existe `build/sw.js` con el manifiesto completo.
2. `npm run build` + `vite preview` (producción) → con red: login, verificar SW `activated` y caches pobladas.
3. Corte de red (CDP `Network.emulateNetworkConditions`) → `location.reload()` → la app **arranca** (pantalla de login) offline; recarga de nuevo y login offline funcionando.
4. Reconexión → comportamiento normal.
5. Dev server intacto: sin `serviceWorker` registrado en :3000.
