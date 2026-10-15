const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')

async function pruebaEditarUsuario() {
  let options = new edge.Options()
  let driver = await new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build()

  try {
    // 1. Login
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

    // 2. Navegar a Usuarios
    const navUsuarios = await driver.wait(
      until.elementLocated(By.xpath("//a[contains(.,'Usuarios')]")),
      5000,
    )
    await navUsuarios.click()
    await driver.sleep(2000)

    // 3. Buscar usuario
    const inputBuscar = await driver.wait(
      until.elementLocated(By.css('input[placeholder="Buscar..."]')),
      5000,
    )
    await inputBuscar.sendKeys('Usuario Selenium')
    await driver.sleep(1000)

    // 4. Click Editar
    const btnEditar = await driver.wait(
      until.elementLocated(
        By.xpath("//div[contains(@class,'card')]//button[contains(.,'Editar')]"),
      ),
      5000,
    )
    await btnEditar.click()
    await driver.sleep(1000)

    // 5. Cambiar nombre
    const inputNombre = await driver.wait(until.elementLocated(By.css('input[name="name"]')), 5000)
    await inputNombre.clear()
    await inputNombre.sendKeys('Usuario Selenium Editado')

    // 6. Guardar cambios
    const btnGuardar = await driver.findElement(By.xpath("//button[contains(.,'Guardar Cambios')]"))
    await btnGuardar.click()
    await driver.sleep(2000)

    // 7. Verificar
    const texto = await driver.getPageSource()
    if (texto.includes('Usuario Selenium Editado')) {
      console.log('✅ USUARIO EDITADO EXITOSAMENTE')
    } else {
      console.log('❌ ERROR: Cambios no encontrados')
    }
  } finally {
    await driver.quit()
  }
}

pruebaEditarUsuario()
