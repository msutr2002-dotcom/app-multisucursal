# Spec: critique-backlog (correcciones del critique 2026-10-11)

Fecha: 2026-10-11. Estado: aprobado ("go", ejecución todas a la vez autorizada por el usuario).
Origen: `.impeccable/critique/2026-10-11T16-58-33Z__src.md` (26/40). SDD aparte de traslados-unidades/compras-unidades.

## Alcance (5 tareas)

1. **POS flujo (P1):** autofocus + atajo global (`/` o F2) al buscador; el modal de conflictos ya **no se auto-abre** al montar el POS — badge "Conflictos (n)" en el carrito que abre al pulsar; validación inline bajo campo en alta de traslado.
2. **Carrito harden (P1):** "Vaciar" pide confirmación con conteo y total; borrar una línea muestra toast con botón **"Deshacer"** (5 s) — `ToastContext` gana acción opcional y `aria-live="polite"`.
3. **Idioma/jerga (P2):** estados crudos con guion bajo → etiqueta legible (`recibido_parcial` → "Recibido parcial") en Traslados e Historial; "cola PENDING" → "Sin conexión: guardado en este dispositivo, se enviará al volver la red"; theme switcher a Claro/Oscuro/Automático; "Auto _ Q…" → "Automático — Q…"; toasts con mensaje técnico de Postgres → mensaje genérico amigable (filtro central en `ToastContext`).
4. **A11y (persona Sam):** `aria-label` en botones icon-only (carrito, pendientes, historial, traslados); `aria-pressed` en método de pago; contraste `.login-tagline` y `.stat-hero-label` a ≥4.5:1; dropdown del buscador con `role="listbox/option"`.
5. **Menores + residuos de plantilla:** vuelto Q0.00 deja de pintarse rojo; Subtotal oculto cuando coincide con TOTAL; icono de "Limpiar" en Historial; quitar `examples.scss`, `DocsComponents.jsx`, `src/index.css` y copyright CoreUI de `index.html`.

## No tocado
Lógica de venta, sync, SDD activo de traslados-unidades/compras-unidades (solo lectura). `err.message` se filtra en la capa de toast, no en cada call site.
