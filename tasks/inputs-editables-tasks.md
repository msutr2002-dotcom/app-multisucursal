# Tasks: inputs-editables

**Módulo:** `inputs-editables` · **Spec:** `specs/inputs-editables.md`

## Task 1 — Componente compartido `CampoNumero`
- [x] Crear `src/components/common/CampoNumero.jsx` (CoreUI `CFormInput`, estado texto local, `/^\d*$/`, commit en vivo, clamp en blur/Enter, sync sin foco).
- [x] Props: `value`, `onCommit`, `min`, `max`, `size`, `className`, `style`, `aria-label`, `title`, `data-testid` (passthrough).

## Task 2 — POS: cantidad en el carrito
- [x] `src/views/pos/components/CarritoFila.jsx`: reemplazar el `CFormInput type=number` por `CampoNumero` (`min=1`, `max=max`, `onCommit=(n)=>onCantidad(item.idProducto, n, item.id_unidad_venta)`).

## Task 3 — POS: cantidad a agregar (detalle)
- [x] `src/views/pos/components/ProductoDetalle.jsx`: usar `CampoNumero` (`min=1`, `max=Math.max(maxDisp,1)`, `onCommit=cambiarCantidad`). Se conserva el clamp de `cambiarCantidad`.

## Task 4 — Admin: stock/mínimo
- [x] `src/views/admin/productos/ModalStock.jsx`: usar `CampoNumero` (`min=0`) por celda; `handleChange` recibe ya el entero.

## Task 5 — Verificación y cierre
- [x] `npx eslint` de los 4 archivos → 0 reales (solo CRLF preexistente en `ModalStock.jsx`).
- [x] `npm run build` ✓ (18.06 s).
- [x] Probe Selenium `Temp/opencode/probe-inputs.js`: detalle `1→""→3→3` (vaciar+blur→`1`), carrito `1→""→2→2`, subtotal recalcula en vivo.
- [x] Actualizar `memory.md` (y `AGENTS.md` si aplica).
