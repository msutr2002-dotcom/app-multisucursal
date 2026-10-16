# Spec: Menú del POS por categoría (card = categoría, modal = productos)

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `pos-menu-categoria`

## Problema

En la vista comida del POS (`ProductosGrid.jsx`), cada fila de `productos` se pinta
como una **tarjeta suelta**. Cuando el admin registra varias variantes de un mismo
platillo (ej. "Hamburguesa americana", "Hamburguesa torito", "Hamburguesa normal")
o varios combos, todas aparecen como tarjetas independientes en el grid en lugar de
agruparse bajo un único ítem de menú.

El usuario quiere el patrón de la app de referencia (Campero):

1. La pantalla muestra **una tarjeta por categoría** ("Hamburguesas", "Combos",
   "Pollo", "Pizzas", ...), con imagen representativa y el nombre de la categoría.
2. Al tocar una tarjeta se abre una pantalla/modal **"Elige tu producto"** que lista
   los productos de esa categoría, cada uno con imagen pequeña, nombre, precio y un
   **radio button**, con botón **"Continuar"** abajo para confirmar.

## Objetivo

- El grid de la vista comida muestra **una tarjeta por categoría** (no por producto).
- Al tocar una categoría se abre `ModalVariantes` con la lista de productos de esa
  categoría (imagen, nombre, precio, radio) y botón **"Continuar"** que agrega el
  producto seleccionado al carrito (1 unidad).
- Los **combos** se agrupan por categoría igual que cualquier otro producto.
- Los productos **sin categoría** caen en un grupo `"Otros"`.

## Decisiones

- **D1:** Agrupación por `productos.categoria` (campo existente, sin cambios en BD).
- **D2:** Productos sin `categoria` → grupo `"Otros"`.
- **D3:** La tarjeta de categoría se **deshabilita solo si todos** sus productos están
  sin stock en la bodega/sucursal activa.
- **D4:** Se eliminan las pestañas de categoría del grid (quedan **redundantes**: el
  grid ya es de categorías).
- **D5:** Imagen representativa del grupo = primera imagen no vacía entre sus
  productos; si ninguna tiene imagen, se muestra el placeholder de `ImagenProducto`.
- **D6:** Al confirmar en el modal, se agrega **1 unidad** del producto elegido con su
  precio default (`precioTile`). En la vista por categoría **no** se abre una segunda
  selección de tipo de precio: si un producto tiene varios `precios`, se agrega con su
  precio default (ver "Fuera de alcance").

## Alcance

- `src/views/pos/components/ProductosGrid.jsx`: pasar de grid de **productos** a grid
  de **categorías**. Agrupa `productos` por `categoria` (fallback `"Otros"`), renderiza
  un card por grupo (imagen representativa + nombre + cantidad de opciones) y llama a
  `onAbrirCategoria(grupo)` al tocar.
- `src/views/pos/components/ModalVariantes.jsx`: generalizar para recibir una lista de
  **productos** (`opciones`) del grupo. Encabezado con imagen representativa + título
  "Elije tu producto". Cada fila: imagen, nombre, precio y radio. Botón "Continuar"
  agrega el producto seleccionado.
- `src/views/pos/POSPage.jsx`: estado de la categoría abierta (`categoriaActiva`),
  apertura/cierre del modal y agregado del producto seleccionado al carrito. Se
  mantiene el comportamiento actual del modal para productos con variantes de precio
  (si aplica) — ver alcance.
- `src/scss/style.scss`: estilos del card de categoría (imagen grande, nombre centrado
  y destacado) reutilizando `.pos-grid` / `.pos-imagen` / `.pos-texto`.

## Fuera de alcance

- Cambios en BD, RPCs o migraciones (se usa `categoria` existente).
- Agrupación por producto padre nuevo (`id_padre`).
- Segunda selección de tipo de precio dentro de la categoría: si un producto tiene
  varios `precios`, en la vista por categoría se agrega con su precio default. Una
  selección en dos pasos (producto → tipo de precio) se deja para una iteración futura.
- Navegación a una ruta separada (`/categoria/:id`): se mantiene como modal/overlay
  dentro de la página única del POS.

## Criterios de verificación

- **V1:** En la vista comida, cada categoría aparece como **una** sola tarjeta.
- **V2:** Al tocar una tarjeta se abre el modal "Elije tu producto" con los productos
  de esa categoría.
- **V3:** Seleccionar un producto y pulsar "Continuar" lo agrega al carrito (1 unidad)
  y cierra el modal.
- **V4:** Los productos sin categoría aparecen agrupados en "Otros".
- **V5:** Un producto sin stock aparece atenuado/no seleccionable dentro del modal; la
  categoría se atenúa solo si todos sus productos están sin stock.
- **V6:** `npx eslint` de los archivos tocados: 0 errores nuevos (ignorar CRLF).
- **V7:** `npm run build` ✓.
- **V8:** Probe E2E con `allen`/`allen003`/Tasty Alitas: activar vista comida, ver las
  tarjetas de categoría, abrir el modal, seleccionar y agregar un producto.
