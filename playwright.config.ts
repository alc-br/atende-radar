import { defineConfig, devices } from '@playwright/test'
import { TOUR_AUDIO_TEST_ENV } from './tests/e2e/tour-audio-env'
import { TEST_DB_URL } from './tests/e2e/test-db-url'

// E2E_PORT: outra porta para rodar duas execuções ao mesmo tempo em checkouts diferentes (cada um tem seu prisma/test.db)
const PORT = Number(process.env.E2E_PORT) || 3100
const TEST_DB = TEST_DB_URL

// Outros navegadores (Firefox, Safari no Mac e no iPhone): só os fluxos que vendem e cobram, em job próprio no CI.
// Ligados por CROSS_BROWSER=1 (bun run test:e2e:browsers) para não pesar a suíte principal.
const CROSS_BROWSER = /(landing|conteudos|first-run|qr|conversations|billing-checkout|jornada|csp)\.ui\.spec\.ts$/
const crossBrowserProjects = process.env.CROSS_BROWSER
  ? [
      { name: 'ui-firefox', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
      { name: 'ui-safari', testMatch: CROSS_BROWSER, use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
      { name: 'ui-iphone', testMatch: CROSS_BROWSER, use: { ...devices['iPhone 14'] } },
    ]
  : []

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  // Testes de API (rápidos, sem navegador) e testes de interface em desktop e celular.
  projects: [
    { name: 'unit', testMatch: /\.unit\.spec\.ts$/ },
    { name: 'api', testIgnore: /(\.ui|\.unit)\.spec\.ts$/ },
    { name: 'ui-desktop', testMatch: /\.ui\.spec\.ts$/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'ui-mobile', testMatch: /\.ui\.spec\.ts$/, use: { ...devices['Pixel 7'] } },
    // tablet: só as varreduras de layout (design e página de vendas)
    { name: 'ui-tablet', testMatch: /(design|landing)\.ui\.spec\.ts$/, use: { ...devices['iPad Mini'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    ...crossBrowserProjects,
  ],
  webServer: {
    // Banco descartável: recriado e populado a cada execução, nunca toca dev.db nem produção.
    // Criado pelas migrações (prisma/migrations), como em produção: migração quebrada derruba os testes.
    command: `node tests/e2e/reset-test-db.mjs && bun scripts/db-migrate.ts && bun prisma/seed.ts && bun tests/e2e/seed-test-orgs.ts && bunx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXTAUTH_SECRET: 'e2e-secret-not-for-production',
      PLATFORM_ADMIN_EMAILS: 'platform@test.local',
      GATEWAY_SECRET: 'gateway-secret-test',
      // Credenciais do WhatsApp cifradas (32 bytes em base64, só para testes); o gateway Baileys fica desligado nos e2e
      WA_SESSIONS_KEY: 'ZTJlLXdhLXNlc3Npb25zLWtleS1ub3QtZm9yLXByb2Q=',
      SALES_EMAIL: 'vendas@atenderadar.test',
      ANALYSIS_SCHEDULER: 'off', // os testes disparam o motor com POST /api/gateway/tick, de forma determinística
      SIGNUP_RATE_LIMIT_PER_HOUR: '500', // os testes criam muitas contas do mesmo IP
      INVITE_RATE_LIMIT_PER_HOUR: '500', // idem para convites aceitos (createUser)
      NEXTAUTH_URL: `http://127.0.0.1:${PORT}`,
      // Pagar.me: sempre o SANDBOX nos testes (chaves *_TEST vêm do .env local ou dos segredos do CI)
      PAGARME_MODE: 'test',
      PAGARME_WEBHOOK_USER: 'webhook-e2e',
      PAGARME_WEBHOOK_PASS: 'webhook-e2e-senha',
      // Webhook de saída: libera http://127.0.0.1 (receptor local dentro do teste). Só vale fora de produção.
      WEBHOOK_ALLOW_LOCAL: '1',
      // Narração do tour: TTS falso (MP3 de silêncio, sem rede) e cache descartável em .tmp/ (tests/e2e/tour-audio-env.ts)
      ...TOUR_AUDIO_TEST_ENV,
    },
  },
})
