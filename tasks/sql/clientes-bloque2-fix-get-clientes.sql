-- ============================================================
-- FIX get_clientes (clientes-bloque2 seccion 6): RE-CREA con
-- el WHERE corregido (precedencia OR/AND: sin parentesis, las
-- filas de la sucursal propia se saltaban busqueda/inactivos/
-- heredados). Idempotente: dropea por firma exacta y crea.
-- Termina con NOTIFY pgrst (recarga el schema cache).
-- ============================================================

DROP FUNCTION IF EXISTS public.get_clientes(uuid,text,boolean,boolean,integer,integer);

-- ------------------------------------------------------------
-- 6) get_clientes — lista con stats
--    Siempre: clientes de la sucursal.
--    + heredados (id_sucursal NULL) de la empresa solo si
--      p_incluir_heredados = true (datalist POS; ClientesPage NO).
-- ------------------------------------------------------------
CREATE FUNCTION public.get_clientes(
  p_id_sucursal uuid,
  p_busqueda text DEFAULT NULL::text,
  p_incluir_inactivos boolean DEFAULT false,
  p_incluir_heredados boolean DEFAULT false,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_resultado json;
  v_empresa uuid;
begin
  if p_id_sucursal is null then
    raise exception 'p_id_sucursal es obligatorio';
  end if;

  select id_empresa into v_empresa from sucursal where id = p_id_sucursal;
  if v_empresa is null then
    raise exception 'Sucursal no encontrada';
  end if;

  select json_build_object(
    'clientes', COALESCE(json_agg(json_build_object(
      'id', x.id,
      'name', x.name,
      'nombre', x.nombre,
      'apellido', x.apellido,
      'nit', x.nit,
      'telefono', x.telefono,
      'direccion', x.direccion,
      'activo', x.activo,
      'id_sucursal', x.id_sucursal,
      'heredado', x.heredado,
      'n_ventas', x.n_ventas,
      'total_gastado', x.total_gastado,
      'ultima_compra', x.ultima_compra
    ) ORDER BY x.name), '[]'),
    'total', COALESCE(MAX(x.total_registros), 0)
  )
  into v_resultado
  from (
    select c.id, c.name, c.nombre, c.apellido, c.nit, c.telefono, c.direccion,
           c.activo, c.id_sucursal, (c.id_sucursal IS NULL) AS heredado,
           COALESCE(v.n_ventas, 0)::int AS n_ventas,
           COALESCE(v.total_gastado, 0)::int AS total_gastado,
           v.ultima_compra,
           count(*) over() AS total_registros
      from clientes c
      left join lateral (
        select count(*) AS n_ventas,
               sum(vt.total) AS total_gastado,
               max(vt.fecha) AS ultima_compra
          from ventas vt
         where vt.id_cliente = c.id
           and vt.estado = 'completada'
      ) v ON true
     where (c.id_sucursal = p_id_sucursal
            OR (p_incluir_heredados AND c.id_sucursal IS NULL AND c.id_empresa = v_empresa))
       AND (p_incluir_inactivos OR c.activo)
       AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
            c.name ILIKE '%' || p_busqueda || '%' OR
            c.nit ILIKE '%' || p_busqueda || '%')
     ORDER BY c.name
     LIMIT p_limite OFFSET p_offset
  ) x;

  return v_resultado;
end;
$function$;

-- ----------------------------------------------------------
-- Limpieza: filas de prueba creadas por los probes E2E 2026-10-12
-- (el DELETE via anon devolvió 204 pero RLS no las borró).
-- ----------------------------------------------------------
DELETE FROM clientes WHERE id IN (
  '6e6381fe-0978-496a-84eb-c4408c5e6733',
  '235ac01e-cb19-4adc-858b-33f9676ba87b',
  '3eb1b418-e8a9-4a5b-a3bf-e99f3daec8b1'
);

NOTIFY pgrst, 'reload schema';
