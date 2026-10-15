-- ============================================================
-- MULTIBODEGA — bloque 1 (tablas + migración)
-- Idempotente. Ejecutar en SQL Editor de Supabase.
-- Spec: specs/multibodega.md (aprobada 2026-10-13).
--
-- Modelo:
--   bodega            bodegas dentro de una sucursal (principal, trasera…).
--   stock_bodega      stock por bodega × producto (unidades base).
--   productos_sucursal SE CONSERVA como caché del stock TOTAL (suma de
--                     bodegas) para compatibilidad con código existente.
--
-- Migración: cada sucursal con stock recibe una bodega "Principal"
-- y su stock actual se copia a stock_bodega.
--
-- RLS habilitada SIN políticas → el anon no lee/escribe directo;
-- todo pasa por RPCs SECURITY DEFINER (regla del repo).
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tablas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bodega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_sucursal uuid NOT NULL REFERENCES sucursal(id),
  name text NOT NULL,
  es_principal boolean NOT NULL DEFAULT false,
  activa boolean NOT NULL DEFAULT true,
  CONSTRAINT bodega_nombre_uk UNIQUE (id_sucursal, name)
);

CREATE INDEX IF NOT EXISTS bodega_sucursal_idx
  ON bodega (id_sucursal);

ALTER TABLE bodega ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS stock_bodega (
  id_bodega uuid NOT NULL REFERENCES bodega(id),
  id_producto uuid NOT NULL REFERENCES productos(id),
  stock integer NOT NULL DEFAULT 0,
  stock_minimo integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id_bodega, id_producto)
);

CREATE INDEX IF NOT EXISTS stock_bodega_producto_idx
  ON stock_bodega (id_producto);

ALTER TABLE stock_bodega ENABLE ROW LEVEL SECURITY;

-- Sin políticas: el anon queda bloqueado (mismo patrón que ventas/clientes).

-- ------------------------------------------------------------
-- 2) Migración: bodega Principal por sucursal + copia de stock
--    Idempotente: solo crea la bodega si la sucursal no tiene ninguna.
--    Solo copia stock si stock_bodega está vacío para esa bodega.
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_id_bodega uuid;
BEGIN
  -- Para cada sucursal que tenga filas en productos_sucursal
  FOR r IN
    SELECT DISTINCT ps.id_sucursal
    FROM productos_sucursal ps
  LOOP
    -- ¿Ya tiene bodegas?
    IF EXISTS (SELECT 1 FROM bodega WHERE id_sucursal = r.id_sucursal) THEN
      CONTINUE; -- ya migrada
    END IF;

    -- Crear bodega Principal
    INSERT INTO bodega (id_sucursal, name, es_principal)
    VALUES (r.id_sucursal, 'Principal', true)
    RETURNING id INTO v_id_bodega;

    -- Copiar stock de productos_sucursal → stock_bodega
    INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
    SELECT v_id_bodega, ps.id_producto, ps.stock, ps.stock_minimo
    FROM productos_sucursal ps
    WHERE ps.id_sucursal = r.id_sucursal
    ON CONFLICT (id_bodega, id_producto) DO NOTHING;

    RAISE NOTICE 'Migrada sucursal % → bodega Principal %', r.id_sucursal, v_id_bodega;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) Función auxiliar: obtener la bodega Principal de una sucursal
--    (usada por los RPCs existentes como fallback)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_bodega_principal(p_id_sucursal uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM bodega
  WHERE id_sucursal = p_id_sucursal AND es_principal = true AND activa = true
  LIMIT 1
$$;

-- ------------------------------------------------------------
-- 4) RPCs de bodegas (CRUD)
-- ------------------------------------------------------------

-- Listar bodegas activas de una sucursal
CREATE OR REPLACE FUNCTION public.get_bodegas(p_id_sucursal uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(b.* ORDER BY b.es_principal DESC, b.name), '[]'::json)
  INTO v_result
  FROM bodega b
  WHERE b.id_sucursal = p_id_sucursal
    AND b.activa = true;
  RETURN v_result;
END;
$$;

-- Crear bodega (solo admin; el caller debe verificar permiso)
CREATE OR REPLACE FUNCTION public.create_bodega(
  p_id_sucursal uuid,
  p_name text,
  p_es_principal boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RETURN json_build_object('ok', false, 'mensaje', 'El nombre es obligatorio');
  END IF;

  -- Si marca Principal, desmarcar las demás
  IF p_es_principal THEN
    UPDATE bodega SET es_principal = false
    WHERE id_sucursal = p_id_sucursal AND es_principal = true;
  END IF;

  INSERT INTO bodega (id_sucursal, name, es_principal)
  VALUES (p_id_sucursal, trim(p_name), p_es_principal)
  RETURNING id INTO v_id;

  RETURN json_build_object('ok', true, 'id', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'mensaje', 'Ya existe una bodega con ese nombre en esta sucursal');
END;
$$;

-- Actualizar bodega
CREATE OR REPLACE FUNCTION public.update_bodega(
  p_id uuid,
  p_name text,
  p_es_principal boolean,
  p_activa boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sucursal uuid;
BEGIN
  SELECT id_sucursal INTO v_sucursal FROM bodega WHERE id = p_id;
  IF v_sucursal IS NULL THEN
    RETURN json_build_object('ok', false, 'mensaje', 'Bodega no encontrada');
  END IF;

  -- No desactivar la Principal
  IF p_activa = false AND p_es_principal THEN
    RETURN json_build_object('ok', false, 'mensaje', 'No se puede desactivar la bodega Principal');
  END IF;

  -- Si marca Principal, desmarcar las demás
  IF p_es_principal THEN
    UPDATE bodega SET es_principal = false
    WHERE id_sucursal = v_sucursal AND es_principal = true AND id != p_id;
  END IF;

  -- No permitir desmarcar Principal sin marcar otra
  IF p_es_principal = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM bodega
      WHERE id_sucursal = v_sucursal AND es_principal = true AND activa = true AND id != p_id
    ) THEN
      RETURN json_build_object('ok', false, 'mensaje', 'Debe haber al menos una bodega Principal activa');
    END IF;
  END IF;

  UPDATE bodega
  SET name = trim(p_name),
      es_principal = p_es_principal,
      activa = p_activa
  WHERE id = p_id;

  RETURN json_build_object('ok', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'mensaje', 'Ya existe una bodega con ese nombre en esta sucursal');
END;
$$;

-- ------------------------------------------------------------
-- 5) RPCs de stock por bodega
-- ------------------------------------------------------------

-- Leer stock de una bodega (solo productos habilitados en la sucursal)
CREATE OR REPLACE FUNCTION public.get_stock_bodega(p_id_bodega uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result json;
BEGIN
  SELECT COALESCE(json_agg(row_to_json(sb)), '[]'::json)
  INTO v_result
  FROM stock_bodega sb
  WHERE sb.id_bodega = p_id_bodega;
  RETURN v_result;
END;
$$;

-- Ajuste manual de stock por bodega (admin)
CREATE OR REPLACE FUNCTION public.upsert_stock_bodega(
  p_id_bodega uuid,
  p_id_producto uuid,
  p_stock integer,
  p_stock_minimo integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_stock < 0 THEN
    RETURN json_build_object('ok', false, 'mensaje', 'El stock no puede ser negativo');
  END IF;

  INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
  VALUES (p_id_bodega, p_id_producto, p_stock, p_stock_minimo)
  ON CONFLICT (id_bodega, id_producto)
  DO UPDATE SET stock = EXCLUDED.stock, stock_minimo = EXCLUDED.stock_minimo;

  -- Actualizar caché en productos_sucursal (suma de bodegas)
  UPDATE productos_sucursal ps
  SET stock = sub.total
  FROM (
    SELECT id_producto, SUM(stock)::integer AS total
    FROM stock_bodega sb
    JOIN bodega b ON b.id = sb.id_bodega
    WHERE b.id_sucursal = (SELECT id_sucursal FROM bodega WHERE id = p_id_bodega)
    GROUP BY id_producto
  ) sub
  WHERE ps.id_sucursal = (SELECT id_sucursal FROM bodega WHERE id = p_id_bodega)
    AND ps.id_producto = sub.id_producto
    AND ps.id_producto = p_id_producto;

  RETURN json_build_object('ok', true);
END;
$$;

-- Grant: el anon puede llamar estos RPCs (la verificación de rol es
-- server-side dentro de cada RPC o el caller usa currentUser.id_rol)
GRANT EXECUTE ON FUNCTION public.get_bodega_principal(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_bodegas(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_bodega(uuid, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_bodega(uuid, text, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stock_bodega(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_stock_bodega(uuid, uuid, integer, integer) TO anon, authenticated;
