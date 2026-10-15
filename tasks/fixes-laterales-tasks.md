# Tasks: fixes-laterales

Spec: `specs/fixes-laterales.md`. Una tarea a la vez: mostrar cambios → verificación/aprobación → `[x]`.

- [x] Task 1: F2 — Desactivar Principal respeta `{ok:false}` en `Bodegas.jsx` + quitar toast duplicado en `BodegasCard.jsx`. Probe: error mostrado, sin éxito falso.
- [x] Task 2: F3 — Resetear `idBodegaOrigen` en `abrirAlta` y al cambiar a modo "entre sucursales" (`TrasladosPage.jsx`). Probe: interno=Principal, cross='', reabrir=''.
- [x] Task 3: F4 — Login `username` case-insensitive con `ilike` + escape (`Login.jsx`). REST: `ilike.ALEX` → `alex`.
- [x] Task 4: F5 — Compras incluye productos sin fila `productos_sucursal` (`ComprasPage.jsx`). Probe: producto inyectado aparece en el alta.
- [x] Task 5: Verificación — lint 0 en los 5 archivos tocados + `npm run build` ✓ (3.86s) + probes F2/F3/F5 OK + REST F4 OK.
- [x] Task 6: Cierre — `memory.md` actualizado.

## Notas

- Bugs independientes entre sí; cada uno toca un archivo distinto (salvo F2 toca 2).
- No modificar el modelo de stock ni el Login/empresa.
