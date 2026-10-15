# Spec: Módulo Reportes-Impresión

## Contexto
`src/views/reportes/ReportesPage.jsx` (RF-V3) ya ofrece: presets Hoy/Mes/Año, rango manual, filtro por usuario, resumen (clientes atendidos, unidades, total cobrado), agrupado por día con líneas de detalle y funcionamiento offline-first (locales + servidor). El módulo **reportes-impresion** agrega la **impresión** de ese mismo reporte. No toca datos ni SQL.

## Decisiones cerradas (2026-10-12)
- **D1 Alcance v1:** imprimir el reporte tal como se ve en pantalla (resumen + grupos por día con líneas). Sin bloques nuevos (top productos, métodos de pago, stat de descuentos = v2).
- **D2 Mecanismo:** botón "Imprimir reporte" → `window.print()` con CSS print (patrón ya usado por `ModalComprobante`: clase en `<body>` + `@media print`). El tamaño (carta/ticket) lo elige el usuario en el diálogo del navegador.
- **D3 Contenido impreso:** encabezado (empresa, sucursal, período desde–hasta, filtro de usuario si aplica, fecha/hora de generación) + resumen (3 stat cards como texto) + grupos por día con cada venta (id corto, cliente, vendedor, hora, líneas cantidad×producto/p.u./subtotal, total, estado) + total general del período + leyenda **"Reporte interno — no es comprobante fiscal"**.
- **D4 Offline:** la impresión usa la data ya cargada (sin re-fetch); con datos locales imprime normalmente; NO lleva la marca de agua fiscal (no es comprobante de venta SAT).
- **D5 Anuladas:** se imprimen con su estado; el total general suma solo completadas (igual que en pantalla).
- **D6 Sin SQL:** cero cambios de BD.

## RF-RI1–4
- RF-RI1: Botón "Imprimir reporte" en el header de ReportesPage, visible siempre que haya ventas filtradas; deshabilitado con spinner si `cargando`.
- RF-RI2: Al imprimir se oculta el app shell y se imprime un nodo `#pagina-reporte` con el encabezado y el contenido del período filtrado (resumen + días + totales + leyenda).
- RF-RI3: `window.print()` se invoca tras renderizar el nodo; al terminar (afterprint o cierre del diálogo) se limpia el nodo/clase.
- RF-RI4: Sin errores en consola; el contenido impreso refleja los filtros vigentes (cambiar período/usuario y volver a imprimir imprime lo nuevo).

## Validación (Task 3)
- E2E: con ventas en el período, click "Imprimir reporte" (stub de `window.print`), nodo de impresión poblado con encabezado, resumen, al menos una venta y la leyenda; cambiar filtro de usuario y re-imprimir → el nodo refleja el filtro; lint + build.
