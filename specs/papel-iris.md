# Spec: Papel iris — selector de color por variantes en el POS

**Fecha:** 2026-10-15 · **Estado:** pendiente de aprobación · **Módulo:** `papel-iris`

> Nombre del módulo por el caso de uso reportado ("papel iris"), pero la regla es
> **genérica**: aplica a **cualquier producto con color** (respuestas del usuario).

## Contexto

Los artículos tipo "papel iris" se venden en varios colores. Hoy cada color **es un
producto distinto** en el catálogo (su propio stock y su propio precio) y el POS **no
tiene ningún selector de color**: el cajero tiene que buscar cada color por su nombre.

Ya existe la base del catálogo de colores (`catalogos-colores`, cerrado 2026-10-15):
tabla `color(id, name)` global, `productos.id_color` (un color por producto) y el cache
local `db.colores`.

## Respuestas del usuario (2026-10-15)

- **Modelo:** *varios productos por color* (cada color es un producto con su stock/precio).
- **Alcance:** a **cualquier producto con color** (`productos.id_color` no nulo).
- **Guardado:** el color elegido queda en **`detalle_venta`** (Base de Datos).
- **Stock/precio:** **sí, por color** → ya lo da el propio producto (no se modela nada nuevo).
- **Agrupación:** **nombre base** = `name` **sin el color del final**
  (ej. `"Hojas Iris carta amarillo"` + `id_color=amarillo` → base `"Hojas Iris carta"`).
- **Dónde aparece:** en el **detalle del producto** (`ProductoDetalle`).

## Decisiones

- **D1 — No hay agrupación en BD.** Cada color sigue siendo un producto independiente
  (stock/precio propios). No se añaden columnas de "grupo" ni tablas de variantes.
- **D2 — Grupo por nombre base (cliente).** `base(p) = quitar_del_final(p.name, nombre_del_color(p.id_color))`
  (case-insensitive, `trim`). Dos productos son hermanos de color si comparten `base` y
  ambos tienen `id_color`. El nombre del color se toma de `db.colores` (catálogo).
- **D3 — El selector vive en `ProductoDetalle`.** Aparece solo si el grupo tiene
  **≥2 colores**. Elegir un color = **seleccionar ese producto hermano**
  (`busqueda.seleccionar(hermano)`), lo que refresca nombre, stock y precio de forma
  automática (ya son el mismo componente/producto del catálogo).
- **D4 — El color se persiste en `detalle_venta.id_color`.** El **servidor lo deriva**
  de `productos.id_color` del producto vendido (nunca confía en el cliente). El espejo
  local (`ventaLocalService`) escribe el mismo valor desde el producto local.
- **D5 — El comprobante muestra el color** cuando la línea lo tiene (cubre el caso en
  que las variantes compartan nombre idéntico; con nombres que ya incluyen el color es
  redundante pero inofensivo).
- **D6 — Offline-First intacto.** Agrupado y selector operan 100% con Dexie
  (`db.productos`, `db.colores`); sin red no cambia nada. El guardado local ocurre en la
  transacción de venta ya existente (<2 s).
- **D7 — Degradación segura.** Si el nombre no termina con el color, o falta el nombre
  del color, o no hay hermanos → `base` = nombre completo → grupo de 1 → **sin selector**.

## Alcance

### Servidor (SQL, `tasks/sql/papel-iris.sql`; Task 1 extrae las definiciones vivas)

1. `ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS id_color uuid`
   (FK a `color(id)`; **sin** `ON DELETE` para no perder historial).
2. `registrar_venta`: en el `INSERT` de detalle, `id_color` = `productos.id_color`
   del producto de la línea (derivado en servidor; sin param nuevo).
3. `get_venta_detalle`: incluir `id_color` + `color_nombre` por línea (para el comprobante).
4. `GRANT`/`NOTIFY pgrst` como en los demás parches.

### Cliente

5. **Nuevo** `src/views/pos/colorUtils.js`:
   - `nombreBase(name, colorNombre)` → quita el color del final (trim + case-insensitive;
     tolera `"Verde\n"`); si no aplica, devuelve el nombre tal cual.
   - `grupoColores(producto, productos, coloresPorId)` → `[{idColor, nombre, producto}]`
     de los hermanos (incluye al activo), ordenados; `[]` si no hay `id_color` o <2.
6. `POSPage.jsx`: cargar el mapa `id_color → nombre` desde `db.colores`; memo de
   hermanos de `selected` sobre `productosGrid`; pasar a `ProductoDetalle`
   `coloresHermanos` + `onCambiarColor={(p) => busqueda.seleccionar(p)}`.
7. `BuscadorProducto.jsx`: mostrar el **nombre del color como badge** junto al nombre del
   producto en el dropdown de resultados (necesario cuando las variantes comparten nombre,
   p. ej. "Hojas Iris carta"). Recibe `coloresPorId` desde `POSPage`.
8. `ProductoDetalle.jsx`: **selector desplegable** de color (CoreUI `CFormSelect`, sin
   librerías externas) — se usa un `<select>` y no botones/swatches porque puede haber
   muchos colores (>10). El color con stock 0 se rotula "(sin stock)"; `aria-label="Color"`.
   Se muestra solo con ≥2 hermanos.
9. `ventaLocalService.js`: `id_color: producto.id_color || null` en el `bulkAdd` de
   `db.detalle_venta` (`:180-189`).
10. `historialOfflineService.js` + `src/components/common/ModalComprobante.jsx`: mostrar
    el color por línea cuando exista (`id_color`/`color_nombre`).

## Fuera de alcance

- Cambiar el modelo de stock/precio (cada color ya es un producto independiente).
- Selector de color en el grid (respuesta: **solo en el detalle**).
- Cotizaciones / factura FEL (no se tocan en este módulo).
- Renombrar/asignar `id_color` a los productos existentes = **setup de datos del usuario**
  (el módulo solo los consume; la Task 1 incluye un diagnóstico de qué productos ya
  cumplen).

## Criterios de aceptación

- C1: con un producto que tiene `id_color` y ≥2 hermanos de igual nombre base, el detalle
  muestra el selector; elegir otro color cambia nombre/stock/precio.
- C2: sin red funciona igual (todo desde Dexie).
- C3: la venta guarda `detalle_venta.id_color` (offline en IndexedDB y online por
  `get_venta_detalle`).
- C4: el comprobante muestra el color cuando la línea lo tiene.
- C5: `npx eslint` de los archivos tocados = 0 errores reales (solo CRLF preexistente);
  `npm run build` ✓.

## Riesgos

- **Nombre base frágil:** si el color no está al final del nombre (o el nombre no lo
  incluye), el grupo = 1 → sin selector (D7: degrada, no rompe). La Task 1 reporta qué
  productos de Libreria Luna encajan hoy.
- **Color con salto de línea** (`"Verde\n"`, dato preexistente) → `trim` al comparar.
- **`registrar_venta`/`get_venta_detalle` no versionados** en el repo → se extraen con
  `pg_get_functiondef` y se aplican vía `CREATE OR REPLACE` (firma intacta; si cambiara
  la lista de argumentos, `DROP` previo para evitar el overload PGRST203).
- **Datos:** para que el selector sea útil hoy, el usuario debe asignar `id_color` a los
  productos y que el nombre termine en el color (ej. `"Hojas Iris carta amarillo"`).
