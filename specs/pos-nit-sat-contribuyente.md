# Spec: Visualización del Contribuyente SAT y Soporte de NIT con Dígito K

**Fecha:** 2026-10-13 · **Estado:** en ejecución · **Módulo:** `pos-nit-sat-contribuyente`

## Contexto y Problema

1. **Dígito verificador K:** En Guatemala los NITs pueden terminar en un número o en la letra **`K`** (ej. `87654321-K`). La regex anterior `/^[0-9][0-9\- ]{3,14}$/` no permitía letras, por lo que cualquier NIT con `K` era clasificado incorrectamente como "nombre casual" y no se enviaba a validar ante la SAT.
2. **Nombre del Contribuyente en UI:** Cuando la API de la SAT devuelve los datos del contribuyente (ej. `{ nombre: "Maria Ana Sofia Lopez Morales" }`), la interfaz del POS únicamente mostraba un texto genérico "Cliente casual · NIT registrado en SAT", ocultando el nombre real del contribuyente. En el portal de la SAT o en un sistema FEL convencional, al ingresar el NIT aparece de inmediato el nombre del receptor en la parte inferior del campo.
3. **Velocidad de Respuesta:** Las consultas remotas al servicio de la SAT requieren un debounce adecuado (250 ms) y una capa de caché en memoria/local para que consultas repetidas o consultas del mismo cliente respondan de forma instantánea (0 ms).

## Decisiones de Diseño (D)

### D1 — Soporte de Dígito Verificador K/k y Normalización
- Nueva regex para detección de NIT candidato:
  `/^[0-9][0-9\- ]{2,13}[0-9kK]$/i`
  (Longitud de 4 a 15 caracteres, inicia con dígito numérico, acepta números, guiones y espacios intermedios, y finaliza con dígito `0-9` o `k`/`K`).
- Normalización: `normalizarNit(t) = t.replace(/\s+/g, '').toUpperCase()` garantizando que la letra K se envíe siempre en mayúscula.

### D2 — Nombre del Contribuyente Visible debajo del Campo (Estilo SAT)
- Al recibir respuesta exitosa de la SAT (`status === 'success'` con `data.nombre`):
  - Se almacena el nombre del contribuyente en el estado del componente (`resSat.nombre`).
  - Se muestra de forma destacada inmediatamente debajo del campo (color azul/primario, texto visible del nombre completo, ej: `Maria Ana Sofia Lopez Morales`).
  - Se añade indicador de verificación oficial `· SAT ✓`.

### D3 — Inclusión del Nombre en la Venta y Ticket
- Al procesar el cobro (`handleCobrar`), si el cliente no es un cliente enlazado de base de datos local pero la SAT proporcionó su nombre oficial:
  - Se asigna `cliente: enlazado ? enlazado.name : (resSat?.nombre || (nitCrudo ? '' : textoCliente))`
  - De esta forma, el comprobante y la factura emitida contendrán el nombre oficial del contribuyente (`Maria Ana Sofia Lopez Morales`).

### D4 — Caché en Memoria para Respuestas Inmediatas
- En `satFelService.js` se implementa un `Map` en memoria (`cacheContribuyentes`) que almacena las consultas exitosas por NIT normalizado.
- Si el NIT ya fue consultado durante la sesión, la respuesta se entrega de forma sincrónica e inmediata (0 ms).
- El debounce en `PanelPago.jsx` se optimiza a 250 ms (anteriormente 400 ms).

## Criterios de Aceptación

1. Escribir `87654321-K` en `#pos-cliente` es detectado como NIT válido.
2. Debajo del campo aparece de inmediato o tras la consulta el nombre **"Maria Ana Sofia Lopez Morales"** en azul/primario con indicador `SAT ✓`.
3. Al realizar la venta, el nombre del contribuyente viaja en los datos de la venta para el ticket.
4. Escribir un NIT previamente consultado muestra el nombre de inmediato desde la caché.
5. El build y linter del proyecto pasan sin errores.
