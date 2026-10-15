# Tasks: NIT y dirección por SUCURSAL

- [ ] **Task 1: Comprobantes leen sucursal (nit/address) con fallback empresa**
  - Los 3 modales: fetch de la sucursal de la sesión + display `NIT: sucursal.nit || empresa.nit` y `dirección: sucursal.address || empresa.direccion`.
  - Implementada 2026-10-10 (tras feedback: se usa `address` preexistente, se dropea `direccion` duplicada). Verificar sonda de comprobante.
- [ ] **Task 2: Campo NIT en el formulario de Sucursales**
  - `ModalSucursales.jsx`: input NIT (prefill `sucursal.nit`).
  - `Sucursales.jsx`: `set_sucursal_nit` en edición (solo si cambió) y en creación si el RPC devuelve id.
  - Requiere SQL del RF-01 (drop columna + RPC).
