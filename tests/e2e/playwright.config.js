// Configuración de la E2E (QA-01). Ejecutar: npm run test:e2e
// En local, sin descargar navegadores: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npm run test:e2e
// En CI: npx playwright install --with-deps chromium (ver .github/workflows/ci.yml).
const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 4173);

module.exports = defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  outputDir: '../../test-results',
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    // El SW se prueba aparte (offline.spec.js); en el resto se bloquea para que la caché no interfiera.
    serviceWorkers: 'block',
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'movil-chromium',
      use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `node server.js ${PORT}`,
    cwd: __dirname,
    url: `http://127.0.0.1:${PORT}/index.html`,
    // Nunca reutilizar un servidor ya levantado: otro worktree en el mismo puerto serviría SU código y daría
    // resultados falsos. Si el puerto está ocupado, Playwright falla con un error claro: usa otro con
    // E2E_PORT=4700 npm run test:e2e (un puerto distinto por worktree).
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
