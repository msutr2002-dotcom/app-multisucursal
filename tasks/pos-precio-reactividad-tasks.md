# tasks: reactividad de precios en el POS

Spec: `specs/pos-precio-reactividad.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [ ] Task 1: POSPage — dispatch `cola-sincronizada` tras hidratar catálogo.
  - `src/views/pos/POSPage.jsx`: en el `useEffect` de hidratación, tras `hidratarCatalogoParaSucursal(idSucursal)` completar, disparar `window.dispatchEvent(new CustomEvent('cola-sincronizada', { detail: { tabla: 'catalogo' } }))` para que `recargarGrid()` re-lea Dexie y actualice `productosGrid`.
  - Verificar: build ✓.
- [ ] Task 2: ModalPrecios — re-hidratar Dexie + dispatch `cola-sincronizada` tras guardar/eliminar precio.
  - `src/views/admin/productos/ModalPrecios.jsx`: importar `hidratarCatalogoParaSucursal`; obtener `idSucursal` de `currentUser`; tras `guardar`/`eliminar` con éxito, llamar `hidratarCatalogoParaSucursal(idSucursal)` y luego `window.dispatchEvent(new CustomEvent('cola-sincronizada', { detail: { tabla: 'precios' } }))`.
  - Verificar: build ✓.
- [ ] Task 3: Verificación con probe (allen / allen003 / Tasty Alitas).
  - Probe a 390×844: login, navegar a POS, verificar precio mostrado.
  - Probe desktop: verificar que al cambiar precio en Catálogos y volver al POS se ve el nuevo precio.
  - build ✓ + lint archivos tocados (0 nuevos).
  - Actualizar `memory.md` y `AGENTS.md`.
