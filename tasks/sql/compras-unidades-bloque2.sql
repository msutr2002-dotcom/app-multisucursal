-- ============================================================
-- compras-unidades Task 2 — Bloque 2 (aplicar DESPUÉS del bloque 1)
-- 1) anular_compra revierte cantidad × COALESCE(factor, 1)
--    (líneas viejas sin factor revierten exactamente lo que sumaron)
-- 2) get_compras devuelve `items` como jsonb ARRAY con factor +
--    id_precio_producto + unidad por línea (antes era un conteo)
-- ============================================================

CREATE OR REPLACE FUNCTION public.anular_compra(
  p_id uuid,
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_motivo text DEFAULT NULL::text
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      v_compra record;
      v_item record;
      v_revertir integer;
    BEGIN
      SELECT * INTO v_compra
        FROM compras
       WHERE id = p_id AND id_sucursal = p_id_sucursal;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Compra no encontrada';
      END IF;
      IF v_compra.estado = 'anulada' THEN
        RAISE EXCEPTION 'La compra ya está anulada';
      END IF;

      FOR v_item IN SELECT id_producto, id_ingrediente, cantidad, factor
                      FROM detalle_compra WHERE id_compra = p_id LOOP
        IF v_item.id_ingrediente IS NOT NULL THEN
          UPDATE ingredientes_sucursal
             SET stock = stock - v_item.cantidad
           WHERE id_sucursal = p_id_sucursal
             AND id_ingrediente = v_item.id_ingrediente;
        ELSE
          -- compras-unidades RF-UC3: revierte cantidad × (factor || 1)
          v_revertir := v_item.cantidad * COALESCE(v_item.factor, 1);
          UPDATE productos_sucursal
             SET stock = stock - v_revertir
           WHERE id_sucursal = p_id_sucursal
             AND id_producto = v_item.id_producto;
        END IF;
      END LOOP;

      UPDATE compras
         SET estado = 'anulada',
             fecha_anulacion = now(),
             motivo_anulacion = p_motivo,
             id_usuario_anula = p_id_usuario
       WHERE id = p_id;

      RETURN json_build_object('id_compra', p_id, 'estado', 'anulada');
    END;
    $function$;

CREATE OR REPLACE FUNCTION public.get_compras(
  p_id_sucursal uuid,
  p_estado text DEFAULT NULL::text,
  p_desde timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_hasta timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_busqueda text DEFAULT NULL::text,
  p_limite integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    DECLARE
      v_resultado json;
    BEGIN
      IF p_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'p_id_sucursal es obligatorio';
      END IF;

      SELECT json_build_object(
        'compras', COALESCE(json_agg(json_build_object(
          'id', x.id,
          'fecha', x.fecha,
          'total', x.total,
          'estado', x.estado,
          'id_proveedor', x.id_proveedor,
          'proveedor', x.proveedor,
          'usuario', x.usuario,
          'items', x.items
        ) ORDER BY x.fecha DESC), '[]'),
        'total', COALESCE(MAX(x.total_registros), 0)
      )
      INTO v_resultado
      FROM (
        SELECT c.id, c.fecha, c.total, c.estado, c.id_proveedor,
               pr.name AS proveedor,
               u.name AS usuario,
               -- compras-unidades: items ahora es un ARRAY con unidad/factor
               -- por línea (antes era un conteo; el cliente acepta ambos)
               (SELECT COALESCE(json_agg(json_build_object(
                          'id_producto', d.id_producto,
                          'name', pd.name,
                          'cantidad', d.cantidad,
                          'precio_unitario', d.precio_unitario,
                          'sub_total', d.sub_total,
                          'id_precio_producto', d.id_precio_producto,
                          'factor', COALESCE(d.factor, 1),
                          'unidad', un.name
                        ) ORDER BY d.id), '[]')
                  FROM detalle_compra d
                  LEFT JOIN productos pd ON pd.id = d.id_producto
                  LEFT JOIN precio_producto pp ON pp.id = d.id_precio_producto
                  LEFT JOIN unidades un ON un.id = pp.id_unidad_venta
                 WHERE d.id_compra = c.id) AS items,
               count(*) OVER() AS total_registros
        FROM compras c
        LEFT JOIN proveedor pr ON pr.id = c.id_proveedor
        LEFT JOIN users u ON u.id = c.id_usuario
        WHERE c.id_sucursal = p_id_sucursal
          AND (p_estado IS NULL OR c.estado = p_estado)
          AND (p_desde IS NULL OR c.fecha >= p_desde)
          AND (p_hasta IS NULL OR c.fecha < p_hasta)
          AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
               c.id::text ILIKE '%' || p_busqueda || '%' OR
               pr.name ILIKE '%' || p_busqueda || '%' OR
               u.name ILIKE '%' || p_busqueda || '%')
        ORDER BY c.fecha DESC
        LIMIT p_limite OFFSET p_offset
      ) x;

      RETURN v_resultado;
    END;
    $function$;

NOTIFY pgrst, 'reload schema';
