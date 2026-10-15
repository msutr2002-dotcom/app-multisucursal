# Spec: Mejoras interfaz móvil del POS v2

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `pos-interfaz-movil-v2`

## Problema

Tras la primera adaptación móvil del POS (`pos-interfaz-movil`), el usuario reporta tres puntos de fricción adicionales basados en la app de referencia (Campero):

1. **Cards todavía grandes**: aunque se redujeron, el usuario pide que sean **más pequeños/compactos** para que quepan más productos por pantalla en móvil (~390 px).
2. **Falta página de selección de variantes**: al tocar un producto padre (ej. "Pollo"), debería abrirse una **nueva pantalla** tipo "Menús / Elige tu producto" que muestre las variantes disponibles (ej. "Menú Súper Campero Q68.00", "Menú Campero Q53.00") cada una con su imagen pequeña, nombre, precio y un **radio button** para seleccionar, con un botón **"Continuar"** abajo para confirmar. Actualmente `ModalVariantes` abre un modal con botones "Elegir" por fila, que no coincide con el patrón esperado.
3. **Contraste en modo oscuro**: las letras en algunos fondos oscuros no se ven bien (falta de contraste).

## Objetivo

Que el POS en móvil sea más usable y se parezca al patrón de referencia:
- Cards de producto más pequeños/compactos en el grid de comida.
- Al tocar un producto padre, navegar/abrir una pantalla de selección de variantes con radio button y botón "Continuar".
- Mejorar el contraste de textos en modo oscuro para que sean legibles.

## Alcance

- `src/views/pos/components/ProductosGrid.jsx`: cards más compactos (imagen menor, menos padding, texto más pequeño).
- Nuevo `src/views/pos/components/ModalVariantes.jsx` (ya existe de v1, se reescribe): mostrar variantes como **lista con radio button** (una por fila: imagen pequeña + nombre + precio + radio a la derecha) y botón **"Continuar"** abajo para confirmar la selección.
- `src/views/pos/POSPage.jsx`: integrar el nuevo flujo de selección de variantes.
- `src/scss/style.scss`: mejoras de contraste de texto en modo oscuro para componentes del POS (cards, botones, títulos).

## Fuera de alcance

- Navegación a una ruta separada (`/producto/:id`) — se mantiene como modal/pantalla overlay dentro del POS para no romper la arquitectura actual de una sola página del POS.
- Crear nuevas tablas en BD o nuevos RPC.

## Criterios de verificación

- V1: A 390 px, los cards del modo comida son más compactos y quepan más productos visibles.
- V2: Al tocar un producto con variantes, aparece una lista de selección con radio button por variante y botón "Continuar" para confirmar.
- V3: El texto en componentes del POS es legible en modo oscuro (contraste suficiente).
- V4: `npx eslint` de archivos tocados: 0 errores nuevos (salvo CRLF preexistente).
- V5: `npm run build` ✓.
