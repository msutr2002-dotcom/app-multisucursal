# Tasks: colores-por-empresa

**Módulo:** `colores-por-empresa` · **Spec:** `specs/colores-por-empresa.md`

## Task 1 — Escribir `tasks/sql/colores-por-empresa.sql`
- [x] `ALTER TABLE color ADD COLUMN IF NOT EXISTS id_empresa uuid;` + índice `(id_empresa, name)`.
- [x] Backfill idempotente: `id_empresa` = empresa de un producto que use el color; los sin uso → Libreria Luna (`e7203a75-2ccd-4778-b532-f330d2550c60`); luego `SET NOT NULL`.
- [x] `get_catalogos`: `colores` filtrado por `co.id_empresa = p_id_empresa`.
- [x] `get_productos_admin`: `colores` filtrado por `co.id_empresa = p_id_empresa`.
- [x] `upsert_catalogo`: `color` inserta con `id_empresa`; update restringido a `id_empresa`.
- [x] `create_producto_admin` / `update_producto_admin`: validar que `p_id_color` sea de la empresa del producto (D5). Sin cambio de firma.
- [x] `GRANT` + `NOTIFY pgrst 'reload schema'`.

## Task 2 — Aplicar SQL y verificar por REST (bloqueada por el usuario)
- [x] Usuario corre `tasks/sql/colores-por-empresa.sql` en Supabase.
- [x] `get_catalogos`(Tasty) `colores = []`; `get_catalogos`(Luna) `colores = 69`.
- [x] `upsert_catalogo 'color'` en Tasty crea un color de Tasty que **no** aparece en Luna.
- [x] `update_producto_admin` con un color de otra empresa → error (D5).
- [x] `delete_catalogo 'color'` sigue bloqueando si hay productos que lo usan.

## Task 3 — Cliente: sin cambios (verificación)
- [x] Confirmar que `catalogSyncService.js` ya estampa `id_empresa` (necesario: `get_catalogos` no lo devuelve) y hace `clear` + `bulkPut`; `db.js` v12 ya indexa `colores.id_empresa`. No se toca código.

## Task 4 — Verificar UI y cerrar
- [x] Admin → Catálogos → pestaña Colores: solo los de la empresa activa; alternar empresa cambia la lista.
- [x] POS: selector de color del detalle y badge del buscador siguen funcionando (Luna).
- [x] `npx eslint` de los archivos tocados = 0 errores reales (solo CRLF); `npm run build` ✓.
- [x] Probe (temp) de UI: Tasty no ve los colores de Luna.
- [x] Actualizar `memory.md` + `AGENTS.md`.
