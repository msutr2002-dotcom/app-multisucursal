-- ============================================================
-- clientes-bloque2.sql — MODELO POR SUCURSAL (reemplaza a bloque1)
-- Aplicar en SQL Editor. Idempotente: safe re-run.
--
-- Reglas de negocio (diseño aprobado 2026-10-12):
--  * Una fila de clientes = UNA sucursal donde compra la persona.
--    Misma persona puede existir en varias sucursales/empresas.
--  * NIT = identidad única POR SUCURSAL (índice parcial).
--  * Nombre+Apellido NO único (homónimos permitidos con NIT distinto);
--    crear un nombre ya existente en la sucursal EXIGE NIT.
--  * Heredados: clientes previos quedan id_sucursal NULL (Opción B);
--    solo aparecen en el datalist del POS, nunca en ClientesPage,
--    no se editan ni se reasignan.
--  * ventas.cliente_nombre = nombre casual impreso en el ticket
--    cuando NO hay id_cliente (sin perfil, no suma historial).
-- ============================================================

-- ------------------------------------------------------------
-- 0) Limpieza de sobrecargas previas (evita el error 42725)
--    CREATE OR REPLACE no cambia firmas: crea sobrecargas nuevas.
--    Por eso se DROPea cada versión vieja antes de crear la nueva.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_venta(uuid,uuid,uuid,integer,jsonb,uuid);        -- versión original
DROP FUNCTION IF EXISTS public.registrar_venta(uuid,uuid,uuid,integer,jsonb,uuid,text);   -- pos-ux (referencia)
DROP FUNCTION IF EXISTS public.upsert_cliente(uuid,text);                                 -- original (empresa+name)
DROP FUNCTION IF EXISTS public.upsert_cliente_admin(uuid,uuid,text,text,text,text,boolean); -- bloque1 (si existió)
DROP FUNCTION IF EXISTS public.get_clientes(uuid,text,boolean,integer,integer);           -- bloque1 (si existió)

-- ------------------------------------------------------------
-- 1) clientes: columnas nuevas (+ bloque1 defensivo) y backfill
-- ------------------------------------------------------------
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS id_sucursal uuid,
  ADD COLUMN IF NOT EXISTS nombre text,
  ADD COLUMN IF NOT EXISTS apellido text,
  ADD COLUMN IF NOT EXISTS nit text,
  ADD COLUMN IF NOT EXISTS telefono text,
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;

-- Backfill nombre/apellido desde name (solo donde falten; idempotente)
UPDATE clientes
   SET nombre = CASE WHEN position(' ' in name) > 0
                     THEN left(name, position(' ' in name) - 1)
                     ELSE name END,
       apellido = CASE WHEN position(' ' in name) > 0
                       THEN substring(name from position(' ' in name) + 1)
                       ELSE '' END
 WHERE nombre IS NULL
   AND name IS NOT NULL;

-- name queda materializado = nombre + apellido (datalist/búsquedas)
UPDATE clientes
   SET name = btrim(coalesce(nombre, '') || ' ' || coalesce(apellido, ''))
 WHERE nombre IS NOT NULL
   AND name IS DISTINCT FROM btrim(coalesce(nombre, '') || ' ' || coalesce(apellido, ''));

-- Heredados: id_sucursal se queda NULL a propósito (no se reasigna)

-- ------------------------------------------------------------
-- 2) ventas: nombre casual (recibo sin perfil)
-- ------------------------------------------------------------
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia text;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cliente_nombre text;

-- ------------------------------------------------------------
-- 3) Índice único: NIT por sucursal (parcial; heredados no aplican)
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS clientes_sucursal_nit_uk
  ON clientes (id_sucursal, lower(nit))
  WHERE id_sucursal IS NOT NULL AND nit IS NOT NULL;

-- ------------------------------------------------------------
-- 4) upsert_cliente — POS/Historial: por sucursal, NIT o nombre
--    1) con NIT  → busca por NIT en la sucursal (identidad fuerte)
--    2) sin NIT  → busca por nombre+apellido en la sucursal;
--                  homónimos (>1) → error pidiendo NIT
--    3) no existe → crea (nunca toca heredados: siempre con sucursal)
-- ------------------------------------------------------------
CREATE FUNCTION public.upsert_cliente(
  p_id_sucursal uuid,
  p_nombre text,
  p_apellido text DEFAULT NULL::text,
  p_nit text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_nom text := nullif(trim(coalesce(p_nombre, '')), '');
  v_ape text := nullif(trim(coalesce(p_apellido, '')), '');
  v_nit text := nullif(trim(coalesce(p_nit, '')), '');
  v_empresa uuid;
  v_total integer;
begin
  if p_id_sucursal is null then
    raise exception 'p_id_sucursal es obligatorio';
  end if;
  if v_nom is null then
    raise exception 'El nombre del cliente no puede estar vacío';
  end if;

  select id_empresa into v_empresa from sucursal where id = p_id_sucursal;
  if v_empresa is null then
    raise exception 'Sucursal no encontrada';
  end if;

  -- 1) por NIT dentro de la sucursal
  if v_nit is not null then
    select id into v_id
      from clientes
     where id_sucursal = p_id_sucursal
       and lower(nit) = lower(v_nit)
     limit 1;
    if v_id is not null then
      update clientes
         set nombre = v_nom,
             apellido = coalesce(v_ape, ''),
             name = btrim(v_nom || ' ' || coalesce(v_ape, ''))
       where id = v_id;
      return v_id;
    end if;
  else
    -- 2) sin NIT: por nombre completo en la sucursal
    select count(*) into v_total
      from clientes
     where id_sucursal = p_id_sucursal
       and lower(nombre) = lower(v_nom)
       and lower(coalesce(apellido, '')) = lower(coalesce(v_ape, ''));
    if v_total > 1 then
      raise exception 'Hay % clientes llamados "% %" en esta sucursal; escribe el NIT para identificarlo',
        v_total, v_nom, coalesce(v_ape, '');
    end if;
    if v_total = 1 then
      select id into v_id
        from clientes
       where id_sucursal = p_id_sucursal
         and lower(nombre) = lower(v_nom)
         and lower(coalesce(apellido, '')) = lower(coalesce(v_ape, ''))
       limit 1;
      return v_id;
    end if;
  end if;

  -- 3) crear (con NIT sin match, o sin NIT y sin homónimos)
  insert into clientes (id, id_empresa, id_sucursal, nombre, apellido, name, nit, activo)
  values (gen_random_uuid(), v_empresa, p_id_sucursal, v_nom, coalesce(v_ape, ''),
          btrim(v_nom || ' ' || coalesce(v_ape, '')), v_nit, true)
  returning id into v_id;
  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- 5) upsert_cliente_admin — CRUD de ClientesPage (por sucursal)
--    Regla anti-homónimo: mismo nombre en la sucursal sin NIT → error.
--    NIT duplicado en la sucursal → error (también lo garantiza el índice).
--    p_id null = alta; p_id con id_sucursal = edición (siempre sucursal,
--    los heredados no se editan desde esta función).
-- ------------------------------------------------------------
CREATE FUNCTION public.upsert_cliente_admin(
  p_id uuid,
  p_id_sucursal uuid,
  p_nombre text,
  p_apellido text DEFAULT NULL::text,
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
  v_nom text := nullif(trim(coalesce(p_nombre, '')), '');
  v_ape text := nullif(trim(coalesce(p_apellido, '')), '');
  v_nit text := nullif(trim(coalesce(p_nit, '')), '');
  v_tel text := nullif(trim(coalesce(p_telefono, '')), '');
  v_dir text := nullif(trim(coalesce(p_direccion, '')), '');
  v_empresa uuid;
  v_id uuid;
  v_dummy uuid;
begin
  if p_id_sucursal is null then
    raise exception 'p_id_sucursal es obligatorio';
  end if;
  if v_nom is null then
    raise exception 'El nombre del cliente no puede estar vacío';
  end if;

  select id_empresa into v_empresa from sucursal where id = p_id_sucursal;
  if v_empresa is null then
    raise exception 'Sucursal no encontrada';
  end if;

  -- NIT duplicado en la sucursal (distinto de la fila que se edita)
  if v_nit is not null then
    select id into v_dummy
      from clientes
     where id_sucursal = p_id_sucursal
       and lower(nit) = lower(v_nit)
       and (p_id is null or id <> p_id)
     limit 1;
    if v_dummy is not null then
      raise exception 'Ya existe un cliente con el NIT % en esta sucursal', v_nit;
    end if;
  end if;

  if p_id is not null then
    -- Edición: la fila debe pertenecer a la sucursal (nunca heredados)
    update clientes
       set nombre = v_nom,
           apellido = coalesce(v_ape, ''),
           name = btrim(v_nom || ' ' || coalesce(v_ape, '')),
           nit = v_nit,
           telefono = v_tel,
           direccion = v_dir,
           activo = coalesce(p_activo, activo)
     where id = p_id and id_sucursal = p_id_sucursal;
    if not found then
      raise exception 'Cliente no encontrado en esta sucursal';
    end if;
    return p_id;
  end if;

  -- Alta: homónimo existente (cualquier estado) sin NIT → exigir NIT
  if v_nit is null then
    select id into v_dummy
      from clientes
     where id_sucursal = p_id_sucursal
       and lower(nombre) = lower(v_nom)
       and lower(coalesce(apellido, '')) = lower(coalesce(v_ape, ''))
     limit 1;
    if v_dummy is not null then
      raise exception 'Ya existe "% %" en esta sucursal; agrega el NIT para diferenciarlo',
        v_nom, coalesce(v_ape, '');
    end if;
  end if;

  insert into clientes (id, id_empresa, id_sucursal, nombre, apellido, name, nit, telefono, direccion, activo)
  values (gen_random_uuid(), v_empresa, p_id_sucursal, v_nom, coalesce(v_ape, ''),
          btrim(v_nom || ' ' || coalesce(v_ape, '')), v_nit, v_tel, v_dir, coalesce(p_activo, true))
  returning id into v_id;
  return v_id;
end;
$function$;

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

-- ------------------------------------------------------------
-- 7) get_ventas_by_cliente — histórico por id de fila de cliente
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 8) registrar_venta — VERSIÓN CANÓNICA ÚNICA
--    (pos-ux: referencia + combo/ingredientes; clientes: p_cliente_nombre)
-- ------------------------------------------------------------
CREATE FUNCTION public.registrar_venta(
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_id_metodo_pago uuid,
  p_efectivo_recibido integer,
  p_items jsonb,
  p_id_cliente uuid DEFAULT NULL::uuid,
  p_referencia text DEFAULT NULL::text,
  p_cliente_nombre text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lineas jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_cambio integer := 0;
  v_item jsonb;
  v_line jsonb;
  v_id_producto uuid;
  v_id_precio uuid;
  v_cantidad integer;
  v_precio integer;
  v_factor integer;
  v_subtotal integer;
  v_id_venta uuid;
  v_es_combo boolean;
  v_sin_stock boolean := false;
  v_comp record;
  v_unidades integer;
  v_stock_comp integer;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'El carrito está vacío';
  END IF;
  IF p_id_metodo_pago IS NULL THEN
    RAISE EXCEPTION 'Selecciona un método de pago';
  END IF;

  SELECT coalesce(s.vender_sin_stock, false) INTO v_sin_stock
  FROM sucursal s WHERE s.id = p_id_sucursal;
  v_sin_stock := coalesce(v_sin_stock, false);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_id_producto := (v_item->>'id_producto')::uuid;
    v_cantidad := (v_item->>'cantidad')::int;
    v_id_precio := (v_item->>'id_precio_producto')::uuid;

    IF v_cantidad IS NULL OR v_cantidad < 1 THEN
      RAISE EXCEPTION 'Cantidad inválida en el carrito';
    END IF;

    SELECT pp.precio, pp.factor INTO v_precio, v_factor
    FROM precio_producto pp
    WHERE pp.id = v_id_precio AND pp.id_producto = v_id_producto;

    IF v_precio IS NULL THEN
      RAISE EXCEPTION 'Precio no válido para un producto del carrito';
    END IF;

    v_subtotal := v_precio * v_cantidad;
    v_total := v_total + v_subtotal;

    SELECT coalesce(pr.contiene_insumos, false) INTO v_es_combo
    FROM productos pr WHERE pr.id = v_id_producto;

    IF coalesce(v_es_combo, false) THEN
      IF NOT EXISTS (SELECT 1 FROM combo_componentes cc WHERE cc.id_producto = v_id_producto) THEN
        RAISE EXCEPTION 'El combo % no tiene receta configurada',
          (SELECT name FROM productos WHERE id = v_id_producto);
      END IF;

      FOR v_comp IN
        SELECT cc.id_producto_componente,
               cc.id_ingrediente,
               cc.cantidad AS comp_cantidad,
               coalesce(ppc.factor, 1) AS comp_factor,
               coalesce(prc.name, ing.name) AS comp_nombre
          FROM combo_componentes cc
          LEFT JOIN productos prc ON prc.id = cc.id_producto_componente
          LEFT JOIN ingredientes ing ON ing.id = cc.id_ingrediente
          LEFT JOIN precio_producto ppc ON ppc.id = cc.id_precio_producto
         WHERE cc.id_producto = v_id_producto
      LOOP
        IF v_comp.id_ingrediente IS NOT NULL THEN
          -- Ingrediente: cantidad directa en unidad base, sin factor
          v_unidades := v_cantidad * v_comp.comp_cantidad;

          SELECT ins.stock INTO v_stock_comp
            FROM ingredientes_sucursal ins
           WHERE ins.id_ingrediente = v_comp.id_ingrediente
             AND ins.id_sucursal = p_id_sucursal;

          IF v_stock_comp IS NULL THEN
            RAISE EXCEPTION 'Sin inventario registrado del ingrediente %', v_comp.comp_nombre;
          END IF;

          IF NOT v_sin_stock AND v_stock_comp < v_unidades THEN
            RAISE EXCEPTION 'Stock insuficiente: el ingrediente % solo tiene % y el combo necesita %',
              v_comp.comp_nombre, v_stock_comp, v_unidades;
          END IF;

          UPDATE ingredientes_sucursal
             SET stock = stock - v_unidades
           WHERE id_ingrediente = v_comp.id_ingrediente
             AND id_sucursal = p_id_sucursal;
        ELSE
          -- Producto: cantidad × factor (presentación)
          v_unidades := v_cantidad * v_comp.comp_cantidad * v_comp.comp_factor;

          SELECT ps.stock INTO v_stock_comp
            FROM productos_sucursal ps
           WHERE ps.id_producto = v_comp.id_producto_componente
             AND ps.id_sucursal = p_id_sucursal;

          IF v_stock_comp IS NULL THEN
            RAISE EXCEPTION 'Sin inventario registrado del componente %', v_comp.comp_nombre;
          END IF;

          IF NOT v_sin_stock AND v_stock_comp < v_unidades THEN
            RAISE EXCEPTION 'Stock insuficiente: el componente % solo tiene % und y el combo necesita % und',
              v_comp.comp_nombre, v_stock_comp, v_unidades;
          END IF;

          UPDATE productos_sucursal
             SET stock = stock - v_unidades
           WHERE id_producto = v_comp.id_producto_componente
             AND id_sucursal = p_id_sucursal;
        END IF;
      END LOOP;
    ELSE
      UPDATE productos_sucursal
      SET stock = stock - (v_cantidad * v_factor)
      WHERE id_producto = v_id_producto
        AND id_sucursal = p_id_sucursal
        AND stock >= (v_cantidad * v_factor);

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stock insuficiente para un producto del carrito';
      END IF;
    END IF;

    v_lineas := v_lineas || jsonb_build_object(
      'id_producto', v_id_producto,
      'id_precio_producto', v_id_precio,
      'cantidad', v_cantidad,
      'subtotal', v_subtotal
    );
  END LOOP;

  IF p_efectivo_recibido IS NOT NULL THEN
    IF p_efectivo_recibido < v_total THEN
      RAISE EXCEPTION 'El efectivo recibido es menor al total';
    END IF;
    v_cambio := p_efectivo_recibido - v_total;
  END IF;

  INSERT INTO ventas
    (id, id_sucursal, id_usuario, id_metodo_pago, fecha, total, cambio, estado,
     id_cliente, referencia, cliente_nombre)
  VALUES
    (gen_random_uuid(), p_id_sucursal, p_id_usuario, p_id_metodo_pago,
     now(), v_total, v_cambio, 'completada', p_id_cliente,
     NULLIF(btrim(p_referencia), ''),
     NULLIF(btrim(p_cliente_nombre), ''))
  RETURNING id INTO v_id_venta;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lineas)
  LOOP
    INSERT INTO detalle_venta
      (id, id_venta, id_producto, cantidad, subtotal, id_precio_producto)
    VALUES
      (gen_random_uuid(), v_id_venta,
       (v_line->>'id_producto')::uuid,
       (v_line->>'cantidad')::int,
       (v_line->>'subtotal')::int,
       (v_line->>'id_precio_producto')::uuid);
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'id_venta', v_id_venta,
    'total', v_total,
    'cambio', v_cambio
  );
END;
$function$;

-- ------------------------------------------------------------
-- 9) get_venta_detalle — cae al nombre casual si no hay perfil
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_venta_detalle(p_id uuid, p_id_sucursal uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_json json;
begin
  select json_build_object(
    'id', ve.id,
    'fecha', ve.fecha,
    'total', ve.total,
    'estado', ve.estado,
    'id_metodo_pago', ve.id_metodo_pago,
    'usuario', coalesce(u.name, ''),
    'cliente', coalesce(cl.name, ve.cliente_nombre, ''),
    'fecha_anulacion', ve.fecha_anulacion,
    'motivo_anulacion', ve.motivo_anulacion,
    'anulado_por', coalesce(u2.name, ''),
    'items', (
      select coalesce(json_agg(json_build_object(
        'producto', p.name,
        'sku', p.sku,
        'cantidad', d.cantidad,
        'subtotal', d.subtotal,
        'unitario', case when d.cantidad > 0
                         then d.subtotal / d.cantidad
                         else d.subtotal end
      ) order by p.name), '[]'::json)
        from detalle_venta d
        join productos p on p.id = d.id_producto
       where d.id_venta = ve.id
    )
  )
  into v_json
  from ventas ve
  left join users u on u.id = ve.id_usuario
  left join users u2 on u2.id = ve.id_usuario_anula
  left join clientes cl on cl.id = ve.id_cliente
 where ve.id = p_id and ve.id_sucursal = p_id_sucursal;

  if v_json is null then
    raise exception 'Venta no encontrada';
  end if;
  return v_json;
end;
$function$;

NOTIFY pgrst, 'reload schema';
