# Spec: POS Cliente Unificado (input único NIT o nombre)

**Fecha:** 2026-10-13 · **Estado:** pendiente de aprobación · **Módulo:** `pos-cliente-unificado`

## Problema (D1)

El flujo actual del POS exige escribir **primero el nombre** en `#pos-cliente` para que el campo `#pos-nit` aparezca (`{textoCliente && ...}` en PanelPago:388). Es artificioso: en facturación el cajero recibe el **NIT del cliente** y debería pegarlo de una vez. Además el NIT no registrado en la lista local se **perdía** en la venta (`nitCliente: enlazado?.nit || null` descartaba el NIT crudo → la venta salía CF y el bloqueo D10 no ocurría).

## Objetivo (D2)

Un **solo campo «Cliente (opcional)»** que acepte NIT **o** nombre, con auto-detección y badge de estado inmediato (padrón SAT + perfil local). Sin campo `#pos-nit`.

## Diseño

### D3 — Detección de NIT

El texto del campo es NIT-candidato si cumple `/^[0-9][0-9\- ]{3,14}$/` (empieza con dígito; solo dígitos/guiones/espacios). NITs reales de GT: `1234567-0`, `12345678-0`. Textos como `FAC-90750` o nombres **no** son NIT-candidato (se tratan como nombre/casual).

### D4 — Auto-match local (perfil)

Si el texto es NIT-candidato → buscar en `opciones` (Dexie, sucursal + heredados) por `o.nit` (case-insensitive):
- **Encontrado** → el campo se autocompleta al texto de la opción (`Nombre (NIT)`) → enlazado (suma historial, mayoreo).
- **No encontrado** → casual **pero el NIT crudo se conserva** en la venta (D5).

La entrada por nombre conserva el datalist actual (`Nombre (NIT)`) y el match exacto por texto.

### D5 — NIT crudo viaja en la venta

`handleCobrar` pasa `nitCliente: enlazado?.nit || (esNit ? normalizar(texto) : null)`. El NIT no enlazado **no se descarta**: `emitir_factura`/`emitirFactura` lo rechazan con el mensaje del padrón (conserva D10 de facturas-sat). El nombre casual cuando el campo contiene un NIT crudo es **vacío** (no se usa el NIT como nombre de cliente).

### D6 — Check al padrón SAT (debounced, no bloqueante)

Si el texto es NIT-candidato **y hay red** → `consultarContribuyente(nit)` con debounce **400 ms** (fire-and-forget tras el último keystroke; la respuesta más vieja se descarta con token de secuencia). Actualiza el badge:

| Estado SAT | Badge |
|---|---|
| `ok: true` | `SAT ✓` |
| `ok: false` (404/no registrado) | `⚠ NIT no en padrón SAT` |
| `ok: false` (error de red/servicio) | `No se pudo verificar — se validará al facturar` |
| Sin red | `Sin conexión — el NIT se validará al facturar` |

El check **no bloquea el cobro** ni el teclado; el bloqueo real sigue siendo server-side en la emisión.

### D7 — Badge combinado (reemplaza el bloque actual)

Debajo del campo, según el caso:

| Caso | Texto del badge |
|---|---|
| Enlazado + SAT ok | `✓ {nombre} ({nit}) — suma historial · SAT ✓` |
| Enlazado + SAT no registrado | `✓ {nombre} ({nit}) — suma historial · ⚠ NIT no en padrón SAT` |
| Enlazado + SAT desconocido/offline | `✓ {nombre} ({nit}) — suma historial` |
| Casual + NIT + SAT ok | `Cliente casual · NIT registrado en SAT — se puede facturar` |
| Casual + NIT + SAT no registrado | `⚠ NIT no en padrón SAT — si pide factura se bloqueará` |
| Casual + NIT + sin red | `Sin conexión — el NIT se validará al facturar` |
| Casual + nombre (sin NIT) | `Cliente nuevo/casual: va en el ticket, sin perfil.` |

### D8 — Se elimina `#pos-nit`

El campo `NIT (opcional)` desaparece. El estado `nitCliente` (POSPage `nitClienteVenta`) se mantiene como **derivado**: `alCambiarCliente` llama `onNitChange(nitNormalizado)` si el texto es NIT-candidato, o `onNitChange('')` si no. `ModalCobrar` no cambia (pasa props por referencia).

### D9 — «Registrar cliente nuevo» se oculta con NIT crudo

El botón solo tiene sentido con un **nombre** en el campo. Si el texto es NIT-candidato → oculto (no se parte un NIT en nombre/apellido).

## Fuera de alcance

- Cambios en `emitirFactura`/SQL (D10 ya bloquea server-side).
- Autocompletado con fuzzy matching o búsqueda remota de clientes.
- El atajo de `ModalResultadoVenta` y `FacturasPage` no cambian.

## Criterios de aceptación

- C1: Pegar `12345678-0` en el campo único enlaza el cliente (badge enlazado + SAT ✓) sin escribir nombre previo.
- C2: NIT no en la lista local pero en SAT → badge "se puede facturar", venta con `nitCliente` = NIT crudo.
- C3: NIT no en SAT → badge de bloqueo; `emitirFactura` rechaza con mensaje del padrón (D10 intacto).
- C4: Sin red → badge "se validará al facturar"; cobro no se bloquea (offline-first).
- C5: El campo `#pos-nit` ya no existe en el DOM.
- C6: Nombre vía datalist sigue enlazando igual que hoy.
- C7: lint 0 en archivos tocados + build ✓.

## E2E (Task 4)

Actualizar `test-facturas.js`: `seleccionarClientePos` simplificado (escribir NIT en el campo único → esperar badge enlazado; sin `#pos-nit`). Re-correr la suite completa (41 asserts base) + asserts nuevos del badge SAT (C1–C4).
