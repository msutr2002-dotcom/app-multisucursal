# Spec: Dashboard "Ventas de hoy" con día local (no UTC)

**Fecha:** 2026-10-15 · **Estado:** pendiente de aprobación · **Módulo:** `dashboard-fecha-hoy`

## Contexto

Reporte del usuario: el hero **"Ventas de hoy"** del dashboard muestra un monto aunque **no se haya vendido nada en el día actual**; aparece actividad de otro día.

## Causa raíz

Las ventas se guardan correctamente como **instantes** (`registrar_venta` → `now()`; offline `fecha: new Date().toISOString()`), pero los RPC del dashboard **agrupan por día/mes en UTC** (timezone de sesión de Supabase), mientras el usuario opera en **America/Guatemala (UTC−6, sin DST)**:

- `get_dashboard_stats(p_id_sucursal)` → `ventas_dia` se bucketea con `CURRENT_DATE` / `date_trunc('day', fecha)` / `fecha::date` (día UTC).
- `get_monthly_sales_chart(p_id_sucursal)` → `to_char(min(fecha),'DD')` + filtro "mes en curso" (día/mes UTC) — reconstruido el 2026-10-09, ver `memory.md:195`.

Efecto con el umbral 18:00 GT (24:00 UTC) — ya documentado como bug previo en `ReportesPage.jsx:30-31`:

- 18:00–23:59 GT: "hoy" (día UTC = mañana) **excluye** las ventas del día local → hero en Q0.00.
- 00:00–18:00 GT: "hoy" (día UTC = ayer) **incluye** la tarde-noche de ayer → "vendimos hoy" sin haber vendido hoy.

`Dashboard.jsx`/`StatsCards.jsx` sólo renderizan lo que devuelve el RPC; **no hay filtro de fecha en el cliente** que pueda mitigarlo (a diferencia de Reportes/Historial, que ya calculan rangos locales).

## Decisión

Corregir el **bucketing en el servidor** con `AT TIME ZONE 'America/Guatemala'`, **sin cambiar la firma** de los RPC (el cliente sigue llamando igual):

- `ventas_dia`: contar/`SUM` filtrando `(fecha AT TIME ZONE 'America/Guatemala')::date = (now() AT TIME ZONE 'America/Guatemala')::date`.
- mes en curso: `date_trunc('month', now() AT TIME ZONE 'America/Guatemala')`.
- gráfica: etiqueta `to_char((min(fecha) AT TIME ZONE 'America/Guatemala'), 'DD')`.

Se entrega `tasks/sql/dashboard-fecha-hoy.sql` para aplicar en Supabase (acuerdo previo: el usuario aplica el SQL). **No** se reescribe la lógica de negocio: se parte de la definición viva (Task 1 la extrae) y sólo se sustituyen las expresiones de fecha.

## Fuera de alcance

- Otros RPC con fechas (historial/reportes ya reciben instantes locales del cliente).
- `get_admin_dashboard_stats` (sólo conteos, sin fechas).
- El resto del backlog (colores, compras unidades, papel iris, móvil).

## Criterios de aceptación

- C1: Con ventas sólo de días anteriores (tarde-noche GT), el hero "Ventas de hoy" muestra **Q0.00**.
- C2: Una venta hecha hoy (hora local GT) aparece en "Ventas de hoy" aunque sea pasada la tarde.
- C3: La barra de la gráfica del día local coincide con el día real (una venta de las 19:00 GT cae en su día, no en el siguiente).
- C4: `total_ventas_mes` / barras del mes no se desplazan de mes en el último día del mes por ventas de la tarde.
- C5: `npm run build` ✓ y sin cambios en `Dashboard.jsx`/`StatsCards.jsx` (firma intacta).

## Riesgos

- Supabase usa UTC como timezone de sesión → se fija explícitamente `America/Guatemala` (no depender de la config del proyecto).
- Reconstruir el `CREATE OR REPLACE` sobre una definición viva mal copiada → se valida el dump y se conserva el cuerpo salvo las expresiones de fecha.
- `DROP` vs `CREATE OR REPLACE`: si cambia el `RETURNS TABLE` hay que `DROP` antes (trampa `42723`, `memory.md:195`).
