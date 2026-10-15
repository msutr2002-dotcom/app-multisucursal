# Spec: Módulo Facturas-SAT (FEL simulado — API del SAT)

## Contexto
Facturación electrónica **simulada** para el POS multisucursal, certificada contra la API pública del simulador FEL de la SAT. Hereda de `specs/mayoreo.md` (el total de la venta ya lleva el descuento aplicado) y respeta la guarda de red de `AGENTS.md`.

**API (descubierta por probe 2026-10-13, CORS abierto, sin auth):**
- `GET https://api-fel-sat.onrender.com/api/sat/contribuyentes/:nit` → 200 `{nit, nombre, direccion, estado}` · 404 `"El NIT ingresado no se encuentra registrado en el Padrón de la SAT."`
- `POST https://api-fel-sat.onrender.com/api/fel/facturas` → exige `items[]` (`descripcion`, `cantidad`, `precioUnitario`; `monto` se autocalcula) + `emisor.{nit, nombreComercial}`; `receptor` opcional (default `CF / CONSUMIDOR FINAL`); **recalcula `totales` = subtotal + IVA 12%** (round a 2 decimales; `totalGeneral = round(Σprecio × 1.12, 2)`); responde `data: {uuid, serie: "SAT-FEL-xxx", numeroDTE, estado: "CERTIFICADO", emisor, receptor, items, totales, fechaHoraCertificacion}`.
- `GET /api/fel/facturas` · `GET /api/fel/facturas/:uuid` → listado / por uuid.
- `DELETE /api/fel/facturas/:uuid` → elimina el DTE (anulación).
- El servidor **no valida** NIT de emisor ni receptor (el padrón solo consulta); Render puede tardar ~30–60 s en cold start.

## Decisiones cerradas v1 (2026-10-12, en pie)
- **D1 PDF:** HTML + `window.print()` con **dos formatos: 80 mm (rollo POS) y carta** — selector como el de `ModalComprobante` (`@page` dinámico con id `pagina-impresion-factura`). **Cero dependencias nuevas.**
- **D2 Flujo:** módulo "Facturación" en el nav (listado + ver/reimprimir) **+ atajo en el modal de resultado del POS** (tras la venta, click explícito, nunca en el camino crítico ≤2s).
- **D3 Red:** emitir **solo con conexión** (el SAT y el correlativo viven en servidores). Ver/reimprimir facturas ya emitidas funciona offline desde el espejo local.
- **D4 Marca de agua:** la factura sale **LIMPIA** (sin "PENDIENTE DE SINCRONIZACIÓN FISCAL" ni "SIMULACIÓN — NO FISCAL") en ambos formatos. El comprobante/ticket normal del POS **conserva** su marca de agua (regla AGENTS.md intacta).
- **D6 Correlativo interno:** folio `A-0000000X` propio (`UNIQUE (id_sucursal, serie, correlativo)`, contador con lock) para control interno; **el folio fiscal** es el del SAT (`serie` + `numeroDTE` + `uuid`) y es el que se imprime en primer lugar.
- **D7 Offline (espejo):** Dexie v9 store `facturas` con payload completo — listado y reimpresión sin red; emisión anulado offline (D3).
- **D8 Fuera de alcance v1:** múltiples series, frases tributarias GT, notas de crédito, anulación de la **venta** (el Anular de este módulo anula solo la **factura**). ~~QR SAT~~ **reabierto por D17 (solo carta).**

## Decisiones de la enmienda FEL (2026-10-13, aprobadas por el usuario)
- **D9 Certificación:** flujo emitir = (1) resolver receptor (D10), (2) `POST /api/fel/facturas` con emisor/receptor/items, (3) guardar fila local+servidor con los datos FEL vía RPC (D12), (4) abrir `FacturaImpresion`. Si el SAT falla/timeoutea → error claro, **no** se crea fila.
- **D10 Receptor (NIT vs CF):**
  - Venta con cliente NIT → **`GET /api/sat/contribuyentes/:nit` obligatorio**: 404 → rechazo **"NIT no registrado en el Padrón de la SAT"** (no se certifica); 200 → `nombre` y `direccion` del padrón son los que van en la factura (fuente autoritativa, se guardan en la fila).
  - Venta **sin NIT** → el atajo ofrece **«Facturar a CF»** → `receptor {nit: "CF", nombre: "CONSUMIDOR FINAL"}` (sin consulta de padrón). Rechazo directo de la v1 ("sin NIT no se factura") queda **reemplazado** por esta opción.
- **D11 IVA / ítems (precio ÷ 1.12):** los precios del POS **incluyen IVA**; al certificar se envía `precioUnitario = parte_del_total_cobrado / 1.12` con **6 decimales** (el servidor acepta decimales) → `totalGeneral = round(Σ × 1.12, 2)` = **exactamente el total cobrado** (probe: 10.50/1.12 = 9.375 → total 10.5 ✓). El descuento mayoreo se **prorratea** por proporción del subtotal de cada ítem antes de dividir; el reparto garantiza `Σ parte_i = total_cobrado` (el último ítem toma el residuo).
- **D12 Emisor:** `emisor = {nit, nombreComercial: name, direccion: address}` desde la **sucursal de la sesión** (`sucursal.nit` existe; `empresa` no tiene columna NIT). Si la sucursal no tiene NIT → bloquear emisión con aviso claro.
- **D13 Persistencia FEL:** columnas nuevas en `facturas`: `uuid_fel (UNIQUE)`, `serie_fel`, `numero_dte`, `estado_fel` (`CERTIFICADO|ANULADO`), `subtotal_fel`, `iva_fel`, `total_fel` (centavos enteros), `fecha_certificacion`. La RPC `emitir_factura` cambia de firma (**DROP de la vieja** — lección 42725) y recibe un `p_fel json` con la respuesta del SAT; si la venta ya tiene factura **ANULADA**, la reutiliza (UPDATE con el nuevo FEL); si tiene factura CERTIFICADA → rechazo.
- **D14 Anulación:** en `FacturasPage`, botón «Anular» (ConfirmModal, solo con red) → `DELETE /api/fel/facturas/:uuid` → RPC `anular_factura(id, id_sucursal)` marca `estado_fel='ANULADO'` + `anulada_en`; si el SAT no responde no se marca nada. Factura anulada queda visible con badge `ANULADO` (auditable) y su venta puede volver a facturarse (D13 reutiliza la fila).
- **D15 Impresión FEL:** el encabezado/agradecimiento igual que v1, y además: `uuid`, `Serie-Número DTE`, estado; bloque de totales **consistente**: `subtotal = round(total/1.12, 2)`, `IVA 12% = total − subtotal`, `total = total cobrado` (siempre suman y el total es el certificado; los valores crudos del SAT se guardan en BD para auditoría). Ítems impresos a precio base (÷1.12). **Sin marca de agua** (D4 intacto).
- **D16 Latencia SAT:** Render cold start; todo llamado con `AbortController`/timeout razonable y mensaje "El servicio del SAT no responde, intente de nuevo" — sin reintentos automáticos en loop.
- **D17 Layout carta FEL real (Task 12, aprobado 2026-10-13):** el tamaño **carta** de `FacturaImpresion` se re-diseña al layout del comprobante FEL real del SAT, **80 mm queda idéntico** (ciclo print `.comprobante-ticket` sin tocar). Carta incluye: encabezado **dos columnas** (emisor a la izquierda: nombre comercial, NIT, dirección; a la derecha: N° de autorización (**UUID**), Serie, N° DTE, fecha de emisión y de certificación, Moneda **GTQ**); bloque **comprador** (nombre/NIT/dirección o CF); tabla de ítems con **columnas SAT**: `#No`, `B/S`, Cant, Descripción, P. Unitario, Descuentos, Otros Desc., Total, `Impuestos (IVA)` por línea; fila **TOTALES**; nota ISR ("Impuesto sobre la Renta"); bloque **"Datos del certificador"** (SAT, NIT **16693949**); **QR del DTE** generado en cliente desde `fel.uuid` (dep `qrcode` ~15 kB, data-URL) — D8 enmendado; pie **"Contribuyendo juntos por Guatemala"**. Totales consistentes de D15 intactos. **Excepción D4:** como la factura FEL es comprobante simulado certificado, la carta se imprime **sin marca de agua** (ya era así desde v1) y ahora también sin la leyenda "PENDIENTE…" en el QR/leyendas — D4 sigue aplicando al ticket/comprobante normal del POS.

## Datos de la factura (RF-FS2, amendado por D15)
Encabezado: sucursal/empresa (nombre, NIT, dirección). **Folio fiscal SAT (`SAT-FEL-xxx-NNNNNNN`, uuid)** + folio interno `A-0000000X` (secundario). Receptor: nombre/NIT/dirección (padrón o CF). Fecha de certificación, vendedor, método de pago. Ítems a precio base + línea de descuento prorrateado cuando aplique. Subtotal, IVA 12%, Total (D15). Pie: "Gracias por su compra".

## RF-FS1–9
- RF-FS1: Tabla `facturas` (+ columnas FEL de D13) y contador; RPCs `emitir_factura(..., p_fel json)` (valida venta propia/completada/no facturada-certificada, lock correlativo, inserta/actualiza con FEL), `anular_factura`, `get_facturas`, `get_factura`.
- RF-FS2: `FacturaImpresion` 80 mm + carta, sin marca de agua, imprime los datos de D15.
- RF-FS3: `FacturasPage`: listado + búsqueda + Ver/Imprimir + **badge de estado FEL + Anular (D14)**; ruta/nav/permisos en los 5 lugares.
- RF-FS4: Dexie v9 store `facturas` + `facturaSyncService` (hidratar/leer local/emisión).
- RF-FS5: Atajo POS en `ModalResultadoVenta`: venta con NIT → «Emitir factura» (valida padrón → certifica → abre impresión); venta sin NIT → **«Facturar a CF»** (certifica directo). Online-only; errores (padrón 404, SAT caído, sucursal sin NIT) como alerta inline.
- RF-FS6: Sin red: atajo no emite; módulo y reimpresión funcionan desde el espejo.
- RF-FS7: `src/services/satFelService.js`: `consultarContribuyente(nit)`, `certificarFactura(payload)` (POST con timeout), `anularFactura(uuid)` (DELETE con timeout), `construirItemsFel(detalle, totalCobrado)` (prorrateo + ÷1.12, 6 decimales). Sin `service_role`, sin keys nuevas (API pública).
- RF-FS8: Guards: `hayRed()` en toda emisión/anulación; el módulo nunca bloquea por latencia del SAT (máster: acciones fuera del camino crítico, ≤2s intacto).
- RF-FS9: Consola y lint limpios; errores de negocio (404 padrón, 400 SAT) se muestran como alerta/toast, no como crash.

## Validación (E2E)
- Con red: venta enlazada con NIT **registrado en el padrón** (`12345678-0`, fixture público) → «Emitir factura» → certificado SAT (`uuid`/`serie`/`numeroDTE` visibles) → impresión 80 mm y carta con `@page` correcto, **sin marca de agua**, `total FEL = total cobrado` → fila en el módulo con badge CERTIFICADO.
- NIT de cliente **no registrado** en el padrón → bloqueo con el mensaje del SAT.
- Venta sin NIT → «Facturar a CF» → certifica con `CF / CONSUMIDOR FINAL`.
- Anular → DELETE SAT ok → badge ANULADO; re-emitir la misma venta reutiliza la fila con folio nuevo.
- Offline: módulo lista/remeprime desde espejo; emisión no disponible.
- lint + build + consola limpia.
