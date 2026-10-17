-- ============================================================================
-- papel-iris → padre/hijo (Task 7) — migración de datos (la aplica el usuario)
--
-- Los colores de "papel iris" se crearon como productos INDEPENDIENTES con el
-- MISMO nombre (solo el color los distingue) → aparecen como N filas sueltas
-- en Admin → Productos. Esta migración crea UN padre contenedor por cada grupo
-- de productos con color que comparten nombre (normalizado en minúsculas, para
-- unir el error de tipeo "Hojas iris carta" vs "Hojas Iris carta") y los enlaza
-- como hijos (`id_padre`).
--
-- El padre: raíz, SIN color, no vendible; hereda categoría/marca de sus hijos.
-- No se toca stock, precios ni historial. Idempotente: si se corre de nuevo,
-- los miembros ya tienen `id_padre` (se filtran) → no hace nada.
-- Sólo agrupa grupos con ≥2 miembros (un producto de color único se deja igual).
-- ============================================================================

do $$
declare
  g record;
  v_padre uuid;
  v_existente uuid;
begin
  for g in
    select
      t.id_empresa,
      lower(btrim(t.name)) as base,
      (array_agg(t.name order by t.cnt desc, t.name))[1] as nombre_canonico,
      (array_agg(t.id_categoria) filter (where t.id_categoria is not null))[1] as id_categoria,
      (array_agg(t.id_marca)     filter (where t.id_marca     is not null))[1] as id_marca,
      (array_agg(t.imagen) filter (where t.imagen is not null and btrim(t.imagen) <> ''))[1] as imagen,
      array_agg(t.id) as ids,
      count(*) as n
    from (
      select p.*,
             count(*) over (partition by p.id_empresa, lower(btrim(p.name))) as cnt
        from productos p
       where p.id_color is not null
         and p.id_padre is null
    ) t
    group by t.id_empresa, lower(btrim(t.name))
    having count(*) > 1
  loop
    -- ¿Ya hay un padre raíz (sin color) con ese nombre? (reintentos / datos previos)
    select id into v_existente
      from productos
     where id_empresa = g.id_empresa
       and id_padre is null
       and id_color is null
       and lower(btrim(name)) = g.base
     limit 1;

    if v_existente is not null then
      v_padre := v_existente;
    else
      insert into productos
        (id, name, id_empresa, id_categoria, id_marca, imagen,
         precio_compra, tipo, estado, id_color, id_padre)
      values
        (gen_random_uuid(), g.nombre_canonico, g.id_empresa, g.id_categoria, g.id_marca,
         g.imagen, 0, 'bien', 'disponible', null, null)
      returning id into v_padre;
    end if;

    update productos
       set id_padre = v_padre
     where id = any(g.ids)
       and id <> v_padre;

    raise notice 'Padre "%" (empresa %) agrupa % variantes', g.nombre_canonico, g.id_empresa, g.n;
  end loop;
end $$;

notify pgrst, 'reload schema';
