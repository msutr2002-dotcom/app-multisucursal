# Spec: Mejoras de interfaz móvil del POS

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `pos-interfaz-movil`

## Problema

La pantalla de Punto de Venta en móvil (~390 px) tiene varios puntos de fricción detectados por el usuario:

1. **Cards de producto demasiado grandes** en el modo comida (`ProductosGrid.jsx`): la imagen ocupa 72 px, el nombre y el precio son muy grandes, y el padding de `p-3` hace que quepan pocos productos por pantalla. El usuario quiere cards más reducidos y compactos.
2. **No hay forma de elegir variantes/subproductos**: al tocar un producto con varias opciones (ej. "Hamburguesa" → "Americana", "Torito", etc.), no aparece un modal para elegir la variante específica con su nombre y precio. Se agrega directamente el producto padre.
3. **El botón "Cotizaciones" siempre se muestra** en el encabezado del POS, incluso cuando el dispositivo está en modo comida (`esComida`) o cuando no tiene sentido. El usuario quiere ocultarlo en esos casos.
4. **El encabezado muestra elementos que no son necesarios** en móvil: el nombre "Punto de Venta", el buscador y el botón de Cotizaciones compiten por espacio. Se pide ajustar qué se muestra.

## Objetivo

Que el POS en móvil sea más compacto y usable:
- Cards de producto reducidos (imagen más pequeña, menos padding, texto más ajustado) para que quepan más productos por pantalla.
- Al tocar un producto con variantes/opciones, se abre un modal con las opciones (nombre y precio de cada una) para elegir antes de agregar al carrito.
- El botón "Cotizaciones" no aparece en modo comida ni cuando no tiene permiso.
- El encabezado se ajusta para mostrar solo lo pertinente en móvil.

## Alcance

- `src/views/pos/components/ProductosGrid.jsx`: cards más compactos (imagen menor, padding reducido, texto más pequeño).
- Nuevo `src/views/pos/components/ModalVariantes.jsx`: modal que lista las variantes/opciones de un producto (nombre + precio + botón de elegir) y devuelve la variante seleccionada al `onAgregar`.
- `src/views/pos/POSPage.jsx`:
  - Ocultar el botón "Cotizaciones" cuando `esComida` es true o cuando `!puedeVerCotizaciones`.
  - Ajustar el encabezado móvil (qué se muestra: nombre, búsqueda, cotizaciones).
- `src/views/pos/components/ProductoDetalle.jsx`: al detectar un producto con variantes, abrir `ModalVariantes` en lugar de agregar directamente (o agregar una acción "Ver opciones").

## Fuera de alcance

- Crear nuevas tablas en BD o nuevos RPC. Las variantes se resuelven con los datos existentes (`contiene_insumos`, `precios`, `id_color`).
- Reactividad cross-tab.
- Cambios en escritorio (>=768 px): el grid de comida ya no se usa en escritorio, y los cambios quedan contenidos en media-queries.

## Criterios de verificación

- V1: A 390 px, los cards del modo comida son más compactos y quepan más productos visibles.
- V2: Al tocar un producto con variantes, aparece un modal con las opciones (nombre y precio) antes de agregar al carrito.
- V3: En modo comida (`esComida=true`), el botón "Cotizaciones" no se muestra en el encabezado.
- V4: Sin permiso `pos_ver_cotizaciones`, el botón "Cotizaciones" no se muestra.
- V5: `npx eslint` de archivos tocados: 0 errores nuevos (salvo CRLF preexistente).
- V6: `npm run build` ✓.
