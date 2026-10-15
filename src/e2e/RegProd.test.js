const { Builder, By, until } = require('selenium-webdriver')
const edge = require('selenium-webdriver/edge')

const BASE = 'http://localhost:3000'
const PAUSA_MS = 4000
const TIPEO_MS = 250

async function pruebaRegistrarProducto() {
  const options = new edge.Options()
  const driver = await new Builder().forBrowser('MicrosoftEdge').setEdgeOptions(options).build()

  const pausa = (ms = PAUSA_MS) => driver.sleep(ms)

  const escribirLento = async (elemento, texto) => {
    for (const c of texto) {
      await elemento.sendKeys(c)
      await driver.sleep(TIPEO_MS)
    }
  }

  const NOMBRE = `Producto Selenium ${Date.now()}`
  const SKU = `SKU-SEL-${Date.now()}`

  try {
    // === 1. LOGIN ===
    await driver.get(`${BASE}/#/login`)
    await pausa()

    const inputUser = await driver.wait(until.elementLocated(By.id('email')), 10000)
    const inputPsw = await driver.wait(until.elementLocated(By.id('password')), 10000)
    const btnIngresar = await driver.wait(
      until.elementLocated(By.css('[data-testid="btn-login"]')),
      5000,
    )

    // Elegir empresa "Luna" (Productos lee empresaSeleccionada de localStorage)
    await driver.wait(
      until.elementLocated(By.xpath("//select[@id='empresa']/option[contains(.,'Luna')]")),
      10000,
    )
    const selectEmpresa = await driver.findElement(By.id('empresa'))
    await selectEmpresa.click()
    await pausa(1500)
    const optionLuna = await driver.findElement(
      By.xpath("//select[@id='empresa']/option[contains(.,'Luna')]"),
    )
    await optionLuna.click()
    await driver.wait(
      async () =>
        (await driver.executeScript("return localStorage.getItem('empresaSeleccionada')")) !== null,
      5000,
    )
    await pausa(1500)

    await inputUser.clear()
    await escribirLento(inputUser, 'julia')
    await pausa(1000)
    await inputPsw.clear()
    await escribirLento(inputPsw, 'julia123')
    await pausa(1000)

    await btnIngresar.click()
    await pausa(6000)

    // === 2. NAVEGAR A PRODUCTOS ===
    const navProductos = await driver.wait(
      until.elementLocated(By.xpath("//a[normalize-space()='Productos']")),
      10000,
    )
    await navProductos.click()
    await pausa(4000)

    // === 3. ABRIR MODAL "NUEVO PRODUCTO" ===
    const btnNuevo = await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space()='Producto']")),
      10000,
    )
    await btnNuevo.click()
    await pausa(3000)

    // === 4. LLENAR FORMULARIO (tipeo lento, campo por campo) ===
    const inputNombre = await driver.wait(until.elementLocated(By.css('input[name="name"]')), 5000)
    await escribirLento(inputNombre, NOMBRE)
    await pausa(1500)

    await escribirLento(await driver.findElement(By.css('input[name="sku"]')), SKU)
    await pausa(1500)

    await escribirLento(await driver.findElement(By.css('input[name="precio_compra"]')), '25.50')
    await pausa(1500)

    await escribirLento(await driver.findElement(By.css('input[name="precio_inicial"]')), '49.90')
    await pausa(2000)

    // === 5. GUARDAR ===
    const btnCrear = await driver.wait(
      until.elementLocated(By.xpath("//button[normalize-space()='Crear Producto']")),
      5000,
    )
    await btnCrear.click()
    await pausa(3000)

    // === 6. VERIFICAR ===
    await driver.wait(
      until.elementLocated(
        By.xpath("//div[contains(@class,'toast-body') and contains(.,'Producto creado')]"),
      ),
      10000,
    )
    await pausa(3000)

    await driver.wait(
      until.elementLocated(
        By.xpath(`//div[contains(@class,'fw-semibold') and normalize-space()='${NOMBRE}']`),
      ),
      10000,
    )
    await pausa(3000)

    // === 7. LIMPIEZA: eliminar el producto de prueba ===
    const btnEliminar = await driver.wait(
      until.elementLocated(
        By.xpath(
          `//tr[.//div[normalize-space()='${NOMBRE}']]//button[contains(@class,'btn-danger')]`,
        ),
      ),
      10000,
    )
    await btnEliminar.click()
    await pausa(2000)

    const btnConfirmar = await driver.wait(
      until.elementLocated(
        By.xpath("//div[contains(@class,'modal')]//button[normalize-space()='Eliminar']"),
      ),
      5000,
    )
    await btnConfirmar.click()
    await pausa(2000)

    await driver.wait(async () => !(await driver.getPageSource()).includes(NOMBRE), 10000)
    await pausa(3000)
  } catch (err) {
    await pausa(5000)
  } finally {
    await driver.quit()
  }
}

pruebaRegistrarProducto()
