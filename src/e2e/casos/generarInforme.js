/**
 * Genera docs/casos-prueba-formato-estandar.md a partir de los JSON de
 * docs/e2e-resultados/ (formato estándar: ID, Escenario, Pasos, Requisitos,
 * Datos, Resultados esperados, Resultados reales, Estado) con la captura de
 * cada caso enlazada.
 * Uso: node src/e2e/casos/generarInforme.js   (o `npm run test:casos-informe`)
 */
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..', '..', '..')
const RESULTADOS = path.join(RAIZ, 'docs', 'e2e-resultados')
const SALIDA = path.join(RAIZ, 'docs', 'casos-prueba-formato-estandar.md')

const GRUPOS = [
  ['CP-LOGIN-', 'Login'],
  ['CP-DASH-', 'Dashboard'],
  ['CP-POS-', 'Punto de Venta'],
  ['CP-INV-', 'Inventario'],
  ['CP-HIST-', 'Historial'],
  ['CP-COMP-', 'Compras'],
  ['CP-REP-', 'Reportes'],
  ['CP-PROD-', 'Productos'],
  ['CP-CAT-', 'Catálogos'],
]

const esc = (t) =>
  String(t ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>')

function main() {
  if (!fs.existsSync(RESULTADOS)) {
    console.log('No existe docs/e2e-resultados/ — corre primero `npm run test:casos`.')
    process.exit(1)
  }
  let todos = []
  for (const f of fs.readdirSync(RESULTADOS).filter((x) => x.endsWith('.json'))) {
    try {
      todos = todos.concat(JSON.parse(fs.readFileSync(path.join(RESULTADOS, f), 'utf8')))
    } catch (e) {
      console.log(`  · se omite ${f}: ${e.message}`)
    }
  }
  if (!todos.length) {
    console.log('No hay casos en los JSON de resultados.')
    process.exit(1)
  }

  const vistos = new Set()
  todos = todos.filter((c) => (vistos.has(c.id) ? false : (vistos.add(c.id), true)))
  todos.sort((a, b) => String(a.id).localeCompare(String(b.id)))

  const aprobados = todos.filter((c) => c.estado === 'Aprobado').length
  const reprobados = todos.length - aprobados

  const lineas = []
  lineas.push('# Casos de Prueba — Formato Estándar (ejecución E2E con Selenium)')
  lineas.push('')
  lineas.push(
    `Ejecución automatizada sobre \`http://localhost:3000\` · ${aprobados} aprobados / ${reprobados} reprobados de ${todos.length} casos · generado: ${new Date().toLocaleString('es-GT')}`,
  )
  lineas.push('')
  lineas.push(
    'Las capturas de pantalla de cada caso están en [`docs/capturas/`](capturas/). Los resultados en bruto (JSON) están en [`docs/e2e-resultados/`](e2e-resultados/).',
  )
  lineas.push('')
  lineas.push('## Resumen general')
  lineas.push('')
  lineas.push('| ID CASO | MÓDULO | ESCENARIO | ESTADO | CAPTURA |')
  lineas.push('| --- | --- | --- | --- | --- |')
  for (const c of todos) {
    const grupo = (GRUPOS.find(([p]) => c.id.startsWith(p)) || ['', '-'])[1]
    const capt = String(c.captura || '').endsWith('.png')
      ? `[ver](capturas/${path.basename(c.captura)})`
      : '—'
    lineas.push(
      `| ${esc(c.id)} | ${esc(grupo)} | ${esc(c.escenario)} | **${esc(c.estado)}** | ${capt} |`,
    )
  }
  lineas.push('')

  for (const [prefijo, titulo] of GRUPOS) {
    const delGrupo = todos.filter((c) => c.id.startsWith(prefijo))
    if (!delGrupo.length) continue
    lineas.push(`## ${titulo}`)
    lineas.push('')
    for (const c of delGrupo) {
      lineas.push(`### ${c.id} — ${c.escenario}`)
      lineas.push('')
      lineas.push('| CAMPO | CONTENIDO |')
      lineas.push('| --- | --- |')
      lineas.push(`| ID del caso de prueba | ${esc(c.id)} |`)
      lineas.push(`| Escenario de prueba | ${esc(c.escenario)} |`)
      lineas.push(`| Pasos de la prueba | ${esc(c.pasos)} |`)
      lineas.push(`| Requisitos previos | ${esc(c.requisitos)} |`)
      lineas.push(`| Datos de prueba | ${esc(c.datos)} |`)
      lineas.push(`| Resultados esperados/previstos | ${esc(c.esperado)} |`)
      lineas.push(`| Resultados reales | ${esc(c.real)} |`)
      lineas.push(
        `| Estado de la prueba: Aprobado/Reprobado | **${esc(c.estado)}** |`,
      )
      lineas.push('')
      if (String(c.captura || '').endsWith('.png')) {
        lineas.push(`![${c.id}](capturas/${path.basename(c.captura)})`)
        lineas.push('')
      }
    }
  }

  fs.writeFileSync(SALIDA, lineas.join('\n'), 'utf8')
  console.log(
    `Informe: ${path.relative(RAIZ, SALIDA)} — ${aprobados}/${todos.length} aprobados, ${reprobados} reprobados`,
  )
}

main()
