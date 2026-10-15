-- catalogos-colores (spec specs/catalogos-colores.md)
-- Aplica en Supabase: agrega el catálogo global `color` a los RPC de catálogos y
-- añade `p_id_color` a los RPC de producto. Idempotente.
--
-- IMPORTANTE: create/update_producto_admin cambian de firma (nuevo p_id_color).
-- CREATE OR REPLACE no puede cambiar la lista de argumentos: crearía un overload
-- ambiguo (PGRST203). Por eso se DROP-ea la firma vieja antes de recrearla.
-- get_catalogos / upsert_catalogo / delete_catalogo / get_productos_admin
-- conservan su firma → CREATE OR REPLACE.

-- =====================================================================
-- 1) Drop de las firmas viejas de producto (para evitar overload)
-- =====================================================================
drop function if exists public.create_producto_admin(
  text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, integer, text, uuid
);
drop function if exists public.update_producto_admin(
  uuid, text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, text
);

-- =====================================================================
-- 2) get_catalogos: añade 'colores' (tabla global, sin id_empresa)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_catalogos(p_id_empresa uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'marcas', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.name)
      from marca m
      where m.id_empresa = p_id_empresa
    ), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name)
      from categoria c
      where c.id_empresa = p_id_empresa
    ), '[]'::jsonb),
    'proveedores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name,
        'address', p.address, 'email', p.email, 'tel', p.tel
      ) order by p.name)
      from proveedor p
      where p.id_empresa = p_id_empresa
    ), '[]'::jsonb),
    'unidades', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.name,
        'abreviatura', u.abreviatura,
        'equivalencia', u.equivalencia,
        'activo', u.activo
      ) order by u.name)
      from unidades u
      where u.id_empresa = p_id_empresa
    ), '[]'::jsonb),
    'tipos_precio', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name)
      from tipo_producto t
      where t.id_empresa = p_id_empresa
    ), '[]'::jsonb),
    'colores', coalesce((
      select jsonb_agg(jsonb_build_object('id', co.id, 'name', co.name) order by co.name)
      from color co
    ), '[]'::jsonb)
  );
$function$;

-- =====================================================================
-- 3) upsert_catalogo: acepta p_tabla = 'color' (global, solo name)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.upsert_catalogo(p_tabla text, p_id uuid, p_id_empresa uuid, p_campos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid;
  v_nombre text;
begin
  if p_id_empresa is null then
    raise exception 'La empresa es obligatoria';
  end if;

  if p_tabla is null
     or p_tabla not in ('marca', 'categoria', 'proveedor', 'unidades', 'tipo_producto', 'color') then
    raise exception 'Catálogo no permitido: %', coalesce(p_tabla, '(vacío)');
  end if;

  v_nombre := nullif(
    regexp_replace(coalesce(p_campos->>'name', ''), '^\s+|\s+$', '', 'g'), ''
  );
  if v_nombre is null then
    raise exception 'El nombre es obligatorio';
  end if;

  if p_id is null then
    -- INSERTAR
    if p_tabla = 'marca' then
      insert into marca (id_empresa, name)
      values (p_id_empresa, v_nombre)
      returning id into v_id;
    elsif p_tabla = 'categoria' then
      insert into categoria (id_empresa, name)
      values (p_id_empresa, v_nombre)
      returning id into v_id;
    elsif p_tabla = 'proveedor' then
      insert into proveedor (id_empresa, name, address, email, tel)
      values (p_id_empresa, v_nombre,
              nullif(p_campos->>'address', ''),
              nullif(p_campos->>'email', ''),
              nullif(p_campos->>'tel', ''))
      returning id into v_id;
    elsif p_tabla = 'unidades' then
      insert into unidades (id_empresa, name, abreviatura, equivalencia, activo)
      values (p_id_empresa, v_nombre,
              nullif(p_campos->>'abreviatura', ''),
              coalesce(nullif(p_campos->>'equivalencia', '')::int, 1),
              coalesce((p_campos->>'activo')::boolean, true))
      returning id into v_id;
    elsif p_tabla = 'color' then
      insert into color (id, name)
      values (gen_random_uuid(), v_nombre)
      returning id into v_id;
    else -- tipo_producto
      insert into tipo_producto (id_empresa, name)
      values (p_id_empresa, v_nombre)
      returning id into v_id;
    end if;
  else
    -- ACTUALIZAR (limitado a la empresa activa; color es global)
    if p_tabla = 'marca' then
      update marca set name = v_nombre
      where id = p_id and id_empresa = p_id_empresa
      returning id into v_id;
    elsif p_tabla = 'categoria' then
      update categoria set name = v_nombre
      where id = p_id and id_empresa = p_id_empresa
      returning id into v_id;
    elsif p_tabla = 'proveedor' then
      update proveedor
      set name = v_nombre,
          address = nullif(p_campos->>'address', ''),
          email = nullif(p_campos->>'email', ''),
          tel = nullif(p_campos->>'tel', '')
      where id = p_id and id_empresa = p_id_empresa
      returning id into v_id;
    elsif p_tabla = 'unidades' then
      update unidades
      set name = v_nombre,
          abreviatura = nullif(p_campos->>'abreviatura', ''),
          equivalencia = coalesce(nullif(p_campos->>'equivalencia', '')::int, 1),
          activo = coalesce((p_campos->>'activo')::boolean, true)
      where id = p_id and id_empresa = p_id_empresa
      returning id into v_id;
    elsif p_tabla = 'color' then
      update color set name = v_nombre
      where id = p_id
      returning id into v_id;
    else -- tipo_producto
      update tipo_producto set name = v_nombre
      where id = p_id and id_empresa = p_id_empresa
      returning id into v_id;
    end if;
  end if;

  if v_id is null then
    raise exception 'No se encontró el registro en tu empresa';
  end if;

  return v_id;
end;
$function$;

-- =====================================================================
-- 4) delete_catalogo: acepta p_tabla = 'color' (bloquea si está en uso)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.delete_catalogo(p_tabla text, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tabla = 'marca' THEN
    IF EXISTS (SELECT 1 FROM productos WHERE id_marca = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: hay productos que la usan';
    END IF;
    DELETE FROM marca WHERE id = p_id;

  ELSIF p_tabla = 'categoria' THEN
    IF EXISTS (SELECT 1 FROM productos WHERE id_categoria = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: hay productos que la usan';
    END IF;
    DELETE FROM categoria WHERE id = p_id;

  ELSIF p_tabla = 'proveedor' THEN
    IF EXISTS (SELECT 1 FROM productos WHERE id_proveedor = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: hay productos que la usan';
    END IF;
    DELETE FROM proveedor WHERE id = p_id;

  ELSIF p_tabla = 'unidades' THEN
    IF EXISTS (SELECT 1 FROM productos WHERE id_unidad_compra = p_id OR id_unidad_venta = p_id)
       OR EXISTS (SELECT 1 FROM precio_producto WHERE id_unidad_venta = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: está en uso';
    END IF;
    DELETE FROM unidades WHERE id = p_id;

  ELSIF p_tabla = 'tipo_producto' THEN
    IF EXISTS (SELECT 1 FROM precio_producto WHERE id_tipo_producto = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: hay precios que lo usan';
    END IF;
    DELETE FROM tipo_producto WHERE id = p_id;

  ELSIF p_tabla = 'color' THEN
    IF EXISTS (SELECT 1 FROM productos WHERE id_color = p_id) THEN
      RAISE EXCEPTION 'No se puede eliminar: hay productos que lo usan';
    END IF;
    DELETE FROM color WHERE id = p_id;

  ELSE
    RAISE EXCEPTION 'Tabla no permitida';
  END IF;
END;
$function$;

-- =====================================================================
-- 5) get_productos_admin: añade id_color (+ nombre del color) por producto
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
-- 6) create_producto_admin: nuevo p_id_color (firma recreada)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_producto_admin(
  p_name text, p_sku text, p_descripcion text, p_id_categoria uuid, p_id_marca uuid,
  p_id_proveedor uuid, p_precio_compra integer, p_tipo text, p_estado text,
  p_id_unidad_compra uuid, p_id_unidad_venta uuid, p_precio_normal integer,
  p_imagen text DEFAULT NULL::text, p_id_empresa uuid DEFAULT NULL::uuid,
  p_id_color uuid DEFAULT NULL::uuid
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

  INSERT INTO productos
    (id, name, sku, descripcion, id_categoria, id_marca, id_proveedor,
     precio_compra, tipo, estado, id_unidad_compra, id_unidad_venta, imagen, id_empresa,
     id_color)
  VALUES
    (gen_random_uuid(), trim(p_name), p_sku, p_descripcion,
     p_id_categoria, p_id_marca, p_id_proveedor,
     COALESCE(p_precio_compra, 0), p_tipo::tipo_productos, p_estado::estado_producto,
     p_id_unidad_compra, p_id_unidad_venta, NULLIF(p_imagen, ''), p_id_empresa,
     p_id_color)
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
-- 7) update_producto_admin: nuevo p_id_color (firma recreada)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.update_producto_admin(
  p_id uuid, p_name text, p_sku text, p_descripcion text, p_id_categoria uuid,
  p_id_marca uuid, p_id_proveedor uuid, p_precio_compra integer, p_tipo text,
  p_estado text, p_id_unidad_compra uuid, p_id_unidad_venta uuid,
  p_imagen text DEFAULT NULL::text, p_id_color uuid DEFAULT NULL::uuid
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
    id_color = p_id_color
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado';
  END IF;
END;
$function$;

-- =====================================================================
-- 8) Permisos + recarga de caché de PostgREST
-- =====================================================================
grant execute on function public.get_catalogos(uuid) to anon, authenticated;
grant execute on function public.upsert_catalogo(text, uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.delete_catalogo(text, uuid) to anon, authenticated;
grant execute on function public.get_productos_admin(uuid) to anon, authenticated;
grant execute on function public.create_producto_admin(
  text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, integer, text, uuid, uuid
) to anon, authenticated;
grant execute on function public.update_producto_admin(
  uuid, text, text, text, uuid, uuid, uuid, integer, text, text, uuid, uuid, text, uuid
) to anon, authenticated;

notify pgrst, 'reload schema';
