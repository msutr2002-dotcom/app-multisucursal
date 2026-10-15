-- ============================================================
-- STOCK/BODEGA — FUENTE DE VERDAD (bloque de convergencia)
-- Idempotente. Ejecutar en SQL Editor de Supabase.
-- Spec: specs/stock-bodega-fuente-verdad.md
--
-- Problema que arregla:
--   El servidor NUNCA vuelve a escribir stock_bodega (solo lo hizo la
--   migración de multibodega-bloque1 y lo hace upsert_stock_bodega).
--   Todos los RPC de stock (registrar_venta, registrar_compra,
--   registrar_entrada, anular_compra…) mantienen SOLO productos_sucursal.
--   Resultado: stock_bodega queda stale/0 → el POS no vende ("stock 0"),
--   el inventario muestra 0, y productos nuevos no entran a ninguna bodega.
--
-- Estrategia (sin reescribir los RPC, cuyas fuentes no están en el repo):
--   La bodega PRINCIPAL es el espejo de productos_sucursal. Todo cambio de
--   stock en productos_sucursal se refleja en stock_bodega de la Principal
--   vía trigger. Los RPC siguen escribiendo productos_sucursal → convergen.
--   Las bodegas NO principales siguen siendo delta local (spec D7).
--
-- Contenido:
--   1) asegurar_bodega_principal(idsucursal)   (helper idempotente)
--   2) Backfill: Principal + filas 0 + reconciliación de stock
--   3) Trigger espejo productos_sucursal -> stock_bodega (Principal)
--   4) Triggers de bootstrap (sucursal nueva / producto nuevo)
--   5) Redefinición de upsert_stock_bodega (solo Principal toca la caché)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Helper: asegura que la sucursal tenga bodega Principal activa.
--    Devuelve el id de la Principal (crea/marca si hace falta).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.asegurar_bodega_principal(p_id_sucursal uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_id_sucursal IS NULL THEN
    RETURN NULL;
  END IF;

  -- ¿Ya hay una Principal?
  SELECT id INTO v_id
  FROM bodega
  WHERE id_sucursal = p_id_sucursal AND es_principal = true
  ORDER BY activa DESC
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- ¿Hay alguna bodega pero ninguna marcada Principal? Marcar la primera.
  SELECT id INTO v_id
  FROM bodega
  WHERE id_sucursal = p_id_sucursal
  ORDER BY name
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE bodega SET es_principal = true, activa = true WHERE id = v_id;
    RETURN v_id;
  END IF;

  -- Sucursal sin bodegas: crear "Principal".
  INSERT INTO bodega (id_sucursal, name, es_principal)
  VALUES (p_id_sucursal, 'Principal', true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 2) Backfill idempotente (reconciliador)
--    a) Cada sucursal recibe su Principal.
--    b) Cada producto de la empresa tiene fila en productos_sucursal (0)
--       si le faltaba → así compras/traslados lo encuentran.
--    c) stock_bodega(Principal) se reconcilia con productos_sucursal
--       (DO UPDATE: pisa ceros obsoletos con el valor real).
--    NOTA: asume productos_sucursal.id uuid DEFAULT gen_random_uuid().
--          Si no tuviera default, añadir gen_random_uuid() al INSERT.
-- ------------------------------------------------------------
DO $$
DECLARE
  r_suc RECORD;
  v_bodega uuid;
BEGIN
  FOR r_suc IN SELECT id, id_empresa FROM sucursal LOOP
    v_bodega := asegurar_bodega_principal(r_suc.id);

    -- 2b) Filas de stock faltantes (0) para cada producto de la empresa
    INSERT INTO productos_sucursal (id_sucursal, id_producto, stock, stock_minimo)
    SELECT r_suc.id, p.id, 0, 0
    FROM productos p
    WHERE p.id_empresa = r_suc.id_empresa
      AND NOT EXISTS (
        SELECT 1 FROM productos_sucursal ps
        WHERE ps.id_sucursal = r_suc.id AND ps.id_producto = p.id
      );

    -- 2c) Reconciliar la caché (productos_sucursal) con la Principal.
    --     productos_sucursal no tiene UNIQUE(id_sucursal,id_producto) y puede
    --     tener filas duplicadas → agrupamos por producto (MAX para no perder
    --     el stock real frente a un duplicado en 0).
    INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
    SELECT v_bodega, ps.id_producto, MAX(ps.stock), MAX(ps.stock_minimo)
    FROM productos_sucursal ps
    WHERE ps.id_sucursal = r_suc.id
    GROUP BY ps.id_producto
    ON CONFLICT (id_bodega, id_producto)
    DO UPDATE SET stock = EXCLUDED.stock, stock_minimo = EXCLUDED.stock_minimo;

    RAISE NOTICE 'Reconciliada sucursal % → bodega Principal %', r_suc.id, v_bodega;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3) Trigger espejo: productos_sucursal (caché) → stock_bodega (Principal)
--    Cubre a TODOS los RPC de stock existentes sin tocarlos.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_mirror_stock_bodega()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bodega uuid;
BEGIN
  v_bodega := asegurar_bodega_principal(NEW.id_sucursal);
  IF v_bodega IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
  VALUES (v_bodega, NEW.id_producto, COALESCE(NEW.stock, 0), COALESCE(NEW.stock_minimo, 0))
  ON CONFLICT (id_bodega, id_producto)
  DO UPDATE SET stock = EXCLUDED.stock, stock_minimo = EXCLUDED.stock_minimo;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_productos_sucursal_mirror ON productos_sucursal;
CREATE TRIGGER trg_productos_sucursal_mirror
AFTER INSERT OR UPDATE ON productos_sucursal
FOR EACH ROW EXECUTE FUNCTION public.trg_mirror_stock_bodega();

-- ------------------------------------------------------------
-- 4a) Bootstrap al crear sucursal: Principal + filas 0 en todas las bodegas
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sucursal_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bodega uuid;
BEGIN
  v_bodega := asegurar_bodega_principal(NEW.id);

  INSERT INTO productos_sucursal (id_sucursal, id_producto, stock, stock_minimo)
  SELECT NEW.id, p.id, 0, 0
  FROM productos p
  WHERE p.id_empresa = NEW.id_empresa
    AND NOT EXISTS (
      SELECT 1 FROM productos_sucursal ps
      WHERE ps.id_sucursal = NEW.id AND ps.id_producto = p.id
    );

  -- El trigger espejo ya crea stock_bodega al insertar productos_sucursal;
  -- esto es solo cinturón-y-tirantes para filas preexistentes (agrupado por
  -- producto porque productos_sucursal admite duplicados).
  INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
  SELECT v_bodega, ps.id_producto, MAX(ps.stock), MAX(ps.stock_minimo)
  FROM productos_sucursal ps
  WHERE ps.id_sucursal = NEW.id
  GROUP BY ps.id_producto
  ON CONFLICT (id_bodega, id_producto) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sucursal_bootstrap ON sucursal;
CREATE TRIGGER trg_sucursal_bootstrap
AFTER INSERT ON sucursal
FOR EACH ROW EXECUTE FUNCTION public.trg_sucursal_bootstrap();

-- ------------------------------------------------------------
-- 4b) Bootstrap al crear producto: filas 0 en todas las sucursales de la empresa
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_producto_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r_suc RECORD;
  v_bodega uuid;
BEGIN
  FOR r_suc IN SELECT id FROM sucursal WHERE id_empresa = NEW.id_empresa LOOP
    v_bodega := asegurar_bodega_principal(r_suc.id);

    INSERT INTO productos_sucursal (id_sucursal, id_producto, stock, stock_minimo)
    SELECT r_suc.id, NEW.id, 0, 0
    WHERE NOT EXISTS (
      SELECT 1 FROM productos_sucursal ps
      WHERE ps.id_sucursal = r_suc.id AND ps.id_producto = NEW.id
    );

    INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
    VALUES (v_bodega, NEW.id, 0, 0)
    ON CONFLICT (id_bodega, id_producto) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_producto_bootstrap ON productos;
CREATE TRIGGER trg_producto_bootstrap
AFTER INSERT ON productos
FOR EACH ROW EXECUTE FUNCTION public.trg_producto_bootstrap();

-- ------------------------------------------------------------
-- 5) Redefinición de upsert_stock_bodega (spec D5)
--    Antes: productos_sucursal = SUMA de todas las bodegas (desincroniza).
--    Ahora: productos_sucursal es la caché de la PRINCIPAL. Solo se toca
--           la caché cuando la bodega editada es la Principal; el trigger
--           espejo mantiene el resto coherente.
-- ------------------------------------------------------------
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
DECLARE
  v_es_principal boolean;
  v_id_sucursal uuid;
BEGIN
  IF p_stock < 0 THEN
    RETURN json_build_object('ok', false, 'mensaje', 'El stock no puede ser negativo');
  END IF;

  SELECT b.es_principal, b.id_sucursal
  INTO v_es_principal, v_id_sucursal
  FROM bodega b
  WHERE b.id = p_id_bodega;

  IF v_id_sucursal IS NULL THEN
    RETURN json_build_object('ok', false, 'mensaje', 'Bodega no encontrada');
  END IF;

  INSERT INTO stock_bodega (id_bodega, id_producto, stock, stock_minimo)
  VALUES (p_id_bodega, p_id_producto, p_stock, p_stock_minimo)
  ON CONFLICT (id_bodega, id_producto)
  DO UPDATE SET stock = EXCLUDED.stock, stock_minimo = EXCLUDED.stock_minimo;

  -- Caché de sucursal = Principal (no la suma). El trigger espejo hará
  -- que stock_bodega(Principal) quede en p_stock.
  IF v_es_principal THEN
    UPDATE productos_sucursal
       SET stock = p_stock, stock_minimo = p_stock_minimo
     WHERE id_sucursal = v_id_sucursal AND id_producto = p_id_producto;

    IF NOT FOUND THEN
      INSERT INTO productos_sucursal (id_sucursal, id_producto, stock, stock_minimo)
      VALUES (v_id_sucursal, p_id_producto, p_stock, p_stock_minimo);
    END IF;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------
-- 6) Recargar el esquema de PostgREST
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
