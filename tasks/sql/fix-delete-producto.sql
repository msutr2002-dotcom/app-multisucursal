-- ============================================================================
-- FIX: no se puede eliminar NINGÚN producto.
--
-- Causa: al crear un producto, `trg_producto_bootstrap` (AFTER INSERT ON
-- productos) le crea filas en `productos_sucursal` y `stock_bodega` para cada
-- sucursal/bodega. `stock_bodega.id_producto` es NOT NULL REFERENCES productos(id)
-- SIN ON DELETE, y `delete_producto_admin` no limpia esas filas → el DELETE
-- choca con la FK:
--   "update or delete on table \"productos\" violates foreign key constraint
--    \"stock_bodega_id_producto_fkey\" on table \"stock_bodega\""
-- (se reproduce incluso con un producto recién creado y sin stock).
--
-- Fix: un trigger BEFORE DELETE en `productos` que borra las dependencias
-- operativas antes de que Postgres evalúe las FKs. Funciona para cualquier vía
-- de borrado (no depende del cuerpo del RPC). El trigger espejo de stock es
-- AFTER INSERT/UPDATE, no AFTER DELETE, así que no re-crea las filas.
--
-- NO borra historial (detalle_venta / detalle_compra / movimientos): un producto
-- con ventas sigue protegido por su FK (correcto).
-- ============================================================================

-- (Solo lectura) Ver todas las FK que apuntan a productos, por si algo más bloquea:
-- select con.conname, cl.relname as tabla, a.attname as columna, con.confdeltype
-- from pg_constraint con
-- join pg_class cl on cl.oid = con.conrelid
-- join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
-- where con.confrelid = 'public.productos'::regclass and con.contype = 'f'
-- order by cl.relname;

create or replace function public.trg_limpiar_dependencias_producto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Componentes de combos donde el producto es el combo o una parte.
  delete from combo_componentes
   where id_producto = old.id or id_producto_componente = old.id;

  -- Precios (después de los componentes, que referencian id_precio_producto).
  delete from precio_producto    where id_producto = old.id;

  -- Stock operativo (la FK que rompía el delete).
  delete from stock_bodega       where id_producto = old.id;
  delete from productos_sucursal where id_producto = old.id;

  return old;
end
$function$;

drop trigger if exists trg_limpiar_dependencias_producto on public.productos;
create trigger trg_limpiar_dependencias_producto
  before delete on public.productos
  for each row execute function public.trg_limpiar_dependencias_producto();

notify pgrst, 'reload schema';
