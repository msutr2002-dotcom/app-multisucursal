const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')

async function pruebaCrearUsuario() {
  let options = new edge.Options()
  let driver = await new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build()

  try {
    // === 1. LOGIN ===
    await driver.get('http://localhost:3000/#/login')

    const inputUser = await driver.wait(until.elementLocated(By.id('email')), 10000)
    const inputPsw = await driver.wait(until.elementLocated(By.id('password')), 10000)
    const btnIngresar = await driver.wait(
      until.elementLocated(By.css('[data-testid="btn-login"]')),
      5000,
    )

    await inputUser.clear()
    await inputUser.sendKeys('system')
    await inputPsw.clear()
    await inputPsw.sendKeys('system321')
    await btnIngresar.click()
    await driver.sleep(2000)

    // === 2. NAVEGAR A USUARIOS ===
    const navUsuarios = await driver.wait(
      until.elementLocated(By.xpath("//a[contains(.,'Usuarios')]")),
      5000,
    )
    await navUsuarios.click()
    await driver.sleep(2000)

    // === 3. CREAR USUARIO ===
    // Click "Nuevo Usuario"
    const btnNuevo = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(.,'Usuario')]")),
      5000,
    )
    await btnNuevo.click()
    await driver.sleep(1000)

    // Llenar formulario
    const inputNombre = await driver.wait(until.elementLocated(By.css('input[name="name"]')), 5000)
    await inputNombre.sendKeys('Usuario Selenium')

    const inputUsername = await driver.findElement(By.css('input[name="username"]'))
    await inputUsername.sendKeys('userselenium')

    const inputPassword = await driver.findElement(By.css('input[name="password"]'))
    await inputPassword.sendKeys('test123')

    // Seleccionar Rol
    const selectRol = await driver.findElement(By.css('select[name="id_rol"]'))
    await selectRol.click()
    const optionRol = await driver.wait(
      until.elementLocated(By.xpath("//select[@name='id_rol']//option[position()>1]")),
      3000,
    )
    await optionRol.click()

    // Seleccionar Sucursal
    const selectSucursal = await driver.findElement(By.css('select[name="id_sucursal"]'))
    await selectSucursal.click()
    const optionSuc = await driver.wait(
      until.elementLocated(By.xpath("//select[@name='id_sucursal']//option[position()>1]")),
      3000,
    )
    await optionSuc.click()

    // Click Crear Usuario
    const btnCrear = await driver.findElement(By.xpath("//button[contains(.,'Crear Usuario')]"))
    await btnCrear.click()
    await driver.sleep(2000)

    // Verificar
    const texto = await driver.getPageSource()
    if (texto.includes('Usuario Selenium')) {
      console.log('✅ USUARIO CREADO EXITOSAMENTE')
    } else {
      console.log('❌ ERROR: Usuario no encontrado en la lista')
    }
  } finally {
    await driver.quit()
  }
}

pruebaCrearUsuario()
