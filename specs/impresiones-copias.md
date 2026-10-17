# Spec — Impresiones/Copias (consumo de papel por hoja)

**Módulo:** `impresiones-copias` · **Estado:** ACTIVO · **Fecha:** 2026-10-16
**Depende de:** `combos-insumos` Task 8 (fix `upsert_combo_componentes`) · `productos-padre-hijo` · `stock-bodega-fuente-verdad`

---

## 1. Contexto y problema

El negocio vende **impresiones y copias** sobre distintos papeles: normal, iris (varios
colores), construcción, lino, fotográfico, cáscara de huevo, etc. Hoy existe un producto
por tipo de impresión (`Copias normal`, `Copias DPI`, `Impresión normal`, `Impresión en
hojas 120g/construcción/Lino/fotográfico`) pero **no descuentan el papel**.

El papel se compra **por resma** pero se consume **por hoja**. Se quiere que al vender una
copia/impresión se descuente **1 hoja** del papel correspondiente (doble cara = 1 hoja).

**Restricción del modelo:** un combo (`contiene_insumos`) **no tiene stock propio**; su
inventario lo forman sus componentes. Hoy el POS lee `producto.stock` y, al ser 0, marca
"Sin stock" y deshabilita "Agregar" → un combo es **invendible desde el POS**.

---

## 2. Decisiones

- **D1 — Modelado padre/hijo + combo:** se crea un **padre contenedor** (ej. "Impresiones /
  Copias") y **una variante (hijo) por tipo/color**; cada hijo es un **combo**
  (`contiene_insumos = true`, `tipo_receta = 'producto'`) cuya receta es **1 hoja** del papel
  correspondiente. Un hijo puede ser combo-hoja (soportado por `productos-padre-hijo`).
- **D2 — Papel por hoja:** cada papel es un producto `bien` con **unidad base = hoja**
  (`id_unidad_venta` = UNIDAD) y **stock en hojas**. Sus precios:
  - tier de venta por resma: unidad **Resma**, **factor 500** (1 resma = 500 hojas), precio por resma;
  - tier **"Por unidad"**, **factor 1**, precio por hoja.
  La compra por resma (`id_unidad_compra = Resma`) vive en Compras y no altera que el stock
  se lleve en hojas. La receta consume el tier **"Por unidad" (factor 1)** → 1 hoja.
- **D3 — Disponibilidad derivada (decisión del usuario):** para un producto-combo, el POS
  **no** usa su stock propio (0). Calcula:
  `disponible = min( floor(stockComponente / requeridoPorCombo) )` sobre todos los componentes,
  donde `requeridoPorCombo = cantidad × factor` (componente-producto, `factor` del tier
  elegido, default 1) o `cantidad` (componente-ingrediente). Se muestra "N copias" y
  "Agregar" se habilita si `N > 0`.
- **D4 — Offline-first:** la receta se hidrata en Dexie (`combo_componentes`) desde
  `get_productos_admin`, que **ya** devuelve `componentes` por producto (con `factor`
  denormalizado). El stock de los componentes sale de `db.stock_bodega` de la bodega activa
  (fallback `db.productos_sucursal`); los ingredientes, de `db.ingredientes_sucursal`. El
  cálculo es 100 % local (sin red).
- **D5 — Padre contenedor:** la disponibilidad mostrada para el padre = **suma** de la
  disponibilidad de sus hijos (no la suma de stock, que en combos sería 0).
- **D6 — Venta:** `registrar_venta` sigue siendo la autoridad (descuenta componentes y
  valida stock online). La expansión de combos **offline** es Task 5 de `combos-insumos`
  (fuera de alcance aquí).

---

## 3. Requisitos

- **RF-IC1:** `hidratarCatalogo` guarda en `db.combo_componentes` las filas de
  `p.componentes` (agregando `id_producto = p.id`) y limpia el store en la misma transacción.
- **RF-IC2:** helper `disponibilidadCombo(idProducto, { componentesPorProducto, stockPorProducto,
  ingredientesPorId, productosPorId })` en cliente, con redondeo a la baja y `0` si algún
  componente falta o no alcanza para 1.
- **RF-IC3:** en el POS, `stockDeProducto` devuelve la **disponibilidad derivada** para
  productos `contiene_insumos` (en vez del stock propio).
- **RF-IC4:** `ProductoDetalle` muestra el badge con la disponibilidad derivada y habilita
  "Agregar" cuando `> 0`; no muestra "Sin stock" para combos con componentes disponibles.
- **RF-IC5:** `ProductosGrid` y `ModalVariantes` tratan al combo como vendible si tiene
  precio y disponibilidad `> 0` (no por stock propio 0).
- **RF-IC6:** `abrirDetalleDePadre` elige el primer hijo con **disponibilidad > 0**.
- **RF-IC7:** la ficha (Admin) del padre sigue mostrando la suma de hijos; el POS muestra la
  suma de disponibilidad (D5).

---

## 4. Fuera de alcance

- Expansión de combos offline (Task 5 de `combos-insumos`).
- Crear los productos-papel: **los crea el usuario** en Admin.
- Cambios de facturación/impresión.

---

## 5. Criterios de aceptación

1. Con el fix de `upsert_combo_componentes` aplicado, guardar una receta de 1 hoja "Por
   unidad" funciona.
2. Con papel stock 750 y receta de 1 hoja, un producto-combo muestra "750" disponibles
   (o la suma de sus componentes si son varios) y se puede agregar al carrito.
3. Vender 10 copias descuenta 10 hojas del papel; la disponibilidad baja a 740.
4. Un combo con algún componente en 0 muestra disponibilidad 0 y no permite agregar.
5. Todo funciona **sin red** (lectura de Dexie).
6. `npx eslint` de los archivos tocados = 0; `npm run build` ✓.
