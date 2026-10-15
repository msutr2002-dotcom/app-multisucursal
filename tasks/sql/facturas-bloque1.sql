-- ============================================================
-- FACTURAS-SAT — bloque 1 (facturación simulada, 1 factura por venta)
-- Idempotente. Ejecutar en SQL Editor de Supabase.
-- Spec: specs/facturas-sat.md (aprobada 2026-10-12).
--
-- Modelo:
--   facturas             1 fila por venta (UNIQUE id_venta); folio =
--                         serie + correlativo con contador server-side.
--   factura_correlativos contador por (id_sucursal, serie) con lock.
--   RLS habilitada SIN políticas → el anon no lee/escribe directo;
--   todo pasa por RPCs SECURITY DEFINER (regla del repo).
--   El NIT del cliente es obligatorio para emitir (D5/RFC-FS6).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tablas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_sucursal uuid NOT NULL REFERENCES sucursal(id),
  id_venta uuid NOT NULL UNIQUE REFERENCES ventas(id),
  serie text NOT NULL DEFAULT 'A',
  correlativo integer NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  nit_cliente text NOT NULL,
  nombre_cliente text NOT NULL,
  direccion_cliente text,
  id_usuario uuid,
  CONSTRAINT facturas_folio_uk UNIQUE (id_sucursal, serie, correlativo)
);

CREATE INDEX IF NOT EXISTS facturas_sucursal_fecha_idx
  ON facturas (id_sucursal, fecha DESC);

CREATE TABLE IF NOT EXISTS factura_correlativos (
  id_sucursal uuid NOT NULL REFERENCES sucursal(id),
  serie text NOT NULL DEFAULT 'A',
  ultimo integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id_sucursal, serie)
);

ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_correlativos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: el anon queda bloqueado (mismo patrón que ventas/clientes).

-- ------------------------------------------------------------
-- 2) emitir_factura — valida, toma el correlativo con lock e inserta.
--    Devuelve el payload completo de impresión (folio + get_venta_detalle).
--    Carnets: NIT obligatorio; 1 factura por venta (UNIQUE + pre-chequeo);
--    huecos de correlativo posibles en carreras (normal en numeración).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emitir_factura(
  p_id_venta uuid,
  p_id_sucursal uuid,
  p_nit_cliente text DEFAULT NULL::text,
  p_nombre_cliente text DEFAULT NULL::text,
  p_direccion_cliente text DEFAULT NULL::text,
  p_id_usuario uuid DEFAULT NULL::uuid
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta record;
  v_cliente record;
  v_nit text := nullif(btrim(coalesce(p_nit_cliente, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre_cliente, '')), '');
  v_dir text := nullif(btrim(coalesce(p_direccion_cliente, '')), '');
  v_correlativo integer;
  v_id uuid;
  v_folio text;
  v_detalle json;
begin
  if p_id_venta is null or p_id_sucursal is null then
    raise exception 'La venta y la sucursal son obligatorias';
  end if;

  select id, estado, id_cliente, id_sucursal, cambio
    into v_venta
    from ventas
   where id = p_id_venta
   for update;

  if v_venta.id is null then
    raise exception 'Venta no encontrada';
  end if;
  if v_venta.id_sucursal <> p_id_sucursal then
    raise exception 'La venta pertenece a otra sucursal';
  end if;
  if v_venta.estado <> 'completada' then
    raise exception 'Solo se facturan ventas completadas';
  end if;
  if exists (select 1 from facturas f where f.id_venta = p_id_venta) then
    raise exception 'Esta venta ya tiene una factura';
  end if;

  -- NIT/nombre: parámetros o perfil del cliente enlazado; sin NIT → rechazo
  if v_venta.id_cliente is not null then
    select name, nit, direccion into v_cliente
      from clientes where id = v_venta.id_cliente;
    v_nit := coalesce(v_nit, nullif(btrim(coalesce(v_cliente.nit, '')), ''));
    v_nombre := coalesce(v_nombre, v_cliente.name);
    v_dir := coalesce(v_dir, nullif(btrim(coalesce(v_cliente.direccion, '')), ''));
  end if;
  if v_nit is null then
    raise exception 'La factura necesita el NIT del cliente (emite desde una venta enlazada con NIT)';
  end if;
  if v_nombre is null then
    raise exception 'La factura necesita el nombre del cliente';
  end if;

  -- Correlativo: upsert con lock (UPDATE toma el row lock de la transacción)
  insert into factura_correlativos (id_sucursal, serie, ultimo)
  values (p_id_sucursal, 'A', 1)
  on conflict (id_sucursal, serie)
  do update set ultimo = factura_correlativos.ultimo + 1
  returning ultimo into v_correlativo;

  begin
    insert into facturas
      (id, id_sucursal, id_venta, serie, correlativo, fecha,
       nit_cliente, nombre_cliente, direccion_cliente, id_usuario)
    values
      (gen_random_uuid(), p_id_sucursal, p_id_venta, 'A', v_correlativo, now(),
       v_nit, v_nombre, v_dir, p_id_usuario)
    returning id into v_id;
  exception
    when unique_violation then
      raise exception 'Esta venta ya tiene una factura';
  end;

  v_folio := 'A-' || lpad(v_correlativo::text, 7, '0');
  v_detalle := public.get_venta_detalle(p_id_venta, p_id_sucursal);

  return json_build_object(
    'id', v_id,
    'folio', v_folio,
    'serie', 'A',
    'correlativo', v_correlativo,
    'fecha', now(),
    'nit_cliente', v_nit,
    'nombre_cliente', v_nombre,
    'direccion_cliente', v_dir,
    'id_venta', p_id_venta,
    'id_usuario', p_id_usuario,
    'cambio', v_venta.cambio,
    'venta', v_detalle
  );
end;
$function$;

-- ------------------------------------------------------------
-- 3) get_facturas — listado del módulo (folio, cliente, total, vendedor)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_facturas(
  p_id_sucursal uuid,
  p_busqueda text DEFAULT NULL::text,
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
  if p_id_sucursal is null then
    raise exception 'p_id_sucursal es obligatorio';
  end if;

  select json_build_object(
    'facturas', COALESCE(json_agg(json_build_object(
      'id', x.id,
      'folio', x.folio,
      'fecha', x.fecha,
      'nit_cliente', x.nit_cliente,
      'nombre_cliente', x.nombre_cliente,
      'total', x.total,
      'id_venta', x.id_venta,
      'vendedor', x.vendedor
    ) ORDER BY x.fecha DESC), '[]'),
    'total', COALESCE(MAX(x.total_registros), 0)
  )
  into v_resultado
  from (
    select f.id,
           f.serie || '-' || lpad(f.correlativo::text, 7, '0') AS folio,
           f.fecha, f.nit_cliente, f.nombre_cliente,
           v.total, f.id_venta,
           coalesce(u.name, '') AS vendedor,
           count(*) over() AS total_registros
      from facturas f
      join ventas v ON v.id = f.id_venta
      left join users u ON u.id = f.id_usuario
     where f.id_sucursal = p_id_sucursal
       AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
            (f.serie || '-' || lpad(f.correlativo::text, 7, '0')) ILIKE '%' || p_busqueda || '%' OR
            f.nombre_cliente ILIKE '%' || p_busqueda || '%' OR
            f.nit_cliente ILIKE '%' || p_busqueda || '%')
     ORDER BY f.fecha DESC
     LIMIT p_limite OFFSET p_offset
  ) x;

  return v_resultado;
end;
$function$;

-- ------------------------------------------------------------
-- 4) get_factura — payload completo para reimprimir (folio + detalle)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_factura(
  p_id uuid,
  p_id_sucursal uuid
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_f record;
  v_detalle json;
begin
  select id, id_venta, serie, correlativo, fecha,
         nit_cliente, nombre_cliente, direccion_cliente, id_usuario, cambio
    into v_f
    from facturas
   where id = p_id and id_sucursal = p_id_sucursal;

  if v_f.id is null then
    raise exception 'Factura no encontrada';
  end if;

  v_detalle := public.get_venta_detalle(v_f.id_venta, p_id_sucursal);

  return json_build_object(
    'id', v_f.id,
    'folio', v_f.serie || '-' || lpad(v_f.correlativo::text, 7, '0'),
    'serie', v_f.serie,
    'correlativo', v_f.correlativo,
    'fecha', v_f.fecha,
    'nit_cliente', v_f.nit_cliente,
    'nombre_cliente', v_f.nombre_cliente,
    'direccion_cliente', v_f.direccion_cliente,
    'id_venta', v_f.id_venta,
    'id_usuario', v_f.id_usuario,
    'cambio', v_f.cambio,
    'venta', v_detalle
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
