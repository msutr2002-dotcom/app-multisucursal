-- ============================================================
-- compras-unidades Task 2 — Bloque 1 (aplicar en SQL Editor)
-- 1) detalle_compra gana id_precio_producto + factor
-- 2) registrar_compra resuelve presentación por línea (D2: el
--    servidor resuelve el factor; nunca confía en el cliente)
-- Total sigue validándose en unidades de compra (Σ cantidad ×
-- precio_unitario) — sin cambio. Ingredientes intactos (D4).
-- ============================================================

ALTER TABLE detalle_compra
  ADD COLUMN IF NOT EXISTS id_precio_producto uuid,
  ADD COLUMN IF NOT EXISTS factor integer DEFAULT 1 CHECK (factor >= 1);

CREATE OR REPLACE FUNCTION public.registrar_compra(
  p_id_sucursal uuid,
  p_id_proveedor uuid,
  p_id_usuario uuid,
  p_total integer,
  p_items jsonb
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      v_id_compra uuid := gen_random_uuid();
      v_item record;
      v_total integer;
      v_id_precio uuid;
      v_factor integer;
      v_cantidad_base integer;
    BEGIN
      IF p_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'p_id_sucursal es obligatorio';
      END IF;
      IF p_total IS NULL OR p_total < 0 THEN
        RAISE EXCEPTION 'total inválido: %', p_total;
      END IF;
      IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'la compra debe incluir al menos un producto o ingrediente';
      END IF;

      SELECT COALESCE(SUM((elem->>'cantidad')::integer * (elem->>'precio_unitario')::integer), 0)
        INTO v_total
        FROM jsonb_array_elements(p_items) AS t(elem);

      IF v_total <> p_total THEN
        RAISE EXCEPTION 'El total enviado (%) no coincide con la suma de los ítems (%)',
          p_total, v_total;
      END IF;

      INSERT INTO compras (id, id_sucursal, id_proveedor, id_usuario, fecha, total, estado)
      VALUES (v_id_compra, p_id_sucursal, p_id_proveedor, p_id_usuario, now(), v_total, 'completada');

      FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS t(elem) LOOP
        IF (v_item.elem->>'cantidad')::integer <= 0 THEN
          RAISE EXCEPTION 'cantidad inválida: %', v_item.elem->>'cantidad';
        END IF;
        IF (v_item.elem->>'precio_unitario')::integer < 0 THEN
          RAISE EXCEPTION 'precio_unitario inválido: %', v_item.elem->>'precio_unitario';
        END IF;

        IF nullif(v_item.elem->>'id_ingrediente', '') IS NOT NULL THEN
          -- Ingrediente: registrar detalle + subir stock de ingredientes_sucursal (D4: sin cambios)
          INSERT INTO detalle_compra (id, id_compra, id_producto, id_ingrediente, cantidad, precio_unitario, sub_total)
          VALUES (
            gen_random_uuid(),
            v_id_compra,
            null,
            (v_item.elem->>'id_ingrediente')::uuid,
            (v_item.elem->>'cantidad')::integer,
            (v_item.elem->>'precio_unitario')::integer,
            (v_item.elem->>'cantidad')::integer * (v_item.elem->>'precio_unitario')::integer
          );

          INSERT INTO ingredientes_sucursal (id_ingrediente, id_sucursal, stock)
          VALUES ((v_item.elem->>'id_ingrediente')::uuid, p_id_sucursal, (v_item.elem->>'cantidad')::integer)
          ON CONFLICT (id_ingrediente, id_sucursal)
          DO UPDATE SET stock = ingredientes_sucursal.stock + (v_item.elem->>'cantidad')::integer;
        ELSE
          -- Producto (compras-unidades RF-UC3): presentación opcional.
          -- El cliente manda id_precio_producto; AQUÍ se resuelve el factor
          -- auditando que el tier pertenezca al producto (D2).
          v_id_precio := nullif(v_item.elem->>'id_precio_producto', '')::uuid;
          IF v_id_precio IS NOT NULL THEN
            SELECT factor INTO v_factor FROM precio_producto
              WHERE id = v_id_precio
                AND id_producto = (v_item.elem->>'id_producto')::uuid;
            IF v_factor IS NULL THEN
              RAISE EXCEPTION 'Presentación inválida para el producto %', v_item.elem->>'id_producto';
            END IF;
          ELSE
            v_factor := 1;
          END IF;
          v_cantidad_base := (v_item.elem->>'cantidad')::integer * v_factor;

          INSERT INTO detalle_compra (id, id_compra, id_producto, cantidad, precio_unitario, sub_total, id_precio_producto, factor)
          VALUES (
            gen_random_uuid(),
            v_id_compra,
            (v_item.elem->>'id_producto')::uuid,
            (v_item.elem->>'cantidad')::integer,
            (v_item.elem->>'precio_unitario')::integer,
            (v_item.elem->>'cantidad')::integer * (v_item.elem->>'precio_unitario')::integer,
            v_id_precio,
            v_factor
          );

          -- Stock en UNIDADES BASE: cantidad × factor (factor 1 = igual que antes)
          UPDATE productos_sucursal
             SET stock = stock + v_cantidad_base
           WHERE id_sucursal = p_id_sucursal
             AND id_producto = (v_item.elem->>'id_producto')::uuid;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no está habilitado en esta sucursal',
              v_item.elem->>'id_producto';
          END IF;
        END IF;
      END LOOP;

      RETURN json_build_object('id_compra', v_id_compra, 'total', p_total, 'estado', 'completada');
    END;
    $function$;

NOTIFY pgrst, 'reload schema';
