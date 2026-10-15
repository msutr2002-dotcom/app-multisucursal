-- ============================================================================
-- papel-iris — Task 2 (SQL, lo aplica el usuario)
-- Selector de color por variantes: persiste el color en detalle_venta y lo
-- expone en el comprobante. Se parte de las definiciones vivas (diagnóstico
-- 2026-10-15) y se cambia SOLO lo mínimo. Firmas intactas (sin DROP → sin
-- overload PGRST203).
-- ============================================================================

-- 1) Columna de color en el detalle de venta (histórico; sin ON DELETE para no
--    perder la referencia si un color se elimina del catálogo).
alter table public.detalle_venta
  add column if not exists id_color uuid references public.color(id);

-- 2) registrar_venta: id_color derivado del producto (el servidor NO confía en
--    el cliente). Firma y defaults idénticos a la definición viva.
create or replace function public.registrar_venta(
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_id_metodo_pago uuid,
  p_efectivo_recibido integer,
  p_items jsonb,
  p_id_cliente uuid default null::uuid,
  p_referencia text default null::text,
  p_cliente_nombre text default null::text
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      (id, id_venta, id_producto, cantidad, subtotal, id_precio_producto, id_color)
    VALUES
      (gen_random_uuid(), v_id_venta,
       (v_line->>'id_producto')::uuid,
       (v_line->>'cantidad')::int,
       (v_line->>'subtotal')::int,
       (v_line->>'id_precio_producto')::uuid,
       (SELECT pr.id_color FROM productos pr WHERE pr.id = (v_line->>'id_producto')::uuid));
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

-- 3) get_venta_detalle: expone id_color + color_nombre por línea (comprobante).
create or replace function public.get_venta_detalle(p_id uuid, p_id_sucursal uuid)
returns json
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
                         else d.subtotal end,
        'id_color', d.id_color,
        'color', c.name
      ) order by p.name), '[]'::json)
        from detalle_venta d
        join productos p on p.id = d.id_producto
        left join color c on c.id = d.id_color
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

-- 4) Permisos + recarga del esquema PostgREST
grant execute on function public.registrar_venta(uuid, uuid, uuid, integer, jsonb, uuid, text, text)
  to anon, authenticated;
grant execute on function public.get_venta_detalle(uuid, uuid)
  to anon, authenticated;

notify pgrst, 'reload schema';
