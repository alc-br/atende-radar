import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const TEST_DB = 'file:./test.db'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  // Testes de API (rápidos, sem navegador) e testes de interface em desktop e celular.
  projects: [
    { name: 'api', testIgnore: /\.ui\.spec\.ts$/ },
    { name: 'ui-desktop', testMatch: /\.ui\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'ui-mobile', testMatch: /\.ui\.spec\.ts$/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    // Banco descartável: recriado e populado a cada execução, nunca toca dev.db nem produção.
    command: `node tests/e2e/reset-test-db.mjs && bunx prisma db push && bun prisma/seed.ts && bun tests/e2e/seed-test-orgs.ts && bunx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXTAUTH_SECRET: 'e2e-secret-not-for-production',
      PLATFORM_ADMIN_EMAILS: 'platform@test.local',
      GATEWAY_SECRET: 'gateway-secret-test',
      SIGNUP_RATE_LIMIT_PER_HOUR: '500', // os testes criam muitas contas do mesmo IP
      NEXTAUTH_URL: `http://127.0.0.1:${PORT}`,
    },
  },
})
