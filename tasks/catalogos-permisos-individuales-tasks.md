# tasks: permisos individuales por catálogo

Spec: `specs/catalogos-permisos-individuales.md`. Una tarea a la vez; `[x]` tras aprobación del usuario.

- [x] Task 1: Agregar módulos de catálogo a los arrays MODULOS de ModalPermisos, RolesCard y useNavPermissions.
  - `src/views/admin/permisos/ModalPermisos.jsx`: agregados `colores`, `marcas`, `categorias`, `proveedores`, `unidades`, `tipos_precio`.
  - `src/views/admin/permisos/RolesCard.jsx`: agregados los mismos módulos.
  - `src/hooks/useNavPermissions.js`: agregados los mismos módulos.
  - Verificar: build ✓.
- [x] Task 2: Hacer que Catalogos.jsx respete permisos por pestaña.
  - Permisos individuales por pestaña (ver/crear/editar/eliminar) vía `usePermission(t.key, accion)`.
  - Ocultar pestañas sin permiso `ver`; redirigir al tab disponible si el activo pierde permiso.
  - Ocultar botón Crear si no hay permiso `crear`; Editar si no hay `editar`; Eliminar si no hay `eliminar`.
  - Verificar: eslint (solo CRLF preexistente) + build ✓.
- [x] Task 3: Verificación global.
  - build ✓ 4.17s; lint archivos tocados: 0 errores nuevos (solo CRLF preexistente del repo).
  - `memory.md` + `AGENTS.md` actualizados (regla de permisos individuales por catálogo).
