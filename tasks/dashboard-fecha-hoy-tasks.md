# Tasks: dashboard-fecha-hoy

**Módulo:** `dashboard-fecha-hoy` · **Spec:** `specs/dashboard-fecha-hoy.md`

## Task 1 — Extraer definiciones vivas de los RPC (bloqueada por el usuario)
- [x] El usuario corrió `tasks/sql/dashboard-fecha-hoy-diagnostico.sql` y entregó `pg_get_functiondef` de `get_dashboard_stats` (plpgsql/json) y `get_monthly_sales_chart` (sql/table).

## Task 2 — Escribir `tasks/sql/dashboard-fecha-hoy.sql`
- [x] `CREATE OR REPLACE` de ambos RPC conservando la lógica viva; sólo las expresiones de fecha pasan a `AT TIME ZONE 'America/Guatemala'` (`ventas_dia`, mes de compras/ventas/ganancias, rango del mes y etiqueta `to_char` de la gráfica). Firma/`RETURNS` intactos (no requiere `DROP`).
- [x] `SECURITY DEFINER` + `SET search_path`, `GRANT` a `anon, authenticated`, `NOTIFY pgrst`.

## Task 3 — Aplicar y verificar
- [x] Usuario aplicó `tasks/sql/dashboard-fecha-hoy.sql` en Supabase.
- [x] Verificado por REST (caso borde real): ventas de Libreria Luna en `2026-10-15T04:39–05:12Z` = **14-oct 22:00–23:12 GT**. RPC vivo → `get_dashboard_stats.ventas_dia = 0` (antes UTC daba 1000) y `get_monthly_sales_chart = [{"dia":"14","total":1000}]` (antes UTC daría `"15"`).
- [x] `npm run build` ✓ (sin cambios de cliente).
- [x] `memory.md` actualizado.
