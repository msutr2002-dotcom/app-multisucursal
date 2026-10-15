const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')

async function pruebaLogin() {
  let options = new edge.Options()

  let driver = await new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build()

  try {
    await driver.get('http://localhost:3000/#/')

    //Esperar a que el input con id = "email"
    const inputUser = await driver.wait(until.elementLocated(By.id('email')), 10000)
    const inputPsw = await driver.wait(until.elementLocated(By.id('password')), 10000)
    const btnIngresar = await driver.wait(
      until.elementLocated(By.css('[data-testid="btn-login"]')),
      2000,
    )
    //const selectEmp = await driver.wait(until.elementLocated(By.id('empresa')), 500)
    //Cargar datos
    await inputUser.clear()
    await inputUser.sendKeys('system')
    await inputPsw.clear()
    await inputPsw.sendKeys('system321')
    await btnIngresar.click()
    //Esperar 3 segundos para visualisar
    await driver.sleep(10000)
  } finally {
    await driver.quit()
  }
}
pruebaLogin()
