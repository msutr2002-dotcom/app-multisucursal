# Spec: NIT y dirección por SUCURSAL (comprobantes)

## 1. Objetivo

Los comprobantes (venta, compra, cotización) muestran NIT/dirección tomados de `empresa`. Cada sucursal puede tener los suyos → la fuente pasa a ser `sucursal`, con fallback a la empresa.

## 2. Consolidación de dirección (feedback del desarrollador 2026-10-10)

`sucursal` **ya tenía** `address` (y `tel`) — el formulario de Sucursales los edita y los RPCs `create/update_sucursal_admin` los aceptan (`p_address`, `p_tel`). La columna `direccion` agregada inicialmente estaba **duplicada** → se dropea. **Decisión: dirección fiscal de la sucursal = `sucursal.address`**.

## 3. Requerimientos Funcionales

- **RF-01 (SQL — lo aplica el desarrollador):**
  - `alter table sucursal drop column if exists direccion;` (duplicada de `address`)
  - `sucursal.nit` se **conserva** (genuinamente nuevo).
  - RPC mínimo `set_sucursal_nit(p_id uuid, p_nit text)` (SECURITY DEFINER, grants anon+authenticated, `nullif(trim(...),'')`), patrón idéntico a `set_sucursal_vender_sin_stock` — los RPCs de crear/editar sucursal no aceptan NIT.
- **RF-02 (Comprobantes leen la sucursal de la sesión):** `ModalComprobante`, `ModalComprobanteCompra` e `ModalImpresionCotizacion` cargan `sucursal` por `currentUser.id_sucursal` (REST, RLS ya lo permite) y muestran:
  - `NIT: sucursal.nit || empresa.nit`
  - `dirección: sucursal.address` (**estricta**: si la sucursal no tiene dirección, no se muestra línea; decisión del desarrollador 2026-10-10)
- **RF-03 (Formulario admin):** `ModalSucursales` agrega campo **NIT**; `Sucursales.handleGuardar` lo persiste con `set_sucursal_nit` en edición (solo si cambió) y, en creación, si el RPC devuelve el id (si no, queda para la edición posterior con `console.warn`).
- **RF-04 (Sin regresión offline):** sin red, comportamiento igual que hoy (fetch de cortesía, sin NIT).
- **RF-05 (Nombre):** el encabezado del ticket sigue mostrando `empresa.name`.

## 4. Fuera de alcance

- Campo `tel` ya existe en el formulario (sin cambios). RPCs `create/update_sucursal_admin` intactos.

## 5. Verificación

- Sonda de comprobante de venta (Ferromax chichi): el ticket muestra la dirección **"Chichicastenango, Santa Cruz del Quicé"** (de `sucursal.address`).
- Con `sucursal.nit` poblado: el ticket muestra ese NIT; si se borra, fallback al de la empresa.
- Formulario de sucursales: campo NIT visible, guardar/editar persiste vía RPC.
