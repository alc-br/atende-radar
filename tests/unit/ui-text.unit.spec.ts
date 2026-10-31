import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Padrão de textos (docs/design/guia-de-ui.md): "Tentar novamente" / "Tente novamente" (nunca "de novo"), e título de
// tela (h1) com maiúscula só na primeira palavra, salvo nomes próprios.
const ROOT = process.cwd()
const PROPER = new Set(['WhatsApp', 'AtendeRadar', 'Growth', 'Pix', 'Pagar.me', 'CRM'])

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}
const sources = files(join(ROOT, 'src')).map((f) => ({ f: relative(ROOT, f), text: readFileSync(f, 'utf8') }))

test('"Tentar novamente" padronizado (sem "Tentar de novo"/"Tente de novo")', () => {
  const found = sources.filter((s) => /Tent(ar|e) de novo/.test(s.text)).map((s) => s.f)
  expect(found).toEqual([])
})

test('h1 com maiúscula só na primeira palavra (exceto nomes próprios)', () => {
  const wrong: string[] = []
  for (const s of sources) {
    for (const m of s.text.matchAll(/<h1[^>]*>([^<{]+)/g)) {
      const words = m[1].trim().split(/\s+/).slice(1)
      if (words.some((w) => /^\p{Lu}/u.test(w) && !PROPER.has(w.replace(/[.,:;!?]+$/, '')))) wrong.push(`${s.f}: ${m[1].trim()}`)
    }
  }
  expect(wrong).toEqual([])
})
