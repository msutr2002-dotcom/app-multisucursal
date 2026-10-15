/**
 * Ejecuta TODAS las suites CP-* en orden secuencial (una Edge a la vez) y
 * resume aprobados/reprobados leyendo los JSON de docs/e2e-resultados/.
 * Uso: node src/e2e/casos/ejecutarTodos.js   (o `npm run test:casos`)
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const RAIZ = path.resolve(__dirname, '..', '..', '..')
const RESULTADOS = path.join(RAIZ, 'docs', 'e2e-resultados')

const SUITES = [
  'CPLogin.test.js',
  'CPDashboard.test.js',
  'CPPOS.test.js',
  'CPInventario.test.js',
  'CPHistorial.test.js',
  'CPCompras.test.js',
  'CPReportes.test.js',
  'CPProductos.test.js',
  'CPCatalogos.test.js',
]

function main() {
  const corridas = []
  for (const archivo of SUITES) {
    const ruta = path.join(__dirname, archivo)
    if (!fs.existsSync(ruta)) {
      console.log(`\n=== ${archivo} (no existe, se omite) ===`)
      corridas.push({ archivo, codigo: -1, omitido: true })
      continue
    }
    console.log(`\n=== ${archivo} ===`)
    const r = spawnSync(process.execPath, [ruta], { stdio: 'inherit', cwd: RAIZ })
    corridas.push({ archivo, codigo: r.status === null ? -1 : r.status })
  }

  console.log('\n================ RESUMEN ================')
  let total = 0
  let aprobados = 0
  let reprobados = 0
  const faltantes = []
  for (const c of corridas) {
    const json = path.join(RESULTADOS, c.archivo.replace(/\.test\.js$/, '') + '.json')
    if (!fs.existsSync(json)) {
      console.log(`  ${c.archivo}: SIN JSON (exit ${c.codigo})`)
      faltantes.push(c.archivo)
      continue
    }
    const casos = JSON.parse(fs.readFileSync(json, 'utf8'))
    const ok = casos.filter((x) => x.estado === 'Aprobado').length
    const ko = casos.length - ok
    total += casos.length
    aprobados += ok
    reprobados += ko
    console.log(`  ${c.archivo}: ${ok}/${casos.length} aprobados${ko ? ` · ${ko} reprobados` : ''}`)
  }
  console.log('-----------------------------------------')
  console.log(`  TOTAL: ${aprobados}/${total} aprobados · ${reprobados} reprobados`)
  if (faltantes.length) console.log(`  Suites sin resultados: ${faltantes.join(', ')}`)
  console.log('  Genera el informe con: npm run test:casos-informe')
}

main()
