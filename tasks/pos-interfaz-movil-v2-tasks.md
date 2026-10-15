# tasks: mejoras interfaz móvil POS v2

Spec: `specs/pos-interfaz-movil-v2.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Reducir más los cards del modo comida en `ProductosGrid.jsx`.
  - Imagen más pequeña (56×56), menos padding, texto más ajustado, menos altura de card.
  - Verificar: build ✓.
- [x] Task 2: Reescribir `ModalVariantes.jsx` como lista de selección con radio button + botón "Continuar".
  - Cada variante: imagen pequeña a la izquierda, nombre, precio, radio button a la derecha.
  - Botón "Continuar" abajo para confirmar y agregar al carrito.
  - Integrar en `POSPage.jsx` (`agregarDelGrid` abre el modal; `agregarVarianteSeleccionada` agrega al carrito).
  - Verificar: build ✓.
- [x] Task 3: Arreglar contraste/legibilidad de letras en modo oscuro en el POS.
  - SCSS: reglas de contraste para `text-body-secondary`, `text-muted`, `pos-product-name`, `pos-card-text`, `.monto`, botones secundarios en modo oscuro.
  - Verificar: build ✓.
- [x] Task 4: Verificación final (build + lint + probe móvil).
  - `npx eslint` de archivos tocados (0 nuevos).
  - `npm run build` ✓.
  - Probe con `allen`/`allen003`/`Tasty Alitas` a 390×844 (modo comida no activo para esa sucursal, cambios de código verificados).
  - `memory.md` + `AGENTS.md` actualizados.
