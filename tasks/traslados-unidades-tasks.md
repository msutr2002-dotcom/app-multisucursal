# Tasks: Traslados con unidades

Una tarea a la vez: mostrar cambios → verificación/aprobación → marcar `[x]`.

## Task 1: Spec
- [x] `specs/traslados-unidades.md` creada

## Task 2: SQL servidor (aplicado por usuario)
Bloque único para Supabase SQL Editor:

```sql
-- Detalle: unidad/factor por línea
ALTER TABLE detalle_traslado
  ADD COLUMN IF NOT EXISTS id_precio_producto uuid REFERENCES precio_producto(id),
  ADD COLUMN IF NOT EXISTS factor integer NOT NULL DEFAULT 1 CHECK (factor >= 1);

-- registrar_traslado: recibe id_precio_producto opcional por línea,
-- resuelve factor desde precio_producto (valida que pertenezca al producto),
-- valida stock ≥ cantidad × factor, descuenta cantidad × factor e inserta factor.
CREATE OR REPLACE FUNCTION registrar_traslado(
  p_id_sucursal_origen uuid,
  p_id_sucursal_destino uuid,
  p_id_usuario uuid,
  p_lineas jsonb
) RETURNS jsonb AS $$
DECLARE
  v_traslado uuid := gen_random_uuid();
  v_empresa_origen uuid; v_empresa_destino uuid;
  v_activo_o boolean; v_activo_d boolean;
  r jsonb; v_stock integer; v_factor integer; v_id_precio uuid; v_base integer;
BEGIN
  IF p_id_sucursal_origen = p_id_sucursal_destino THEN
    RAISE EXCEPTION 'El origen y el destino deben ser distintos';
  END IF;
  SELECT id_empresa, activo INTO v_empresa_origen, v_activo_o
    FROM sucursal WHERE id = p_id_sucursal_origen FOR UPDATE;
  SELECT id_empresa, activo INTO v_empresa_destino, v_activo_d
    FROM sucursal WHERE id = p_id_sucursal_destino FOR UPDATE;
  IF v_empresa_origen IS NULL OR v_empresa_destino IS NULL THEN
    RAISE EXCEPTION 'Sucursal origen o destino inexistente';
  END IF;
  IF v_empresa_origen <> v_empresa_destino THEN
    RAISE EXCEPTION 'Los traslados deben ser entre sucursales de la misma empresa';
  END IF;
  IF v_activo_o IS NOT TRUE OR v_activo_d IS NOT TRUE THEN
    RAISE EXCEPTION 'Las sucursales deben estar activas';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El traslado debe incluir al menos un producto';
  END IF;

  INSERT INTO traslados (id, id_sucursal_origen, id_sucursal_destino, id_usuario, fecha, estado)
  VALUES (v_traslado, p_id_sucursal_origen, p_id_sucursal_destino, p_id_usuario, now(), 'enviado');

  FOR r IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF r->>'id_producto' IS NULL OR COALESCE((r->>'cantidad')::int, 0) <= 0 THEN
      RAISE EXCEPTION 'Cada línea requiere producto y cantidad positiva';
    END IF;
    IF EXISTS (SELECT 1 FROM detalle_traslado d
               WHERE d.id_traslado = v_traslado AND d.id_producto = (r->>'id_producto')::uuid) THEN
      RAISE EXCEPTION 'Producto duplicado en el traslado';
    END IF;

    v_id_precio := (r->>'id_precio_producto')::uuid;
    IF v_id_precio IS NOT NULL THEN
      SELECT factor INTO v_factor FROM precio_producto
        WHERE id = v_id_precio AND id_producto = (r->>'id_producto')::uuid;
      IF v_factor IS NULL THEN
        RAISE EXCEPTION 'Presentación inválida para el producto';
      END IF;
    ELSE
      v_factor := 1;
    END IF;
    v_base := (r->>'cantidad')::int * v_factor;

    SELECT stock INTO v_stock FROM productos_sucursal
      WHERE id_sucursal = p_id_sucursal_origen AND id_producto = (r->>'id_producto')::uuid
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto sin stock registrado en la sucursal origen';
    END IF;
    IF v_stock < v_base THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto (se necesitan % unidades base)', v_base;
    END IF;
    UPDATE productos_sucursal SET stock = stock - v_base
      WHERE id_sucursal = p_id_sucursal_origen AND id_producto = (r->>'id_producto')::uuid;

    INSERT INTO detalle_traslado (id, id_traslado, id_producto, cantidad_enviada, id_precio_producto, factor)
    VALUES (gen_random_uuid(), v_traslado, (r->>'id_producto')::uuid,
            (r->>'cantidad')::int, v_id_precio, v_factor);
  END LOOP;

  RETURN jsonb_build_object('id_traslado', v_traslado, 'estado', 'enviado');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- aceptar_traslado: matemática × factor del detalle (sin cambio de firma)
CREATE OR REPLACE FUNCTION aceptar_traslado(
  p_id_traslado uuid,
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_lineas jsonb
) RETURNS jsonb AS $$
DECLARE
  t RECORD; d RECORD; v_recibida int; v_devuelta int;
BEGIN
  SELECT * INTO t FROM traslados
    WHERE id = p_id_traslado AND id_sucursal_destino = p_id_sucursal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traslado no encontrado o no pertenece a esta sucursal'; END IF;
  IF t.estado NOT IN ('enviado', 'recibido_parcial') THEN
    RAISE EXCEPTION 'El traslado no está en estado aceptable';
  END IF;

  FOR d IN SELECT * FROM detalle_traslado WHERE id_traslado = p_id_traslado LOOP
    SELECT COALESCE((l->>'cantidad_recibida')::int, 0) INTO v_recibida
      FROM jsonb_array_elements(p_lineas) l
     WHERE (l->>'id_producto')::uuid = d.id_producto;
    v_recibida := COALESCE(v_recibida, 0);
    IF v_recibida < 0 OR v_recibida > d.cantidad_enviada THEN
      RAISE EXCEPTION 'La cantidad recibida debe estar entre 0 y la enviada';
    END IF;

    UPDATE detalle_traslado SET cantidad_recibida = v_recibida
      WHERE id = d.id;

    IF v_recibida > 0 THEN
      UPDATE productos_sucursal SET stock = stock + (v_recibida * d.factor)
        WHERE id_sucursal = p_id_sucursal AND id_producto = d.id_producto;
    END IF;
    v_devuelta := d.cantidad_enviada - v_recibida;
    IF v_devuelta > 0 THEN
      UPDATE productos_sucursal SET stock = stock + (v_devuelta * d.factor)
        WHERE id_sucursal = t.id_sucursal_origen AND id_producto = d.id_producto;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM detalle_traslado
             WHERE id_traslado = p_id_traslado AND cantidad_recibida < cantidad_enviada) THEN
    UPDATE traslados SET estado = 'recibido_parcial', id_usuario = p_id_usuario, fecha_recepcion = now()
      WHERE id = p_id_traslado;
    RETURN jsonb_build_object('id_traslado', p_id_traslado, 'estado', 'recibido_parcial');
  END IF;
  UPDATE traslados SET estado = 'recibido', id_usuario = p_id_usuario, fecha_recepcion = now()
    WHERE id = p_id_traslado;
  RETURN jsonb_build_object('id_traslado', p_id_traslado, 'estado', 'recibido');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- anular_traslado: recupera cantidad_enviada × factor
CREATE OR REPLACE FUNCTION anular_traslado(
  p_id_traslado uuid,
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_motivo text
) RETURNS jsonb AS $$
DECLARE
  t RECORD; d RECORD;
BEGIN
  SELECT * INTO t FROM traslados
    WHERE id = p_id_traslado AND id_sucursal_origen = p_id_sucursal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traslado no encontrado o no pertenece a esta sucursal'; END IF;
  IF t.estado NOT IN ('enviado', 'recibido_parcial') THEN
    RAISE EXCEPTION 'Solo se pueden anular traslados enviados o parciales';
  END IF;
  FOR d IN SELECT * FROM detalle_traslado WHERE id_traslado = p_id_traslado LOOP
    UPDATE productos_sucursal SET stock = stock + (d.cantidad_enviada * d.factor)
      WHERE id_sucursal = t.id_sucursal_origen AND id_producto = d.id_producto;
    UPDATE detalle_traslado SET cantidad_recibida = 0 WHERE id = d.id;
  END LOOP;
  UPDATE traslados SET estado = 'anulado', id_usuario = p_id_usuario,
    fecha_anulacion = now(), motivo_anulacion = p_motivo WHERE id = p_id_traslado;
  RETURN jsonb_build_object('id_traslado', p_id_traslado, 'estado', 'anulado');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- get_traslados: retorna factor/unidad por línea (id_precio_producto y factor ya en detalle)
-- (el usuario debe reemplazar get_traslados con la versión que en el SELECT de lineas agrega:
--    d.id_precio_producto, d.factor, u.name AS unidad
--  haciendo LEFT JOIN detalle_traslado d ... LEFT JOIN precio_producto pp ON pp.id = d.id_precio_producto
--  LEFT JOIN unidades u ON u.id = pp.id_unidad_venta
--  manteniendo el resto de la función idéntica)

NOTIFY pgrst, 'reload schema';
```

- [x] SQL aplicado y verificado (usuario confirma 2026-10-10; fix sintaxis `SET search_path = 'public'`)

### Task 2b: SQL complementario (pendiente de aplicación por usuario)
Hallazgo de Task 5: el SQL original rechaza **mismo producto en dos unidades** ("Producto duplicado" por `id_producto` solo) y la aceptación emparejaba por `id_producto` solo (dos líneas del mismo producto recibirían el mismo `cantidad_recibida`). Bloque a aplicar:

```sql
-- registrar_traslado: duplicados por (producto, unidad); el check de stock ya
-- es acumulado dentro del bucle (UPDATE en cada iteración con FOR UPDATE).
CREATE OR REPLACE FUNCTION registrar_traslado(
  p_id_sucursal_origen uuid,
  p_id_sucursal_destino uuid,
  p_id_usuario uuid,
  p_lineas jsonb
) RETURNS jsonb AS $$
DECLARE
  v_traslado uuid := gen_random_uuid();
  v_empresa_origen uuid; v_empresa_destino uuid;
  v_activo_o boolean; v_activo_d boolean;
  r jsonb; v_stock integer; v_factor integer; v_id_precio uuid; v_base integer;
BEGIN
  IF p_id_sucursal_origen = p_id_sucursal_destino THEN
    RAISE EXCEPTION 'El origen y el destino deben ser distintos';
  END IF;
  SELECT id_empresa, activo INTO v_empresa_origen, v_activo_o
    FROM sucursal WHERE id = p_id_sucursal_origen FOR UPDATE;
  SELECT id_empresa, activo INTO v_empresa_destino, v_activo_d
    FROM sucursal WHERE id = p_id_sucursal_destino FOR UPDATE;
  IF v_empresa_origen IS NULL OR v_empresa_destino IS NULL THEN
    RAISE EXCEPTION 'Sucursal origen o destino inexistente';
  END IF;
  IF v_empresa_origen <> v_empresa_destino THEN
    RAISE EXCEPTION 'Los traslados deben ser entre sucursales de la misma empresa';
  END IF;
  IF v_activo_o IS NOT TRUE OR v_activo_d IS NOT TRUE THEN
    RAISE EXCEPTION 'Las sucursales deben estar activas';
  END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'El traslado debe incluir al menos un producto';
  END IF;

  INSERT INTO traslados (id, id_sucursal_origen, id_sucursal_destino, id_usuario, fecha, estado)
  VALUES (v_traslado, p_id_sucursal_origen, p_id_sucursal_destino, p_id_usuario, now(), 'enviado');

  FOR r IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    IF r->>'id_producto' IS NULL OR COALESCE((r->>'cantidad')::int, 0) <= 0 THEN
      RAISE EXCEPTION 'Cada línea requiere producto y cantidad positiva';
    END IF;

    v_id_precio := (r->>'id_precio_producto')::uuid;
    IF v_id_precio IS NOT NULL THEN
      SELECT factor INTO v_factor FROM precio_producto
        WHERE id = v_id_precio AND id_producto = (r->>'id_producto')::uuid;
      IF v_factor IS NULL THEN
        RAISE EXCEPTION 'Presentación inválida para el producto';
      END IF;
    ELSE
      v_factor := 1;
    END IF;

    -- duplicados por (producto, unidad): 2 CAJA + 3 UNIDAD del mismo producto
    -- son DOS líneas válidas; dos CAJAs en el mismo traslado no.
    IF EXISTS (SELECT 1 FROM detalle_traslado d
               WHERE d.id_traslado = v_traslado
                 AND d.id_producto = (r->>'id_producto')::uuid
                 AND d.id_precio_producto IS NOT DISTINCT FROM v_id_precio) THEN
      RAISE EXCEPTION 'Producto duplicado en el mismo producto y unidad';
    END IF;

    v_base := (r->>'cantidad')::int * v_factor;

    SELECT stock INTO v_stock FROM productos_sucursal
      WHERE id_sucursal = p_id_sucursal_origen AND id_producto = (r->>'id_producto')::uuid
      FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto sin stock registrado en la sucursal origen';
    END IF;
    IF v_stock < v_base THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto (se necesitan % unidades base)', v_base;
    END IF;
    UPDATE productos_sucursal SET stock = stock - v_base
      WHERE id_sucursal = p_id_sucursal_origen AND id_producto = (r->>'id_producto')::uuid;

    INSERT INTO detalle_traslado (id, id_traslado, id_producto, cantidad_enviada, id_precio_producto, factor)
    VALUES (gen_random_uuid(), v_traslado, (r->>'id_producto')::uuid,
            (r->>'cantidad')::int, v_id_precio, v_factor);
  END LOOP;

  RETURN jsonb_build_object('id_traslado', v_traslado, 'estado', 'enviado');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

-- aceptar_traslado: empareja p_lineas por (id_producto, id_precio_producto)
CREATE OR REPLACE FUNCTION aceptar_traslado(
  p_id_traslado uuid,
  p_id_sucursal uuid,
  p_id_usuario uuid,
  p_lineas jsonb
) RETURNS jsonb AS $$
DECLARE
  t RECORD; d RECORD; v_recibida int; v_devuelta int;
BEGIN
  SELECT * INTO t FROM traslados
    WHERE id = p_id_traslado AND id_sucursal_destino = p_id_sucursal FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traslado no encontrado o no pertenece a esta sucursal'; END IF;
  IF t.estado NOT IN ('enviado', 'recibido_parcial') THEN
    RAISE EXCEPTION 'El traslado no está en estado aceptable';
  END IF;

  FOR d IN SELECT * FROM detalle_traslado WHERE id_traslado = p_id_traslado LOOP
    SELECT COALESCE((l->>'cantidad_recibida')::int, 0) INTO v_recibida
      FROM jsonb_array_elements(p_lineas) l
     WHERE (l->>'id_producto')::uuid = d.id_producto
       AND (l->>'id_precio_producto')::uuid IS NOT DISTINCT FROM d.id_precio_producto;
    v_recibida := COALESCE(v_recibida, 0);
    IF v_recibida < 0 OR v_recibida > d.cantidad_enviada THEN
      RAISE EXCEPTION 'La cantidad recibida debe estar entre 0 y la enviada';
    END IF;

    UPDATE detalle_traslado SET cantidad_recibida = v_recibida
      WHERE id = d.id;

    IF v_recibida > 0 THEN
      UPDATE productos_sucursal SET stock = stock + (v_recibida * d.factor)
        WHERE id_sucursal = p_id_sucursal AND id_producto = d.id_producto;
    END IF;
    v_devuelta := d.cantidad_enviada - v_recibida;
    IF v_devuelta > 0 THEN
      UPDATE productos_sucursal SET stock = stock + (v_devuelta * d.factor)
        WHERE id_sucursal = t.id_sucursal_origen AND id_producto = d.id_producto;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM detalle_traslado
             WHERE id_traslado = p_id_traslado AND cantidad_recibida < cantidad_enviada) THEN
    UPDATE traslados SET estado = 'recibido_parcial', id_usuario = p_id_usuario, fecha_recepcion = now()
      WHERE id = p_id_traslado;
    RETURN jsonb_build_object('id_traslado', p_id_traslado, 'estado', 'recibido_parcial');
  END IF;
  UPDATE traslados SET estado = 'recibido', id_usuario = p_id_usuario, fecha_recepcion = now()
    WHERE id = p_id_traslado;
  RETURN jsonb_build_object('id_traslado', p_id_traslado, 'estado', 'recibido');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public';

NOTIFY pgrst, 'reload schema';
```

- [ ] SQL 2b aplicado y verificado

## Task 3: `trasladoService.js` con factor
- `registrarTrasladoLocal`: recibe líneas `{id_producto, cantidad, id_precio_producto?}`; resuelve factor desde el catálogo local (tiers del producto, misma fuente que el POS); valida `stock ≥ cantidad × factor`; guarda `id_precio_producto` + `factor` en `detalle_traslado`; descuenta `× factor`; evento cola con `id_precio_producto` por línea (sin factor — el servidor lo resuelve).
- `aceptarTrasladoLocal` / `anularTrasladoLocal`: matemática `× factor` leído del detalle local.
- `listarTrasladosLocal` / helpers de unidades: total = Σ cantidad × factor.
- [x] Código + lint + build OK (entregado y aprobado 2026-10-10)
- [x] Verificación (offline: descuento 2 Cajas = 24 base) — aprobada con la aprobación de Task 3

## Task 4: UI alta de traslado (selector de unidad)
- [x] `TrasladosPage.jsx`: al elegir producto, cargar sus tiers del catálogo local; selector de unidad por línea (solo si hay presentaciones con factor > 1); cantidad en la unidad; máximo `floor((stock − baseUsada) / factor)`; label de equivalencia y "Máx: N Cajas"; Total en unidades base; línea lista muestra `2 Caja` + columna "Unidades base"; merge de líneas por (producto, unidad).
- [x] Código + lint + build OK (entregado 2026-10-10, pendiente verificación manual)
- [ ] Verificación manual

## Task 5: UI aceptación de traslado
- Modal de recepción: líneas muestran unidad y factor; input recibida en esa unidad; validación 0 ≤ recibida ≤ enviada; resultado muestra unidades base sumadas.
- Emparejamiento por (producto, unidad) — `claveLinea` exportada de `trasladoService` y usada en UI y servicio; mismo producto en dos unidades son dos filas independientes (fix del bug de match por `id_producto` solo, local y servidor).
- [x] Código + lint + build OK (entregado 2026-10-10; requiere SQL 2b aplicado + verificación manual)

## Task 6: E2E y cierre
- [ ] E2E Selenium: registrar 2 Cajas → stock origen −24 → aceptar 1 Caja → destino +12, origen +12 parcial; sin tiers funciona; offline con factor. — script `test-unidades-traslados.js` entregado 2026-10-12 (en Temp). Flujo **sin-tiers verificado OK** (stock 9→6, factor 1 intacto, selector de unidad ausente). **Bloqueado en usuario:** (1) la BD de test (Ferromax/alex) no tiene NINGÚN producto con tier factor>1 — crear un tier de prueba vía `upsert_precio_producto` (p_id_unidad_venta + p_factor=12) o el E2E lo crea automáticamente cuando exista; (2) la aceptación parcial requiere el SQL pendiente (`pg_get_functiondef('aceptar_traslado')`).
- [x] Actualizar `memory.md` y este checklist final

---

## Siguiente módulo (roadmap): multibodega — BODEGAS DENTRO DE SUCURSAL
Definido por el desarrollador 2026-10-10: cada sucursal tendrá varias bodegas (principal, trasera…) con stock dividido; POS vende desde una bodega elegida o del agregado. **Spec aparte** (`specs/multibodega.md`) a escribir al cerrar este módulo; tocará: tabla `bodega`, `stock_bodega`, migración de `productos_sucursal.stock` a bodega principal, POS, inventario, compras, traslados (origen/destino con bodega).
