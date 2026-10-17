# Spec: Productos padre/hijo (`id_padre`)

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `productos-padre-hijo`

## Problema

Hoy **cada variante es una fila suelta** en `productos`:

- **Colores (`papel-iris`):** "Hojas Iris carta amarillo", "...azul", "...rojo" son filas
  independientes, agrupadas solo por heurística de **nombre base** (`colorUtils.js`).
- **Comida:** "Hamburguesa americana", "torito", "normal" aparecen como tarjetas/productos
  separados.

Resultado: la vista **Admin → Productos** y los grids del POS quedan **llenos de filas
parecidas**, y no hay forma explícita de decir "estos productos son variantes de este otro".
La heurística por nombre depende de la convención de nombres (el color debe estar al final)
y no sirve para variantes que **no son color** (tallas, sabores, presentaciones, combos).

## Objetivo

Modelo explícito **padre/hijo**:

- **Padre = contenedor "virtual":** agrupa, se muestra como **una sola entrada** y oculta a
  sus hijos de las listas/grid. **No se vende ni tiene stock propio.**
- **Hijo = producto real y vendible:** tiene stock, precio y —si aplica— su propia receta de
  insumos.
- Los hijos apuntan al padre con `id_padre`; el padre tiene `id_padre = NULL` y "tiene hijos".

Esto **no reemplaza** el modelo actual: es un eje de agrupación encima. Los productos sin
`id_padre` siguen funcionando igual que hoy.

## Decisiones

- **D1:** Campo nuevo `productos.id_padre` (`uuid`, `NULL` = sin padre). Un solo nivel de
  anidación (padre → hijos); **no hay nietos**.
- **D2:** El **padre no es vendible**: se oculta su stock/precio en la UI y no aparece como
  línea vendible en el POS ni en reportes. Su stock mostrado = **suma de sus hijos**.
- **D3:** `papel-iris` pasa a ser un **caso particular** de padre/hijo: la agrupación por
  `id_color`/nombre base se migra a `id_padre` (más robusto). *Ver Task 7.* **Decisión
  (Task 7, aprobada 2026-10-15):** se ejecuta ahora, alcance **datos + Admin**. La migración
  (`tasks/sql/papel-iris-a-padre.sql`) crea **un padre por grupo** de productos con color que
  comparten nombre **normalizado en minúsculas** (une "Hojas iris carta" vs "Hojas Iris carta"),
  el padre es raíz y **sin color**, hereda categoría/marca/imagen del grupo y solo agrupa grupos
  de **≥2** miembros (un color único se deja suelto). El POS ya abre el modal de variantes al
  tocar un padre; la heurística de color (`colorUtils.js`) queda como **respaldo**.
- **D4 (comida):** en la vista por categoría, el modal lista los productos **vendibles**
  (hijos). Si un listado muestra un padre, al elegirlo se abre un **segundo paso** con sus
  hijos. Si no hay categoría, el grid/lista muestra al padre como una entrada y entra a sus
  hijos.
- **D5 (combos):** un combo **consume hijos, nunca padres** (los padres no tienen stock). La
  receta (`RecetaForm`) debe **excluir a los padres** y **agrupar a los hijos bajo su padre**
  en el desplegable de componentes.
- **D6 (combo con variante elegible):** se resuelve con el **mismo modelo**: el combo es un
  **padre** y sus hijos son "Combo con americana", "Combo con torito", etc.; cada hijo-combo
  es `contiene_insumos = true` con su receta concreta. No se inventa un sistema de "slots
  variables".
- **D7:** Se **prohíben ciclos** (padre→hijo→padre, un producto que se contiene a sí mismo) y
  se mantiene la regla actual de **no anidar combos** (`RecetaForm.opcionesProducto` ya
  excluye `contiene_insumos`).
- **D8:** Compatibilidad: los productos existentes quedan con `id_padre = NULL` y se comportan
  como hoy. La migración de colores (D3) es opcional y reversible.
- **D9:** El **producto normal** (`id_padre = NULL` y **sin hijos**) es el **caso por defecto y
  siempre está permitido**. El padre/hijo es **opt-in**: crear un producto **no** obliga a
  asignarle padre ni a crearle variantes. Un producto sin categoría, sin color y sin padre se
  crea, se muestra y se vende como hasta ahora.

> **Estados posibles de un producto:**
> 1. **Normal (suelto):** `id_padre = NULL`, sin hijos. Vendible. *Caso por defecto.*
> 2. **Padre (contenedor):** `id_padre = NULL`, con hijos. **No vendible**; agrupa.
> 3. **Hijo (variante):** `id_padre = <uuid>`. Vendible; pertenece a un padre.

## Alcance

### Base de datos (Supabase, migración manual)

- `ALTER TABLE productos ADD COLUMN id_padre uuid REFERENCES productos(id) ON DELETE SET NULL`.
- `CREATE INDEX idx_productos_id_padre ON productos(id_padre)`.
- Validaciones en RPC: el padre debe ser de la **misma `id_empresa`**, sin ciclos y de
  profundidad ≤ 1.

### RPC (recordar `DROP FUNCTION` previo: `CREATE OR REPLACE` no puede cambiar la lista de args)

- `create_producto_admin`: añadir `p_id_padre uuid DEFAULT NULL` (15 → 16 args).
- `update_producto_admin`: añadir `p_id_padre`.
- `get_productos_admin`: devolver `id_padre`.

### Offline-First (Dexie + sync)

- Dexie **v13**: agregar `id_padre` al índice de `productos` (`src/lib/db.js`).
- `catalogSyncService` / cola de sync: incluir `id_padre` en el payload de `productos`.

### Admin (`src/views/admin/productos/`)

- `ModalProductos.jsx`: selector "Es variante de" (producto padre) + botón **"Agregar
  variante"** desde un padre (crear el hijo dentro del padre). Al crear un padre, ocultar
  stock/precio.
- `Productos.jsx` / `ProductosTabla.jsx` / `ProductosTarjeta.jsx`: mostrar solo **padres +
  productos sueltos**; los hijos se ven **dentro** del padre (expandible / conteo de variantes).

### POS (`src/views/pos/`)

- Listas/grid: agrupar por padre; mostrar una entrada por padre.
- Vista comida: aplicar D4 (padre como fila que entra a sus hijos, o hijos directos).
- Venta: la unidad vendible es el **hijo**.
- Stock mostrado del padre = suma de hijos (D2).

### Combos (`src/views/admin/productos/RecetaForm.jsx`)

- `opcionesProducto`: **excluir padres** (D5) y **agrupar** los hijos bajo su padre.
- Permitir que un **hijo** sea a su vez combo (`contiene_insumos`), como hoja de la selección.
- Validar ciclos (D7).

## Fuera de alcance

- Cambios en la forma de cobrar/descontar stock: los RPC de venta siguen escribiendo
  `productos_sucursal` (la convergencia con `stock_bodega` ocurre por trigger).
- Anidación de más de un nivel (nietos).
- Sistema de "slots variables" dentro de una receta (se resuelve con D6).
- Migrar **otros** grupos de color/sabor distintos de `papel-iris` queda fuera; la Task 7 cubre
  los grupos de productos con `id_color` que comparten nombre (Libreria Luna).

## Riesgos

- Tocar RPCs de producto (server-side, `SECURITY DEFINER`) es el punto más delicado: hay que
  respetar la sobrecarga y dropear la firma vieja antes de recrear.
- El cambio de esquema Dexie exige un bump de versión limpio (v13); no romper la hidratación.
- No listar al padre como vendible ni contarlo dos veces en reportes de stock (D2).

## Criterios de verificación

- **V1:** Un producto padre agrupa a sus hijos y la vista Admin → Productos muestra **una**
  entrada por padre.
- **V2:** Un padre no aparece como línea vendible en el POS.
- **V3:** En comida, elegir un padre muestra sus hijos; elegir un hijo lo agrega al carrito.
- **V4:** Un combo puede incluir un **hijo** (no un padre) como componente; al vender el
  combo se descuenta el stock del hijo.
- **V5:** Un combo con variante elegible se modela como padre con hijos-combo, cada uno con su
  receta.
- **V6:** Sin ciclos; un padre no puede ser componente de su propio hijo.
- **V7:** Los productos sin `id_padre` se comportan igual que antes (sin regresiones).
- **V8:** `npx eslint` de archivos tocados: 0 errores nuevos (ignorar CRLF).
- **V9:** `npm run build` ✓.
- **V10:** Probe E2E con `allen`/`allen003`/Tasty Alitas: crear padre + hijo, verlos agrupados
  y vender el hijo.
