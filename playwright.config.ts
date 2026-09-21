import { defineConfig } from '@playwright/test'

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
  webServer: {
    // Banco descartável: recriado e populado a cada execução, nunca toca dev.db nem produção.
    command: `node tests/e2e/reset-test-db.mjs && bunx prisma db push --skip-generate && bun prisma/seed.ts && bunx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: TEST_DB,
      NEXTAUTH_SECRET: 'e2e-secret-not-for-production',
      NEXTAUTH_URL: `http://127.0.0.1:${PORT}`,
    },
  },
})
