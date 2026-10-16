# tasks: menú del POS por categoría

Spec: `specs/pos-menu-categoria.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [ ] Task 1: Refactor `ProductosGrid.jsx` a grid de **categorías**.
  - Agrupar `productos` por `categoria` (`"Otros"` como fallback, D2).
  - Un card por grupo: imagen representativa (D5) + nombre de la categoría + nº de opciones.
  - Deshabilitar la categoría solo si **todos** sus productos están sin stock (D3).
  - Quitar las pestañas de categoría (D4).
  - Nueva prop `onAbrirCategoria(grupo)`.
  - Verificar: build ✓.
- [ ] Task 2: Generalizar `ModalVariantes.jsx` para listar los productos del grupo.
  - Recibe `opciones` (productos) + `grupo` (nombre, imagen representativa).
  - Encabezado con imagen representativa + título "Elije tu producto" (como la referencia).
  - Cada fila: imagen, nombre, precio (`precioTile`), radio button a la derecha.
  - "Continuar" agrega el producto seleccionado; producto sin stock atenuado/no seleccionable (V5).
  - Verificar: build ✓.
- [ ] Task 3: Integrar en `POSPage.jsx`.
  - Estado `categoriaActiva`; `onAbrirCategoria` abre el modal con los productos del grupo.
  - Al confirmar, `carrito.addItem(producto, 1, null)` y cerrar el modal.
  - Verificar: build ✓.
- [ ] Task 4: Verificación final (build + lint + probe E2E).
  - `npx eslint` de archivos tocados (0 nuevos, ignorar CRLF).
  - `npm run build` ✓.
  - Probe con `allen`/`allen003`/Tasty Alitas a 390×844: tarjetas de categoría, abrir modal, seleccionar y agregar.
  - `memory.md` + `AGENTS.md` actualizados.
