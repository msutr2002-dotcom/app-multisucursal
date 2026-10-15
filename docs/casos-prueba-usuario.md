# Casos de Prueba — Módulos de Usuario (sin Traslados)

Suite de pruebas manuales para el rol de usuario del POS (sidebar), excluyendo el módulo Traslados.
Convención de ID: `CP-<MÓDULO>-NNN`. Tipos de prueba: `Positiva (Ruta ideal)`, `Negativa`, `Límite`, `Permisos`, `Offline`.

---

## LOGIN

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-LOGIN-001 | Inicio de sesión exitoso con credenciales correctas | El usuario está registrado en la base de datos y su empresa está activa | 1. Ir a la página de login. 2. Ingresar usuario válido. 3. Ingresar contraseña válida. 4. Seleccionar la empresa correcta en el select. 5. Hacer clic en "Ingresar" | Aparece toast "Bienvenido — Sesion iniciada correctamente. Redirigiendo..." y el sistema redirige al usuario a #/dashboard (Admin → #/admin-dashboard) | Positiva (Ruta ideal) |
| CP-LOGIN-002 | Inicio de sesión con usuario inexistente | Se conoce un usuario no registrado | 1. Ir a la página de login. 2. Ingresar un usuario inexistente. 3. Ingresar cualquier contraseña. 4. Seleccionar empresa. 5. Clic en "Ingresar" | Se muestra alerta roja "Usuario no encontrado. Verifique el usuario"; no se inicia sesión | Negativa |
| CP-LOGIN-003 | Inicio de sesión con contraseña incorrecta | El usuario existe en la base de datos | 1. Ir a la página de login. 2. Ingresar usuario válido. 3. Ingresar contraseña incorrecta. 4. Seleccionar empresa. 5. Clic en "Ingresar" | Se muestra alerta roja "Contraseña incorrecta"; no se inicia sesión | Negativa |
| CP-LOGIN-004 | Inicio de sesión sin seleccionar empresa | El usuario existe y tiene contraseña correcta | 1. Ir a la página de login. 2. Ingresar usuario y contraseña válidos. 3. Dejar el select de empresa en "Selecciona tu empresa". 4. Clic en "Ingresar" | Se muestra alerta amarilla "Debe seleccionar una empresa para continuar"; no se inicia sesión | Negativa |
| CP-LOGIN-005 | Selección de empresa que no corresponde al usuario | El usuario existe y tiene contraseña correcta | 1. Ir a la página de login. 2. Ingresar usuario y contraseña válidos. 3. Seleccionar una empresa distinta a la de la sucursal del usuario. 4. Clic en "Ingresar" | Se muestra alerta "No pertenece a esta empresa. Seleccione la empresa correcta"; no se inicia sesión | Negativa |

---

## DASHBOARD

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-DASH-001 | Visualización correcta del panel principal | Sesión iniciada como usuario no Admin; ventas y compras registradas en el mes | 1. Ir a #/dashboard. 2. Observar el saludo, el hero "Ventas de hoy", las 5 tarjetas y la gráfica "Ventas del mes" | Saludo "Buenos días/tardes/noches, {nombre}" con fecha en español; monto de hoy en Q; tarjetas (Productos registrados, Compras del mes, Ventas del mes, Ganancias del mes, Productos con poco stock) con valores; gráfica de barras con total del mes | Positiva (Ruta ideal) |
| CP-DASH-002 | Navegación desde los accesos del dashboard | Sesión iniciada | 1. Ir a #/dashboard. 2. Clic en "Ir al Punto de Venta". 3. Volver al dashboard. 4. Clic en "Productos registrados" y luego en "Productos con poco stock" | Cada clic navega a la ruta correspondiente (#/pos, #/productos, #/productos?stock=bajo) sin errores | Positiva (Ruta ideal) |
| CP-DASH-003 | Dashboard sin datos en la sucursal | Sucursal nueva sin ventas/compras registradas | 1. Iniciar sesión en una sucursal sin actividad. 2. Ir a #/dashboard | La vista carga sin errores; el hero muestra Q0.00 y las tarjetas muestran 0; no hay pantalla en blanco | Negativa |
| CP-DASH-004 | Rol Admin redirige al dashboard de administración | Sesión iniciada con rol Admin | 1. Ir a #/dashboard con rol Admin | El sistema redirige automáticamente a #/admin-dashboard | Permisos |
| CP-DASH-005 | Dashboard sin conexión a internet | Sesión iniciada y sin red | 1. Cortar la conexión de red. 2. Ir a #/dashboard o recargar la página | La vista no se bloquea ni queda en blanco; no hay toasts; al recuperar la red los datos se actualizan | Offline |

---

## PUNTO DE VENTA

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-POS-001 | Venta completa en efectivo (ruta ideal) | Sesión iniciada, producto con stock y precio en la sucursal, red disponible | 1. Ir a #/pos. 2. Buscar un producto y seleccionarlo. 3. Elegir cantidad y clic en "Agregar". 4. Verificar el carrito. 5. En el panel de pago elegir tipo de pago "Efectivo". 6. Clic en "Realizar Venta" | El carrito agrega el ítem; se muestra spinner "Procesando..."; aparece modal "¡Venta realizada!" con Folio y botones "Nueva venta"; toast "Venta registrado correctamente"; el stock baja | Positiva (Ruta ideal) |
| CP-POS-002 | Búsqueda de producto por nombre y por SKU | Al menos un producto existe en la sucursal | 1. Ir a #/pos. 2. Escribir parte del nombre en el buscador ("Buscar por nombre, marca o código..."). 3. Limpiar y escribir el SKU completo. 4. Presionar Enter | El listado se filtra tras el debounce; con SKU exacto único el producto se selecciona automáticamente; sin coincidencias muestra "Sin resultados para "x"" | Positiva (Ruta ideal) |
| CP-POS-003 | Selección de precio por volumen | Producto con más de un tipo de precio configurado (ej: mínimo 5 unidades) | 1. Ir a #/pos. 2. Seleccionar el producto. 3. Revisar la sección "Precio:". 4. Cambiar la cantidad a un valor que alcanza el mínimo. 5. Agregar al carrito | Se muestra la opción "Auto _ Qx (según cantidad)" o "TIPO _ Qx (mín. N)"; al alcanzar el mínimo cambia al precio mayorista; el total se recalcula | Positiva (Ruta ideal) |
| CP-POS-004 | Vuelto con efectivo recibido mayor al total | Carrito con ítems y total a cobrar mayor a cero | 1. Armar un carrito. 2. Elegir "Efectivo". 3. Ingresar en "Efectivo recibido" un monto mayor al total. 4. Clic en "Realizar Venta" | El resumen muestra el campo "Vuelto" con la diferencia; la venta se procesa correctamente | Positiva (Ruta ideal) |
| CP-POS-005 | Efectivo recibido menor al total | Carrito con ítems | 1. Armar un carrito. 2. Elegir "Efectivo". 3. Ingresar en "Efectivo recibido" un monto menor al total | El resumen muestra "Falta" con la diferencia; el botón "Realizar Venta" queda deshabilitado | Negativa |
| CP-POS-006 | Intento de cobro con carrito vacío | Sesión iniciada, carrito sin ítems | 1. Ir a #/pos. 2. No agregar productos. 3. Intentar realizar la venta | El carrito muestra "Carrito vacío"; no se puede cobrar; se muestra el estado vacío "Busca un producto para ver su detalle" | Negativa |
| CP-POS-007 | Cantidad mayor al stock disponible | Producto con stock limitado (ej: 3 unidades) | 1. Seleccionar un producto con stock 3. 2. Intentar ingresar cantidad 5 en el detalle. 3. Agregar al carrito y subir la cantidad con + | La cantidad se limita al stock; el input queda bloqueado al llegar a stock máximo; no se excede el inventario | Límite |
| CP-POS-008 | Producto sin stock en la sucursal | Producto con stock 0 en la sucursal del dispositivo | 1. Buscar un producto agotado en la sucursal. 2. Revisar el detalle | Se muestra "Sin stock en tu sucursal — revisa disponibilidad en otras bodegas" y el botón "Agregar" está deshabilitado | Negativa |
| CP-POS-009 | Venta sin conexión (cola de sincronización) | Sesión iniciada, red caída, producto disponible localmente | 1. Cortar la red. 2. Ir a #/pos. 3. Armar carrito y realizar la venta en efectivo. 4. Revisar el modal resultado. 5. Clic en "Imprimir comprobante sin conexión" | Venta registrada localmente con toast "Venta registrada correctamente"; modal "¡Venta realizada!" con Folio; el comprobante impreso lleva marca de agua "PENDIENTE DE SINCRONIZACIÓN FISCAL"; la venta queda PENDING | Offline |
| CP-POS-010 | Guardar cotización sin conexión | Red caída y carrito con ítems | 1. Cortar la red. 2. Armar carrito. 3. Clic en "Cotización". 4. Abrir "Ver cotizaciones" | Modal "¡Cotización guardada localmente!" con aviso de comprobante sin red; toast "Cotización guardada"; la cotización aparece en el listado local | Offline |
| CP-POS-011 | Vaciar carrito con confirmación | Carrito con ítems | 1. Armar carrito con 2 o más productos. 2. Clic en "Vaciar". 3. Confirmar el reemplazo | Aparece confirmación "Reemplazar carrito"; al confirmar el carrito queda vacío ("Carrito vacío") y al cancelar conserva los ítems | Negativa |
| CP-POS-012 | Recuperar una venta pendiente | Existe al menos una venta pendiente guardada en la sucursal | 1. Ir a #/pos. 2. Clic en "Pendientes (n)". 3. Seleccionar un pendiente. 4. Completar el cobro | Se lista "No hay ventas pendientes en esta sucursal." solo si no hay; si hay, el pendiente se carga en el carrito y la venta se completa con folio | Positiva (Ruta ideal) |

---

## INVENTARIO

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-INV-001 | Visualización del listado de inventario | Usuario con permiso inventario/ver; productos cargados en la sucursal | 1. Ir a #/inventario. 2. Revisar columnas y contador. 3. Navegar de página si hay más de 25 productos | Título "Inventario" con contador "N productos"; columnas SKU, Producto, Categoría, Stock, Stock mín., Precio; paginación de 25 por página | Positiva (Ruta ideal) |
| CP-INV-002 | Búsqueda por nombre o SKU | Inventario con productos | 1. Ir a #/inventario. 2. Escribir en "Buscar por nombre o SKU..." | La tabla filtra en memoria y vuelve a la página 1; al limpiar se muestra el listado completo | Positiva (Ruta ideal) |
| CP-INV-003 | Filtrado por categoría | Productos de al menos dos categorías | 1. Ir a #/inventario. 2. Seleccionar una categoría en "Todas las categorías" | Solo se muestran productos de la categoría elegida; al volver a "Todas las categorías" se muestra todo | Positiva (Ruta ideal) |
| CP-INV-004 | Resaltado de stock bajo | Producto con stock menor o igual al stock mínimo | 1. Ir a #/inventario. 2. Localizar el producto con stock bajo | El stock se muestra con badge rojo y texto "Stock bajo"; los demás con badge verde | Positiva (Ruta ideal) |
| CP-INV-005 | Inventario vacío | Sucursal sin productos en IndexedDB | 1. Ir a #/inventario sin productos locales | Se muestra el icono y el mensaje "No hay productos en el inventario local"; sin errores en consola | Negativa |
| CP-INV-006 | Acceso sin permiso de ver | Usuario sin inventario/ver | 1. Iniciar sesión con un rol sin inventario/ver. 2. Intentar entrar a #/inventario | Tras validar el permiso el sistema redirige silenciosamente a #/dashboard | Permisos |
| CP-INV-007 | Aislamiento de datos por sucursal | Dos sucursales con stock distinto en el mismo producto | 1. Iniciar sesión en la sucursal A. 2. Ir a #/inventario. 3. Comparar el stock con el de la sucursal B | Solo se muestra el stock de la sucursal del dispositivo (A); nunca el de otra sucursal | Permisos |
| CP-INV-008 | Inventario sin conexión | Red caída, catálogo hidratado en IndexedDB | 1. Cortar la red. 2. Ir a #/inventario | La vista carga desde IndexedDB sin bloquearse; no hay botones de edición (solo lectura) | Offline |

---

## HISTORIAL

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-HIST-001 | Listado de ventas y cotizaciones con paginación | Ventas y cotizaciones registradas en la sucursal | 1. Ir a #/historial. 2. Revisar columnas y contador. 3. Cambiar el selector de tipo a "Solo ventas" | Título "Historial de Ventas y Cotizaciones"; contador "Mostrando X de Y"; columnas Fecha, Tipo, Folio, Usuario, Método, Ítems, Total, Estado, Acciones; "Cargar más" pagina de 50 en 50 | Positiva (Ruta ideal) |
| CP-HIST-002 | Búsqueda por folio o usuario | Existe al menos una venta registrada | 1. Ir a #/historial. 2. Escribir un folio o usuario en "Buscar por folio o usuario (Enter)". 3. Presionar Enter | El listado se filtra solo al presionar Enter; se muestra el registro coincidente | Positiva (Ruta ideal) |
| CP-HIST-003 | Filtros de estado, fechas y limpiar | Registros con distintos estados y fechas | 1. Ir a #/historial. 2. Seleccionar "Anuladas" en el select de estado. 3. Definir fechas desde/hasta. 4. Clic en "Limpiar" | Cada filtro aplica sobre la lista; "Limpiar" restaura "Todos los estados" y el listado completo | Positiva (Ruta ideal) |
| CP-HIST-004 | Detalle e impresión de comprobante | Venta completada existente | 1. Ir a #/historial. 2. Clic en una venta completada. 3. Revisar el modal "Detalle de venta". 4. Clic en "Imprimir comprobante" | Modal con Fecha, Usuario, Método, Estado, Cliente, ítems y Total; se imprime el comprobante con marca de agua si aún no sincroniza | Positiva (Ruta ideal) |
| CP-HIST-005 | Anulación de venta completada con red | Usuario con permiso historial/eliminar, red disponible, venta completada | 1. Ir a #/historial. 2. Clic en el ícono de papelera de una venta completada. 3. Revisar el modal "Anular venta". 4. Escribir un motivo. 5. Clic en "Anular venta" | El modal muestra "¿Anular la venta XXXXXXXX por Q…? El stock se devolverá a la sucursal."; toast "Venta anulada — El stock fue devuelto a la sucursal"; el estado cambia a anulada | Positiva (Ruta ideal) |
| CP-HIST-006 | Intento de anulación sin conexión | Red caída y venta completada visible | 1. Cortar la red. 2. Ir a #/historial. 3. Intentar anular una venta | Toast warning "La anulación se registra en el servidor: inténtala de nuevo al recuperar la red."; el estado no cambia | Offline |
| CP-HIST-007 | Edición y quita del cliente de la venta | Usuario con permiso historial/editar, red disponible | 1. Abrir el detalle de una venta. 2. Clic en "Editar". 3. Escribir un nombre de cliente y "Guardar". 4. Repetir y dejar el campo vacío | Con nombre: se guarda el cliente. Vacío: toast "Cliente quitado de la venta". Sin red: toast warning con aviso de folio sin red | Positiva (Ruta ideal) |
| CP-HIST-008 | Búsqueda sin resultados | Filtros que no coinciden con ningún registro | 1. Ir a #/historial. 2. Aplicar un folio inexistente con Enter | Se muestra "No hay registros con esos filtros" (agrega "en el almacenamiento local" si está offline); sin errores | Negativa |
| CP-HIST-009 | Acceso sin permiso de ver | Usuario sin historial/ver | 1. Iniciar sesión con rol sin historial/ver. 2. Intentar entrar a #/historial | El sistema redirige a #/dashboard | Permisos |
| CP-HIST-010 | Anulación sin permiso de eliminar | Usuario con historial/ver pero sin historial/eliminar | 1. Iniciar sesión con dicho rol. 2. Ir a #/historial. 3. Revisar las acciones de las filas | El botón de papelera (anular) no está visible; el resto del listado funciona | Permisos |

---

## COMPRAS

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-COMP-001 | Registrar una nueva compra | Usuario con permiso compras/crear; al menos un proveedor y productos | 1. Ir a #/compras. 2. Clic en "Nueva compra". 3. Seleccionar el proveedor. 4. Agregar producto con cantidad y precio unitario. 5. (Opcional) adjuntar imagen/PDF menor a 4 MB. 6. Clic en "Registrar compra" | Se agrega la línea con total "Total: Q…"; toast "Compra registrada" ("Guardada en el dispositivo y en cola de sincronización"); aparece en el listado con badge "sin sincronizar" hasta que sincronice | Positiva (Ruta ideal) |
| CP-COMP-002 | Registrar una entrada manual de mercadería | Usuario con permiso compras/crear; producto seleccionable | 1. Ir a la pestaña "Entradas". 2. Clic en "Nueva entrada". 3. Elegir producto. 4. Revisar la alerta "Stock actual: X → quedará Y". 5. Ingresar cantidad y motivo. 6. Clic en "Registrar entrada" | Toast "Entrada registrada"; el stock del producto sube al instante; la fila aparece en el listado de entradas | Positiva (Ruta ideal) |
| CP-COMP-003 | Validaciones del formulario de compra | Modal "Nueva compra" abierto | 1. Clic en "Registrar compra" sin proveedor. 2. Seleccionar proveedor pero sin productos. 3. Ingresar cantidad 0 o no numérica. 4. Ingresar precio inválido | Toasts warning: "Falta el proveedor", "Sin productos", "Cantidad inválida" / "Usa un entero mayor a cero", "Precio inválido"; no se guarda nada | Negativa |
| CP-COMP-004 | Adjunto mayor a 4 MB | Modal "Nueva compra" abierto | 1. Intentar adjuntar un archivo de más de 4 MB | Toast warning "Adjunto muy grande" / "El archivo no puede superar 4 MB"; el archivo no se adjunta | Límite |
| CP-COMP-005 | Anulación de compra con devolución de stock | Usuario con permiso compras/eliminar, red disponible, compra completada | 1. Ir a #/compras. 2. Clic en anular de una compra completada. 3. Revisar el modal "Anular compra". 4. Escribir motivo opcional. 5. Clic en "Anular compra" | Confirmación "¿Anular la compra XXXXXXXX por Q…? El stock se devolverá a la sucursal."; toast "Compra anulada / El stock fue devuelto a la sucursal"; estado en anulada | Positiva (Ruta ideal) |
| CP-COMP-006 | Registrar compra sin conexión | Red caída | 1. Cortar la red. 2. Ir a #/compras (aparece alerta "Sin conexión: estás viendo los registros locales..."). 3. Registrar una compra válida | Toast "Compra registrada — Sin conexión: guardada localmente (cola PENDING)"; la fila muestra el badge "sin sincronizar"; la alta sigue permitida | Offline |
| CP-COMP-007 | Intento de anular compra pendiente de sync | Compra con estado PENDING/CONFLICT o sin red | 1. Intentar anular una compra con badge "sin sincronizar" o con la red caída | El sistema bloquea la acción con toast explicativo; la compra no cambia de estado | Negativa |
| CP-COMP-008 | Filtros, pestañas y paginación | Varias compras y entradas registradas | 1. Ir a #/compras. 2. Alternar pestañas "Compras" y "Entradas". 3. Buscar "Buscar por proveedor o producto...". 4. Filtrar por estado. 5. Recargar con el botón "Recargar listado" | Cada pestaña muestra sus columnas y su vacío propio ("No hay compras registradas" / "No hay entradas registradas"); filtros y paginación de 50 por página funcionan | Positiva (Ruta ideal) |
| CP-COMP-009 | Visualización del comprobante de compra | Compra con adjunto o ticket generado | 1. Ir a #/compras. 2. Clic en el ícono de archivo de una compra. 3. Probar "Ticket 80 mm" y "Carta" | El modal muestra el adjunto local o el ticket con MarcaAguaComprobante; los botones "Cerrar", "Ticket 80 mm" y "Carta" funcionan (PDF: "Abrir en pestaña") | Positiva (Ruta ideal) |
| CP-COMP-010 | Permisos de creación y visualización | Usuario sin compras/crear y otro sin compras/ver | 1. Con un rol sin "crear": entrar a #/compras. 2. Revisar los botones "Nueva compra" y "Nueva entrada". 3. Con un rol sin "ver": intentar entrar a #/compras | Sin crear: los botones quedan deshabilitados u ocultos. Sin ver: redirige a #/dashboard | Permisos |

---

## REPORTES

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-REP-001 | Resumen de ventas del día (preset por defecto) | Ventas registradas hoy; usuario con permiso reportes/ver | 1. Ir a #/reportes. 2. Verificar el preset "Hoy" activo. 3. Revisar las tarjetas "Resumen" | Preset "Hoy" seleccionado; tarjetas "Clientes atendidos", "Unidades vendidas" y "Total cobrado" (Q) con valores correctos; ventas agrupadas por día | Positiva (Ruta ideal) |
| CP-REP-002 | Cambio de preset de fecha | Ventas en el mes y en el año | 1. Ir a #/reportes. 2. Clic en "Este Mes". 3. Clic en "Este Año" | Cada preset actualiza el rango, las tarjetas y el listado; el total del período cambia en consecuencia | Positiva (Ruta ideal) |
| CP-REP-003 | Rango de fechas manual | Reporte abierto con un preset activo | 1. Ir a #/reportes. 2. Editar los inputs "Desde" y "Hasta" | Al editar, el preset se desactiva; el listado se refiltra por el rango elegido | Positiva (Ruta ideal) |
| CP-REP-004 | Filtrado por usuario | Varias ventas de distintos usuarios en el período | 1. Ir a #/reportes. 2. Seleccionar un usuario en el select "Usuario" | Se muestran solo las ventas de ese usuario; "Todos los usuarios (N)" restaura el listado completo | Positiva (Ruta ideal) |
| CP-REP-005 | Detalle de productos por venta | Ventas con varias líneas en el período | 1. Ir a #/reportes. 2. Revisar una venta con "N líneas". 3. Revisar la tabla inferior | Cada venta muestra cliente, usuario, hora, líneas, total y badge de estado; la tabla lista "Cantidad × Producto", "Precio", "Tipo de precio" y "Subtotal" | Positiva (Ruta ideal) |
| CP-REP-006 | Período sin ventas | Rango de fechas sin actividad | 1. Ir a #/reportes. 2. Elegir un rango de fechas sin ventas | Tarjetas en 0 y mensaje "No hay ventas en el período seleccionado"; sin errores | Negativa |
| CP-REP-007 | Reportes sin conexión | Red caída | 1. Cortar la red. 2. Ir a #/reportes | Alerta "Sin respuesta del servidor, se muestran solo las ventas locales: ..."; el detalle usa el aviso de folio sin red; la vista nunca queda en blanco | Offline |
| CP-REP-008 | Acceso sin permiso de ver | Usuario sin reportes/ver | 1. Iniciar sesión con rol sin reportes/ver. 2. Intentar entrar a #/reportes | El sistema redirige a #/dashboard | Permisos |

---

## PRODUCTOS

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-PROD-001 | Crear un producto nuevo | Usuario con permiso productos/crear; empresa activa; categorías/marcas existentes | 1. Ir a #/productos. 2. Clic en "+ Producto". 3. Completar "Nombre *" (único) y los datos opcionales (SKU, categoría, marca, precio compra, precio inicial). 4. Clic en "Crear Producto" | Toast "Producto creado"; el producto aparece en la tabla con su precio y stock | Positiva (Ruta ideal) |
| CP-PROD-002 | Editar un producto existente | Producto existente con permiso productos/editar | 1. Ir a #/productos. 2. Clic en "Editar" de una fila. 3. Modificar nombre, estado u otra fecha. 4. Clic en "Guardar Cambios" | Toast "Producto editado"; los cambios se reflejan en la tabla | Positiva (Ruta ideal) |
| CP-PROD-003 | Eliminar un producto con confirmación | Producto existente con permiso productos/eliminar | 1. Ir a #/productos. 2. Clic en el ícono de papelera. 3. Revisar "Confirmar eliminación". 4. Clic en "Eliminar" | Mensaje "¿Eliminar el producto "X"? Esta acción no se puede deshacer."; toast "Producto eliminado"; desaparece de la tabla (cancelar lo conserva) | Positiva (Ruta ideal) |
| CP-PROD-004 | Crear producto sin nombre | Modal "Nuevo Producto" abierto | 1. Clic en "+ Producto". 2. Dejar "Nombre *" vacío. 3. Intentar guardar | El campo "Nombre *" es obligatorio; el formulario no se envía hasta completarlo | Negativa |
| CP-PROD-005 | Imagen inválida o mayor a 2 MB | Modal de producto abierto | 1. Intentar adjuntar un archivo que no sea imagen. 2. Adjuntar una imagen de más de 2 MB | Errores "El archivo debe ser una imagen" y "La imagen no puede superar 2 MB" (límite: "PNG o JPG, máximo 2 MB"); no se guarda | Límite |
| CP-PROD-006 | Gestión de precios por tipo y cantidad | Producto creado | 1. Clic en el precio verde de la fila (title "Clic para editar precios"). 2. En "Precios — {nombre}" agregar tipo de precio, "Desde" y "Precio (Q)". 3. Clic en "Agregar" | Toast "Precio agregado"; la fila muestra "TIPO · desde N (Q…)"; "Actualizar" muestra "Precio actualizado" y el icono de eliminar muestra "Precio eliminado" | Positiva (Ruta ideal) |
| CP-PROD-007 | Edición de stock por sucursal | Producto con stock en la sucursal actual y permiso productos/editar | 1. Clic en el número de Stock de la fila. 2. En "Stock — {nombre}" ajustar el stock y el mínimo (≥0). 3. Clic en "Guardar Stock" | Tabla por sucursal con columnas Sucursal, Stock, Mínimo; toast "Stock guardado"; el contador de la fila se actualiza | Positiva (Ruta ideal) |
| CP-PROD-008 | Filtros de búsqueda, estado y categoría | Productos con distintos estados y categorías | 1. Ir a #/productos. 2. Buscar "Buscar por nombre, SKU o marca...". 3. Filtrar por "Disponible"/"Agotado"/"Descontinuado". 4. Filtrar por categoría | Cada filtro reduce la tabla; margen en rojo cuando es ≤0; sin coincidencias se muestra vacío | Positiva (Ruta ideal) |
| CP-PROD-009 | Ocultación del botón de creación sin permiso | Usuario sin productos/crear | 1. Iniciar sesión con rol sin productos/crear. 2. Ir a #/productos | El botón "+ Producto" no está visible; las acciones de edición/eliminación siguen sus permisos | Permisos |
| CP-PROD-010 | Productos sin conexión | Red caída | 1. Cortar la red. 2. Ir a #/productos | Alerta "Sin conexión. Productos desde almacenamiento local — solo lectura."; se listan los datos de IndexedDB sin edición efectiva | Offline |

---

## CATÁLOGOS

| ID CASO | DESCRIPCIÓN/ESCENARIO | CONDICIÓN PREVIA | PASOS DE EJECUCIÓN | RESULTADO ESPERADO | TIPOS DE PRUEBA |
| --- | --- | --- | --- | --- | --- |
| CP-CAT-001 | Crear un registro en un catálogo | Usuario con permiso catalogos/crear; red disponible; empresa activa | 1. Ir a #/catalogos. 2. Verificar la pestaña "Marcas". 3. Clic en "+ Marca". 4. Escribir "Nombre *". 5. Clic en "Crear" | Toast "Marca creada"; el registro aparece en la lista de tarjetas | Positiva (Ruta ideal) |
| CP-CAT-002 | Editar un registro existente | Registro existente con permiso catalogos/editar | 1. Ir a #/catalogos. 2. Clic en "Editar" (title) de una tarjeta. 3. Modificar el nombre. 4. Clic en "Guardar Cambios" | Toast "Guardado correctamente"; la tarjeta muestra el nombre actualizado | Positiva (Ruta ideal) |
| CP-CAT-003 | Eliminar un registro con confirmación | Registro existente con permiso catalogos/eliminar | 1. Clic en "Eliminar" (title) de una tarjeta. 2. Revisar el mensaje. 3. Clic en "Eliminar" | Mensaje "¿Eliminar "X"? Esta acción no se puede deshacer."; toast "Registro eliminado"; desaparece de la lista | Positiva (Ruta ideal) |
| CP-CAT-004 | Navegación entre los 5 catálogos | Sesión con empresa activa | 1. Ir a #/catalogos. 2. Recorrer las pestañas: Marcas, Categorías, Proveedores, Unidades, Tipos de Precio. 3. Verificar el botón de creación de cada pestaña | Cada pestaña muestra su lista y su botón con el nombre correcto ("+ Marca", "+ Categoría", "+ Proveedor", "+ Unidad", "+ Tipo de Precio"); tipo de precio inicial: Marcas | Positiva (Ruta ideal) |
| CP-CAT-005 | Crear registro sin nombre | Modal "Nueva Marca" (o similar) abierto | 1. Clic en el botón de crear. 2. Dejar "Nombre *" vacío. 3. Intentar guardar | El campo "Nombre *" es obligatorio; no se envía el formulario | Negativa |
| CP-CAT-006 | Correo inválido en proveedor | Modal "Nuevo Proveedor" abierto | 1. Ir a la pestaña "Proveedores". 2. Clic en "+ Proveedor". 3. Ingresar un correo sin formato válido. 4. Intentar guardar | El input "Correo" (type email) bloquea el envío con correo inválido; con correo válido se guarda con datos de contacto (address · email · tel) | Negativa |
| CP-CAT-007 | Crear una unidad de medida | Pestaña "Unidades" y permiso catalogos/crear | 1. Ir a la pestaña "Unidades". 2. Clic en "+ Unidad". 3. Completar Nombre, Abreviatura (ej. UNI), Equivalencia (≥1) y el switch "Activa". 4. Clic en "Crear" | La tarjeta muestra el badge de abreviatura y el badge "Activa"/"Inactiva"; toast de creación correcta | Positiva (Ruta ideal) |
| CP-CAT-008 | Catálogos sin conexión | Red caída | 1. Cortar la red. 2. Ir a #/catalogos. 3. Intentar crear y eliminar un registro | Alerta "Sin conexión. Catálogos desde almacenamiento local — solo lectura."; guardar devuelve "Sin conexión: no se pueden guardar catálogos" y eliminar toast "Sin conexión / No se pueden eliminar registros sin red" | Offline |
| CP-CAT-009 | Permisos de creación/edición/eliminación | Usuario con distintas combinaciones de permisos de catálogos | 1. Con un rol sin crear: revisar los botones "+ ..." de cada pestaña. 2. Con un rol sin editar/eliminar: revisar los iconos de las tarjetas | Los botones/iconos sin permiso no están visibles; el resto de la pestaña se consulta normalmente | Permisos |
| CP-CAT-010 | Lista de catálogo vacía | Catálogo sin registros y con red | 1. Ir a #/catalogos con un catálogo vacío (ej. Marcas sin datos) | Mensaje "Crea el primer registro con el botón «Marca»." (offline: "No hay datos en el almacenamiento local."); sin errores | Negativa |
