import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { db } from '../../src/lib/db'
import { crmEnabled, crmFlags, crmKilled, crmMe } from '../../src/lib/crm/flags'
import { emitCrmEvent } from '../../src/lib/crm/events'
import { captureCrmChanges, reconcileDue } from '../../src/lib/crm/capture'
import { crmTick } from '../../src/lib/crm/tick'

// Matriz de testes do CRM (F7, docs/crm/08-testes-e2e.md), parte sem rede: o que se prova lendo o código ou chamando a
// função com o banco trocado por um dublê. Complementa tests/unit/crm.unit.spec.ts.

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const rel = (f: string) => relative(ROOT, f).split(sep).join('/')
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) ? [join(d, e.name)] : []))
const CRM_ROOTS = ['lib/crm', 'app/api/crm', 'components/crm'].map((d) => join(SRC, d))
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length

/** Tira os comentários (bloco e linha), mantendo as quebras de linha (número da linha certo) e o "//" de URLs. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, '')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

// ── T11.05 / S4 · kill switch ────────────────────────────────────────────────

test.describe('T11 · kill switch (CRM_DISABLED=1)', () => {
  test('T11.05 · S4 · com CRM_DISABLED=1 flags, /api/me, captura, fila e emissão desligam SEM consultar o banco', async () => {
    const anyDb = db as unknown as Record<string, unknown>
    const delegates = ['crmFeatureState', 'crmOutboxEvent', 'crmSyncCheckpoint'] as const
    const original = Object.fromEntries(delegates.map((k) => [k, anyDb[k]]))
    let calls = 0
    // dublê: qualquer método conta a chamada e falha (se o kill switch deixar passar, o teste mostra)
    const fake = new Proxy(
      {},
      {
        get: () => () => {
          calls++
          return Promise.reject(new Error('consulta ao banco'))
        },
      },
    )
    const prevEnv = process.env.CRM_DISABLED
    try {
      for (const k of delegates) anyDb[k] = fake
      // pré-condição: o dublê está no lugar. Comparado com ===: o expect(...).toBe(fake) procuraria asymmetricMatch
      // no dublê, e o Proxy responde a qualquer nome (contaria uma "consulta")
      expect(anyDb.crmFeatureState === fake).toBe(true)

      process.env.CRM_DISABLED = '1'
      expect(crmKilled()).toBe(true)
      expect(await crmEnabled('org-qualquer')).toBe(false)
      const flags = await crmFlags('org-qualquer')
      expect(Object.values(flags).every((v) => v === false)).toBe(true)
      expect(await crmMe('org-qualquer')).toEqual({ enabled: false, flags: { autoCreateDeals: false, suggestStage: false, notifications: false, exports: false } })
      expect(await crmTick()).toBeNull()
      expect(await crmTick('org-qualquer')).toBeNull()
      await expect(captureCrmChanges()).resolves.toBeUndefined()
      await expect(reconcileDue()).resolves.toBeUndefined()
      expect(
        await emitCrmEvent({
          organizationId: 'org-qualquer',
          eventType: 'alert.resolved',
          aggregateType: 'alert',
          aggregateId: 'a1',
          aggregateVersion: 1,
          data: { alertId: 'a1', conversationId: null },
        }),
      ).toBe(false)
      expect(calls).toBe(0)

      // controle: sem o kill switch o mesmo código vai ao banco (o dublê responde com erro)
      delete process.env.CRM_DISABLED
      expect(crmKilled()).toBe(false)
      await expect(crmEnabled('org-qualquer')).rejects.toThrow('consulta ao banco')
      expect(calls).toBe(1)
      process.env.CRM_DISABLED = '0' // só "1" desliga
      await expect(crmFlags('org-qualquer')).rejects.toThrow('consulta ao banco')
      expect(calls).toBe(2)
    } finally {
      for (const k of delegates) anyDb[k] = original[k]
      if (prevEnv === undefined) delete process.env.CRM_DISABLED
      else process.env.CRM_DISABLED = prevEnv
    }
    expect(anyDb.crmFeatureState).toBe(original.crmFeatureState)
  })
})

// ── T05.09 · CRM nunca manda mensagem pelo WhatsApp ──────────────────────────

const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) if (existsSync(c) && statSync(c).isFile()) return c
  return null
}

/** Fecho de importações a partir dos arquivos do CRM: todo arquivo de src/ alcançável e os pacotes externos usados. */
function importClosure(roots: string[]) {
  const seen = new Set<string>()
  const packages = new Set<string>()
  const queue = roots.flatMap(walk)
  while (queue.length) {
    const f = queue.pop() as string
    if (seen.has(f)) continue
    seen.add(f)
    const text = readFileSync(f, 'utf8')
    for (const m of text.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3]
      const r = resolveImport(f, spec)
      if (r) queue.push(r)
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) packages.add(spec)
    }
  }
  return { files: [...seen].map(rel).sort(), packages: [...packages].sort() }
}

test.describe('T05 · o CRM só sugere, nunca fala com o cliente', () => {
  test('T05.09 · nenhum arquivo do CRM alcança o WhatsApp (src/lib/whatsapp, Baileys) nem chama função de envio', () => {
    const { files, packages } = importClosure(CRM_ROOTS)
    expect(files.length).toBeGreaterThan(20) // sanidade: o fecho achou o CRM
    expect(files.filter((f) => f.startsWith('src/lib/whatsapp'))).toEqual([])
    expect(packages.filter((p) => /baileys|evolution|whatsapp-web|venom|wppconnect/i.test(p))).toEqual([])

    const SEND = /\b(sendMessage|sendText|sendMedia|readMessages|markRead|markAsRead|sendReadReceipt|sendReceipts?|sendPresenceUpdate|chatModify)\b/
    const offenders: string[] = []
    for (const f of CRM_ROOTS.flatMap(walk)) {
      const code = stripComments(readFileSync(f, 'utf8'))
      const m = SEND.exec(code)
      if (m) offenders.push(`${rel(f)}: ${m[1]}`)
    }
    expect(offenders).toEqual([])

    // a tela do CRM não chama o gateway nem as conexões do WhatsApp
    const ui: string[] = []
    for (const f of walk(join(SRC, 'components/crm'))) {
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const m of code.matchAll(/\/api\/(gateway|connections)\b/g)) ui.push(`${rel(f)}:${lineOf(code, m.index ?? 0)} ${m[0]}`)
    }
    expect(ui).toEqual([])
  })
})

// ── T08 · LGPD e segurança ───────────────────────────────────────────────────

/**
 * Argumentos da chamada que abre em `open` (o "("), com parênteses equilibrados. Texto fixo some ('' no lugar) e o
 * template literal vira só as expressões de dentro dos ${}: sobra o que é VALOR em tempo de execução.
 */
function callArgs(src: string, open: number): string {
  let depth = 0
  let out = ''
  let i = open
  while (i < src.length) {
    const ch = src[i]
    if (ch === "'" || ch === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== ch) j += src[j] === '\\' ? 2 : 1
      out += "''"
      i = j + 1
      continue
    }
    if (ch === '`') {
      let j = i + 1
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === '$' && src[j + 1] === '{') {
          let k = j + 2
          let braces = 1
          while (k < src.length && braces > 0) {
            if (src[k] === '{') braces++
            else if (src[k] === '}') braces--
            k++
          }
          out += ` ${src.slice(j + 2, k - 1)} `
          j = k
          continue
        }
        j++
      }
      out += "''"
      i = j + 1
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return out.slice(1)
    }
    out += ch
    i++
  }
  return out
}

test.describe('T08 · LGPD e segurança', () => {
  test('T08.04 · log do CRM não leva corpo, payload, texto, nome, telefone, e-mail nem e.message (pode citar valores)', () => {
    // O que pode: tipo do evento, ids, nome do recurso, e.name e o código do erro (como src/lib/crm/http.ts:107).
    // e.message NÃO: mensagem do Prisma cita os valores da consulta (telefone, e-mail) e a de um erro de domínio pode
    // carregar texto do cliente.
    const FORBIDDEN_ID = /\b(body|payload|payloadJson|rows|request|text|phone|email|displayName|pushName|customerName|notes|token)\b/
    const offenders: string[] = []
    let calls = 0
    for (const f of [join(SRC, 'lib/crm'), join(SRC, 'app/api/crm')].flatMap(walk)) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/\bconsole\.(log|info|warn|error|debug)\(/g)) {
        calls++
        const at = (m.index ?? 0) + m[0].length - 1
        const code = callArgs(src, at)
        const why: string[] = []
        if (/\.message\b/.test(code)) why.push('e.message')
        const id = FORBIDDEN_ID.exec(code)
        if (id) why.push(id[1])
        for (const n of code.matchAll(/\b(\w+)\.name\b/g)) if (!['e', 'err', 'error'].includes(n[1])) why.push(`${n[1]}.name`)
        if (why.length) offenders.push(`${rel(f)}:${lineOf(src, m.index ?? 0)} (${why.join(', ')})`)
      }
    }
    expect(calls).toBeGreaterThan(0) // sanidade: achou as chamadas de log
    // capture.ts, events.ts e worker.ts logavam e.message; hoje passam pelo errTag de src/lib/crm/log.ts
    expect(offenders).toEqual([])
  })

  test('T08.02 · a tela do CRM não injeta HTML: sem dangerouslySetInnerHTML, innerHTML, insertAdjacentHTML ou document.write', () => {
    // Parte estática. O XSS de ponta a ponta (texto hostil salvo e aberto na tela) está em tests/e2e/crm.ui.spec.ts › T08.02.
    const RAW_HTML = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/g
    const offenders: string[] = []
    const files = walk(join(SRC, 'components/crm'))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const m of code.matchAll(RAW_HTML)) offenders.push(`${rel(f)}:${lineOf(code, m.index ?? 0)} ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })
})

// ── T01.03 / T05.09 · gateway legado ─────────────────────────────────────────

test.describe('T01 · o WhatsApp continua só leitura', () => {
  test('T01.03 / T05.09 · o gateway do WhatsApp (sessões, eventos e conexões) não envia, não marca lida nem aparece online', () => {
    const roots = ['lib/whatsapp', 'app/api/gateway', 'app/api/connections'].map((d) => join(SRC, d))
    const files = roots.flatMap(walk)
    expect(files.length).toBeGreaterThan(5) // sanidade: achou o gateway
    const SEND = /\b(sendMessage|sendText|sendMedia|readMessages|markRead|markAsRead|sendReadReceipt|sendReceipts?|sendPresenceUpdate|chatModify|relayMessage)\b/g
    const offenders: string[] = []
    for (const f of files) {
      const code = stripComments(readFileSync(f, 'utf8'))
      for (const m of code.matchAll(SEND)) offenders.push(`${rel(f)}:${lineOf(code, m.index ?? 0)} ${m[0]}`)
    }
    expect(offenders).toEqual([])
    // a sessão abre sem ficar "online" para o cliente (sem "visto por último" novo nem confirmação de leitura)
    const manager = stripComments(readFileSync(join(SRC, 'lib/whatsapp/manager.ts'), 'utf8'))
    expect(manager).toMatch(/markOnlineOnConnect:\s*false/)
  })
})

test.describe('T08 · log das rotinas do CRM fora de lib/crm', () => {
  test('T08.04 · as rotinas do CRM no agendador e no tick logam só o tipo do erro (errTag), sem e.message', () => {
    // src/lib/background.ts roda as rotinas do CRM pelo safelyCrm; o safely() comum (das outras rotinas) leva e.message
    const bg = stripComments(readFileSync(join(SRC, 'lib/background.ts'), 'utf8'))
    const routines = [...bg.matchAll(/\b(safely|safelyCrm)\(\s*'([^']+)'/g)].map((m) => ({ fn: m[1], label: m[2] }))
    const crm = routines.filter((r) => /CRM/.test(r.label))
    expect(crm.map((r) => r.label).sort()).toEqual(['captura do CRM', 'fila do CRM', 'limpeza da fila do CRM', 'reconciliação do CRM', 'sugestões vencidas do CRM'])
    expect(crm.filter((r) => r.fn !== 'safelyCrm')).toEqual([])
    const body = /async function safelyCrm\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(bg)?.[1] ?? ''
    expect(body).toContain('errTag(e)')
    expect(body).not.toMatch(/\.message\b/)
    // a falha do CRM dentro do tick do gateway também
    const tick = stripComments(readFileSync(join(SRC, 'app/api/gateway/tick/route.ts'), 'utf8'))
    const crmLogs = [...tick.matchAll(/console\.(?:log|info|warn|error|debug)\(([^\n]*CRM[^\n]*)\)/g)].map((m) => m[1])
    expect(crmLogs.length).toBeGreaterThan(0)
    for (const l of crmLogs) {
      expect(l).toContain('errTag(')
      expect(l).not.toMatch(/\.message\b/)
    }
  })
})
