# Tasks: Módulo de Compras, Entradas y Comprobantes

> Spec asociada: `specs/compras-entradas.md`. Una tarea activa a la vez; marcar `[x]` solo tras la verificación del desarrollador.

- [x] **Task 1: Inspección de esquema (paso previo, decide la estructura)**
  - **Sondeo REST 2026-10-02 (solo lectura, PostgREST con anon key) — estructura conocida:**
    - `compras`: `id, id_sucursal, id_proveedor, id_usuario, fecha, total, estado` — sin columnas extra entre 45 candidatas; `estado` **NO es enum** (text: todos los labels devolvieron 200).
    - `detalle_compra`: `id, id_compra, id_producto, cantidad, precio_unitario, sub_total` — sin extras.
    - `entradas`: **solo** `id, id_producto, cantidad, id_usuario` — **no tiene `id_sucursal`, `fecha` ni `motivo`** (violación Art. II → ALTER obligatorio).
    - `comprobante`: `id, id_venta, id_cliente, tipo, numero, estado, fecha_emision` — **enums descubiertos**: `tipo_comprobante` ∈ {`factura`, `nota_venta`, `recibo`} (¡no existe label `venta`!), `estado_comprobante` ∈ {`emitido`, `pendiente`, `anulado`}.
    - `proveedor` (singular): `id_empresa, name, address, email, tel` — catálogo ya operable con `upsert_catalogo`.
  - **SQL de inspección ejecutado por el usuario (2026-10-02):** consultas 2–5 de abajo (la 1 falló por `WHERE` duplicado del copy-paste; sus datos —tipos y columnas— se recuperaron con sondas de error REST: `?col=eq.__zzz__` revela `invalid input syntax for type <tipo>`).
  - **Resultados de la inspección (todo confirmado 2026-10-02):**
    - **Tipos:** `compras.total` **integer** (centavos), `compras.fecha` timestamp, `compras.id_usuario` uuid; `detalle_compra.cantidad/precio_unitario/sub_total` integer; `entradas.cantidad` integer, `entradas.id_producto` uuid; `comprobante.numero` text, `fecha_emision` timestamp, `id_venta`/`id_cliente` uuid; `productos_sucursal` = `id, id_sucursal, id_producto, stock` integer, `stock_minimo` integer (**sin** `id_empresa`).
    - **FKs:** `comprobante.id_cliente→clientes.id`, `comprobante.id_venta→ventas.id`, `entradas.id_producto→productos.id`, `entradas.id_usuario→users.id`, `compras.id_proveedor→proveedor.id`, `compras.id_sucursal→sucursal.id`, `compras.id_usuario→users.id`, `detalle_compra.id_compra→compras.id`, `detalle_compra.id_producto→productos.id`.
    - **Patrón de RPCs a imitar:** `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`, `RETURNS json`, params `p_` + snake_case, ids `gen_random_uuid()`, validaciones `RAISE EXCEPTION`, items en `p_items jsonb` (`registrar_cotizacion` recorre `jsonb_array_elements`), stock en `productos_sucursal` (`UPDATE ... stock = stock ± n` + `IF NOT FOUND`), listados tipo `get_ventas_historial(uuid,text,timestamptz,timestamptz,text,integer,integer)` → `{ventas:[...], total}` (el cliente lee `data.ventas`/`data.total`), `registrar_venta` devuelve `{id_venta, total}` (remapeo en `colaSyncService` lee `data?.id_venta ?? data?.id`).
    - **JOINs disponibles:** `users.name`, `proveedor.name`, `productos.name` (los tres columnas existen; `productos`/`proveedor` devuelven `[]` por RLS, irrelevante porque los RPC son SECURITY DEFINER).
    - **Grants:** `anon`, `authenticated`, `service_role`, `postgres` con SELECT/INSERT/UPDATE/DELETE completos sobre las 4 tablas.
    - **Tablas vacías (4/4 verificadas justo antes del ALTER)** → `NOT NULL`/índices seguros.
    - **Decisiones finales:** labels `venta→nota_venta`, `compra→factura`; `compras.estado` = `'completada' | 'anulada'` (text); la UI "eliminar" es **anulación** (`anular_compra`), sin DELETE físico.
  - **Queries ejecutadas por el usuario (registro):**
    ```sql
    -- 1) Tipos/nulos/defaults (falló por WHERE duplicado; sustituido por sondas REST)
    SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name IN ('compras','detalle_compra','entradas','comprobante')
    ORDER BY table_name, ordinal_position;

    -- 2) Sets COMPLETOS de los enums descubiertos ✓
    SELECT t.typname AS enum, e.enumlabel
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname IN ('estado_comprobante','tipo_comprobante')
    ORDER BY t.typname, e.enumsortorder;

    -- 3) Claves foráneas existentes ✓
    SELECT tc.table_name, kcu.column_name, ccu.table_name AS ref_tabla, ccu.column_name AS ref_col
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('compras','detalle_compra','entradas','comprobante');

    -- 4) Definiciones de los RPCs patrón ✓
    SELECT pg_get_functiondef(oid)
    FROM pg_proc
    WHERE proname IN ('registrar_venta','get_ventas_historial','registrar_cotizacion','upsert_catalogo');

    -- 5) Grants actuales sobre las tablas ✓
    SELECT grantee, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_name IN ('compras','detalle_compra','entradas','comprobante');
    ```
  - **Criterio:** estructura y resultados documentados en esta tarea; confirmación del desarrollador antes de marcar `[x]`.

- [x] **Task 1b: SQL definitivo (ALTERs + 6 RPCs) — APLICADO Y VERIFICADO 2026-10-02**
  - **Entregado 2026-10-02.** Todo el SQL de abajo se pega de una sola vez en el SQL editor de Supabase. Es re-ejecutable (`IF NOT EXISTS`/`CREATE OR REPLACE`/guard de FKs). Las tablas están vacías, así que los `NOT NULL` no fallan.
  - ```sql
    -- ============================================================
    -- MÓDULO COMPRAS/ENTRADAS/COMPROBANTES — SQL definitivo (Task 1b)
    -- Aplicar en el SQL editor de Supabase. Re-ejecutable.
    -- ============================================================

    -- ---------- 1) ALTERs ----------
    -- entradas: sucursal obligatoria (Art. II), fecha y motivo de auditoría
    ALTER TABLE entradas ADD COLUMN IF NOT EXISTS id_sucursal uuid;
    ALTER TABLE entradas ADD COLUMN IF NOT EXISTS fecha timestamp NOT NULL DEFAULT now();
    ALTER TABLE entradas ADD COLUMN IF NOT EXISTS motivo text;
    ALTER TABLE entradas ALTER COLUMN id_sucursal SET NOT NULL;

    -- compras: columnas de anulación (espejo del ALTER que ventas ya tiene)
    ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_anulacion timestamp;
    ALTER TABLE compras ADD COLUMN IF NOT EXISTS motivo_anulacion text;
    ALTER TABLE compras ADD COLUMN IF NOT EXISTS id_usuario_anula uuid;

    -- comprobante: vínculo con compra, sucursal y contenido (RF-C4)
    ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS id_compra uuid;
    ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS id_sucursal uuid;
    ALTER TABLE comprobante ADD COLUMN IF NOT EXISTS contenido text;

    -- FKs de las columnas nuevas (guard: ADD CONSTRAINT no tiene IF NOT EXISTS)
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'entradas'::regclass
                       AND conname = 'entradas_id_sucursal_fkey') THEN
        ALTER TABLE entradas ADD CONSTRAINT entradas_id_sucursal_fkey
          FOREIGN KEY (id_sucursal) REFERENCES sucursal(id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'comprobante'::regclass
                       AND conname = 'comprobante_id_compra_fkey') THEN
        ALTER TABLE comprobante ADD CONSTRAINT comprobante_id_compra_fkey
          FOREIGN KEY (id_compra) REFERENCES compras(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE conrelid = 'comprobante'::regclass
                       AND conname = 'comprobante_id_sucursal_fkey') THEN
        ALTER TABLE comprobante ADD CONSTRAINT comprobante_id_sucursal_fkey
          FOREIGN KEY (id_sucursal) REFERENCES sucursal(id);
      END IF;
    END;
    $$;

    -- índices de listado + unicidad del comprobante (1 por venta / 1 por compra)
    CREATE INDEX IF NOT EXISTS idx_compras_sucursal_fecha ON compras(id_sucursal, fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_entradas_sucursal_fecha ON entradas(id_sucursal, fecha DESC);
    CREATE INDEX IF NOT EXISTS idx_comprobante_id_compra ON comprobante(id_compra);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_id_venta
      ON comprobante(id_venta) WHERE id_venta IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_comprobante_id_compra
      ON comprobante(id_compra) WHERE id_compra IS NOT NULL;

    -- ---------- 2) registrar_compra: compra + detalle + stock en una tx ----------
    CREATE OR REPLACE FUNCTION public.registrar_compra(
      p_id_sucursal uuid,
      p_id_proveedor uuid,
      p_id_usuario uuid,
      p_total integer,
      p_items jsonb
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_id_compra uuid := gen_random_uuid();
      v_item record;
      v_total integer;
    BEGIN
      IF p_id_sucursal IS NULL THEN
        RAISE EXCEPTION 'p_id_sucursal es obligatorio';
      END IF;
      IF p_total IS NULL OR p_total < 0 THEN
        RAISE EXCEPTION 'total inválido: %', p_total;
      END IF;
      IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'la compra debe incluir al menos un producto';
      END IF;

      -- total del servidor: no se confía en el que calculó el cliente
      SELECT COALESCE(SUM((elem->>'cantidad')::integer * (elem->>'precio_unitario')::integer), 0)
        INTO v_total
        FROM jsonb_array_elements(p_items) AS t(elem);

      IF v_total <> p_total THEN
        RAISE EXCEPTION 'El total enviado (%) no coincide con la suma de los ítems (%)',
          p_total, v_total;
      END IF;

      INSERT INTO compras (id, id_sucursal, id_proveedor, id_usuario, fecha, total, estado)
      VALUES (v_id_compra, p_id_sucursal, p_id_proveedor, p_id_usuario, now(), p_total, 'completada');

      FOR v_item IN SELECT elem FROM jsonb_array_elements(p_items) AS t(elem) LOOP
        IF (v_item.elem->>'cantidad')::integer <= 0 THEN
          RAISE EXCEPTION 'cantidad inválida: %', v_item.elem->>'cantidad';
        END IF;
        IF (v_item.elem->>'precio_unitario')::integer < 0 THEN
          RAISE EXCEPTION 'precio_unitario inválido: %', v_item.elem->>'precio_unitario';
        END IF;

        INSERT INTO detalle_compra (id, id_compra, id_producto, cantidad, precio_unitario, sub_total)
        VALUES (
          gen_random_uuid(),
          v_id_compra,
          (v_item.elem->>'id_producto')::uuid,
          (v_item.elem->>'cantidad')::integer,
          (v_item.elem->>'precio_unitario')::integer,
          (v_item.elem->>'cantidad')::integer * (v_item.elem->>'precio_unitario')::integer
        );

        UPDATE productos_sucursal
           SET stock = stock + (v_item.elem->>'cantidad')::integer
         WHERE id_sucursal = p_id_sucursal
           AND id_producto = (v_item.elem->>'id_producto')::uuid;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'El producto % no está habilitado en esta sucursal',
            v_item.elem->>'id_producto';
        END IF;
      END LOOP;

      RETURN json_build_object('id_compra', v_id_compra, 'total', p_total, 'estado', 'completada');
    END;
    $$;

    -- ---------- 3) get_compras: listado paginado (espejo de get_ventas_historial) ----------
    CREATE OR REPLACE FUNCTION public.get_compras(
      p_id_sucursal uuid,
      p_estado text DEFAULT NULL,
      p_desde timestamptz DEFAULT NULL,
      p_hasta timestamptz DEFAULT NULL,
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
               (SELECT count(*) FROM detalle_compra d WHERE d.id_compra = c.id) AS items,
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
    $$;

    -- ---------- 4) registrar_entrada: ajuste manual de stock + fila de auditoría ----------
    CREATE OR REPLACE FUNCTION public.registrar_entrada(
      p_id_sucursal uuid,
      p_id_producto uuid,
      p_cantidad integer,
      p_motivo text,
      p_id_usuario uuid
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_id_entrada uuid := gen_random_uuid();
      v_stock integer;
    BEGIN
      IF p_id_sucursal IS NULL OR p_id_producto IS NULL THEN
        RAISE EXCEPTION 'sucursal y producto son obligatorios';
      END IF;
      IF p_cantidad IS NULL OR p_cantidad = 0 THEN
        RAISE EXCEPTION 'la cantidad no puede ser cero';
      END IF;
      IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
        RAISE EXCEPTION 'el motivo es obligatorio';
      END IF;

      UPDATE productos_sucursal
         SET stock = stock + p_cantidad
       WHERE id_sucursal = p_id_sucursal
         AND id_producto = p_id_producto;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto % no está habilitado en esta sucursal', p_id_producto;
      END IF;

      SELECT stock INTO v_stock
        FROM productos_sucursal
       WHERE id_sucursal = p_id_sucursal
         AND id_producto = p_id_producto;
      IF v_stock < 0 THEN
        RAISE EXCEPTION 'El ajuste dejaría el stock en negativo (%)', v_stock;
      END IF;

      INSERT INTO entradas (id, id_producto, cantidad, motivo, id_usuario, id_sucursal, fecha)
      VALUES (v_id_entrada, p_id_producto, p_cantidad, btrim(p_motivo), p_id_usuario,
              p_id_sucursal, now());

      RETURN json_build_object('id_entrada', v_id_entrada, 'stock', v_stock);
    END;
    $$;

    -- ---------- 5) get_entradas: listado paginado ----------
    CREATE OR REPLACE FUNCTION public.get_entradas(
      p_id_sucursal uuid,
      p_desde timestamptz DEFAULT NULL,
      p_hasta timestamptz DEFAULT NULL,
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

      SELECT json_build_object(
        'entradas', COALESCE(json_agg(json_build_object(
          'id', x.id,
          'fecha', x.fecha,
          'id_producto', x.id_producto,
          'producto', x.producto,
          'cantidad', x.cantidad,
          'motivo', x.motivo,
          'usuario', x.usuario
        ) ORDER BY x.fecha DESC), '[]'),
        'total', COALESCE(MAX(x.total_registros), 0)
      )
      INTO v_resultado
      FROM (
        SELECT e.id, e.fecha, e.id_producto,
               p.name AS producto,
               e.cantidad, e.motivo,
               u.name AS usuario,
               count(*) OVER() AS total_registros
        FROM entradas e
        LEFT JOIN productos p ON p.id = e.id_producto
        LEFT JOIN users u ON u.id = e.id_usuario
        WHERE e.id_sucursal = p_id_sucursal
          AND (p_desde IS NULL OR e.fecha >= p_desde)
          AND (p_hasta IS NULL OR e.fecha < p_hasta)
          AND (p_busqueda IS NULL OR btrim(p_busqueda) = '' OR
               e.id::text ILIKE '%' || p_busqueda || '%' OR
               p.name ILIKE '%' || p_busqueda || '%' OR
               u.name ILIKE '%' || p_busqueda || '%')
        ORDER BY e.fecha DESC
        LIMIT p_limite OFFSET p_offset
      ) x;

      RETURN v_resultado;
    END;
    $$;

    -- ---------- 6) guardar_comprobante: upsert por venta o por compra ----------
    CREATE OR REPLACE FUNCTION public.guardar_comprobante(
      p_id_venta uuid DEFAULT NULL,
      p_id_compra uuid DEFAULT NULL,
      p_id_sucursal uuid DEFAULT NULL,
      p_tipo text DEFAULT NULL,
      p_numero text DEFAULT NULL,
      p_estado text DEFAULT 'emitido',
      p_contenido text DEFAULT NULL
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_id uuid;
      v_tipo tipo_comprobante;
      v_estado estado_comprobante;
    BEGIN
      IF p_id_venta IS NULL AND p_id_compra IS NULL THEN
        RAISE EXCEPTION 'se requiere id_venta o id_compra';
      END IF;
      IF p_tipo IS NULL OR p_tipo NOT IN ('factura', 'nota_venta', 'recibo') THEN
        RAISE EXCEPTION 'tipo inválido: % (permitidos: factura, nota_venta, recibo)', p_tipo;
      END IF;
      IF p_estado IS NULL OR p_estado NOT IN ('emitido', 'pendiente', 'anulado') THEN
        RAISE EXCEPTION 'estado inválido: % (permitidos: emitido, pendiente, anulado)', p_estado;
      END IF;
      v_tipo := p_tipo::tipo_comprobante;
      v_estado := p_estado::estado_comprobante;

      IF p_id_venta IS NOT NULL THEN
        SELECT id INTO v_id FROM comprobante WHERE id_venta = p_id_venta;
      ELSE
        SELECT id INTO v_id FROM comprobante
         WHERE id_compra = p_id_compra AND id_venta IS NULL;
      END IF;

      IF v_id IS NULL THEN
        v_id := gen_random_uuid();
        INSERT INTO comprobante
          (id, id_venta, id_compra, id_sucursal, tipo, numero, estado, fecha_emision, contenido)
        VALUES
          (v_id, p_id_venta, p_id_compra, p_id_sucursal, v_tipo, p_numero, v_estado, now(), p_contenido);
      ELSE
        UPDATE comprobante
           SET tipo = v_tipo,
               numero = COALESCE(p_numero, numero),
               estado = v_estado,
               id_sucursal = COALESCE(p_id_sucursal, id_sucursal),
               contenido = COALESCE(p_contenido, contenido)
         WHERE id = v_id;
      END IF;

      RETURN json_build_object(
        'id_comprobante', v_id,
        'id_venta', p_id_venta,
        'id_compra', p_id_compra,
        'estado', p_estado
      );
    END;
    $$;

    -- ---------- 7) anular_compra: soft-delete con reversión de stock ----------
    -- Decisión Task 1b: la reversión NO tiene guard de negativo (el stock del
    -- original ya se consumió; bloquear aquí haría imposible anular compras
    -- antiguas). Si el producto ya no está en la sucursal, se omite su reversión.
    CREATE OR REPLACE FUNCTION public.anular_compra(
      p_id uuid,
      p_id_sucursal uuid,
      p_id_usuario uuid,
      p_motivo text DEFAULT NULL
    ) RETURNS json
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
      v_compra record;
      v_item record;
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

      FOR v_item IN SELECT id_producto, cantidad FROM detalle_compra WHERE id_compra = p_id LOOP
        UPDATE productos_sucursal
           SET stock = stock - v_item.cantidad
         WHERE id_sucursal = p_id_sucursal
           AND id_producto = v_item.id_producto;
      END LOOP;

      UPDATE compras
         SET estado = 'anulada',
             fecha_anulacion = now(),
             motivo_anulacion = p_motivo,
             id_usuario_anula = p_id_usuario
       WHERE id = p_id;

      RETURN json_build_object('id_compra', p_id, 'estado', 'anulada');
    END;
    $$;

    -- ---------- 8) Grants (patrón existente: anon + authenticated) ----------
    GRANT EXECUTE ON FUNCTION public.registrar_compra(uuid,uuid,uuid,integer,jsonb) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_compras(uuid,text,timestamptz,timestamptz,text,integer,integer) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.registrar_entrada(uuid,uuid,integer,text,uuid) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_entradas(uuid,timestamptz,timestamptz,text,integer,integer) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.guardar_comprobante(uuid,uuid,uuid,text,text,text,text) TO anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.anular_compra(uuid,uuid,uuid,text) TO anon, authenticated;
    ```
  - **Verificación (la hace el agente tras la aplicación del usuario):**
    1. Columnas nuevas visibles: `GET /rest/v1/entradas?select=id_sucursal,fecha,motivo`, `compras?select=fecha_anulacion,motivo_anulacion,id_usuario_anula`, `comprobante?select=id_compra,id_sucursal,contenido` → 200.
    2. RPCs responden: `POST /rest/v1/rpc/get_compras` y `rpc/get_entradas` con `{p_id_sucursal: "<uuid>"}` → `{"compras":[],"total":0}` / `{"entradas":[],"total":0}`.
    3. Devolver la salida al usuario y marcar Task 1 + 1b `[x]`.
  - **Resultado de la verificación (2026-10-02) — 6/6 RPCs OK por PostgREST con anon key:**
    - `registrar_compra` → `P0001 "la compra debe incluir al menos un producto"` (validación, sin escritura) · `get_compras` → `200 {"compras":[],"total":0}` · `registrar_entrada` → `P0001 "la cantidad no puede ser cero"` · `get_entradas` → `200 {"entradas":[],"total":0}` · `guardar_comprobante` → `P0001 "se requiere id_venta o id_compra"` · `anular_compra` → `P0001 "Compra no encontrada"`.
    - Episodio resuelto: `registrar_compra`/`registrar_entrada`/`anular_compra` dieron 404 `PGRST202` (fuera de la *schema cache*) pese a existir en catálogo; tras el `NOTIFY pgrst, 'reload schema'` del usuario la caché se refrescó y las 3 respondieron (los 404 iniciales fueron por cuerpo de prueba incompleto en la sonda + caché vieja).
  - **Criterio:** el SQL aplica sin errores y los 6 RPCs responden por PostgREST con anon key. ✅

- [x] **Task 2: Espejo IndexedDB (Dexie v6)** — verificado 2026-10-02 (build 0, lint 0, E2E `dbg-v6-stores.js`: IDB v60, 4 stores nuevos + 15 intactos, vistas sin ErrorBoundary). Desviación anotada: `comprobante_cache` lleva `id` como PK (IndexedDB rechaza claves nulas).
  - `src/lib/db.js` bump a **v6** con stores `compras`, `detalle_compra`, `entradas`, `comprobante_cache` e índices del spec (§3).
  - Trampas del repo: `snake_case` solo entre comillas (índices), nombres de parámetro en camelCase en JS, bump único (no romper v5), espejo 1:1 de las columnas reales confirmadas en Task 1.
  - **Criterio:** la app arranca, las vistas existentes siguen funcionando y los stores nuevos existen en `indexedDB.databases()`.

- [x] **Task 3: Servicio offline `compraOfflineService.js`** — verificado 2026-10-03 (E2E `dbg-task3-compras.js` con red cortada: compra 5 ms, entrada 2 ms, stock 88→95, cola PENDING con los rpc correctos, comprobante `envio:'sin-red'`, validaciones OK; build 0, lint 0). Nota: la tx de compra incluye **5 stores** (`db.productos` además de los 4 de la task) porque dentro se lee el nombre para el snapshot — sin eso Dexie lanza `NotFoundError: object store not found`.
  - `registrarCompraLocal(...)`: transacción única `['rw', compras, detalle_compra, productos_sucursal, cola_sincronizacion]` — snapshot de líneas, incremento de stock por producto, evento `PENDING` con `id_sucursal` (patrón de `ventaLocalService`); dinero en centavos.
  - `registrarEntradaLocal(...)`: mismo patrón (cantidad con signo, motivo, usuario).
  - `listarComprasLocal`/`listarEntradasLocal` (filtros y paginación en memoria), `guardarComprobanteLocal` (FileReader → base64 con límite de tamaño y tipo imagen/PDF), `leerComprobanteLocal`.
  - Guard de red con `redService.hayRed()` antes de tocar servidor (nada de `navigator.onLine` disperso).
  - **Criterio:** registro local <2 s y verificable en Dexie con la red cortada.

- [x] **Task 4: UI de Compras (`src/views/compras/ComprasPage.jsx`)** — verificada 2026-10-03 (E2E `dbg-task4-compras.js` 23/23 con red cortada: alta offline → toast + fila `PENDING` + badge "sin sincronizar", anulación de PENDING bloqueada con aviso, recarga sin red OK, refresco vía `get_compras` al volver en línea confirmado por resource timing, consola 0 errores; `eslint` 0, `npm run build` 0). Nota: sin `_nav.jsx` la ruta solo es alcanzable por URL directa hasta la Task 8.
  - Ruta `#/compras` con pestañas Compras/Entradas; lista local primero, banner sin red, alta con modal (proveedor del catálogo local `leerCatalogosLocales`, líneas con producto/ cantidad / precio_unitario, total con `formatQ`, adjunto opcional con previsualización).
  - Acción de borrado = **anulación** (`anular_compra`, soft-delete con motivo) vía `ConfirmModal`; permiso de UI `eliminar` (etiqueta "Anular").
  - Solo CoreUI, iconos verificados en terminal, `usePermission('compras','crear')` para las acciones, `useToast` para retroalimentación.
  - **Criterio:** crear una compra offline deja la fila local con `PENDING` y el toast de éxito; con red, refresco desde `get_compras`.

- [x] **Task 5: UI de Entradas (pestaña dentro de ComprasPage)** — verificada 2026-10-03 (E2E `dbg-task5-entradas.js` 32/32 con red cortada: entrada +7 → stock local **984→991 al instante** + fila `PENDING` con badge "sin sincronizar"; Inventario refleja el 991; RF-05 con **ambas ramas**: umbral temporal `2→1041` muestra "Stock bajo" y al restaurar desaparece; refresco vía `get_entradas` al volver en línea; consola 0 errores; `eslint` 0, `npm run build` 0). La alerta de stock bajo en la vista de productos ya existía en `InventarioPage` (`stockActual <= stockMinimo`), se verificó end-to-end y el modal de entrada la evalúa en vivo al escribir la cantidad.
  - Modal de entrada (producto del catálogo local con su stock actual, cantidad, motivo obligatorio) + lista de entradas con badge "sin sincronizar".
  - Evaluar y mostrar alerta de stock bajo (`stock <= min_stock`, RF-05) en la vista de productos al cambiar el stock.
  - **Criterio:** la entrada sube el stock local al instante y queda `PENDING`.

- [x] **Task 6: Almacenamiento y visualización de comprobantes** — verificada 2026-10-05 (E2E `dbg-task6-compras.js` 41/41 con red cortada: venta online dispara `guardar_comprobante` → CustomEvent `comprobante-registrado` con `id_comprobante`, `estado=emitido` y folio correcto; compra A con adjunto → `comprobante_cache` PENDING con imagen data URL; compra B sin adjunto → 0 filas; compras NO disparan el RPC con red; adjunto embebido offline (`naturalWidth 343px`) + ticket armado con marca de agua y leyenda RF-C5 + ticket de venta previa desde Historial; consola 0; capturas `task6v2-*.png` con labels y adjunto visibles en tema oscuro; `eslint` 0 en archivos tocados, `npm run build` 0).
  - Venta emitida (online) → hook `guardarComprobanteVentaServidor` en `colaSyncService.sincronizarEvento` (tras update `SYNCED`, si `rpc === 'registrar_venta' && idServidor`) → RPC con `p_numero = idVenta.slice(0,8).toUpperCase()`, `p_estado:'emitido'`; fire-and-forget + CustomEvent `comprobante-registrado`.
  - Compra con adjunto → `guardarComprobanteLocal` (Task 3) ya escribe en `comprobante_cache`; visor solo lee espejo (`leerComprobanteLocal`), nunca servidor.
  - `src/views/compras/ModalComprobanteCompra.jsx` (nuevo) + botón "Ver comprobante" en `ComprasPage`; print reutiliza `body.imprimir-comprobante` y `.comprobante-ticket` (80 mm / carta); fix de labels en tema oscuro = override scoped `--cui-secondary-color` en `.comprobante-ticket` (CoreUI lo tiene con `!important`).
  - **Trampas resueltas:** tabla `comprobante` con RLS habilitado → anon REST no sirve para verificar (GET 200 vacío / POST 42501) → verificación vía CustomEvent; driver Edge solo captura `console.warn/error`; JSX eager evaluation (`fila ? ... : null` para no crashear el ErrorBoundary); `driver.takeScreenshot({path})` no escribe archivo → base64 + `fs.writeFileSync`; fixture adjunto = `src/assets/hero.png` (no PNG 1x1).
  - **Criterio:** con red cortada se puede abrir el comprobante de una compra/venta previa desde IndexedDB. ✅

- [x] **Task 7: Sincronización a Supabase — VERIFICADA 2026-10-05 (E2E 43/43)**
  - Subida de compras/entradas `PENDING` (motor existente o servicio dedicado: decidir en implementación reutilizando `colaSyncService` con `tabla: 'compras'`), remapeo de ids local→servidor (leer `data?.id_compra`/`data?.id_entrada`, patrón del `data?.id_venta` actual), clasificación de fallos (`red` → sigue `PENDING`, negocio → `CONFLICT` con mensaje).
  - Subida de comprobantes pendientes (`guardar_comprobante`): **solo después de que la compra/venta esté sincronizada** (el FK al servidor falla con ids locales aún no remapeados).
  - **Criterio:** con red restaurada, todo `PENDING` sale de la cola sin duplicados en la lista con red.
  - **Implementado y verificado 2026-10-05 (E2E `dbg-task7-sync.js` 43/43):**
    - `colaSyncService`: `RPCS_POR_TABLA` (guard de éxito/CONFLICT por rpc+tabla, no genérico), `idServidor` lee `id_compra`/`id_entrada`, `remapearCompraLocal`/`remapearEntradaLocal` (tx + fila local `SYNCED` con id del servidor), rechazo de negocio → fila local `CONFLICT` + `ultimo_error`, `avisarLista(tabla)` → CustomEvent `cola-sincronizada` **en éxito y en CONFLICT** (sin el dispatch en CONFLICT, si el rechazo es el último evento de la ronda la UI se quedaba con estado viejo), `ultimo_error: null` al marcar `SYNCED` (antes quedaba el `TypeError: Failed to fetch` del intento offline).
    - `compraOfflineService.subirComprobantesPendientes()`: barrido que sube `comprobante_cache` PENDING vía `guardar_comprobante` **solo con el padre SYNCED** (`padrePendiente`), red → `break` (sigue PENDING), negocio → fila `CONFLICT`. Invocado por `syncEngineService.procesarCola` tras drenar (skip si `cortadoPorRed`).
    - `ComprasPage`: fusión con red incluye locales `PENDING`/`CONFLICT` en offset 0 sin duplicar (`idsRemotos`), listener `cola-sincronizada` → refresco, `abrirAnular` bloquea `PENDING` y `CONFLICT`, badge "conflicto" en ambas pestañas.
  - **Hallazgo (gap de la Task 1b):** la anulación de compras **nunca funcionó** — `compras.estado_check` no aceptaba `'anulada'` (el SQL de la 1b tocó columnas/FKs/índices pero nunca el constraint). Resuelto con SQL aplicado por el usuario: `ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_estado_check; ALTER TABLE compras ADD CONSTRAINT compras_estado_check CHECK (estado IN ('completada', 'anulada'));`. La Task 4 solo probó el *bloqueo* de anulación, no el éxito — por eso nunca salió.
  - **Trampas del E2E resueltas:** la tabla no se re-renderiza al borrar de Dexie (baseline con DOM obsoleto → recargar `button[title="Recargar listado"]` antes de medir); baselines UI+servidor y motivo con token único por corrida para tolerar residuos; toast de anulación capturado con polling (sin él, el error del constraint quedaba oculto tras el auto-hide).
  - **Criterio:** checklist del §7 de la spec en verde y verificación del desarrollador. ✅ 2026-10-05

- [x] **Task 8: Navegación, rutas y permisos (los 5 puntos del Art. V) — VERIFICADA 2026-10-05 (E2E 8/8)**
  - `routes.js` (`/compras`, `modulo: 'compras'`), `_nav.jsx` (grupo Inventario, junto a Historial), `useNavPermissions.MODULOS`, `ModalPermisos.MODULOS`, `RolesCard.MODULOS` + `MobileNav` si aplica el patrón actual.
  - **Criterio:** el módulo aparece solo para roles con permiso, sin flash de admin al recargar, y `PermissionRoute` lo protege offline (cache `perm_...`).
  - **Implementado y verificado 2026-10-05:**
    - `routes.js` ya estaba (Task 4: `/compras` + `modulo: 'compras'` → `AppContent` lo envuelve en `PermissionRoute`).
    - `_nav.jsx`: ítem Compras (ícono `cilCart` verificado en terminal) después de Historial con `modulo: 'compras'`.
    - `useNavPermissions.MODULOS`, `ModalPermisos.MODULOS`, `RolesCard.MODULOS` += `'compras'` (misma posición que en el nav: tras `historial`).
    - `MobileNav.jsx`: enlace `{ name: 'Compras', to: '/compras', icon: cilCart }` (montado en `DefaultLayout`, visible en viewports < md).
    - Fix lint preexistente en `ModalPermisos`: `cargarPermisos` declarado antes del `useEffect` + llamada diferida con `setTimeout(cb, 0)` (patrón react-hooks v7 del repo; antes fallaba con `Cannot access variable before it is declared` + `set-state-in-effect`).
  - **E2E `dbg-task8-nav.js` 8/8:** sidebar con ítem Compras → clic renderiza `/compras`; modal de Permisos con fila `compras` y 4 checkboxes; MobileNav (390 px) con Compras; **PermissionRoute redirige a `/dashboard`** con rol no-Admin (nombre tamperado a `Cajero`) + cache `perm_<rol>_compras_ver='0'` + red cortada (CDP); Admin vuelve a entrar tras restaurar; consola sin errores. Evidencias: `task8-sidebar/permisos/mobilenav/redirect/final.png` (**trampa:** el tool de lectura de imágenes de la sesión sirvió contenido cruzado — verificar dimensiones por cabecera PNG o abrir los archivos a mano; las aserciones del E2E son la fuente de verdad).
  - **Nota:** los roles no-admin no ven Compras hasta que un Admin la otorgue desde Roles → Permisos (sin filas `permiso` para `compras`, comportamiento esperado RF-C7).
  - **Criterio:** checklist del §7 de la spec en verde y verificación del desarrollador. ✅ 2026-10-05

- [x] **Task 9: Verificación E2E offline + docs — VERIFICADA 2026-10-05 (E2E `dbg-task9-cierre.js` 36/36)**
  - Script Selenium con todo el checklist §7: con red → compra online C0 (Q12.00, sin adjunto, se pone `SYNCED` sola vía cola) → baselines UI+servidor+stock → CDP offline → **compra C2 (Q15.00, con adjunto) visible en 313 ms y entrada +2 en 130 ms (<2 s)**, stock local +3/+2, cola con exactamente 2 eventos `PENDING` (compra+entrada), badge "sin sincronizar".
  - §7.3 previsualización OFFLINE desde IndexedDB: ticket sin adjunto con leyenda `PENDIENTE DE SINCRONIZACIÓN FISCAL` (captura) y adjunto de C2 servido como `data:` (`img[alt="Comprobante de compra"]`); **0 llamadas a `guardar_comprobante` antes del sync** (resource timing).
  - §7.2 vuelve la red → cola drenada (compra/entrada/`comprobante_cache` SYNCED, 0 PENDING), **remapeo verificado** (id local ≠ id servidor en fila y evento), 1 llamada a `guardar_comprobante` después del padre, badges fuera por auto-refresh, sin duplicados en lista ni en servidor, UNA entrada con token en servidor.
  - §7.4 rol `Cajero` + cache `perm_<rol>_compras_ver='0'` + sin red → redirect a `/dashboard`; Admin restaurado vuelve a `/compras`; consola sin errores de la app. §7.5 lint 0 reales (216 `Delete ␍` preexistentes) + `npm run build` ✓ 6.60 s.
  - **Trampas nuevas:** (1) re-setear `window.location.hash` al **mismo valor** no dispara navegación → `PermissionRoute` no re-monta (el test de permisos falló hasta navegar antes a `#/dashboard`); (2) Edge inyecta errores SEVERE de su propia new tab (`ntp.msn.com`, `assets.msn.com`, `microsoft.*.js`) que enmascaran el check de consola → filtrarlos; (3) baselines post-C0 tolerantes a residuos (los totales Q12/Q15 se repiten entre corridas).
  - Limpieza server: 6 compras de prueba Q12/Q15 anuladas vía REST (`anular_compra`) → **0** `completada` con esos totales; quedan 3 entradas de prueba (sin RPC de delete, mismo límite que la Task 7). Evidencias: `compras-03-preview-leyenda.png`, `compras-04-preview-adjunto.png`, `compras-05-sincronizada.png`, `compras-06-permiso-redirect.png`, `compras-07-final.png`.
  - **Criterio:** checklist del §7 de la spec en verde y verificación del desarrollador. ✅ 2026-10-05
