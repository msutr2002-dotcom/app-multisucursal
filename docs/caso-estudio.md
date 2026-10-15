# Caso de estudio: el alta de compras siempre se rechaza al implementar el módulo

## Situación

Durante la implementación del módulo de Compras, el alta de una compra siempre se rechaza: el modal muestra un error y la compra no se guarda, aunque el RPC `registrar_compra` ya se creó en Supabase y los permisos de ejecución fueron concedidos. El resto del sistema (catálogos, ventas, historial) opera con normalidad.

## Datos observados

- Network: `POST /rpc/registrar_compra` → **404 PGRST202** ("Could not find the function public.registrar_compra ...").
- El RPC **existe** en el SQL editor de Supabase.
- Firma declarada: `registrar_compra(uuid, uuid, uuid, integer, jsonb)`; `EXECUTE` concedido a `anon` y `authenticated`.
- `GET /rpc/get_productos_admin` → 200 OK (el resto del módulo funciona).
- El error ocurre igual con red estable y en un navegador limpio (sin caché del cliente).

## Hipótesis

La caché de esquema de PostgREST no conoce la función recién creada; el cliente no la "ve" y devuelve un 404 engañoso. Como hipótesis alternativa, la firma invocada no coincide con la declarada (un cuerpo incompleto de parámetros produce el mismo 404 genérico). RLS no es el candidato principal: el RPC es `SECURITY DEFINER`.

## Acciones

1. Ejecutar `NOTIFY pgrst, 'reload schema';` y esperar a que surta efecto (puede requerir unos segundos).
2. Sondear el RPC con **cuerpo completo** de todos los parámetros requeridos (un cuerpo incompleto también devuelve 404 y enmascara el diagnóstico).
3. Comparar la firma exacta (orden y tipos de los parámetros) de la petición del cliente contra la declarada en la función.
4. Reintentar el alta de la compra y confirmar: respuesta 200/201, fila insertada en `compras` y stock actualizado en `productos_sucursal`.
5. Documentar la trampa en `AGENTS.md`: sondear RPCs siempre con cuerpo completo y recargar el esquema de PostgREST tras cualquier DDL.

Con estas acciones se resuelve la situación: el alta de compras vuelve a funcionar y los indicadores dejen de mostrar el 404 PGRST202.
