-- Diagnóstico: extrae la definición viva de los RPC del dashboard.
-- Correr en el SQL Editor de Supabase y pegar la salida completa (columna def).
-- No modifica nada.
select 'get_dashboard_stats' as rpc, pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_dashboard_stats'
union all
select 'get_monthly_sales_chart' as rpc, pg_get_functiondef(p.oid) as def
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_monthly_sales_chart';

-- Alternativa si el editor recorta la salida (varias filas):
-- select p.proname, l.lanname, p.prosrc
-- from pg_proc p
-- join pg_language l on l.oid = p.prolang
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('get_dashboard_stats','get_monthly_sales_chart');
