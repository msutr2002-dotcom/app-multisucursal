# Spec: Colores por empresa (aislamiento del catálogo `color`)

**Fecha:** 2026-10-15 · **Estado:** pendiente de aprobación · **Módulo:** `colores-por-empresa`

## Contexto

`catalogos-colores` (D2) dejó la tabla `color` como **global** (solo `id, name`), igual que
`tipo_producto` en su momento. Los RPC `get_catalogos(p_id_empresa)` y
`get_productos_admin(p_id_empresa)` devuelven **todos** los colores sin filtrar, y el cliente
(`catalogSyncService.js`) **estampa** `id_empresa = empresa activa` a cada color al cachearlos
en Dexie. Resultado: los colores creados en **Libreria Luna** aparecen también en el catálogo
de **cualquier otra empresa/sucursal** del sistema.

Datos reales (2026-10-15): `color` tiene **69** filas; Libreria Luna usa **10** (en sus
productos), Tasty Alitas **0**. Las otras **59** no las usa ningún producto.

## Decisiones

- **D1 — Ámbito por empresa.** Se agrega `color.id_empresa uuid` y se filtra por empresa en
  todos los RPC, igual que `marca`, `categoria`, `proveedor`, `unidades` y `tipo_producto`.
  (No por sucursal: el color es atributo del producto y los productos son por empresa.)
- **D2 — Backfill a Libreria Luna.** Todos los colores existentes (los 10 usados + los 59 sin
  uso) se asignan a Libreria Luna (`e7203a75-2ccd-4778-b532-f330d2550c60`). Las demás empresas
  quedan con su lista propia (vacía hasta que creen colores).
- **D3 — RLS sin cambios.** La tabla `color` ya bloquea la lectura directa de `anon`; todo pasa
  por RPC `SECURITY DEFINER`, que se filtran por `id_empresa` en la lógica. No se expone `color`
  a lectura directa.
- **D4 — El cliente no cambia.** `catalogSyncService` sigue estampando
  `id_empresa = empresa activa` a cada color, porque `get_catalogos` NO devuelve `id_empresa` y
  el filtro local (`leerCatalogosLocales`) lo necesita. Con el servidor ya filtrando por empresa,
  esa etiqueta pasa a ser **correcta** (todos los colores devueltos pertenecen a la empresa
  activa). El cache hace `clear` + `bulkPut` en cada hidratación → el dispositivo solo guarda los
  colores de su empresa.
- **D5 — Color del producto debe ser de la misma empresa.** `create_producto_admin` /
  `update_producto_admin` validan que `p_id_color` pertenezca a la empresa del producto
  (hardening; evita referencias cruzadas por RPC).

## Alcance

### Servidor (`tasks/sql/colores-por-empresa.sql`, idempotente)

1. `ALTER TABLE color ADD COLUMN IF NOT EXISTS id_empresa uuid;`
2. Backfill: `id_empresa` = empresa de un producto que lo use; si ninguno, **Libreria Luna**
   (D2). Índice `(id_empresa, name)`.
3. `get_catalogos`: `colores` filtrado por `co.id_empresa = p_id_empresa`.
4. `get_productos_admin`: `colores` filtrado por `co.id_empresa = p_id_empresa`.
5. `upsert_catalogo`: al insertar `color` incluye `id_empresa = p_id_empresa`; al actualizar,
   `where id = p_id and id_empresa = p_id_empresa`.
6. `delete_catalogo`: `delete from color where id = p_id` (sin cambio de firma); el bloqueo por
   uso de productos se mantiene.
7. `create_producto_admin` / `update_producto_admin`: validar que `p_id_color` pertenezca a la
   empresa del producto (D5). **Sin cambio de firma** → `CREATE OR REPLACE`.

### Cliente

8. **Sin cambios.** `catalogSyncService` ya estampa `id_empresa = empresa activa` (necesario
   porque `get_catalogos` no lo devuelve) y hace `clear` + `bulkPut`. El store `colores` ya
   indexa `id_empresa` (Dexie v12). El aislamiento efectivo pasa a ser server-side.

### Verificación

10. REST: con empresa sin colores (Tasty) `get_catalogos.colores` y `get_productos_admin.colores`
    = `[]`; con Luna = 69. `upsert_catalogo 'color'` en Tasty crea un color **solo** de Tasty y
    no aparece en Luna. `delete_catalogo 'color'` sigue bloqueando si hay productos que lo usan.
11. UI: Admin → Catálogos → pestaña Colores lista solo los de la empresa activa; alternar de
    empresa cambia la lista (sin recargar código).
12. POS: el selector de color del detalle y el badge del buscador siguen funcionando en Luna.

## Fuera de alcance

- Colores por sucursal (D1).
- Compartir colores entre empresas / "heredados".
- Multi-color por producto / color por variante.
- Reescribir `buscar_productos` (si devuelve `id_color`, ya viene del producto de la empresa).

## Criterios de aceptación

- C1: `color.id_empresa` existe y las 69 filas quedan en Libreria Luna.
- C2: `get_catalogos`/`get_productos_admin` devuelven colores **solo** de `p_id_empresa`.
- C3: Crear/editar/eliminar color sigue funcionando y queda etiquetado con la empresa activa.
- C4: Un producto no puede quedar con un color de otra empresa (D5).
- C5: En la app, otra empresa ya **no** ve los colores de Libreria Luna (Admin y POS).
- C6: `npx eslint` de los archivos tocados = 0 errores reales (solo CRLF preexistente);
  `npm run build` ✓.

## Riesgos

- **R1 — Origen del color.** El backfill no puede saber quién creó un color sin uso; por
  decisión D2 van todos a Libreria Luna (única empresa que usa colores hoy).
- **R2 — `clear` en Dexie.** Si el dispositivo ya tenía colores "estampados" de otra empresa,
  la próxima hidratación los limpia; offline podría verse la lista vieja hasta reconectar
  (aceptable; el aislamiento real es server-side).
- **R3 — Firma de RPC.** `get_catalogos`/`get_productos_admin`/`upsert_catalogo`/`delete_catalogo`
  conservan firma → `CREATE OR REPLACE`; si alguno tuviera overload, se dropea la firma vieja
  primero (lección PGRST203).
