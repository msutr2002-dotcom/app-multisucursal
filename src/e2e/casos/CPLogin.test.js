/**
 * CP-LOGIN — Casos de prueba del módulo Login (formato estándar).
 * Requiere dev server en :3000. Capturas en docs/capturas/CP-LOGIN-*.png,
 * resultados en docs/e2e-resultados/CPLogin.json.
 * Orden de ejecución: primero los negativos (dejan la página en error) y
 * al final el caso positivo (deja la sesión iniciada).
 */
const {
  crearDriver,
  caso,
  guardarResultados,
  resolverEmpresa,
  By,
  until,
  BASE,
} = require('./utilCasos')
const { Select } = require('selenium-webdriver/lib/select')

const RESULTADOS = []

const CASOS = {
  'CP-LOGIN-001': {
    id: 'CP-LOGIN-001',
    escenario: 'Inicio de sesión exitoso con credenciales correctas',
    pasos:
      '1. Ir a la página de login. 2. Ingresar usuario válido. 3. Ingresar contraseña válida. 4. Seleccionar la empresa correcta en el select. 5. Hacer clic en "Ingresar"',
    requisitos: 'El usuario está registrado en la base de datos y su empresa está activa',
    datos: 'Usuario: alex / alex123 (rol Gerente, sucursal Ferromax chichi)',
    esperado:
      'Aparece toast "Bienvenido — Sesion iniciada correctamente. Redirigiendo..." y el sistema redirige al usuario a #/dashboard (Admin → #/admin-dashboard)',
  },
  'CP-LOGIN-002': {
    id: 'CP-LOGIN-002',
    escenario: 'Inicio de sesión con usuario inexistente',
    pasos:
      '1. Ir a la página de login. 2. Ingresar un usuario inexistente. 3. Ingresar cualquier contraseña. 4. Seleccionar empresa. 5. Clic en "Ingresar"',
    requisitos: 'Se conoce un usuario no registrado',
    datos: 'Usuario: usuario_no_existe_cp / clave arbitraria',
    esperado:
      'Se muestra alerta roja "Usuario no encontrado. Verifique el usuario"; no se inicia sesión',
  },
  'CP-LOGIN-003': {
    id: 'CP-LOGIN-003',
    escenario: 'Inicio de sesión con contraseña incorrecta',
    pasos:
      '1. Ir a la página de login. 2. Ingresar usuario válido. 3. Ingresar contraseña incorrecta. 4. Seleccionar empresa. 5. Clic en "Ingresar"',
    requisitos: 'El usuario existe en la base de datos',
    datos: 'Usuario: alex con clave errónea "clave_errada_cp"',
    esperado: 'Se muestra alerta roja "Contraseña incorrecta"; no se inicia sesión',
  },
  'CP-LOGIN-004': {
    id: 'CP-LOGIN-004',
    escenario: 'Inicio de sesión sin seleccionar empresa',
    pasos:
      '1. Ir a la página de login. 2. Ingresar usuario y contraseña válidos. 3. Dejar el select de empresa en "Selecciona tu empresa". 4. Clic en "Ingresar"',
    requisitos: 'El usuario existe y tiene contraseña correcta',
    datos: 'Usuario: alex / alex123 con empresa vacía',
    esperado:
      'Se muestra alerta amarilla "Debe seleccionar una empresa para continuar"; no se inicia sesión',
  },
  'CP-LOGIN-005': {
    id: 'CP-LOGIN-005',
    escenario: 'Selección de empresa que no corresponde al usuario',
    pasos:
      '1. Ir a la página de login. 2. Ingresar usuario y contraseña válidos. 3. Seleccionar una empresa distinta a la de la sucursal del usuario. 4. Clic en "Ingresar"',
    requisitos: 'El usuario existe y tiene contraseña correcta',
    datos: 'Usuario: alex / alex123 con la primera empresa del select que NO sea la suya',
    esperado:
      'Se muestra alerta "No pertenece a esta empresa. Seleccione la empresa correcta"; no se inicia sesión',
  },
}

/** Limpia la sesión y abre el login listo para un intento nuevo (recarga real). */
async function loginPage(driver) {
  await driver.get('about:blank')
  await driver.sleep(400)
  await driver.get(BASE + '/#/')
  await driver.sleep(800)
  await driver.executeScript(
    "localStorage.removeItem('currentUser'); localStorage.removeItem('empresaSeleccionada')",
  )
  await driver.get('about:blank')
  await driver.sleep(400)
  await driver.get(BASE + '/#/')
  try {
    await driver.wait(until.elementLocated(By.id('email')), 15000)
  } catch (e) {
    const hash = await driver.executeScript('return location.hash')
    const src = (await driver.getPageSource()).slice(0, 300).replace(/\s+/g, ' ')
    throw new Error(`no apareció el formulario de login (hash=${hash}) · inicio: ${src}`)
  }
}

async function alerta(driver) {
  const els = await driver.findElements(By.css('.alert'))
  if (!els.length) return ''
  return (await els[0].getText()).trim()
}

async function main() {
  const driver = await crearDriver()
  try {
    // --- CP-LOGIN-002: usuario inexistente ---
    await caso(driver, RESULTADOS, CASOS['CP-LOGIN-002'], async () => {
      await loginPage(driver)
      await (await driver.findElement(By.id('email'))).sendKeys('usuario_no_existe_cp')
      await (await driver.findElement(By.id('password'))).sendKeys('cualquiera123')
      await driver.findElement(By.css('[data-testid="btn-login"]')).click()
      await driver.sleep(2500)
      const txt = await alerta(driver)
      const hash = await driver.executeScript('return location.hash')
      if (!/Usuario no encontrado/.test(txt))
        throw new Error(
          `Se esperaba "Usuario no encontrado..." y se observó: "${txt}" (hash ${hash})`,
        )
      return `Se observó la alerta "${txt}" y la sesión no inició (hash ${hash})`
    })

    // --- CP-LOGIN-003: contraseña incorrecta ---
    await caso(driver, RESULTADOS, CASOS['CP-LOGIN-003'], async () => {
      await loginPage(driver)
      await (await driver.findElement(By.id('email'))).sendKeys('alex')
      await (await driver.findElement(By.id('password'))).sendKeys('clave_errada_cp')
      await driver.findElement(By.css('[data-testid="btn-login"]')).click()
      await driver.sleep(3000)
      const txt = await alerta(driver)
      const hash = await driver.executeScript('return location.hash')
      if (!/Contraseña incorrecta/.test(txt))
        throw new Error(`Se esperaba "Contraseña incorrecta" y se observó: "${txt}" (hash ${hash})`)
      return `Se observó la alerta "${txt}" y la sesión no inició (hash ${hash})`
    })

    // --- CP-LOGIN-004: sin empresa ---
    await caso(driver, RESULTADOS, CASOS['CP-LOGIN-004'], async () => {
      await loginPage(driver)
      await (await driver.findElement(By.id('email'))).sendKeys('alex')
      await (await driver.findElement(By.id('password'))).sendKeys('alex123')
      await driver.findElement(By.css('[data-testid="btn-login"]')).click()
      await driver.sleep(2500)
      const txt = await alerta(driver)
      const hash = await driver.executeScript('return location.hash')
      if (!/Debe seleccionar una empresa/.test(txt))
        throw new Error(
          `Se esperaba "Debe seleccionar una empresa para continuar" y se observó: "${txt}" (hash ${hash})`,
        )
      return `Se observó la alerta "${txt}" y la sesión no inició (hash ${hash})`
    })

    // --- CP-LOGIN-005: empresa incorrecta ---
    await caso(driver, RESULTADOS, CASOS['CP-LOGIN-005'], async () => {
      await loginPage(driver)
      const empresaPropia = await resolverEmpresa('alex')
      const opciones = await driver.findElements(By.css('#empresa option'))
      let otra = null
      for (const o of opciones) {
        const v = await o.getAttribute('value')
        if (v && v !== empresaPropia) {
          otra = v
          break
        }
      }
      if (!otra) throw new Error('No hay otra empresa en el select para probar (solo una opción)')
      await (await driver.findElement(By.id('email'))).sendKeys('alex')
      await (await driver.findElement(By.id('password'))).sendKeys('alex123')
      await driver.findElement(By.css(`#empresa option[value="${otra}"]`)).click()
      await driver.findElement(By.css('[data-testid="btn-login"]')).click()
      await driver.sleep(3000)
      const txt = await alerta(driver)
      const hash = await driver.executeScript('return location.hash')
      if (!/No pertenece a esta empresa/.test(txt))
        throw new Error(
          `Se esperaba "No pertenece a esta empresa..." y se observó: "${txt}" (hash ${hash})`,
        )
      return `Se observó la alerta "${txt}" con empresa ${otra.slice(0, 8)}… (hash ${hash})`
    })

    // --- CP-LOGIN-001: ruta ideal (al final, deja la sesión iniciada) ---
    await caso(driver, RESULTADOS, CASOS['CP-LOGIN-001'], async () => {
      await loginPage(driver)
      const empresaId = await resolverEmpresa('alex')
      if (!empresaId) throw new Error('No se resolvió la empresa de alex para el select')
      await (await driver.findElement(By.id('email'))).sendKeys('alex')
      await (await driver.findElement(By.id('password'))).sendKeys('alex123')
      await new Select(await driver.findElement(By.id('empresa'))).selectByValue(empresaId)
      await driver.findElement(By.css('[data-testid="btn-login"]')).click()
      let hash = ''
      try {
        await driver.wait(
          async () => {
            hash = await driver.executeScript('return location.hash')
            return hash === '#/dashboard' || hash === '#/admin-dashboard'
          },
          15000,
          500,
        )
      } catch (e) {
        /* se evalúa abajo */
      }
      const toastOk = /Bienvenido|Sesion iniciada/.test(await driver.getPageSource())
      if (hash !== '#/dashboard')
        throw new Error(
          `Se esperaba redirección a #/dashboard y se observó hash "${hash}" (toast ${toastOk ? 'visible' : 'ausente'})`,
        )
      return `Toast de bienvenida presente y redirección a ${hash} tras iniciar sesión`
    })
  } catch (e) {
    console.log('EXCEP', String(e).split('\n').slice(0, 4).join(' | '))
  } finally {
    guardarResultados('CPLogin', RESULTADOS)
    try {
      await driver.quit()
    } catch (e) {
      /* ya cerrado */
    }
  }
  const reprobados = RESULTADOS.filter((r) => r.estado === 'Reprobado')
  console.log(
    reprobados.length === 0
      ? 'CP-LOGIN OK (5/5 aprobados)'
      : `CP-LOGIN con ${reprobados.length} reprobado(s): ${reprobados.map((r) => r.id).join(', ')}`,
  )
}

main()
