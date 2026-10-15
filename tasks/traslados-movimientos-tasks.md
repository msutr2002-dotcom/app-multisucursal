# Tasks: Módulo de Traslados y Movimientos

> Spec asociada: `specs/traslados-movimientos.md`. Una tarea activa a la vez; marcar `[x]` solo tras la verificación del desarrollador.

- [x] **Task 1: Sondeo (previo, decide el SQL) — REALIZADO 2026-10-05 (aprobado por el desarrollador)**
  - **Sondeo ejecutado 2026-10-05 por el agente (PostgREST con anon key, solo lectura):**
    - **Tablas candidatas NO existen (404 `PGRST205`):** `traslado`, `traslados`, `traspaso`, `traspasos`, `movimiento`, `movimientos`, `movimientos_inventario` → se crean **nuevas** (`CREATE TABLE`), no hay ALTERs.
    - **RPCs NO existen (404 `PGRST202`):** `registrar_traslado`, `get_traslados`, `aceptar_traslado`, `anular_traslado` → nombres libres.
    - **`sucursal` (REST, 2026-10-05):** `id, id_empresa, name, address, tel, activo`; anon la lee (3 filas / 2 empresas) → selector de destino = misma `id_empresa` del dispositivo + `activo = true` + `id !=` mi sucursal (filtro en cliente **y** validación en servidor: el anon ve sucursales de otras empresas).
    - **Patrón SQL a copiar:** el bloque **ya aplicado** de `tasks/compras-entradas-tasks.md` Task 1b (líneas 57–469: `registrar_compra`, `get_compras`, `registrar_entrada`, `get_entradas`, `anular_compra`, grants) — no hace falta `pg_get_functiondef` ni query de grants (queries 3–4 del plan original: innecesarias, el SQL completo vive en el repo).
    - Lección aplicada desde el diseño: los CHECK (`estado`, `cantidad_recibida`, `origen <> destino`) se definen en el mismo `CREATE TABLE` (gap del constraint de compras).
  - **Criterio:** resultados documentados aquí; confirmación del desarrollador antes de marcar `[x]`.

- [x] **Task 1b: SQL definitivo (2 CREATE TABLE + 4 RPCs + grants) — APLICADO Y VERIFICADO 2026-10-05**
  - **SQL entregado 2026-10-05.** Bloque único re-ejecutable para el SQL editor de Supabase (también está en el mensaje de entrega al desarrollador):
  - ```sql
    -- ============================================================
    -- MÓDULO TRASLADOS Y MOVIMIENTOS — SQL definitivo (Task 1b)
    -- Aplicar en el SQL editor de Supabase. Re-ejecutable.
    -- ============================================================

    -- ---------- 1) Tablas nuevas ----------
    CREATE TABLE IF NOT EXISTS traslados (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_sucursal_origen uuid NOT NULL REFERENCES sucursal(id),
      id_sucursal_destino uuid NOT NULL REFERENCES sucursal(id),
      id_usuario uuid NOT NULL REFERENCES users(id),
      fecha timestamptz NOT NULL DEFAULT now(),
      estado text NOT NULL DEFAULT 'enviado'
        CHECK (estado IN ('enviado','recibido','recibido_parcial','anulado')),
      motivo_anulacion text,
      id_usuario_anula uuid,
      id_usuario_receptor uuid,
      fecha_recepcion timestamptz,
      CONSTRAINT traslados_sucursales_distintas_check CHECK (id_sucursal_origen <> id_sucursal_destino)
    );

    CREATE TABLE IF NOT EXISTS detalle_traslado (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      id_traslado uuid NOT NULL REFERENCES traslados(id) ON DELETE CASCADE,
      id_producto uuid NOT NULL REFERENCES productos(id),
      cantidad_enviada integer NOT NULL CHECK (cantidad_enviada > 0),
      cantidad_recibida integer CHECK (cantidad_recibida >= 0)
    );

    CREATE INDEX IF NOT EXISTS idx_traslados_destino_estado ON traslados(id_sucursal_destino, estado);
    CREATE INDEX IF NOT EXISTS idx_traslados_origen_fecha ON traslados(id_sucursal_origen, fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_traslados_fecha ON traslados(fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_detalle_traslado_traslado ON detalle_traslado(id_traslado);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_detalle_traslado_producto ON detalle_traslado(id_traslado, id_producto);

    -- RLS sin policies: acceso solo vía RPC SECURITY DEFINER (criterio de compras)
    ALTER TABLE traslados ENABLE ROW LEVEL SECURITY;
    ALTER TABLE detalle_traslado ENABLE ROW LEVEL SECURITY;

    -- ---------- 2) registrar_traslado: cabecera + detalle + descuento en origen ----------
    CREATE OR REPLACE FUNCTION public.registrar_traslado(
      p_id_sucursal_origen uuid,
      p_id_sucursal_destino uuid,
      p_id_usuario uuid,
      p_lineas jsonb
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_id_traslado uuid := gen_random_uuid();
      v_empresa_origen uuid;
      v_empresa_destino uuid;
      v_item record;
      v_stock integer;
    BEGIN
      IF p_id_sucursal_origen IS NULL OR p_id_sucursal_destino IS NULL OR p_id_usuario IS NULL THEN
        RAISE EXCEPTION 'sucursales y usuario son obligatorios';
      END IF;
      IF p_id_sucursal_origen = p_id_sucursal_destino THEN
        RAISE EXCEPTION 'la sucursal destino debe ser distinta a la de origen';
      END IF;
      IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN
        RAISE EXCEPTION 'el traslado debe incluir al menos un producto';
      END IF;
      IF (SELECT count(DISTINCT elem->>'id_producto') FROM jsonb_array_elements(p_lineas) AS t(elem))
         <> (SELECT count(*) FROM jsonb_array_elements(p_lineas) AS t(elem)) THEN
        RAISE EXCEPTION 'producto duplicado en el traslado';
      END IF;

      -- misma empresa y activos (el selector filtra en cliente; esto es la validación de servidor)
      SELECT id_empresa INTO v_empresa_origen FROM sucursal
       WHERE id = p_id_sucursal_origen AND activo IS DISTINCT FROM false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'sucursal origen no existe o está inactiva';
      END IF;
      SELECT id_empresa INTO v_empresa_destino FROM sucursal
       WHERE id = p_id_sucursal_destino AND activo IS DISTINCT FROM false;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'sucursal destino no existe o está inactiva';
      END IF;
      IF v_empresa_destino <> v_empresa_origen THEN
        RAISE EXCEPTION 'la sucursal destino debe pertenecer a la misma empresa';
      END IF;

      INSERT INTO traslados (id, id_sucursal_origen, id_sucursal_destino, id_usuario, fecha, estado)
      VALUES (v_id_traslado, p_id_sucursal_origen, p_id_sucursal_destino, p_id_usuario, now(), 'enviado');

      FOR v_item IN SELECT elem FROM jsonb_array_elements(p_lineas) AS t(elem) LOOP
        IF (v_item.elem->>'id_producto') IS NULL THEN
          RAISE EXCEPTION 'cada línea debe incluir id_producto';
        END IF;
        IF (v_item.elem->>'cantidad')::integer IS NULL OR (v_item.elem->>'cantidad')::integer <= 0 THEN
          RAISE EXCEPTION 'cantidad inválida: %', v_item.elem->>'cantidad';
        END IF;

        SELECT stock INTO v_stock
          FROM productos_sucursal
         WHERE id_sucursal = p_id_sucursal_origen
           AND id_producto = (v_item.elem->>'id_producto')::uuid
         FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'El producto % no está habilitado en la sucursal origen',
            v_item.elem->>'id_producto';
        END IF;
        IF v_stock < (v_item.elem->>'cantidad')::integer THEN
          RAISE EXCEPTION 'Stock insuficiente en la sucursal origen: el producto % solo tiene % unidades y se solicitan %',
            v_item.elem->>'id_producto', v_stock, v_item.elem->>'cantidad';
        END IF;

        UPDATE productos_sucursal
           SET stock = stock - (v_item.elem->>'cantidad')::integer
         WHERE id_sucursal = p_id_sucursal_origen
           AND id_producto = (v_item.elem->>'id_producto')::uuid;

        INSERT INTO detalle_traslado (id, id_traslado, id_producto, cantidad_enviada)
        VALUES (gen_random_uuid(), v_id_traslado, (v_item.elem->>'id_producto')::uuid,
                (v_item.elem->>'cantidad')::integer);
      END LOOP;

      RETURN json_build_object('id_traslado', v_id_traslado, 'estado', 'enviado');
    END;
    $$;

    -- ---------- 3) get_traslados: listado paginado enviados/recibidos con líneas ----------
    CREATE OR REPLACE FUNCTION public.get_traslados(
      p_id_sucursal uuid,
      p_direccion text,
      p_busqueda text DEFAULT NULL,
      p_limite integer DEFAULT 50,
      p_offset integer DEFAULT 0
    ) RETURNS json
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_resultado json;
    BEGIN
      IF p_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'p_id_sucursal es obligatorio';
      END IF;
      IF p_direccion IS NULL OR p_direccion NOT IN ('enviados','recibidos') THEN
        RAISE EXCEPTION 'p_direccion debe ser ''enviados'' o ''recibidos''';
      END IF;

      SELECT json_build_object(
        'traslados', COALESCE(json_agg(json_build_object(
          'id', x.id,
          'fecha', x.fecha,
          'estado', x.estado,
          'id_sucursal_origen', x.id_sucursal_origen,
          'origen', x.origen,
          'id_sucursal_destino', x.id_sucursal_destino,
          'destino', x.destino,
          'usuario', x.usuario,
          'fecha_recepcion', x.fecha_recepcion,
          'motivo_anulacion', x.motivo_anulacion,
          'lineas', x.lineas
        ) ORDER BY x.fecha DESC), '[]'),
        'total', COALESCE(MAX(x.total_registros), 0)
      )
      INTO v_resultado
      FROM (
        SELECT t.id, t.fecha, t.estado,
               t.id_sucursal_origen, so.name AS origen,
               t.id_sucursal_destino, sd.name AS destino,
               u.name AS usuario,
               t.fecha_recepcion, t.motivo_anulacion,
               (SELECT COALESCE(json_agg(json_build_object(
                  'id', d.id,
                  'id_producto', d.id_producto,
                  'producto', p.name,
                  'cantidad_enviada', d.cantidad_enviada,
                  'cantidad_recibida', d.cantidad_recibida
                ) ORDER BY p.name), '[]')
                  FROM detalle_traslado d
                  LEFT JOIN productos p ON p.id = d.id_producto
                 WHERE d.id_traslado = t.id) AS lineas,
               count(*) OVER() AS total_registros
          FROM traslados t
          LEFT JOIN sucursal so ON so.id = t.id_sucursal_origen
          LEFT JOIN sucursal sd ON sd.id = t.id_sucursal_destino
          LEFT JOIN users u ON u.id = t.id_usuario
         WHERE (CASE WHEN p_direccion = 'enviados'
                     THEN t.id_sucursal_origen = p_id_sucursal
                     ELSE t.id_sucursal_destino = p_id_sucursal END)
           AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
                so.name ILIKE '%' || p_busqueda || '%' OR
                sd.name ILIKE '%' || p_busqueda || '%' OR
                u.name ILIKE '%' || p_busqueda || '%' OR
                t.id::text ILIKE '%' || p_busqueda || '%')
         ORDER BY t.fecha DESC
         LIMIT p_limite OFFSET p_offset
      ) x;

      RETURN v_resultado;
    END;
    $$;

    -- ---------- 4) aceptar_traslado: verificación con cantidades reales ----------
    -- Todo lo enviado que NO se confirma como recibido queda en 0 (no llegó).
    CREATE OR REPLACE FUNCTION public.aceptar_traslado(
      p_id_traslado uuid,
      p_id_sucursal uuid,
      p_id_usuario uuid,
      p_lineas jsonb
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_traslado record;
      v_item record;
      v_d record;
      v_recibida integer;
      v_lineas integer := 0;
      v_faltantes integer := 0;
      v_estado text;
    BEGIN
      IF p_id_traslado IS NULL OR p_id_sucursal IS NULL OR p_id_usuario IS NULL THEN
        RAISE EXCEPTION 'traslado, sucursal y usuario son obligatorios';
      END IF;

      SELECT * INTO v_traslado FROM traslados WHERE id = p_id_traslado FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Traslado no encontrado';
      END IF;
      IF v_traslado.id_sucursal_destino <> p_id_sucursal THEN
        RAISE EXCEPTION 'Esta sucursal no es la destino del traslado';
      END IF;
      IF v_traslado.estado <> 'enviado' THEN
        RAISE EXCEPTION 'El traslado ya fue %', v_traslado.estado;
      END IF;

      -- toda línea enviada debe pertenecer al traslado
      FOR v_item IN SELECT elem FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb)) AS t(elem) LOOP
        IF NOT EXISTS (
          SELECT 1 FROM detalle_traslado
           WHERE id_traslado = p_id_traslado
             AND id_producto = (v_item.elem->>'id_producto')::uuid
        ) THEN
          RAISE EXCEPTION 'El producto % no pertenece al traslado', v_item.elem->>'id_producto';
        END IF;
      END LOOP;

      FOR v_d IN SELECT * FROM detalle_traslado
                  WHERE id_traslado = p_id_traslado
                  ORDER BY id FOR UPDATE LOOP
        v_recibida := 0;
        FOR v_item IN SELECT elem FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb)) AS t(elem) LOOP
          IF (v_item.elem->>'id_producto')::uuid = v_d.id_producto THEN
            v_recibida := COALESCE((v_item.elem->>'cantidad_recibida')::integer, 0);
            EXIT;
          END IF;
        END LOOP;

        IF v_recibida < 0 THEN
          RAISE EXCEPTION 'cantidad_recibida no puede ser negativa para el producto %', v_d.id_producto;
        END IF;
        IF v_recibida > v_d.cantidad_enviada THEN
          RAISE EXCEPTION 'La cantidad recibida (%) no puede superar la enviada (%) del producto %',
            v_recibida, v_d.cantidad_enviada, v_d.id_producto;
        END IF;

        UPDATE detalle_traslado SET cantidad_recibida = v_recibida WHERE id = v_d.id;

        -- stock destino: solo lo que llegó
        IF v_recibida > 0 THEN
          UPDATE productos_sucursal
             SET stock = stock + v_recibida
           WHERE id_sucursal = v_traslado.id_sucursal_destino
             AND id_producto = v_d.id_producto;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no está habilitado en la sucursal destino', v_d.id_producto;
          END IF;
        END IF;

        -- origen recupera lo que no llegó (si su fila ya no existe se omite, como en anular_compra)
        IF v_d.cantidad_enviada - v_recibida > 0 THEN
          UPDATE productos_sucursal
             SET stock = stock + (v_d.cantidad_enviada - v_recibida)
           WHERE id_sucursal = v_traslado.id_sucursal_origen
             AND id_producto = v_d.id_producto;
        END IF;

        v_lineas := v_lineas + 1;
        IF v_recibida < v_d.cantidad_enviada THEN
          v_faltantes := v_faltantes + 1;
        END IF;
      END LOOP;

      IF v_lineas = 0 THEN
        RAISE EXCEPTION 'El traslado no tiene líneas';
      END IF;

      v_estado := CASE WHEN v_faltantes = 0 THEN 'recibido' ELSE 'recibido_parcial' END;

      UPDATE traslados
         SET estado = v_estado,
             id_usuario_receptor = p_id_usuario,
             fecha_recepcion = now()
       WHERE id = p_id_traslado;

      RETURN json_build_object('id_traslado', p_id_traslado, 'estado', v_estado);
    END;
    $$;

    -- ---------- 5) anular_traslado: solo origen, solo 'enviado', revierte stock ----------
    CREATE OR REPLACE FUNCTION public.anular_traslado(
      p_id_traslado uuid,
      p_id_sucursal uuid,
      p_id_usuario uuid,
      p_motivo text DEFAULT NULL
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_traslado record;
      v_d record;
    BEGIN
      IF p_id_traslado IS NULL OR p_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'traslado y sucursal son obligatorios';
      END IF;

      SELECT * INTO v_traslado FROM traslados WHERE id = p_id_traslado FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Traslado no encontrado';
      END IF;
      IF v_traslado.id_sucursal_origen <> p_id_sucursal THEN
        RAISE EXCEPTION 'Solo la sucursal origen puede anular el traslado';
      END IF;
      IF v_traslado.estado = 'anulado' THEN
        RAISE EXCEPTION 'El traslado ya está anulado';
      END IF;
      IF v_traslado.estado <> 'enviado' THEN
        RAISE EXCEPTION 'El traslado ya fue % y no puede anularse', v_traslado.estado;
      END IF;

      FOR v_d IN SELECT id_producto, cantidad_enviada FROM detalle_traslado
                  WHERE id_traslado = p_id_traslado LOOP
        UPDATE productos_sucursal
           SET stock = stock + v_d.cantidad_enviada
         WHERE id_sucursal = v_traslado.id_sucursal_origen
           AND id_producto = v_d.id_producto;
      END LOOP;

      UPDATE traslados
         SET estado = 'anulado',
             motivo_anulacion = p_motivo,
             id_usuario_anula = p_id_usuario
       WHERE id = p_id_traslado;

      RETURN json_build_object('id_traslado', p_id_traslado, 'estado', 'anulado');
    END;
    $$;

    -- ---------- 6) Grants (anon + authenticated, patrón del repo) ----------
    GRANT EXECUTE ON FUNCTION public.registrar_traslado(uuid,uuid,uuid,jsonb) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_traslados(uuid,text,text,integer,integer) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.aceptar_traslado(uuid,uuid,uuid,jsonb) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.anular_traslado(uuid,uuid,uuid,text) TO anon, authenticated;

    -- refresca la caché de PostgREST (lección PGRST202 de compras)
    NOTIFY pgrst, 'reload schema';
    ```
  - **Verificación (la hace el agente tras la aplicación del usuario):** RPCs por REST con cuerpo completo — `get_traslados` → `200 {"traslados":[],"total":0}`; `registrar_traslado` → `P0001 'la sucursal destino debe ser distinta...'` (validación sin escritura); `aceptar_traslado`/`anular_traslado` → `P0001 'Traslado no encontrado'`. REST directo a `traslados` → debe ser 401/403 o vacío por RLS.
  - **Resultado de la verificación (2026-10-05) — 4/4 RPCs OK con anon key:**
    - `registrar_traslado` → `P0001` en 4 validaciones: origen=destino *"la sucursal destino debe ser distinta a la de origen"*, `p_lineas: []` *"el traslado debe incluir al menos un producto"*, destino inexistente *"sucursal destino no existe o está inactiva"*, **destino de otra empresa** *"la sucursal destino debe pertenecer a la misma empresa"* (aislamiento multiempresa ✓).
    - `get_traslados` → `200 {"traslados":[],"total":0}`; dirección inválida → `P0001 "p_direccion debe ser 'enviados' o 'recibidos'"`.
    - `aceptar_traslado` → `P0001 "traslado, sucursal y usuario son obligatorios"` / `"Traslado no encontrado"`; `anular_traslado` → `P0001 "Traslado no encontrado"`.
    - REST directo `traslados?select=` → `200 []` (RLS sin policies: 0 filas para anon, mismo comportamiento que compras; acceso efectivo vía RPC).
    - Episodio PGRST202 repetido: los 3 RPCs nuevos dieron 404 hasta un segundo `NOTIFY pgrst, 'reload schema'` → resolvieron (misma lección que compras; **incluir siempre el NOTIFY al final del bloque y re-ejecutarlo si hace falta**).
    - **Trampa de sonda:** `p_lineas` (jsonb) debe enviarse como **array JSON** en el cuerpo (`[]`, `[{...}]`), nunca como string `"[]"` → PostgREST da `22023 cannot get array length of a scalar`.
  - **Criterio:** el SQL aplica sin errores y los 4 RPCs responden por PostgREST con anon key. ✅

- [x] **Task 2: Dexie v7 (`traslados`, `detalle_traslado`) — VERIFICADA 2026-10-05**
  - `db.js` **v7** con `traslados: 'id, id_sucursal_origen, id_sucursal_destino, fecha, estado, sync_status'` y `detalle_traslado: 'id, id_traslado, id_producto'`.
  - **Verificación:** `eslint src/lib/db.js` 0, `npm run build` ✓ 4.02 s, E2E `dbg-v7-stores.js` → **IDB v70, 21 stores** (19 previos intactos + 2 nuevos), paneles renderizados sin ErrorBoundary y 0 errores de consola (excluyendo ruido de la new tab de Edge, regla 5 de AGENTS).
  - **Criterio:** `npm run build` 0, lint 0, E2E de apertura de BD (versión IDB + stores nuevos sin romper los viejos). ✅

- [x] **Task 3: `trasladoService.js` (offline-first) — VERIFICADA 2026-10-05**
  - `registrarTrasladoLocal` (tx única: `traslados` + `detalle_traslado` + descuento `productos_sucursal` de A — **listar todas las tablas leídas en la tx**, lección Dexie — + evento cola `PENDING`), `listarTrasladosLocal` (enviados/recibidos con filtros en memoria, forma `{traslados, total}`), `aceptarTrasladoLocal` (valida `0 ≤ recibida ≤ enviada`, stock destino += recibida, stock origen += (enviada − recibida), estados, evento `PENDING`), `anularTrasladoLocal` (solo `SYNCED` + red), `refrescarTraslados(direccion)` (fuse servidor→espejo con `get_traslados`), CustomEvent `traslados-actualizados`.
  - **Verificación:** `eslint src/services/trasladoService.js` 0, `npm run build` ✓ 4.15 s, **E2E en el repo `src/e2e/Traslados.test.js`** + script `npm run test:traslados` (directiva del usuario: los E2E nuevos van al repo) → **34/34 aserciones en ambos escenarios**: `USUARIO=alex CLAVE=alex123` (Ferromax chichi, catálogo de 1 producto → el test sintetiza un 2do producto fixture local limpiable) y `system` (Libreria Luna). Cobertura: registro <2 s (8–13 ms) con stock −3 y cola PENDING; guards (origen=destino, stock, catálogo `CATALOGO_LOCAL`); aceptación parcial offline (destino +3/+0, origen 12/14) con campanita 1→0; guards de aceptación y anulación (PENDING/no-origen/sin red); listados locales; `refrescarTraslados` offline; consola 0 errores; limpieza sin residuos.
  - **Lecciones del E2E:** (1) el nombre real de la BD es `PosLibreriaDB` (con `i`); (2) `import()` dinámico del servicio debe **pre-cargarse con red** — bajo CDP-offline Vite no sirve módulos (`Failed to fetch dynamically imported module`); (3) el login de no-admin exige seleccionar `#empresa` en el formulario → el test la resuelve por REST; (4) re-setear `location.hash` al mismo valor no navega (regla 4 de AGENTS).
  - **Criterio:** E2E local con red cortada: alta <2 s, stock A baja; aceptación parcial cambia ambos stocks; build/lint 0. ✅

- [x] **Task 4: UI — pestaña Traslados (envío) + ruta — VERIFICADA 2026-10-05 (aprobada por el desarrollador)**
  - `src/views/traslados/TrasladosPage.jsx` con `CTabs` (Traslados | Movimientos), lista de enviados local-first con fuse, "Nuevo traslado" (destino desde `sucursal` filtrado por empresa del dispositivo, líneas con stock visible y guard, total en unidades), anulación con `ConfirmModal` + motivo y bloqueos (PENDING/sin red). Ruta `#/traslados` en `routes.js` con `modulo: 'traslados'` (PermissionRoute).
  - **Verificación:** `npx eslint src/views/traslados/TrasladosPage.jsx src/routes.js src/e2e/TrasladosUI.test.js` 0, `npm run build` ✓ 3.11 s, **E2E en el repo `src/e2e/TrasladosUI.test.js`** + script `npm run test:traslados-ui` (default `USUARIO=alex CLAVE=alex123`, Ferromax) → **30/30 aserciones**: con red (ruta, pestañas, modal, destino 1 hermana, 3 guards, alta 2 und → toast + fila + badge PENDING + stock 10→8, bloqueo anular PENDING, pestaña Movimientos vacía); sin red CDP (alerta, lista espejo, alta desde caché destinos → toast cola PENDING + stock 10→7, 2 traslados en IndexedDB, consola sin errores). `npm run test:traslados` → 34/34 sin regresión. Limpieza automática (borrados 6, stock restaurado).
  - **Lecciones del E2E de UI:** (1) los toasts (autohide 5 s, `top-end`) tapan botones → `esperarToasts()` entre interacciones; (2) `contains(text(),'X')` no matchea textos partidos en varios nodos (`Total: {2} unidades`) → helper `apareceTexto` con `normalize-space(.)`; (3) las pestañas CoreUI son `button[role="tab"]` **sin** contenedor `.nav-tabs` → selector `[role="tab"]`; (4) fila en tabla → esperar activamente `//td[contains(., destino)]` (no `findElements` instantáneo); (5) `nombreDestino` se captura del `option:checked` tras seleccionar.
  - **Permiso concedido:** `upsert_permiso` Gerente+traslados 4/4 (row `47ac6c7e-52b6-479a-b024-4da20271ff8a`) → `has_permission` true en las 4 acciones (configuración permanente, avisada al usuario).
  - **Criterio:** E2E con red y sin red (lista, modal, alta, bloqueos); build/lint 0. ✅

- [x] **Task 5: UI — pestaña Movimientos (verificación y aceptación) — VERIFICADA 2026-10-05 (aprobada por el desarrollador)**
  - Lista de recibidos (fecha, origen, estado, ítems, badges) + modal de verificación: tabla de líneas con **enviada / recibida editable** (default = enviada), quitar producto = 0, validaciones, resumen "llega X de Y", botón Aceptar con `ConfirmModal`; histórico `recibido`/`recibido_parcial`/`anulado` solo lectura.
  - **Verificación:** `npx eslint src/views/traslados/TrasladosPage.jsx src/e2e/TrasladosMov.test.js` 0, `npm run build` ✓ 3.22 s, **E2E nuevo `src/e2e/TrasladosMov.test.js`** + script `npm run test:traslados-mov` (default alex/Ferromax) → **30/30 aserciones**: con red abre la pestaña Movimientos (precarga de chunk) → CDP offline → arma traslado entrante en el espejo (origen falso + 2 líneas) → fila con `btn-verificar` → modal (default 9/9, inputs identificados por `aria-label`) → guard `recibida > enviada` (toast "Cantidades inválidas" + ConfirmModal cerrado) → aceptación parcial (base 0 por "no llegó", fixture 3/4 → "Llega 3 de 9", estado previsto `recibido_parcial`) → ConfirmModal → toast éxito → **stock destino 10→10 (no llegó) y 8→11 (+3); origen 10→15 (+5) y 10→11 (+1); estado `recibido_parcial`; evento `aceptar_traslado` PENDING=1; botón Verificar desaparece; badge en la lista; consola limpia; limpieza 8 filas.** Regresión: `test:traslados` 34/34 OK, `test:traslados-ui` 30/30 OK.
  - **Lecciones del E2E:** (6) `getText()` de celdas dentro de un CModal recién abierto devuelve `''` durante la animación → identificar inputs por `aria-label` (estable); (7) badge con JSX partido (`estado: {valor}`) no matchea `contains(text(),…)` → `apareceTexto` con `normalize-space(.)`.
  - **Criterio:** E2E: aceptación parcial (0 + cantidad reducida) → stock destino solo lo recibido, origen recupera diferencia, estado `recibido_parcial`; build/lint 0. ✅

- [x] **Task 6: Campanita de notificaciones (AppHeader) — VERIFICADA 2026-10-05 (aprobada por el desarrollador)**
  - Componente `CampanaTraslados` en `AppHeader` (junto a `SyncIndicator`): `cilBell` + punto rojo con el conteo de recibidos `enviado` (lectura local de `contarTrasladosPendientes`, funciona sin red); `iniciarMonitorTraslados()` idempotente en `trasladoService.js` montado en `App.jsx` (arranque + `online`, patrón `iniciarGestorCotizacionesOffline`); el componente refresca el espejo al montar (cubre el hueco post-login, la app arranca en el login) y escucha `traslados-actualizados`. **Centro de notificaciones:** clic en la campanita abre el menú `CDropdown` (cabecera "Notificaciones", centro extensible) **sin navegar**; el aviso «N traslados pendientes por aprobar» → navega a `#/traslados?tab=movimientos` (hash + CustomEvent `traslados-ir-movimientos` que `TrasladosPage` escucha para el caso de misma ruta); vacío → «Sin notificaciones pendientes» (disabled); invisible sin `traslados/ver`.
  - **Verificación:** `npx eslint` en los 4 archivos tocados 0, `npm run build` ✓ 3.56 s, **E2E nuevo `src/e2e/TrasladosCampana.test.js`** + script `npm run test:traslados-campana` (default alex/Ferromax, con heal de `traslados/ver` al inicio) → **37/37 aserciones**: conteo 0/2, conteo local sin red (CDP), menú vacío, mensaje plural/singular, **clic en la campanita NO navega (hash intacto)**, **aviso navega al módulo (`#/traslados?tab=movimientos`) con pestaña Movimientos y 2 filas `btn-verificar`**, aviso con mismo hash → evento mantiene Movimientos, aceptaciones por servicio → mensajes 1 → vacío y punto rojo desaparecido, revoke vía `upsert_permiso` + refresh → campanita oculta, restore → visible + ruta accesible, consola limpia; `finally` restaura permiso, red y stock. Regresión: `test:traslados` 34/34 OK, `test:traslados-ui` 30/30 OK, `test:traslados-mov` 30/30 OK.
  - **Lecciones del E2E:** (8) `upsert_permiso` vía REST responde **body vacío** → `r.json()` lanza `Unexpected end of JSON input` aunque el RPC **sí** ejecuta: validar con `has_permission` posterior, no con el JSON del upsert; (9) `usePermission` arranca en `true` y resuelve async → para aserciones de AUSENCIA esperar primero un marker siempre presente del header (aria-label de SyncIndicator) y luego la ausencia en 2 lecturas seguidas (tolera el flash); (10) el E2E debe heal+restore del permiso en `finally` (un run roto dejaba a Gerente sin `ver` y rompía los tests siguientes).
  - **Criterio:** E2E: punto rojo con el conteo, clic en la campanita muestra el mensaje sin cambiar el hash, clic en el aviso aterriza en Movimientos con las filas, mensajes desaparecen al aceptar todo, campanita oculta sin permiso; build/lint 0. ✅

- [x] **Task 7: Nav + permisos (los 6 puntos) — VERIFICADA 2026-10-05 (aprobada por el desarrollador)**
  - `_nav.jsx` (grupo Inventario, tras Compras, `cilTransfer`, `modulo:'traslados'`), `useNavPermissions.MODULOS`, `ModalPermisos.MODULOS`, `RolesCard.MODULOS` += `'traslados'`, `MobileNav` += ítem Traslados tras Compras. `routes.js` ya quedó en la Task 4.
  - **Verificación:** `npx eslint` en los 5 archivos tocados 0 errores nuevos (solo CRLF preexistentes), `npm run build` ✓ 3.17 s, **E2E nuevo `src/e2e/TrasladosNav.test.js`** + script `npm run test:traslados-nav` → **27/27 aserciones** en 2 sesiones: (A) alex/Gerente: MobileNav con enlace Traslados a 390px, sidebar → clic → `#/traslados` renderiza, revoke `traslados/ver` → sidebar oculta + redirect `#/dashboard` + cache `perm_<rol>_traslados_ver='0'`, offline CDP → el redirect sigue resolviendo con la cache, restore → sidebar vuelve; (B) system/Admin: `/roles` renderiza, badge Gerente `traslados: ver, crear, editar, eliminar`, Permisos → ModalPermisos con fila `traslados` y **4/4 checkboxes marcados** (poll tras `get_permisos_by_rol`), consola limpia; `finally` restaura permiso/red/viewport. Regresión: `test:traslados` 34/34 OK, `test:traslados-ui` 30/30 OK, `test:traslados-mov` 30/30 OK, `test:traslados-campana` 37/37 OK.
  - **Lecciones del E2E:** (11) para cambiar de usuario en una misma corrida, `driver.get` con el **mismo hash no navega ni recarga** → limpiar `localStorage` + `driver.navigate().refresh()` (el 2º login esperaba `#email` sobre la sesión vieja y agotaba el timeout); (12) los checkboxes de `ModalPermisos` se llenan cuando resuelve `get_permisos_by_rol` (state async) → poll hasta 4/4 `isSelected()`, no leerlos en el primer frame.
  - **Criterio:** E2E: sidebar → clic en Traslados renderiza `/traslados`; fila `traslados` con 4 checkboxes en ModalPermisos; MobileNav; redirect sin permiso + cache `'0'` + offline; build/lint 0. ✅

- [x] **Task 8: Sincronización a Supabase (cola) — VERIFICADA 2026-10-05 (aprobada por el desarrollador)**
  - `colaSyncService`: `RPCS_POR_TABLA.traslados = ['registrar_traslado','aceptar_traslado','anular_traslado']`, `idServidor` += `id_traslado`, **re-apuntado de eventos `PENDING` posteriores** al remapear (`id_registro` + `datos.params.p_id_traslado` → id del servidor; diseño §4 de la spec), `remapearTrasladoLocal` (re-key de cabecera + repuntado de `detalle_traslado`; si el id no cambia solo `SYNCED`), fusión/`CONFLICT` (marca fila + motivo en `db.traslados`) / `avisarLista('traslados')` en éxito y conflicto. Comentario de header en `trasladoService.js`.
  - **Verificación:** `npx eslint` en los archivos tocados 0, `npm run build` ✓ 3.35 s, **E2E nuevo `src/e2e/TrasladosSync.test.js`** + script `npm run test:traslados-sync` → **32/32 aserciones**: envío offline → `SYNCED` + id remapeado + detalle repuntado + servidor exactamente 1 fila nueva + espejo sin duplicados; alta+aceptación offline con el mismo id local → ambos `SYNCED`, re-apuntado verificado (0 CONFLICT falso), servidor `recibido` con `cantidad_recibida=1`, espejo fusiona; rechazo de stock (99999) → fila y evento en `CONFLICT` con motivo «Stock insuficiente…», servidor no creó la fila, badge «conflicto» + tooltip en UI, consola limpia; limpieza: anulación + stock restaurado contra baseline del servidor. **Regresión 6/6:** `test:traslados` 34/34, `-ui` 31/31, `-mov` 30/30, `-campana` 37/37, `-nav` 27/27, `-sync` 32/32. Higiene: fila `enviado` huérfana anulada vía RPC; las suites básica y UI ahora limpian con la red aún cortada → cero basura nueva en servidor.
  - **Lecciones:** (13) los RPCs `registrar_traslado`/`aceptar_traslado` exigen `p_id_usuario` **NO nulo** (RAISE si es null; `anular` no lo exige) → el E2E debe usar el `id` de la sesión, no `null`; (14) los polls de sync deben resolver el **id nuevo** desde `evR.respuesta.id_traslado`: tras el rekey `get(idViejo)` → `undefined` y el check nunca se cumple aunque todo haya subido (falsa falla de «re-apuntado»); (15) con la cola ya operativa, cualquier E2E que asuma fila `PENDING` **con red** es una carrera con el motor → cortar la red antes del alta (determinista) y borrar eventos/filas **con la red aún cortada** antes de restaurarla (si no, el evento `online` sube la fila justo antes del borrado y deja basura `enviado`); los recuentos del espejo se miden relativos al base (hidrata el histórico del servidor).
  - **Criterio:** E2E: sync de envío y de aceptación sin duplicados, rechazo de stock → `CONFLICT` visible, build/lint 0. ✅

- [x] **Task 9: Verificación E2E offline final + docs — VERIFICADA 2026-10-07 (aprobada por el desarrollador: "sí")**
  - **Fix de UI hallado durante la verificación (`src/views/traslados/TrasladosPage.jsx`):** el efecto de listado no cancelaba respuestas fuera de orden — con dos `recargar()` solapados (avisos `cola-sincronizada`/`traslados-actualizados`), el fetch **viejo** podía completar después y pisar al nuevo, y el badge «conflicto» desaparecía de la lista (carrera observada 1 de ~3 corridas E2E). Fix: token de secuencia `secuenciaLista` (`useRef`) — cada run compara su `sec` después de cada `await` y sale si quedó viejo (también en `catch`/`finally` para toast y `setCargando`). ESLint 0, build ✓.
  - **Checklist §7 completo en un solo script** (temp, directiva de cierre): `C:\Users\HP\AppData\Local\Temp\opencode\dbg-task9-traslados.js` + capturas `traslados-01..07*.png`. **3 corridas verdes seguidas (70/70, 70/70, 70/70)** con el código final. Criterios:
    - **§7.1 offline <2 s:** red CDP cortada ANTES del alta (lección 15) → alta 2 líneas (3 fixture + 2 llave) → fila con badge «sin sincronizar» visible en **191–298 ms**, toast, stock local 7→5 (−2) y 10→7 (−3), evento `registrar_traslado` PENDING.
    - **§7.2 remapeo sin duplicados:** red → `drenar` → `SYNCED` con id remapeado (id viejo borrado), servidor exactamente 1 fila nueva, espejo sin duplicados, badge fuera. **Variante CONFLICT:** evento parcheado a 99999 und → RPC rechaza → fila y evento `CONFLICT`, motivo «Stock insuficiente…», badge «conflicto» + tooltip, servidor no creó la fila (recuento igual).
    - **§7.3 aceptación parcial:** local → `recibido_parcial`, subida, **servidor**: estado `recibido_parcial`, recibidas llave=1 fix=0, y los 4 deltas de stock verificados **en servidor** (origen +1/+3, destino +1/+0), badge en lista.
    - **§7.4 campanita offline:** traslado entrante armado en el espejo → conteo 1 **sin red**, aviso singular navega a `#/traslados?tab=movimientos`, aceptación → conteo 0 (punto rojo fuera) y menú vacío; evento del fixture borrado **con la red aún cortada** (lección 15) antes de restaurar.
    - **§7.5 sin permiso:** revoke servidor + cache sembrada `perm_..._ver='0'` → reload **sin flash** (el enlace Traslados nunca aparece), sidebar sin ítem, campanita oculta, URL directa → redirect `#/dashboard`; restore → todo vuelve.
    - **§7.6:** consola 0 errores de la app; `npm run build` ✓ 3.07 s; `npx eslint src/views/traslados/TrasladosPage.jsx` 0.
  - **Regresión (toqué `TrasladosPage.jsx`):** `npm run test:traslados-ui` → **OK (31)**, `npm run test:traslados` → **OK (34)**.
  - **Lecciones 16–18:** (16) **refetch fuera de orden**: un efecto que hace `await` de servidor sin token de secuencia puede pisar datos más frescos con la respuesta vieja → guard `secuenciaLista` (revisar `ComprasPage`/`HistorialPage` si se ve el mismo síntoma — no se tocó sin aprobación); (17) E2E sobre tabla que re-renderiza: `getText()` sobre un snapshot de `findElements` lanza `StaleElementReference` → try/catch por fila; el conteo crudo de filas durante un `recargar()` (spinner) es inestable → esperar por el badge de la fila, no por el conteo; (18) **stock canónico forzado**: fijar los stocks fixture al inicio (upsert) y restaurar a esos MISMOS valores en el `finally` → una corrida que muere a medias ya no contamina la línea base de la siguiente (antes la base arrastraba deriva 7→5).
  - **Evidencias:** logs `t9-run.log`/`t9-run3.log`/`t9-run4.log` en Temp; capturas `traslados-01-lista-online.png`, `-02-offline-alta.png`, `-03-sincronizado-conflicto.png`, `-04-recibido-parcial.png`, `-05-campanita-offline.png`, `-06-sin-permiso.png`, `-07-final.png`.
  - **Criterio:** §7 en verde y verificación del desarrollador.
