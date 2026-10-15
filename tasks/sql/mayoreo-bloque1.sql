-- ============================================================
-- MAYOREO — bloque 1 (v1: descuento % por cliente)
-- Idempotente. Ejecutar en SQL Editor de Supabase.
-- Spec: specs/mayoreo.md (aprobada 2026-10-12).
--
-- Modelo:
--   clientes.descuento_bp   int 0..10000 (10% = 1000) — perfil mayorista.
--   ventas.descuento_bp     snapshot del bp aplicado a la venta.
--   ventas.descuento_monto  centavos descontados (round half-up por venta).
--   detalle_venta SIN cambios (subtotales a precio full; el descuento
--   se descuenta del total de la venta y se imprime como línea aparte).
--
-- Round: v_descuento = round(numeric(v_total_full) * bp / 10000)::int
--   (misma fórmula en cliente JS y servidor → sync offline exacta).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Columnas nuevas
-- ------------------------------------------------------------
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS descuento_bp integer
  NOT NULL DEFAULT 0;
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_descuento_bp_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_descuento_bp_check
  CHECK (descuento_bp >= 0 AND descuento_bp <= 10000);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_bp integer NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_monto integer NOT NULL DEFAULT 0;

-- ------------------------------------------------------------
-- 2) upsert_cliente_admin — misma lógica + p_descuento_bp
--    (firma crece → DROP de la vieja + CREATE nueva; el parámetro
--    tiene DEFAULT 0 así los llamados JS que no lo envían siguen OK)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_cliente_admin(uuid, uuid, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.upsert_cliente_admin(uuid, uuid, text, text, text, text, boolean, integer);

CREATE FUNCTION public.upsert_cliente_admin(
  p_id uuid,
  p_id_sucursal uuid,
  p_nombre text,
  p_apellido text DEFAULT NULL::text,
  p_nit text DEFAULT NULL::text,
  p_telefono text DEFAULT NULL::text,
  p_direccion text DEFAULT NULL::text,
  p_activo boolean DEFAULT true,
  p_descuento_bp integer DEFAULT 0
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
  v_bp integer := coalesce(p_descuento_bp, 0);
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
  if v_bp < 0 or v_bp > 10000 then
    raise exception 'El descuento debe estar entre 0%% y 100%%';
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
           activo = coalesce(p_activo, activo),
           descuento_bp = v_bp
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

  insert into clientes (id, id_empresa, id_sucursal, nombre, apellido, name, nit, telefono, direccion, activo, descuento_bp)
  values (gen_random_uuid(), v_empresa, p_id_sucursal, v_nom, coalesce(v_ape, ''),
          btrim(v_nom || ' ' || coalesce(v_ape, '')), v_nit, v_tel, v_dir, coalesce(p_activo, true), v_bp)
  returning id into v_id;
  return v_id;
end;
$function$;

-- ------------------------------------------------------------
-- 3) get_clientes — + descuento_bp por fila
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_clientes(
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
      'descuento_bp', x.descuento_bp,
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
           COALESCE(c.descuento_bp, 0)::int AS descuento_bp,
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
-- 4) registrar_venta — misma firma; el servidor recalcula el
--    descuento desde la BD cuando p_id_cliente viene informado
--    (no confía en el cliente offline; bp 0 si no hay perfil).
--    detalle_venta sigue guardando subtotales full.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_venta(
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
  v_total_full integer := 0;
  v_desc_bp integer := 0;
  v_desc_monto integer := 0;
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

  -- Mayoreo: bp del cliente enlazado (0 si casual/inexistente);
  -- el total final es full − descuento; efectivo/cambio sobre el final.
  v_total_full := v_total;
  IF p_id_cliente IS NOT NULL THEN
    SELECT coalesce(c.descuento_bp, 0) INTO v_desc_bp
      FROM clientes c
     WHERE c.id = p_id_cliente;
    v_desc_bp := coalesce(v_desc_bp, 0);
    IF v_desc_bp > 0 THEN
      v_desc_monto := round((v_total_full::numeric * v_desc_bp / 10000))::int;
      IF v_desc_monto > v_total_full THEN
        v_desc_monto := v_total_full;
      END IF;
      v_total := v_total_full - v_desc_monto;
    END IF;
  END IF;

  IF p_efectivo_recibido IS NOT NULL THEN
    IF p_efectivo_recibido < v_total THEN
      RAISE EXCEPTION 'El efectivo recibido es menor al total';
    END IF;
    v_cambio := p_efectivo_recibido - v_total;
  END IF;

  INSERT INTO ventas
    (id, id_sucursal, id_usuario, id_metodo_pago, fecha, total, cambio, estado,
     id_cliente, referencia, cliente_nombre, descuento_bp, descuento_monto)
  VALUES
    (gen_random_uuid(), p_id_sucursal, p_id_usuario, p_id_metodo_pago,
     now(), v_total, v_cambio, 'completada', p_id_cliente,
     NULLIF(btrim(p_referencia), ''),
     NULLIF(btrim(p_cliente_nombre), ''),
     v_desc_bp, v_desc_monto)
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
    'total_full', v_total_full,
    'descuento_bp', v_desc_bp,
    'descuento_monto', v_desc_monto,
    'cambio', v_cambio
  );
END;
$function$;

-- ------------------------------------------------------------
-- 5) get_venta_detalle — + campos de descuento para el ticket
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
    'total_full', ve.total + coalesce(ve.descuento_monto, 0),
    'descuento_bp', coalesce(ve.descuento_bp, 0),
    'descuento_monto', coalesce(ve.descuento_monto, 0),
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
