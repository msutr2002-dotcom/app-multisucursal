-- ============================================================================
-- Diagnóstico — bug de combos: "column reference v_comp is ambiguous" (42702)
-- Módulo: combos-insumos (Task 3 dual)
--
-- Contexto: al guardar un combo, create_producto_admin OK pero
-- upsert_combo_componentes falla con:
--   ERROR: column reference "v_comp" is ambiguous   (SQLSTATE 42702)
--
-- OJO: filtrar prokind='f' (función normal). pg_get_functiondef sobre una
-- función AGREGADA lanza "42809: array_agg is an aggregate function".
--
-- Ejecutar en el SQL Editor de Supabase (si pide, elegir "No limit") y pegar.
-- ============================================================================

select
  p.proname                                  as funcion,
  pg_get_function_identity_arguments(p.oid)  as args,
  pg_get_functiondef(p.oid)                  as definicion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and p.prosrc ilike '%v_comp%'
order by p.proname;

-- Fallback por nombre (si el anterior no devuelve nada útil):
-- select p.proname, pg_get_functiondef(p.oid)
-- from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and p.prokind='f'
--   and p.proname in ('upsert_combo_componentes','registrar_venta','anular_venta',
--                     'registrar_cotizacion','get_productos_admin');
