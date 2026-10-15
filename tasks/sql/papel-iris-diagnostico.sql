-- ============================================================================
-- papel-iris — DIAGNÓSTICO (Task 1, SOLO LECTURA)
-- Se ejecuta en el SQL Editor de Supabase. No modifica nada.
--
-- Responde:
--   1) tipo de dato e índice de `color` y columnas actuales de `detalle_venta`
--   2) definición viva de los RPC `registrar_venta` y `get_venta_detalle`
--   3) productos de Libreria Luna con su color y su "nombre base"
--   4) grupos de color (nombre base con >=2 variantes) que armarían el selector
--   5) productos tipo "iris" que aún NO tienen id_color (falta de datos)
--
-- Empresa por defecto: Libreria Luna (e7203a75-2ccd-4778-b532-f330d2550c60).
-- Cambia el uuid si quieres auditar otra empresa.
-- ============================================================================

-- 1) Estructura: color(id) y detalle_venta
select 'color' as tabla, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'color'
order by ordinal_position;

select 'detalle_venta' as tabla, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'detalle_venta'
order by ordinal_position;

-- ¿Ya existe detalle_venta.id_color? (vacío = no existe todavía)
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'detalle_venta' and column_name = 'id_color';

-- 2) Definición viva de los RPC implicados (cada fila = una firma)
select
  p.proname as funcion,
  pg_get_function_identity_arguments(p.oid) as argumentos,
  pg_get_functiondef(p.oid) as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('registrar_venta', 'get_venta_detalle')
order by p.proname;

-- 3) y 4) Productos y grupos de color de Libreria Luna
with base as (
  select
    p.id,
    p.name,
    p.id_color,
    c.name as color_nombre,
    case
      when p.id_color is not null
        and c.name is not null
        and p.name ilike '%' || trim(c.name)
        then trim(left(p.name, length(p.name) - length(trim(c.name))))
      else p.name
    end as nombre_base
  from productos p
  left join color c on c.id = p.id_color
  where p.id_empresa = 'e7203a75-2ccd-4778-b532-f330d2550c60'
)
select id, name, id_color, color_nombre, nombre_base
from base
order by nombre_base, color_nombre nulls first, name;

-- Grupos con >= 2 variantes (estos SÍ mostrarían selector)
with base as (
  select
    p.id,
    p.name,
    c.name as color_nombre,
    case
      when p.id_color is not null
        and c.name is not null
        and p.name ilike '%' || trim(c.name)
        then trim(left(p.name, length(p.name) - length(trim(c.name))))
      else p.name
    end as nombre_base
  from productos p
  left join color c on c.id = p.id_color
  where p.id_empresa = 'e7203a75-2ccd-4778-b532-f330d2550c60'
)
select
  nombre_base,
  count(*) as variantes,
  string_agg(coalesce(color_nombre, '(sin color)'), ' | ' order by color_nombre) as colores
from base
group by nombre_base
having count(*) >= 2
order by variantes desc, nombre_base;

-- 5) Candidatos "iris" sin color asignado (setup pendiente del usuario)
select id, name, id_color
from productos
where id_empresa = 'e7203a75-2ccd-4778-b532-f330d2550c60'
  and name ilike '%iris%'
order by name;
