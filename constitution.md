# CONSTITUCIÓN DEL PROYECTO: SISTEMA MULTISUCURSAL POS + ADMIN (LIBRERÍA)

> **Estado:** Documento Supremo del Repositorio. De cumplimiento estricto e inmutable para todo agente de IA y desarrollador humano.

---

## ARTÍCULO I: Filosofía de Desarrollo y Soberanía Humana

1. **Soberanía del Desarrollador:** La IA actúa como un asistente de ejecución técnica. El desarrollador humano aprueba, audita y asume la responsabilidad final de cada línea de código, vista o función RPC.
2. **Desarrollo Guiado por Especificaciones (SDD):** La IA TIENE PROHIBIDO generar código, crear componentes o alterar la estructura sin una especificación previa aprobada en `specs/` y una tarea activa en `tasks.md`.
3. **Ejecución Atómica:** La IA trabajará estricta y únicamente en **UNA sola tarea a la vez**. Muestra los cambios, espera la aprobación explícita y no avanza a la siguiente tarea por cuenta propia.

---

## ARTÍCULO II: Reglas Inviolables de Arquitectura Multisucursal y Offline-First

1. **Estructura Multisucursal Obligatoria (RF-07 / RF-04):**
   - Toda transacción de venta, movimiento de inventario, registro de caja o usuario DEBE incluir y filtrar explícitamente el ID de la sucursal (`branch_id` / `empresaSeleccionada`). Queda prohibida la manipulación de datos sin contexto de sucursal.
2. **Prioridad Local e Independencia de Red (RNF-01 / RNF-02):**
   - Toda operación en el Punto de Venta (POS) e inventarios locales debe ejecutarse **primero y directamente contra IndexedDB**.
   - La interfaz de usuario NUNCA debe bloquearse, congelarse o fallar por falta de conexión a internet o latencia de Supabase.
3. **Rendimiento Operativo (RNF-06):** El registro local de una venta en IndexedDB debe completarse y reflejarse en la UI en **menos de 2 segundos**.
4. **Gobernanza de Sincronización (RF-08 / RNF-07):**
   - Supabase actúa como el nodo central de respaldo y consolidación.
   - Todo registro local en IndexedDB mantendrá una cola con `sync_status`: `'PENDING' | 'SYNCED' | 'CONFLICT'`.
   - La sincronización asíncrona hacia los RPCs de Supabase respetará la integridad referencial por sucursal y no sobrescribirá datos sin validar la política de resolución de conflictos.

---

## ARTÍCULO III: Seguridad, Privacidad y Manejo Financiero

1. **Aislamiento de Datos por Sucursal:** Las políticas de RLS en Supabase y las consultas locales deben garantizar que los usuarios no administradores solo puedan leer/escribir datos pertenecientes a su sucursal asignada.
2. **Protección de Credenciales de Supabase:**
   - Únicamente se usará la clave pública/anon (`VITE_SUPABASE_ANON_KEY`) en el cliente. Queda prohibido el uso o exposición de claves `service_role` (administrador) en el código, en archivos `.env` o en los prompts.
3. **Manejo Estricto de Dinero:** Todos los valores monetarios deben almacenarse obligatoriamente en **centavos enteros** (ej. Q10.50 = `1050`) para evitar errores de redondeo en punto flotante. Deben formatearse para la UI usando la función helper `formatQ()`.

---

## ARTÍCULO IV: Estándares de Código, UI Multiplataforma y Convenciones

1. **Ecosistema de UI Exclusivo:** Solo está permitido usar componentes de **CoreUI / Bootstrap**. Queda prohibida la instalación o uso de Tailwind, MUI u otras librerías de estilos no autorizadas.
2. **Diseño Responsive y Accesible (RNF-03 / RNF-04):**
   - La pantalla de ventas (POS) debe ser intuitiva y totalmente táctil para teléfonos móviles, ofreciendo además atajos de teclado para uso en computadoras de escritorio.
3. **Control de Inventario y Alerta de Stock Bajo (RF-05):** Toda consulta o lista de inventario debe evaluar el umbral mínimo configurado (`stock <= min_stock`) para emitir las alertas visuales correspondientes.
4. **Verificación Previa de Iconos:** Antes de importar un icono de `@coreui/icons`, se debe verificar su existencia en terminal para evitar caídas en tiempo de ejecución (`undefined`).

---

## ARTÍCULO V: Integración con Herramientas (MCP)

1. **Acceso de Solo Lectura:** Las consultas a Supabase o bases de datos locales mediante Servidores MCP se limitarán a la inspección de esquemas DDL (`schema.sql`) y pruebas en entornos de desarrollo con datos ficticios (_mocks_).
2. **Respeto a la Navegación Existente:** Al agregar módulos o vistas, la IA debe actualizar los 5 puntos de configuración requeridos en el proyecto (`routes.js`, `_nav.jsx`, `useNavPermissions.js`, `ModalPermisos.jsx`, `RolesCard.jsx`).
