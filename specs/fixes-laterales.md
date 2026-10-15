# Spec: Correcciones laterales del batch stock/bodega

**Fecha:** 2026-10-14 · **Estado:** pendiente de aprobación · **Módulo:** `fixes-laterales`

## Contexto (F1)

Al cerrar `stock-bodega-fuente-verdad` quedaron **4 bugs laterales** detectados y explícitamente **fuera de alcance** (spec D7). Este módulo los ataca uno por uno, sin tocar el modelo de stock ni el Login/empresa.

## Bugs y decisiones

### F2 — Desactivar bodega Principal ignora el `{ok:false}` del RPC

- **Dónde:** `src/views/admin/bodegas/Bodegas.jsx:72-90` (`handleDesactivar`) y `BodegasCard.jsx:13-17`.
- **Causa:** `handleDesactivar` sólo revisa `error`, no el flag de negocio. El RPC `update_bodega` devuelve `{ok:false, mensaje:'No se puede desactivar la bodega Principal'}` (`tasks/sql/multibodega-bloque1.sql:182-184`) sin error HTTP → la vista muestra **"Bodega desactivada correctamente"** aunque el servidor la rechazó. Además la tarjeta también toastea éxito (`resultado?.ok`), duplicando el toast.
- **Fix:** `handleDesactivar` verifica `cuerpo.ok === false` (patrón de `handleGuardar`) → toast `danger` con `cuerpo.mensaje` y `return { error }`. La vista (contenedor) queda como **única dueña del toast** (AGENTS.md); se quita el toast de éxito de `BodegasCard` (y su import de `useToast`).

### F3 — Traslados conserva `idBodegaOrigen` obsoleto entre altas / cambios de modo

- **Dónde:** `src/views/traslados/TrasladosPage.jsx:383-394` (`abrirAlta`) y `:882-906` (botones de modo).
- **Causa:** `abrirAlta` resetea `idBodegaDestino`/`idDestino`/productos/líneas, pero **no** `idBodegaOrigen`. Como fuerza `modoTraslado='entre_sucursales'` (donde no corre la auto-selección), una alta nueva hereda la bodega origen de una sesión anterior (modo interno) y la envía en el payload cross-branch. Idéntico al cambiar de interno → entre sucursales (el botón sólo limpia `idBodegaDestino`).
- **Fix:** `abrirAlta` limpia `idBodegaOrigen` a `null` (cross-branch por defecto = "Todas las bodegas"/stock de sucursal) y el botón `modo-entre-sucursales` también. El modo interno sigue auto-seleccionando la Principal/guardada vía el effect de `:226-231`.

### F4 — Login sensible a mayúsculas en el `username`

- **Dónde:** `src/views/authentication/login/Login.jsx:64` (`.eq('username', username)`).
- **Causa:** la comparación es exacta → `Juan` no puede entrar como `juan` (aun existiendo el usuario).
- **Fix:** buscar con `.ilike('username', <escapado>)`, escapando `%`/`_`/`\` para que el input del usuario no se interprete como patrón. El resto del flujo (varios candidatos por sucursal, elección por empresa/Admin) no cambia.

### F5 — Compras oculta productos sin fila en `productos_sucursal`

- **Dónde:** `src/views/compras/ComprasPage.jsx:186-198`.
- **Causa:** `prods.filter((p) => stockMap.has(p.id))` con `stockMap` construido desde `productos_sucursal` → un producto del catálogo de la empresa **sin fila de sucursal** (p. ej. recién creado, o sucursal que aún no lo tiene) no aparece en el alta de Compras y no se puede comprar.
- **Fix:** no filtrar; incluir todos los productos de `db.productos` con `stock: stockMap.get(p.id)?.stock ?? 0` y `stockMin: ... ?? 0`.

## Fuera de alcance

- Modelo de stock y RPC server-side (ya cerrado en `stock-bodega-fuente-verdad`).
- Selector de bodega oculto con 1 sola bodega (`TrasladosPage.jsx:943`) y recepción cross-branch que no escribe `stock_bodega` (`trasladoService.js:352-366`): se dejan para un batch posterior si el usuario lo pide.

## Criterios de aceptación

- C1: Desactivar la bodega Principal muestra el error del servidor y **no** muestra éxito; desactivar otra bodega sí confirma (un solo toast, de la vista).
- C2: Abrir una alta nueva de traslado con `modoTraslado='entre_sucursales'` deja "Bodega origen" en "Todas las bodegas" (no conserva la de una alta previa).
- C3: Login funciona con distinto de mayúsculas/minúsculas en el `username`.
- C4: Un producto del catálogo sin fila `productos_sucursal` aparece en el alta de Compras (stock 0).
- C5: lint 0 en archivos tocados + `npm run build` ✓.

## Riesgos

- `ilike` con `%`/`_` sin escape = falso positivo de usuario → se escapa.
- `BodegasCard` sin su toast: el contenedor ya toastea éxito/error → sin regresión de feedback.
- Limpiar `idBodegaOrigen` en cross-branch no rompe el modo interno (lo re-selecciona su effect).
