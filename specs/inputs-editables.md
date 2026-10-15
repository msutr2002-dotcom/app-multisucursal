# Spec: Campos numéricos editables (poder borrar y reescribir)

**Fecha:** 2026-10-15 · **Estado:** pendiente de aprobación · **Módulo:** `inputs-editables`

## Contexto

Reporte del usuario: en varios campos numéricos **no se puede borrar el valor** para escribir uno nuevo. Casos concretos:

- POS · cantidad en el carrito: está en `1` y al borrar vuelve a `1`.
- POS · cantidad a agregar en el detalle del producto: igual (`1` no se borra).
- Admin · stock/mínimo (`ModalStock`): con `0` no se puede dejar vacío para teclear otro número.

## Causa raíz

Los tres inputs son **controlados por un número** y convierten en el `onChange`:

- `src/views/pos/components/CarritoFila.jsx:47` → `parseInt(e.target.value, 10) || 1` (vacío ⇒ `NaN` ⇒ `1`).
- `src/views/pos/components/ProductoDetalle.jsx:116` + `cambiarCantidad` (`:44-45`) → `Math.max(1, Math.min(nueva || 1, …))` (doble clamp).
- `src/views/admin/productos/ModalStock.jsx:49` → `Math.max(0, parseInt(valor, 10) || 0)`.

También `useCarrito.setCantidad` (`:103`) recorta `''`/`NaN` a `1`. Al ser el valor de entrada un número, **nunca existe el estado transitorio vacío** ⇒ el usuario no puede limpiar el campo.

## Decisión

Componente compartido **`CampoNumero`** (`src/components/common/CampoNumero.jsx`), CoreUI-only:

- Mantiene el **texto** que teclea el usuario como estado local (`string`), permitiendo `''`.
- Sólo acepta dígitos (`/^\d*$/`); al escribir un número válido **hace `onCommit` en vivo** (así el carrito/total siguen reaccionando sin esperar el blur).
- Vaciar **no** dispara commit (el valor de negocio se conserva hasta que haya un número).
- Al `blur` o `Enter`: si queda vacío o inválido → vuelve al `min`/valor vigente; si no, recorta a `[min, max]` y sincroniza el texto.
- Sincroniza el texto desde la prop `value` **sólo si el input no tiene foco** (evita pisar lo que el usuario escribe).
- Props: `value`, `onCommit`, `min`, `max`, `size`, `className`, `style`, `aria-label`, `title`, `data-testid`.

Se usa en los 3 lugares afectados. Los clamps existentes en `useCarrito.setCantidad` y `cambiarCantidad` **se conservan** como defensa (ahora siempre reciben enteros válidos).

## Fuera de alcance

- Compras/Traslados/ModalPrecios/ModalProductos/Clientes/Ingredientes: ya guardan `string` y permiten vaciar (verificado).
- Campos de dinero en `PanelPago`: ya son `string`.
- Otros módulos del backlog (fecha dashboard, colores, compras unidades, papel iris, móvil).

## Criterios de aceptación

- C1: En el carrito del POS se puede borrar la cantidad y teclear una nueva; el valor final respeta `min=1` y el máximo de la unidad.
- C2: En el detalle del producto se puede borrar la cantidad (aunque esté en `1`) y teclear otra; el `total` se recalcula en vivo y se recorta al stock disponible.
- C3: En `ModalStock` se puede borrar stock/mínimo (aunque esté en `0`) y teclear otro valor; al guardar se envían enteros ≥ 0.
- C4: Vaciar y salir sin teclear no deja el campo en blanco ni rompe el guardado (vuelve al valor vigente / `min`).
- C5: `npx eslint` 0 en los archivos tocados + `npm run build` ✓.

## Riesgos

- Commit en vivo con `max`: escribir `100` con `max=5` deja el carrito en `5` mientras el texto muestra `100` hasta el blur → se normaliza a `5` al salir del campo.
- `type="number"`: en algunos navegadores el `onChange` no dispara con entradas inválidas (`e`, `-`, `.`); el componente las ignora (no rompe).
- Persistencia del carrito (`localStorage`): el commit sigue enviando enteros, así que el formato guardado no cambia.
