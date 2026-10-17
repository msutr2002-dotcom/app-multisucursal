-- ============================================================================
-- Fix — bug de combos: "column reference v_comp is ambiguous" (SQLSTATE 42702)
-- Módulo: combos-insumos (Task 8)
--
-- Causa: en `upsert_combo_componentes`, el INSERT ... SELECT final usaba el
-- alias `v_comp` para jsonb_array_elements, homónimo de la variable PL/pgSQL
-- `v_comp` del FOR → Postgres no resuelve `v_comp->>'...'`.
--
-- Fix mínimo: renombrar el alias del SELECT final a `v_parte`. El resto de la
-- función queda idéntico (validaciones XOR, duplicados, combos anidados, tiers).
--
-- Idempotente (CREATE OR REPLACE). Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_combo_componentes(p_id_producto uuid, p_componentes jsonb)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_comp jsonb;
BEGIN
  IF p_id_producto IS NULL THEN
    RAISE EXCEPTION 'El producto es obligatorio';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM productos WHERE id = p_id_producto) THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
  IF p_componentes IS NULL OR jsonb_array_length(p_componentes) = 0 THEN
    RAISE EXCEPTION 'La receta necesita al menos un componente';
  END IF;

  -- Validar que cada fila traiga exactamente una referencia (producto XOR ingrediente)
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_componentes) x
    WHERE (x->>'id_producto_componente') IS NOT NULL
      AND (x->>'id_ingrediente') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Un componente no puede ser producto e ingrediente a la vez';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_componentes) x
    WHERE nullif(x->>'id_producto_componente', '') IS NULL
      AND nullif(x->>'id_ingrediente', '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Cada componente debe ser un producto o un ingrediente';
  END IF;

  -- Sin duplicados entre componentes-producto
  IF (SELECT count(*) FROM jsonb_array_elements(p_componentes) x
        WHERE nullif(x->>'id_producto_componente', '') IS NOT NULL) <>
     (SELECT count(DISTINCT (x->>'id_producto_componente'))
        FROM jsonb_array_elements(p_componentes) x
        WHERE nullif(x->>'id_producto_componente', '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay componentes duplicados en la receta';
  END IF;

  -- Sin duplicados entre componentes-ingrediente
  IF (SELECT count(*) FROM jsonb_array_elements(p_componentes) x
        WHERE nullif(x->>'id_ingrediente', '') IS NOT NULL) <>
     (SELECT count(DISTINCT (x->>'id_ingrediente'))
        FROM jsonb_array_elements(p_componentes) x
        WHERE nullif(x->>'id_ingrediente', '') IS NOT NULL) THEN
    RAISE EXCEPTION 'Hay ingredientes duplicados en la receta';
  END IF;

  FOR v_comp IN SELECT * FROM jsonb_array_elements(p_componentes)
  LOOP
    IF coalesce((v_comp->>'cantidad')::int, 0) < 1 THEN
      RAISE EXCEPTION 'Cantidad inválida para un componente';
    END IF;

    IF nullif(v_comp->>'id_ingrediente', '') IS NOT NULL THEN
      -- Componente-ingrediente
      IF NOT EXISTS (SELECT 1 FROM ingredientes i WHERE i.id = (v_comp->>'id_ingrediente')::uuid) THEN
        RAISE EXCEPTION 'Ingrediente no encontrado en la receta';
      END IF;
    ELSE
      -- Componente-producto
      IF NOT EXISTS (
        SELECT 1 FROM productos p
        WHERE p.id = (v_comp->>'id_producto_componente')::uuid
          AND coalesce(p.contiene_insumos, false) = false
      ) THEN
        RAISE EXCEPTION 'Componente inválido: no existe o es un combo (no se permiten combos anidados)';
      END IF;
      IF nullif(v_comp->>'id_precio_producto', '') IS NOT NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM precio_producto pp
          WHERE pp.id = (v_comp->>'id_precio_producto')::uuid
            AND pp.id_producto = (v_comp->>'id_producto_componente')::uuid
        ) THEN
          RAISE EXCEPTION 'El tier elegido no pertenece al componente';
        END IF;
      END IF;
    END IF;
  END LOOP;

  DELETE FROM combo_componentes WHERE id_producto = p_id_producto;

  INSERT INTO combo_componentes (id, id_producto, id_producto_componente, id_ingrediente, cantidad, id_precio_producto)
  SELECT gen_random_uuid(), p_id_producto,
         nullif(v_parte->>'id_producto_componente', '')::uuid,
         nullif(v_parte->>'id_ingrediente', '')::uuid,
         (v_parte->>'cantidad')::int,
         nullif(v_parte->>'id_precio_producto', '')::uuid
  FROM jsonb_array_elements(p_componentes) AS v_parte;

  RETURN json_build_object('ok', true, 'componentes', jsonb_array_length(p_componentes));
END;
$function$;
