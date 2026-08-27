import { defineConfig } from '@playwright/test'

/**
 * Binario de Chromium a usar, si el entorno impone uno.
 *
 * En CI no hace falta: `playwright install` descarga el build que espera la
 * version instalada. En contenedores de desarrollo con navegadores preinstalados
 * la version puede no coincidir —y entonces Playwright aborta pidiendo un
 * `playwright install` que ahi no toca—, asi que se deja apuntar al que exista.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
  },
  webServer: [
    {
      command: 'cd ../core-api && pnpm dev',
      port: 4000,
      // 15 s no bastaban: el arranque de core-api abre LanceDB y siembra el
      // catalogo de fabricantes antes de escuchar, y ronda los 13 s en un
      // contenedor sin calentar. El config abortaba antes de que respondiera.
      timeout: 120_000,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm dev',
      port: 5173,
      timeout: 60_000,
      reuseExistingServer: true,
    },
  ],
})
