-- ============================================================================
-- productos-padre-hijo — Task 1 (SQL, lo aplica el usuario en Supabase)
-- Spec: specs/productos-padre-hijo.md
--
-- Agrega la relación padre/hijo a `productos` y la expone en los RPC de
-- producto. Basado en las definiciones vivas de `tasks/sql/catalogos-colores.sql`
-- (última versión conocida de create/update/get_productos_admin).
--
-- IMPORTANTE: create/update_producto_admin cambian de firma (nuevo p_id_padre).
-- CREATE OR REPLACE no puede cambiar la lista de argumentos: crearía un overload
-- ambiguo (PGRST203). Por eso se DROP-ea la firma vieja antes de recrearla.
-- get_productos_admin conserva su firma → CREATE OR REPLACE.
--
-- ANTES DE APLICAR: corre la sección 0 (solo lectura). Si las firmas no
-- coinciden con lo asumido, avísame antes de aplicar el resto.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) (Solo lectura) Confirma las firmas actuales antes de aplicar.
-- ----------------------------------------------------------------------------
-- select p.proname as funcion,
--        pg_get_function_identity_arguments(p.oid) as argumentos
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.proname in ('create_producto_admin','update_producto_admin','get_productos_admin')
-- order by p.proname;

-- =====================================================================
-- 1) Columna + índice
-- =====================================================================
alter table public.productos
  add column if not exists id_padre uuid references public.productos(id) on delete set null;

create index if not exists idx_productos_id_padre on public.productos(id_padre);

-- =====================================================================
-- 2) Drop de las firmas viejas de producto (para evitar overload)
-- =====================================================================
drop function if exists public.create_producto_admin(
  text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, integer, text, uuid, uuid
);
drop function if exists public.update_producto_admin(
  uuid, text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, text, uuid
);

-- =====================================================================
-- 3) get_productos_admin: expone id_padre + nº de hijos
--    (firma intacta → CREATE OR REPLACE)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_productos_admin(p_id_empresa uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result json;
BEGIN
  SELECT json_build_object(
    'productos', (
      SELECT COALESCE(json_agg(p ORDER BY p.name), '[]'::json)
      FROM (
        SELECT
          pr.id, pr.name, pr.sku, pr.descripcion, pr.estado, pr.tipo,
          pr.precio_compra, pr.imagen,
          pr.id_categoria, pr.id_marca, pr.id_proveedor,
          pr.id_unidad_compra, pr.id_unidad_venta,
          pr.contiene_insumos,
          pr.id_color,
          pr.id_padre,
          (SELECT count(*) FROM productos h WHERE h.id_padre = pr.id) AS hijos,
          (SELECT c.name FROM categoria c WHERE c.id = pr.id_categoria) AS categoria,
          (SELECT m.name FROM marca m WHERE m.id = pr.id_marca) AS marca,
          (SELECT pv.name FROM proveedor pv WHERE pv.id = pr.id_proveedor) AS proveedor,
          (SELECT co.name FROM color co WHERE co.id = pr.id_color) AS color,
          (
            SELECT COALESCE(json_agg(pp ORDER BY pp.min_cantidad), '[]'::json)
            FROM (
              SELECT x.id, x.id_tipo_producto, tp.name AS tipo,
                     x.precio, x.min_cantidad, x.id_unidad_venta, x.factor
              FROM precio_producto x
              JOIN tipo_producto tp ON tp.id = x.id_tipo_producto
              WHERE x.id_producto = pr.id
            ) pp
          ) AS precios,
          (
            SELECT COALESCE(json_agg(ps), '[]'::json)
            FROM (
              SELECT y.id_sucursal, s.name AS sucursal, y.stock, y.stock_minimo
              FROM productos_sucursal y
              JOIN sucursal s ON s.id = y.id_sucursal
              WHERE y.id_producto = pr.id
            ) ps
          ) AS stock,
          (
            SELECT COALESCE(json_agg(json_build_object(
              'id', cc.id,
              'id_producto_componente', cc.id_producto_componente,
              'id_ingrediente', cc.id_ingrediente,
              'cantidad', cc.cantidad,
              'id_precio_producto', cc.id_precio_producto,
              'factor', coalesce(ppc.factor, 1),
              'componente', coalesce(prc.name, ing.name)
            ) ORDER BY coalesce(prc.name, ing.name)), '[]'::json)
            FROM combo_componentes cc
            LEFT JOIN productos prc ON prc.id = cc.id_producto_componente
            LEFT JOIN ingredientes ing ON ing.id = cc.id_ingrediente
            LEFT JOIN precio_producto ppc ON ppc.id = cc.id_precio_producto
            WHERE cc.id_producto = pr.id
          ) AS componentes
        FROM productos pr
        WHERE pr.id_empresa = p_id_empresa
      ) p
    ),
    'categorias',   (SELECT COALESCE(json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name), '[]'::json) FROM categoria c WHERE c.id_empresa = p_id_empresa),
    'marcas',       (SELECT COALESCE(json_agg(json_build_object('id', m.id, 'name', m.name) ORDER BY m.name), '[]'::json) FROM marca m WHERE m.id_empresa = p_id_empresa),
    'proveedores',  (SELECT COALESCE(json_agg(json_build_object('id', v.id, 'name', v.name) ORDER BY v.name), '[]'::json) FROM proveedor v WHERE v.id_empresa = p_id_empresa),
    'tipos_precio', (SELECT COALESCE(json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name), '[]'::json) FROM tipo_producto t WHERE t.id_empresa = p_id_empresa),
    'unidades',     (SELECT COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name, 'abreviatura', u.abreviatura, 'equivalencia', u.equivalencia) ORDER BY u.name), '[]'::json) FROM unidades u WHERE u.activo = true AND u.id_empresa = p_id_empresa),
    'colores',      (SELECT COALESCE(json_agg(json_build_object('id', co.id, 'name', co.name) ORDER BY co.name), '[]'::json) FROM color co)
  )
  INTO v_result;
  RETURN v_result;
END;
$function$;

-- =====================================================================
-- 4) create_producto_admin: nuevo p_id_padre (firma recreada)
--    Reglas: el padre debe ser de la misma empresa, raíz (sin padre).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_producto_admin(
  p_name text, p_sku text, p_descripcion text, p_id_categoria uuid, p_id_marca uuid,
  p_id_proveedor uuid, p_precio_compra integer, p_tipo text, p_estado text,
  p_id_unidad_compra uuid, p_id_unidad_venta uuid, p_precio_normal integer,
  p_imagen text DEFAULT NULL::text, p_id_empresa uuid DEFAULT NULL::uuid,
  p_id_color uuid DEFAULT NULL::uuid, p_id_padre uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_tipo_normal uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;
  IF p_id_empresa IS NULL THEN
    RAISE EXCEPTION 'La empresa es obligatoria';
  END IF;

  IF p_id_padre IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM productos pa
      WHERE pa.id = p_id_padre
        AND pa.id_empresa = p_id_empresa
        AND pa.id_padre IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto padre no existe, no es de tu empresa o ya es un hijo';
    END IF;
  END IF;

  INSERT INTO productos
    (id, name, sku, descripcion, id_categoria, id_marca, id_proveedor,
     precio_compra, tipo, estado, id_unidad_compra, id_unidad_venta, imagen, id_empresa,
     id_color, id_padre)
  VALUES
    (gen_random_uuid(), trim(p_name), p_sku, p_descripcion,
     p_id_categoria, p_id_marca, p_id_proveedor,
     COALESCE(p_precio_compra, 0), p_tipo::tipo_productos, p_estado::estado_producto,
     p_id_unidad_compra, p_id_unidad_venta, NULLIF(p_imagen, ''), p_id_empresa,
     p_id_color, p_id_padre)
  RETURNING id INTO v_id;

  IF p_precio_normal IS NOT NULL THEN
    SELECT t.id INTO v_tipo_normal
    FROM tipo_producto t
    WHERE t.name = 'NORMAL' AND t.id_empresa = p_id_empresa
    LIMIT 1;

    IF v_tipo_normal IS NULL THEN
      INSERT INTO tipo_producto (id, name, id_empresa)
      VALUES (gen_random_uuid(), 'NORMAL', p_id_empresa)
      RETURNING id INTO v_tipo_normal;
    END IF;

    INSERT INTO precio_producto
      (id, id_producto, id_tipo_producto, precio, min_cantidad, id_unidad_venta)
    VALUES
      (gen_random_uuid(), v_id, v_tipo_normal, p_precio_normal, 1, NULL);
  END IF;

  RETURN v_id;
END;
$function$;

-- =====================================================================
-- 5) update_producto_admin: nuevo p_id_padre (firma recreada)
--    Reglas: no puede ser su propio padre; si ya tiene hijos no puede pasar a
--    ser hijo; el padre debe ser de la misma empresa y raíz (sin padre).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_producto_admin(
  p_id uuid, p_name text, p_sku text, p_descripcion text, p_id_categoria uuid,
  p_id_marca uuid, p_id_proveedor uuid, p_precio_compra integer, p_tipo text,
  p_estado text, p_id_unidad_compra uuid, p_id_unidad_venta uuid,
  p_imagen text DEFAULT NULL::text, p_id_color uuid DEFAULT NULL::uuid,
  p_id_padre uuid DEFAULT NULL::uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;

  IF p_id_padre IS NOT NULL THEN
    IF p_id_padre = p_id THEN
      RAISE EXCEPTION 'Un producto no puede ser su propio padre';
    END IF;
    IF EXISTS (SELECT 1 FROM productos h WHERE h.id_padre = p_id) THEN
      RAISE EXCEPTION 'El producto ya tiene variantes; no puede convertirse en hijo';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM productos pa
      JOIN productos pr ON pr.id = p_id
      WHERE pa.id = p_id_padre
        AND pa.id_empresa = pr.id_empresa
        AND pa.id_padre IS NULL
    ) THEN
      RAISE EXCEPTION 'El producto padre no existe, es de otra empresa o ya es un hijo';
    END IF;
  END IF;

  UPDATE productos SET
    name = trim(p_name),
    sku = p_sku,
    descripcion = p_descripcion,
    id_categoria = p_id_categoria,
    id_marca = p_id_marca,
    id_proveedor = p_id_proveedor,
    precio_compra = COALESCE(p_precio_compra, 0),
    tipo = p_tipo::tipo_productos,
    estado = p_estado::estado_producto,
    id_unidad_compra = p_id_unidad_compra,
    id_unidad_venta = p_id_unidad_venta,
    imagen = NULLIF(p_imagen, ''),
    id_color = p_id_color,
    id_padre = p_id_padre
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
END;
$function$;

-- =====================================================================
-- 6) Permisos + recarga de caché de PostgREST
-- =====================================================================
grant execute on function public.get_productos_admin(uuid) to anon, authenticated;
grant execute on function public.create_producto_admin(
  text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, integer, text, uuid, uuid, uuid
) to anon, authenticated;
grant execute on function public.update_producto_admin(
  uuid, text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, text, uuid, uuid
) to anon, authenticated;

notify pgrst, 'reload schema';
