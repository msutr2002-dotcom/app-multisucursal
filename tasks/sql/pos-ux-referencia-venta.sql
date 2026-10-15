-- ============================================================
-- pos-ux-permisos Task 3 (RF-P3) — referencia de transferencia
-- 1) ventas gana columna `referencia`
-- 2) registrar_venta acepta p_referencia (opcional) y lo almacena
--    (NULLIF+btrim: cadena vacía queda como NULL)
-- ============================================================

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS referencia text;

CREATE OR REPLACE FUNCTION public.registrar_venta(
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_id_metodo_pago uuid,
  p_efectivo_recibido integer,
  p_items jsonb,
  p_id_cliente uuid DEFAULT NULL::uuid,
  p_referencia text DEFAULT NULL::text
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
    (id, id_sucursal, id_usuario, id_metodo_pago, fecha, total, cambio, estado, id_cliente, referencia)
  VALUES
    (gen_random_uuid(), p_id_sucursal, p_id_usuario, p_id_metodo_pago,
     now(), v_total, v_cambio, 'completada', p_id_cliente,
     NULLIF(btrim(p_referencia), ''))
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

NOTIFY pgrst, 'reload schema';
