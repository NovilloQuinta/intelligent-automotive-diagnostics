import { test, expect, type Page } from '@playwright/test'
import { generateSync } from 'otplib'

const PASSWORD = 'Password123!'

/** Cuenta nueva por test: dos recorridos no pueden compartir email. */
function freshUser() {
  const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  return {
    username: `e2e2fa_${suffix}`,
    email: `e2e2fa_${suffix}@test.com`,
    password: PASSWORD,
  }
}

type TestUser = ReturnType<typeof freshUser>

const SHOTS = 'tests/e2e/screenshots'

/** Captura de pantalla completa, numerada para leerlas en orden. */
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })

/** Registra la cuenta y deja la sesion abierta. */
async function register(page: Page, user: TestUser) {
  await page.goto('/login')
  await page.getByRole('tab', { name: 'Registrarse' }).click()
  await page.locator('#reg-username').fill(user.username)
  await page.locator('#reg-email').fill(user.email)
  await page.locator('#reg-password').fill(user.password)
  await page.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(page).toHaveURL('/', { timeout: 15000 })
}

/** Abre el perfil en la pestaña Seguridad. */
async function openSecurity(page: Page) {
  await page.goto('/profile')
  await page.getByRole('tab', { name: 'Seguridad' }).click()
}

test.describe('Segundo factor de punta a punta', () => {
  // Un solo recorrido: cada paso depende del anterior, y partirlo en tests
  // independientes obligaria a repetir el alta entera cuatro veces.
  test('alta con QR, login en dos pasos y desactivacion', async ({ page }) => {
    const USER = freshUser()
    await register(page, USER)
    await shot(page, '01-registro-completado')

    // ---- Alta: la pestaña Seguridad ofrece activar ----
    await openSecurity(page)
    await expect(page.getByRole('button', { name: 'Activar' })).toBeVisible()
    await shot(page, '02-perfil-seguridad')

    // ---- El QR ----
    await page.getByRole('button', { name: 'Activar' }).click()
    const qr = page.getByAltText('Código QR del segundo factor')
    await expect(qr).toBeVisible()
    await expect(qr).toHaveAttribute('src', /^data:image\/png;base64,/)
    await shot(page, '03-qr-del-alta')

    // El secreto en texto tiene que estar, para quien no pueda escanear.
    const secret = (await page.locator('span.font-mono').first().innerText()).trim()
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/)

    // ---- Activar con el codigo que generaria la app ----
    await page.locator('#profile-2fa-code').fill(generateSync({ secret }))
    await page.getByRole('button', { name: 'Confirmar' }).click()

    // ---- Los codigos de recuperacion, una sola vez ----
    await expect(page.getByText(/no volverán a mostrarse/i)).toBeVisible()
    const codes = await page.locator('ul.font-mono li').allInnerTexts()
    expect(codes).toHaveLength(10)
    await shot(page, '04-codigos-de-recuperacion')

    // ---- Cerrar sesion y volver a entrar: ahora pide codigo ----
    await page.goto('/')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.goto('/login')
    await page.locator('#login-email').fill(USER.email)
    await page.locator('#login-password').fill(USER.password)
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('#login-2fa-code')).toBeVisible()
    // Lo que demuestra que el primer factor ya no basta: seguimos fuera.
    await expect(page).toHaveURL('/login')
    await shot(page, '05-login-pide-el-codigo')

    // ---- Un codigo incorrecto no deja pasar, y el reto sigue vivo ----
    await page.locator('#login-2fa-code').fill('000000')
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('.text-destructive').first()).toBeVisible()
    await shot(page, '06-codigo-incorrecto')

    // ---- El codigo bueno abre la sesion ----
    await page.locator('#login-2fa-code').fill(generateSync({ secret }))
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/', { timeout: 15000 })
    await shot(page, '07-dentro-tras-verificar')

    // ---- El perfil refleja que esta activo ----
    await openSecurity(page)
    await expect(page.getByRole('button', { name: 'Desactivar' })).toBeVisible()
    await shot(page, '08-perfil-con-2fa-activa')

    // ---- Desactivar exige contrasena Y codigo ----
    await page.locator('#profile-2fa-password').fill(USER.password)
    await page.locator('#profile-2fa-disable-code').fill(generateSync({ secret }))
    await page.getByRole('button', { name: 'Desactivar' }).click()
    await expect(page.getByRole('button', { name: 'Activar' })).toBeVisible({ timeout: 15000 })
    await shot(page, '09-desactivado')

    // ---- Y el login vuelve a ser de un solo paso ----
    await page.goto('/')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    await page.goto('/login')
    await page.locator('#login-email').fill(USER.email)
    await page.locator('#login-password').fill(USER.password)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL('/', { timeout: 15000 })
  })

  test('un codigo de recuperacion entra, y solo una vez', async ({ page }) => {
    const USER = freshUser()
    await register(page, USER)
    await openSecurity(page)
    await page.getByRole('button', { name: 'Activar' }).click()
    await expect(page.getByAltText('Código QR del segundo factor')).toBeVisible()
    const secret = (await page.locator('span.font-mono').first().innerText()).trim()
    await page.locator('#profile-2fa-code').fill(generateSync({ secret }))
    await page.getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.getByText(/no volverán a mostrarse/i)).toBeVisible()
    const [recoveryCode] = await page.locator('ul.font-mono li').allInnerTexts()

    /** Cierra sesion y llega al paso del codigo. */
    async function reachCodeStep() {
      await page.goto('/')
      await page.getByRole('button', { name: 'Cerrar sesión' }).click()
      await page.goto('/login')
      await page.locator('#login-email').fill(USER.email)
      await page.locator('#login-password').fill(USER.password)
      await page.locator('button[type="submit"]').click()
      await expect(page.locator('#login-2fa-code')).toBeVisible()
    }

    await reachCodeStep()
    await page.locator('#login-2fa-code').fill(recoveryCode)
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page).toHaveURL('/', { timeout: 15000 })

    // El mismo codigo, una segunda vez, ya no vale.
    await reachCodeStep()
    await page.locator('#login-2fa-code').fill(recoveryCode)
    await page.getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('.text-destructive').first()).toBeVisible()
    await expect(page).toHaveURL('/login')
  })
})
