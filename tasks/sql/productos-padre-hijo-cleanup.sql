-- ============================================================================
-- productos-padre-hijo — LIMPIEZA de productos de prueba (lo aplica el usuario)
-- Borra los productos residuales creados por los probes de verificación
-- (Tasks 1, 3, 4, 5 y 6). Todos se nombran "PROBE ...".
--
-- Motivos por los que `delete_producto_admin` no puede borrarlos:
--   * quedaron con filas en `stock_bodega` (FK) que el RPC no limpia, y
--   * el hijo vendido en la Task 6 tiene filas en `detalle_venta`, que el fix
--     `fix-delete-producto.sql` NO borra a propósito (protege historial).
-- Por eso esta limpieza también elimina las VENTAS de prueba que referencian
-- a esos productos (no solo el detalle) antes de borrarlos.
--   * `ventas` es referenciada por `detalle_venta`, `comprobante` y `facturas`
--     → hay que borrar esos hijos antes que la venta.
--   * `productos` es referenciada por `precio_producto`, `productos_sucursal`,
--     `detalle_venta`, `entradas`, `detalle_cotizacion`, `detalle_compra`,
--     `detalle_traslado`, `combo_componentes` (x2) y `stock_bodega`.
--
-- Se borran primero las dependencias conocidas y luego el producto.
-- Idempotente: si no hay productos "PROBE%" no hace nada.
-- ============================================================================

do $$
declare
  ids uuid[];
  ventas_prueba uuid[];
begin
  select array_agg(id) into ids from productos where name like 'PROBE%';

  if ids is null then
    raise notice 'Limpieza padre/hijo: no hay productos PROBE que borrar';
    return;
  end if;

  -- Ventas de prueba que incluyen algún producto PROBE (Task 6).
  -- Orden por dependencias: hijos de `ventas` (comprobante / facturas / detalle_venta) → `ventas`.
  select array_agg(distinct id_venta) into ventas_prueba
    from detalle_venta
   where id_producto = any(ids);

  if ventas_prueba is not null then
    delete from comprobante   where id_venta = any(ventas_prueba);
    delete from facturas      where id_venta = any(ventas_prueba);
    delete from detalle_venta where id_venta = any(ventas_prueba);
    delete from ventas        where id = any(ventas_prueba);
  end if;

  -- Dependencias directas de `productos` (todas las tablas con FK a `productos`).
  delete from entradas            where id_producto = any(ids);
  delete from detalle_cotizacion  where id_producto = any(ids);
  delete from detalle_compra      where id_producto = any(ids);
  delete from detalle_traslado    where id_producto = any(ids);
  delete from stock_bodega        where id_producto = any(ids);
  delete from productos_sucursal  where id_producto = any(ids);
  delete from precio_producto     where id_producto = any(ids);
  delete from combo_componentes   where id_producto = any(ids) or id_producto_componente = any(ids);
  delete from productos           where id = any(ids);

  raise notice 'Limpieza padre/hijo: % productos y % ventas de prueba eliminados',
    array_length(ids, 1), coalesce(array_length(ventas_prueba, 1), 0);
end $$;

notify pgrst, 'reload schema';
