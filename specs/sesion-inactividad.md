# Spec — Cierre de sesión por inactividad

**Fecha:** 2026-10-14 · **Origen:** petición del desarrollador — *"falto agregar que se cierre automáticamente la sesión después de unos 15 min"*.

## Contexto

La sesión del POS es **100% `localStorage`**, sin `AuthContext`:

- `Login.jsx:135` guarda `currentUser`; `Login.jsx:242` guarda `empresaSeleccionada`.
- `ProtectRoute.jsx:5-10` solo comprueba que `currentUser` exista → **nunca expira**.
- El logout manual vive en `AppHeaderDropdown.jsx:18-21` (`removeItem('currentUser')` + `navigate('/login')`).
- Todo el resto del repo lee la sesión con `JSON.parse(localStorage.getItem('currentUser'))`.

Hoy, si un operador deja el dispositivo desatendido, la sesión queda abierta indefinidamente. Se necesita un **cierre por inactividad de 15 minutos** (decidido en sesión), **sin aviso previo**, que no interfiera con el límite de 2 s del registro de ventas.

Alcance: `src/services/sesionService.js` (nuevo), `src/hooks/useCierreInactividad.js` (nuevo), `src/layout/DefaultLayout.jsx` (montaje), `src/components/header/AppHeaderDropdown.jsx` (logout centralizado) y `src/views/authentication/login/Login.jsx` (reset del reloj al iniciar sesión). **Sin cambios de schema, RPCs ni RLS.**

---

## RF-SI1 — Timeout por inactividad (15 min)

- Constante `TIMEOUT_INACTIVIDAD_MS = 15 * 60 * 1000` en `sesionService.js`.
- "Inactividad" = tiempo transcurrido **sin interacción del usuario**. Se reinicia el reloj con cada evento: `mousemove`, `mousedown`, `pointerdown`, `keydown`, `touchstart`, `scroll`, `wheel` (listeners `passive`).
- La marca de actividad se **throttlea a 1 escritura/segundo** para no escribir `localStorage` en cada `mousemove`.
- Un `setInterval` (15 s) compara `Date.now() - últimaActividad` contra el timeout; al superarlo → `cerrarSesion()`.
- Se hace una **revisión inmediata al montar**: si la app se reabre con una marca de actividad vieja (> timeout) → cierra al instante.

## RF-SI2 — Persistencia y sincronización entre pestañas

- Marca de actividad en `localStorage.session_last_activity` (timestamp en ms).
- Listener `storage`: si otra pestaña registra actividad, esta pestaña adopta la marca; si otra pestaña **cierra sesión** (`currentUser` → `null`), esta pestaña también navega a `/login`.
- Al iniciar sesión (`Login.jsx`) se **resetea** la marca a `Date.now()` (evita que una marca vieja de una sesión previa cierre la sesión recién iniciada).

## RF-SI3 — Cierre centralizado

- `cerrarSesion(navigate)` en `sesionService.js`: elimina `currentUser`, `empresaSeleccionada` y `session_last_activity`; y hace `navigate('/login', { replace: true })` si recibe el `navigate`.
- Lo usan: el hook de inactividad y el logout manual (`AppHeaderDropdown.jsx`). Una sola fuente de verdad para "cerrar sesión".

## RF-SI4 — Ámbito: solo área autenticada

- El hook se monta en `DefaultLayout.jsx` (solo se renderiza bajo `ProtectRoute`), por lo que **no corre en `/login`** ni en las páginas 404/500.

## RF-SI5 — Testabilidad (override)

- El timeout efectivo es `window.__SESSION_IDLE_MS__ ?? TIMEOUT_INACTIVIDAD_MS`, para que los E2E puedan acortarlo sin esperar 15 min.

---

## Criterios de aceptación

1. Con sesión activa, tras **15 min sin interacción** → cierra sesión y redirige a `#/login` (sin aviso).
2. Cualquier interacción del usuario (mover el mouse, teclear, hacer scroll, tocar) **reinicia** el reloj: a los 14 min de inactividad + una interacción → no cierra a los 15 min desde el login, sino 15 min después de esa interacción.
3. Recargar/reabrir la pestaña con una marca de actividad de hace > 15 min → cierra sesión al cargar.
4. Iniciar sesión resetea el reloj → no cierra por una marca vieja heredada.
5. Cerrar sesión en una pestaña cierra las demás pestañas abiertas de la misma sesión.
6. Logout manual sigue funcionando (y ahora limpia también `session_last_activity`).
7. `npx eslint` sobre los archivos tocados → 0 errores nuevos; `npm run build` ✓.
8. `memory.md` y `AGENTS.md` actualizados al cerrar la sesión.

## Fuera de alcance

- Seguridad real (tokens/JWT/`service_role`): la sesión sigue siendo local; el servidor protege vía RLS/RPCs. Esto es **higiene de la sesión en el dispositivo**, no autenticación criptográfica.
- Aviso/cuenta regresiva antes de expirar (decidido: **cerrar directo**, sin aviso).
- Timeout absoluto desde el login (decidido: **solo inactividad**).
- Bloqueo del POS por PIN al volver (feature distinta).
