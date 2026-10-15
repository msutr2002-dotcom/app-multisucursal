-- dashboard-fecha-hoy — corrige el bucketing por día/mes a hora Guatemala.
-- Causa: los RPC agrupaban con CURRENT_DATE / date_trunc(now()) en UTC, así que
-- pasadas las 18:00 GT "hoy" caía en el día/mes siguiente. Se conserva la
-- definición viva y SÓLO se sustituyen las expresiones de fecha por
-- `AT TIME ZONE 'America/Guatemala'`. Firma y resultado intactos.
-- Aplicar en el SQL Editor de Supabase (ejecutar TODO el script, no una selección).

-- ============================================================
-- get_dashboard_stats(uuid) -> json   (plpgsql, sin cambios de firma)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_id_sucursal uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'productos_registrados', (
      SELECT COUNT(*)
      FROM productos_sucursal ps
      JOIN productos p ON ps.id_producto = p.id
      WHERE ps.id_sucursal = p_id_sucursal
        AND p.estado = 'disponible'
    ),
    'total_compras_mes', COALESCE((
      SELECT SUM(total)
      FROM compras
      WHERE id_sucursal = p_id_sucursal
        AND EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Guatemala'))
        AND EXTRACT(YEAR  FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(YEAR  FROM (now() AT TIME ZONE 'America/Guatemala'))
        AND estado = 'completada'
    ), 0),
    'total_ventas_mes', COALESCE((
      SELECT SUM(total)
      FROM ventas
      WHERE id_sucursal = p_id_sucursal
        AND EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Guatemala'))
        AND EXTRACT(YEAR  FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(YEAR  FROM (now() AT TIME ZONE 'America/Guatemala'))
        AND estado = 'completada'
    ), 0),
    'ganancias_mes', (
      COALESCE((
        SELECT SUM(total)
        FROM ventas
        WHERE id_sucursal = p_id_sucursal
          AND EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Guatemala'))
          AND EXTRACT(YEAR  FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(YEAR  FROM (now() AT TIME ZONE 'America/Guatemala'))
          AND estado = 'completada'
      ), 0)
      - COALESCE((
        SELECT SUM(total)
        FROM compras
        WHERE id_sucursal = p_id_sucursal
          AND EXTRACT(MONTH FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Guatemala'))
          AND EXTRACT(YEAR  FROM (fecha AT TIME ZONE 'America/Guatemala')) = EXTRACT(YEAR  FROM (now() AT TIME ZONE 'America/Guatemala'))
          AND estado = 'completada'
      ), 0)
    ),
    'productos_poco_stock', (
      SELECT COUNT(*)
      FROM productos_sucursal
      WHERE id_sucursal = p_id_sucursal
        AND stock <= stock_minimo
    ),
    'ventas_dia', COALESCE((
      SELECT SUM(total)
      FROM ventas
      WHERE id_sucursal = p_id_sucursal
        AND (fecha AT TIME ZONE 'America/Guatemala')::date = (now() AT TIME ZONE 'America/Guatemala')::date
        AND estado = 'completada'
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ============================================================
-- get_monthly_sales_chart(uuid) -> table(dia text, total bigint)  (sql)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_monthly_sales_chart(p_id_sucursal uuid)
 RETURNS TABLE(dia text, total bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    to_char(min(v.fecha AT TIME ZONE 'America/Guatemala'), 'DD') as dia,
    coalesce(sum(v.total), 0)::bigint as total
  from ventas v
  where v.id_sucursal = p_id_sucursal
    and v.estado = 'completada'
    and v.fecha >= (date_trunc('month', (now() AT TIME ZONE 'America/Guatemala'))) AT TIME ZONE 'America/Guatemala'
    and v.fecha <  (date_trunc('month', (now() AT TIME ZONE 'America/Guatemala')) + interval '1 month') AT TIME ZONE 'America/Guatemala'
  group by (v.fecha AT TIME ZONE 'America/Guatemala')::date
  order by (v.fecha AT TIME ZONE 'America/Guatemala')::date;
$function$;

-- Permisos (idempotentes; CREATE OR REPLACE conserva los existentes)
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_sales_chart(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
