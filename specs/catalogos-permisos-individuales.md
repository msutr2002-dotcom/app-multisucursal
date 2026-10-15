# Spec: Permisos individuales por catálogo

**Fecha:** 2026-10-15 · **Estado:** propuesta · **Módulo:** `catalogos-permisos-individuales`

## Problema

Actualmente los permisos de catálogos son un módulo genérico `catalogos` que controla acceso a toda la pantalla de Catálogos (ver/crear/editar/eliminar para todos los catálogos a la vez). El administrador no puede decir, por ejemplo, "este rol puede editar Colores pero no Marcas", o "puede ver Unidades pero no eliminarlas". Todo o nada.

Los catálogos existentes son: Marcas, Categorías, Proveedores, Unidades de Medida, Tipos de Precio, Colores.

## Objetivo

Que cada catálogo sea un módulo de permiso independiente con sus propias casillas Ver / Crear / Editar / Eliminar en la matriz de permisos por rol (ModalPermisos y RolesCard), y que la pantalla de Catálogos respete esos permisos por pestaña (ocultar pestañas sin permiso de ver, deshabilitar crear/editar/eliminar según el permiso correspondiente).

## Alcance

- Agregar módulos de permiso independientes para cada catálogo: `colores`, `marcas`, `categorias`, `proveedores`, `unidades`, `tipos_precio`.
- Expandir `ModalPermisos.jsx` para incluir estos módulos en la matriz de permisos.
- Expandir `RolesCard.jsx` para mostrar las badges de permisos de estos módulos.
- Expandir `useNavPermissions.js` para resolver/cachear permisos de estos módulos (offline-first).
- Modificar `Catalogos.jsx` para respetar permisos por pestaña:
  - Ocultar pestañas sin permiso `ver`.
  - Ocultar botón crear si no hay permiso `crear`.
  - Ocultar botón editar si no hay permiso `editar`.
  - Ocultar botón eliminar si no hay permiso `eliminar`.
- Los catálogos `tipos_precio` y `colores` son comunes para todas las empresas (según nota actual en Catalogos.jsx), pero sus permisos se gestionan por rol igual que los demás.
- Escritorio no cambia; la adaptación es solo de permisos, no de presentación.

## Fuera de alcance

- Agregar estos módulos a la navegación lateral (_nav.jsx) — solo permisos, no ítems de menú.
- Crear nuevos catálogos o tablas en BD.
- Cambiar la lógica de servidor/RLS; los permisos se resuelven en cliente igual que los módulos existentes.

## Criterios de verificación

- V1: Al abrir el modal de permisos de un rol, aparecen las filas de cada catálogo con sus 4 casillas.
- V2: Al desmarcar "Ver" de un catálogo, esa pestaña desaparece en la pantalla de Catálogos.
- V3: Al desmarcar "Crear" de un catálogo, el botón de crear no aparece en esa pestaña.
- V4: Al desmarcar "Editar" o "Eliminar", los respectivos botones no aparecen en las filas de ese catálogo.
- V5: eslint 0 errores nuevos + build ✓.
