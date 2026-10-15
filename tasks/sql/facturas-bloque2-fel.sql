-- ============================================================
-- FACTURAS-SAT — bloque 2 (enmienda FEL 2026-10-13, spec D13/D14)
-- Idempotente. Ejecutar en SQL Editor de Supabase DESPUÉS de bloque1.
--
-- - Columnas FEL en `facturas` (uuid/serie/número/estado/totales en centavos).
-- - emitir_factura v2: firma NUEVA con `p_fel json` (la vieja se DROPEA);
--   si la venta ya tiene factura ANULADA reutiliza la fila (nuevo FEL),
--   si tiene CERTIFICADA rechaza.
-- - anular_factura: marca estado_fel='ANULADO' (el DELETE al SAT lo hace
--   el cliente ANTES de llamar; si el SAT respondió 404 = ya borrado).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas FEL
-- ------------------------------------------------------------
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS uuid_fel text,
  ADD COLUMN IF NOT EXISTS serie_fel text,
  ADD COLUMN IF NOT EXISTS numero_dte bigint,
  ADD COLUMN IF NOT EXISTS estado_fel text NOT NULL DEFAULT 'CERTIFICADO',
  ADD COLUMN IF NOT EXISTS subtotal_fel integer,   -- centavos (subtotal ÷1.12)
  ADD COLUMN IF NOT EXISTS iva_fel integer,        -- centavos
  ADD COLUMN IF NOT EXISTS total_fel integer,      -- centavos (= total cobrado)
  ADD COLUMN IF NOT EXISTS fecha_certificacion timestamptz,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS facturas_uuid_fel_uk ON facturas (uuid_fel);

-- ------------------------------------------------------------
-- 2) emitir_factura v2 (DROP de la firma de bloque1 — lección 42725)
--    p_fel = {uuid, serie, numeroDTE, estado, subtotal, iva, total,
--             fechaCertificacion} (totales en CENTAVOS)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.emitir_factura(uuid, uuid, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.emitir_factura(
  p_id_venta uuid,
  p_id_sucursal uuid,
  p_nit_cliente text DEFAULT NULL::text,
  p_nombre_cliente text DEFAULT NULL::text,
  p_direccion_cliente text DEFAULT NULL::text,
  p_id_usuario uuid DEFAULT NULL::uuid,
  p_fel json DEFAULT NULL::json
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venta record;
  v_cliente record;
  v_existente record;
  v_nit text := nullif(btrim(coalesce(p_nit_cliente, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre_cliente, '')), '');
  v_dir text := nullif(btrim(coalesce(p_direccion_cliente, '')), '');
  v_uuid text := nullif(btrim(coalesce(p_fel->>'uuid', '')), '');
  v_serie text := nullif(btrim(coalesce(p_fel->>'serie', '')), '');
  v_numero bigint := nullif(p_fel->>'numeroDTE', '')::bigint;
  v_subtotal integer := nullif(p_fel->>'subtotal', '')::integer;
  v_iva integer := nullif(p_fel->>'iva', '')::integer;
  v_total integer := nullif(p_fel->>'total', '')::integer;
  v_fecha_cert timestamptz;
  v_correlativo integer;
  v_id uuid;
  v_folio text;
  v_detalle json;
begin
  if p_id_venta is null or p_id_sucursal is null then
    raise exception 'La venta y la sucursal son obligatorias';
  end if;
  if v_uuid is null or v_serie is null or v_numero is null then
    raise exception 'Falta la certificación del SAT (uuid, serie o número DTE)';
  end if;
  if v_subtotal is null or v_iva is null or v_total is null then
    raise exception 'Faltan los totales certificados por el SAT';
  end if;

  begin
    v_fecha_cert := coalesce((p_fel->>'fechaCertificacion')::timestamptz, now());
  exception
    when others then v_fecha_cert := now();
  end;

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

  -- ¿Ya tiene factura? CERTIFICADA → rechazo; ANULADA → se reutiliza la fila
  select * into v_existente from facturas where id_venta = p_id_venta;
  if v_existente.id is not null and v_existente.estado_fel = 'CERTIFICADO' then
    raise exception 'Esta venta ya tiene una factura';
  end if;

  -- NIT/nombre: parámetros (padrón o CF) o perfil del cliente enlazado
  if v_venta.id_cliente is not null then
    select name, nit, direccion into v_cliente
      from clientes where id = v_venta.id_cliente;
    v_nit := coalesce(v_nit, nullif(btrim(coalesce(v_cliente.nit, '')), ''));
    v_nombre := coalesce(v_nombre, v_cliente.name);
    v_dir := coalesce(v_dir, nullif(btrim(coalesce(v_cliente.direccion, '')), ''));
  end if;
  if v_nit is null then
    raise exception 'La factura necesita el NIT del cliente o facturar a CF';
  end if;
  if v_nombre is null then
    raise exception 'La factura necesita el nombre del cliente';
  end if;

  v_detalle := public.get_venta_detalle(p_id_venta, p_id_sucursal);

  if v_existente.id is not null then
    -- Re-emisión tras anulación: misma fila y folio interno, FEL nuevo
    update facturas
       set fecha = now(),
           nit_cliente = v_nit,
           nombre_cliente = v_nombre,
           direccion_cliente = v_dir,
           id_usuario = coalesce(p_id_usuario, id_usuario),
           uuid_fel = v_uuid,
           serie_fel = v_serie,
           numero_dte = v_numero,
           estado_fel = 'CERTIFICADO',
           subtotal_fel = v_subtotal,
           iva_fel = v_iva,
           total_fel = v_total,
           fecha_certificacion = v_fecha_cert,
           anulada_en = null
     where id = v_existente.id
     returning id into v_id;
    v_correlativo := v_existente.correlativo;
  else
    -- Correlativo: upsert con lock (UPDATE toma el row lock de la transacción)
    insert into factura_correlativos (id_sucursal, serie, ultimo)
    values (p_id_sucursal, 'A', 1)
    on conflict (id_sucursal, serie)
    do update set ultimo = factura_correlativos.ultimo + 1
    returning ultimo into v_correlativo;

    begin
      insert into facturas
        (id, id_sucursal, id_venta, serie, correlativo, fecha,
         nit_cliente, nombre_cliente, direccion_cliente, id_usuario,
         uuid_fel, serie_fel, numero_dte, estado_fel,
         subtotal_fel, iva_fel, total_fel, fecha_certificacion)
      values
        (gen_random_uuid(), p_id_sucursal, p_id_venta, 'A', v_correlativo, now(),
         v_nit, v_nombre, v_dir, p_id_usuario,
         v_uuid, v_serie, v_numero, 'CERTIFICADO',
         v_subtotal, v_iva, v_total, v_fecha_cert)
      returning id into v_id;
    exception
      when unique_violation then
        raise exception 'Esta venta ya tiene una factura';
    end;
  end if;

  v_folio := 'A-' || lpad(v_correlativo::text, 7, '0');

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
    'fel', json_build_object(
      'uuid', v_uuid,
      'serie', v_serie,
      'numeroDTE', v_numero,
      'estado', 'CERTIFICADO',
      'subtotal', v_subtotal,
      'iva', v_iva,
      'total', v_total,
      'fechaCertificacion', v_fecha_cert
    ),
    'venta', v_detalle
  );
end;
$function$;

-- ------------------------------------------------------------
-- 3) anular_factura — solo CERTIFICADAs; el cliente ya borró el DTE en el SAT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anular_factura(
  p_id uuid,
  p_id_sucursal uuid
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_f record;
begin
  if p_id is null or p_id_sucursal is null then
    raise exception 'La factura y la sucursal son obligatorias';
  end if;

  select id, serie, correlativo, estado_fel, uuid_fel
    into v_f
    from facturas
   where id = p_id and id_sucursal = p_id_sucursal
   for update;

  if v_f.id is null then
    raise exception 'Factura no encontrada';
  end if;
  if v_f.estado_fel = 'ANULADO' then
    raise exception 'La factura ya está anulada';
  end if;

  update facturas
     set estado_fel = 'ANULADO',
         anulada_en = now()
   where id = v_f.id;

  return json_build_object(
    'id', v_f.id,
    'folio', v_f.serie || '-' || lpad(v_f.correlativo::text, 7, '0'),
    'uuid_fel', v_f.uuid_fel,
    'estado', 'ANULADO'
  );
end;
$function$;

-- ------------------------------------------------------------
-- 4) get_facturas — + campos FEL en el listado
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
      'total_fel', x.total_fel,
      'estado_fel', x.estado_fel,
      'serie_fel', x.serie_fel,
      'numero_dte', x.numero_dte,
      'uuid_fel', x.uuid_fel,
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
           f.total_fel, f.estado_fel, f.serie_fel, f.numero_dte, f.uuid_fel,
           coalesce(u.name, '') AS vendedor,
           count(*) over() AS total_registros
      from facturas f
      join ventas v ON v.id = f.id_venta
      left join users u ON u.id = f.id_usuario
     where f.id_sucursal = p_id_sucursal
       AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
            (f.serie || '-' || lpad(f.correlativo::text, 7, '0')) ILIKE '%' || p_busqueda || '%' OR
            f.nombre_cliente ILIKE '%' || p_busqueda || '%' OR
            f.nit_cliente ILIKE '%' || p_busqueda || '%' OR
            f.serie_fel ILIKE '%' || p_busqueda || '%' OR
            f.numero_dte::text ILIKE '%' || p_busqueda || '%' OR
            f.uuid_fel ILIKE '%' || p_busqueda || '%')
     ORDER BY f.fecha DESC
     LIMIT p_limite OFFSET p_offset
  ) x;

  return v_resultado;
end;
$function$;

-- ------------------------------------------------------------
-- 5) get_factura — payload completo + datos FEL
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
  select f.id, f.id_venta, f.serie, f.correlativo, f.fecha,
         f.nit_cliente, f.nombre_cliente, f.direccion_cliente, f.id_usuario,
         v.cambio,
         f.uuid_fel, f.serie_fel, f.numero_dte, f.estado_fel,
         f.subtotal_fel, f.iva_fel, f.total_fel, f.fecha_certificacion, f.anulada_en
    into v_f
    from facturas f
    join ventas v ON v.id = f.id_venta
   where f.id = p_id and f.id_sucursal = p_id_sucursal;

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
    'fel', json_build_object(
      'uuid', v_f.uuid_fel,
      'serie', v_f.serie_fel,
      'numeroDTE', v_f.numero_dte,
      'estado', v_f.estado_fel,
      'subtotal', v_f.subtotal_fel,
      'iva', v_f.iva_fel,
      'total', v_f.total_fel,
      'fechaCertificacion', v_f.fecha_certificacion,
      'anuladaEn', v_f.anulada_en
    ),
    'venta', v_detalle
  );
end;
$function$;

NOTIFY pgrst, 'reload schema';
