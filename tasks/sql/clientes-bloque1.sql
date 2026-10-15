-- ============================================================
-- ⛔ SUPERSEDIDO por `clientes-bloque2.sql` (modelo POR SUCURSAL).
--    NO APLICAR este archivo: el diseño v1 por empresa fue reemplazado.
--    bloque2 es idempotente y dropea por firma las funciones de este
--    bloque1 si llegaron a existir, así que aplicar SOLO bloque2.
-- ============================================================
-- clientes Task 2 — SQL (aplicar en SQL Editor)
-- 1) clientes gana nit/telefono/direccion/activo
-- 2) upsert_cliente_admin: alta/edición con datos completos,
--    unifica por lower(name) igual que upsert_cliente del POS
-- 3) get_clientes: lista + stats (n_ventas, total_gastado,
--    ultima_compra) desde ventas estado='completada' (todas las
--    sucursales de la empresa — historial multisucursal)
-- 4) get_ventas_by_cliente: últimas ventas POS del cliente
-- ============================================================

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS nit text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.upsert_cliente_admin(
  p_id uuid,
  p_id_empresa uuid,
  p_name text,
  p_nit text DEFAULT NULL::text,
  p_telefono text DEFAULT NULL::text,
  p_direccion text DEFAULT NULL::text,
  p_activo boolean DEFAULT true
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if v_name is null then
    raise exception 'El nombre del cliente no puede estar vacío';
  end if;
  if p_id_empresa is null then
    raise exception 'p_id_empresa es obligatorio';
  end if;

  -- Edición directa: el id debe pertenecer a la empresa
  if p_id is not null then
    update clientes
       set name = v_name,
           nit = nullif(trim(coalesce(p_nit, '')), ''),
           telefono = nullif(trim(coalesce(p_telefono, '')), ''),
           direccion = nullif(trim(coalesce(p_direccion, '')), ''),
           activo = coalesce(p_activo, true)
     where id = p_id and id_empresa = p_id_empresa;
    if not found then
      raise exception 'Cliente no encontrado en esta empresa';
    end if;
    return p_id;
  end if;

  -- Alta o unificación por nombre (mismo criterio que upsert_cliente del POS)
  select id into v_id
    from clientes
   where id_empresa = p_id_empresa
     and lower(name) = lower(v_name)
   limit 1;

  if v_id is null then
    insert into clientes (id, id_empresa, name, nit, telefono, direccion, activo)
    values (gen_random_uuid(), p_id_empresa, v_name,
            nullif(trim(coalesce(p_nit, '')), ''),
            nullif(trim(coalesce(p_telefono, '')), ''),
            nullif(trim(coalesce(p_direccion, '')), ''),
            coalesce(p_activo, true))
    returning id into v_id;
  else
    update clientes
       set nit = coalesce(nullif(trim(coalesce(p_nit, '')), ''), nit),
           telefono = coalesce(nullif(trim(coalesce(p_telefono, '')), ''), telefono),
           direccion = coalesce(nullif(trim(coalesce(p_direccion, '')), ''), direccion),
           activo = coalesce(p_activo, activo)
     where id = v_id;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_clientes(
  p_id_empresa uuid,
  p_busqueda text DEFAULT NULL::text,
  p_incluir_inactivos boolean DEFAULT false,
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
begin
  if p_id_empresa is null then
    raise exception 'p_id_empresa es obligatorio';
  end if;

  select json_build_object(
    'clientes', COALESCE(json_agg(json_build_object(
      'id', x.id,
      'name', x.name,
      'nit', x.nit,
      'telefono', x.telefono,
      'direccion', x.direccion,
      'activo', x.activo,
      'n_ventas', x.n_ventas,
      'total_gastado', x.total_gastado,
      'ultima_compra', x.ultima_compra
    ) ORDER BY x.name), '[]'),
    'total', COALESCE(MAX(x.total_registros), 0)
  )
  into v_resultado
  from (
    select c.id, c.name, c.nit, c.telefono, c.direccion, c.activo,
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
     where c.id_empresa = p_id_empresa
       and (p_incluir_inactivos OR c.activo)
       and (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
            c.name ILIKE '%' || p_busqueda || '%' OR
            c.nit ILIKE '%' || p_busqueda || '%')
     order by c.name
     limit p_limite offset p_offset
  ) x;

  return v_resultado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_ventas_by_cliente(
  p_id_cliente uuid,
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
begin
  if p_id_cliente is null then
    raise exception 'p_id_cliente es obligatorio';
  end if;

  select json_build_object(
    'ventas', COALESCE(json_agg(json_build_object(
      'id', v.id,
      'fecha', v.fecha,
      'total', v.total,
      'cambio', v.cambio,
      'estado', v.estado,
      'id_metodo_pago', v.id_metodo_pago,
      'id_sucursal', v.id_sucursal,
      'sucursal', s.name
    ) ORDER BY v.fecha DESC), '[]')
  )
  into v_resultado
  from ventas v
  left join sucursal s ON s.id = v.id_sucursal
  where v.id_cliente = p_id_cliente
    and v.estado = 'completada'
  limit p_limite offset p_offset;

  return v_resultado;
end;
$function$;

NOTIFY pgrst, 'reload schema';
