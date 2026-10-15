# Tasks: Modal de Stock limitado a la sucursal actual

- [ ] **Task 1: Filtrar ModalStock a la sucursal actual**
  - `Productos.jsx`: pasar `idSucursalActual` a `<ModalStock>`.
  - `ModalStock.jsx`: prop `idSucursalActual`; filtro `.eq('id', idSucursalActual)` cuando existe (fallback: todas las de la empresa); deps del effect + `disabled` de guardar sin filas.
  - Verificar: lint de los archivos tocados + `npm run build` + sonda (modal con 1 fila = sucursal de la sesión).
