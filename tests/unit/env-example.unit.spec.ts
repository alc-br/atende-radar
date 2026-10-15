import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Toda variável de ambiente que o código do app lê (process.env.X em src/) está no .env.example,
// para quem instala saber que ela existe (ex.: SUPPORT_EMAIL, que faltava).
const ROOT = process.cwd()
const NOT_IN_EXAMPLE = new Set([
  'NODE_ENV', 'NEXT_RUNTIME', // definidas pelo Next/Bun
  'NEXT_PUBLIC_APP_VERSION', // preenchida no build (next.config.ts)
  'AUTH_SECRET', // nome antigo do NEXTAUTH_SECRET, lido só como alternativa
  'WEBHOOK_ALLOW_LOCAL', // só nos testes (playwright.config.ts)
])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts)$/.test(name) ? [p] : []
  })
}

test('.env.example lista as variáveis lidas em src/', () => {
  const used = new Set<string>()
  for (const f of files(join(ROOT, 'src'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1])
  }
  const example = new Set([...readFileSync(join(ROOT, '.env.example'), 'utf8').matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]))
  const missing = [...used].filter((v) => !example.has(v) && !NOT_IN_EXAMPLE.has(v)).sort()
  expect(missing, `faltam no .env.example: ${missing.join(', ')}`).toEqual([])
  expect(example.has('SUPPORT_EMAIL')).toBe(true)
})
