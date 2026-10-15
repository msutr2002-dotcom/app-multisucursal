# Spec: Reactividad de precios en el POS al cambiar catálogo

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `pos-precio-reactividad`

## Problema

Cuando el administrador cambia el precio de un producto desde Catálogos → Precios (`ModalPrecios.jsx`, RPC `upsert_precio_producto`), el cambio **no se refleja en el POS** hasta que el usuario refresca la página.

Causa raíz doble:
1. `ModalPrecios.jsx` solo actualiza Supabase (RPC) y llama `onCambio()` (que refresca la vista de admin), pero **no actualiza Dexie localmente** ni **dispara `cola-sincronizada`**, por lo que el POS (que lee precios de Dexie) no se entera.
2. `POSPage.jsx` solo refresca `productosGrid` (precios) al escuchar el evento `cola-sincronizada` o `online`, y el `useEffect` de hidratación (`hidratarCatalogoParaSucursal`) solo se ejecuta al cambiar `idSucursal` — no al volver a la pestaña POS. Al regresar, `productosGrid` sigue con precios viejos.

## Objetivo

Que un cambio de precio (o de cualquier otro dato de producto) realizado en Catálogos se vea reflejado en el POS **sin refrescar la página**, tanto:
- al navegar de Catálogos de vuelta al POS (misma pestaña), como
- al guardar el precio desde la vista de administración mientras el POS está abierto.

## Alcance

- `src/views/pos/POSPage.jsx`: tras `hidratarCatalogoParaSucursal(idSucursal)` completar, disparar `cola-sincronizada` para que `recargarGrid()` vuelva a leer Dexie y actualice `productosGrid` con precios actuales.
- `src/views/admin/productos/ModalPrecios.jsx`: tras `guardar` o `eliminar` un precio con éxito, re-hidratar el catálogo local (`hidratarCatalogoParaSucursal`) para que Dexie tenga los nuevos precios, y disparar `cola-sincronizada` para que el POS (y otras vistas) se refresquen.
- Offline-First intacto: sin red no hay cambio de precio (el RPC falla y `guardar` muestra error), por tanto no hay evento que disparar.

## Fuera de alcance

- Reactividad en tiempo real entre pestañas distintas del navegador (cross-tab) — requeriría listener de `storage` y se deja para una tarea futura.
- Cambios de stock (ya se manejan vía `cola-sincronizada` en `recargarStockBodega`).

## Criterios de verificación

- V1: Cambiar precio de un producto en Catálogos → Precios, volver al POS, el nuevo precio se muestra sin refrescar la página.
- V2: A 390 px (móvil), el POS renderiza y el precio del producto en el grid/detalle es el actualizado.
- V3: `npx eslint` de archivos tocados: 0 errores nuevos (salvo CRLF preexistente).
- V4: `npm run build` ✓.
