-- Diagnóstico: extrae la definición viva de los RPC que necesita el módulo
-- `catalogos-colores`. Correr en el SQL Editor de Supabase y pegar la salida
-- completa (columnas rpc, args, def). No modifica nada.
select p.proname as rpc,
       pg_get_function_identity_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_catalogos',
    'upsert_catalogo',
    'delete_catalogo',
    'get_productos_admin',
    'create_producto_admin',
    'update_producto_admin'
  )
order by p.proname, args;

-- Alternativa si el editor recorta la salida (varias filas):
-- select p.proname, pg_get_function_identity_arguments(p.oid) as args, l.lanname, p.prosrc
-- from pg_proc p
-- join pg_language l on l.oid = p.prolang
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in (
--     'get_catalogos','upsert_catalogo','delete_catalogo',
--     'get_productos_admin','create_producto_admin','update_producto_admin'
--   );

-- Columnas reales de `color` y `productos.id_color` (por si hiciera falta):
-- select column_name, data_type from information_schema.columns
-- where table_schema='public' and table_name='color' order by ordinal_position;
-- select column_name, data_type, is_nullable from information_schema.columns
-- where table_schema='public' and table_name='productos' and column_name like '%color%';
