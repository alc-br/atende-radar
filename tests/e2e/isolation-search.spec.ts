import { test, expect } from '@playwright/test'
import { strFromU8, unzipSync } from 'fflate'
import { loginAs, uid } from './helpers'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// T3/T4 · isolamento entre empresas na BUSCA e nos ARQUIVOS exportados, e busca com caracteres especiais
// (aspas, % e _) que não quebra nem vaza. A empresa B do seed tem "Cliente Secreto B" (final 9999) e conv_b.

type Conv = { id: string; customerName: string; customerPhone: string | null }
const search = async (ctx: Awaited<ReturnType<typeof loginAs>>, q: string) => {
  const res = await ctx.get(`/api/conversations?limit=100&search=${encodeURIComponent(q)}`)
  return { status: res.status(), list: res.status() === 200 ? ((await res.json()).conversations as Conv[]) : [] }
}

test.describe('T3 · busca não atravessa empresas', () => {
  test('a busca da empresa A não acha o cliente da empresa B (nome nem final do telefone)', async () => {
    const a = await loginAs('admin.a@test.local')
    const b = await loginAs('admin.b@test.local')
    // controle: na própria empresa B a busca acha
    const own = await search(b, 'Secreto')
    expect(own.status).toBe(200)
    expect(own.list.map((c) => c.id)).toContain('conv_b')

    for (const q of ['Secreto', 'Cliente Secreto B', '9999', 'B']) {
      const r = await search(a, q)
      expect(r.status, q).toBe(200)
      expect(r.list.map((c) => c.id), `busca "${q}" na empresa A`).not.toContain('conv_b')
      expect(JSON.stringify(r.list), `busca "${q}" na empresa A`).not.toContain('Secreto')
    }
    await a.dispose()
    await b.dispose()
  })

  test('atendente busca só nas conversas dele, mesmo procurando pelo nome de outro cliente', async () => {
    const att = await loginAs('atendente.a@test.local')
    const r = await search(att, 'Cliente')
    expect(r.status).toBe(200)
    expect(r.list.length).toBeGreaterThan(0)
    expect(r.list.map((c) => c.id)).toContain('conv_a_own')
    const agentIds = await testDb.conversation.findMany({ where: { id: { in: r.list.map((c) => c.id) } }, select: { agentId: true } })
    expect(new Set(agentIds.map((x) => x.agentId))).toEqual(new Set(['agent_a_att']))
    await att.dispose()
  })
})

test.describe('T4 · busca com caracteres especiais', () => {
  test('aspas, % e _ são texto comum: não quebram a consulta nem viram curinga', async () => {
    const c = await setupCompany()
    const tag = uid()
    await c.send(newChat(), 'Oi, bom dia', { pushName: `Ana 100% Silva ${tag}` })
    await c.send(newChat(), 'Olá', { pushName: `Bruno Costa ${tag}` })
    await c.send(newChat(), 'Oi', { pushName: `Carla O'Neil ${tag}` })
    const all = await c.conversations()
    expect(all.length).toBe(3)

    const names = async (q: string) => {
      const res = await c.admin.get(`/api/conversations?limit=100&search=${encodeURIComponent(q)}`)
      expect(res.status(), `busca ${JSON.stringify(q)}`).toBe(200)
      return ((await res.json()).conversations as Conv[]).map((x) => x.customerName).sort()
    }
    // antes da correção, "%" e "_" traziam todas as conversas (LIKE sem escape)
    expect(await names('%')).toEqual([`Ana 100% Silva ${tag}`])
    expect(await names('_')).toEqual([])
    expect(await names('100%')).toEqual([`Ana 100% Silva ${tag}`])
    expect(await names('a%s')).toEqual([])
    expect(await names("O'Neil")).toEqual([`Carla O'Neil ${tag}`])
    expect(await names("' OR '1'='1")).toEqual([])
    expect(await names('"; DROP TABLE "Contact"; --')).toEqual([])
    expect(await names('bruno')).toEqual([`Bruno Costa ${tag}`]) // busca normal segue sem diferenciar maiúsculas
    // a consulta literal também fica dentro da empresa: a empresa A do seed não acha nada desta empresa
    const a = await loginAs('admin.a@test.local')
    const fromA = await search(a, `% Silva ${tag}`)
    expect(fromA.status).toBe(200)
    expect(fromA.list).toEqual([])
    await a.dispose()
    expect((await c.admin.get('/api/conversations?limit=100')).status()).toBe(200) // a tabela continua lá
    await c.dispose()
  })
})

test.describe('T3 · arquivos exportados só trazem a própria empresa', () => {
  test('relatório (CSV, XLSX, JSON, HTML) e indicadores da empresa A não têm nada da empresa B', async () => {
    test.setTimeout(120_000)
    const marker = uid()
    const A = await setupCompany()
    const B = await setupCompany()
    await A.send(newChat(), 'Oi, quanto custa o clareamento?', { minutes: 90, pushName: `Cliente Alfa ${marker}` })
    for (let i = 0; i < 3; i++) await B.send(newChat(), 'Quero agendar uma consulta, qual o valor?', { minutes: 60 + i, pushName: `Cliente Beta ${marker} ${i}` })
    await A.tick({ onlyThisCompany: true })
    await B.tick({ onlyThisCompany: true })
    const orgA = (await (await A.admin.get('/api/me')).json()).organizationId as string
    const orgB = (await (await B.admin.get('/api/me')).json()).organizationId as string
    const nameB = (await testDb.organization.findUniqueOrThrow({ where: { id: orgB } })).displayName

    const now = Date.now()
    const gen = await A.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', periodStart: new Date(now - 7 * 86400000).toISOString(), periodEnd: new Date(now).toISOString() } })
    expect(gen.status()).toBe(201)
    const runId = (await gen.json()).reportRun.id as string

    const texts: Record<string, string> = {}
    for (const fmt of ['csv', 'json', 'html']) {
      const r = await A.admin.get(`/api/reports/runs/${runId}/download?format=${fmt}`)
      expect(r.status(), fmt).toBe(200)
      texts[fmt] = await r.text()
    }
    const xlsx = await A.admin.get(`/api/reports/runs/${runId}/download?format=xlsx`)
    expect(xlsx.status()).toBe(200)
    const files = unzipSync(new Uint8Array(await xlsx.body()))
    texts.xlsx = Object.entries(files).filter(([n]) => n.endsWith('.xml')).map(([, f]) => strFromU8(f)).join('\n')

    for (const [fmt, text] of Object.entries(texts)) {
      expect(text, `${fmt}: o relatório traz o cliente da própria empresa`).toContain(`Cliente Alfa ${marker}`)
      expect(text, `${fmt}: cliente da outra empresa no arquivo`).not.toContain(`Cliente Beta ${marker}`)
      expect(text, `${fmt}: nome da outra empresa no arquivo`).not.toContain(nameB)
    }

    // indicadores diários (JSON): exatamente as linhas da empresa A
    const metrics = await A.admin.get('/api/reports/export?format=json')
    expect(metrics.status()).toBe(200)
    const { daily } = (await metrics.json()) as { daily: Array<{ messagesReceived: number }> }
    const rowsA = await testDb.dailyMetric.findMany({ where: { organizationId: orgA, connectionId: null, teamId: null } })
    expect(daily.length).toBe(rowsA.length)
    expect(daily.reduce((s, d) => s + d.messagesReceived, 0)).toBe(rowsA.reduce((s, d) => s + d.messagesReceived, 0))

    // exportação LGPD e relatório de B pedidos pela empresa A: 404 (não revela que existem)
    const convB = await testDb.conversation.findFirstOrThrow({ where: { organizationId: orgB } })
    expect((await A.admin.get(`/api/conversations/${convB.id}/privacy/export`)).status()).toBe(404)
    const runB = await B.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', periodStart: new Date(now - 86400000).toISOString(), periodEnd: new Date(now).toISOString() } })
    const runBId = (await runB.json()).reportRun.id as string
    expect((await A.admin.get(`/api/reports/runs/${runBId}/download?format=csv`)).status()).toBe(404)

    await A.dispose()
    await B.dispose()
  })
})

test.describe('Filtro "Hoje" da lista de conversas', () => {
  test('period=today deixa de fora a conversa criada em outro dia', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Oi', { pushName: 'Cliente de hoje' })
    await c.send(newChat(), 'Olá', { pushName: 'Cliente antigo' })
    const old = (await c.conversations()).find((x) => x.customerName === 'Cliente antigo')!
    await testDb.conversation.update({ where: { id: old.id as string }, data: { createdAt: new Date(Date.now() - 3 * 86400000) } })
    const res = await c.admin.get('/api/conversations?limit=100&period=today')
    expect(res.status()).toBe(200)
    const names = ((await res.json()).conversations as Conv[]).map((x) => x.customerName)
    expect(names).toContain('Cliente de hoje')
    expect(names).not.toContain('Cliente antigo') // antes: "Hoje" não filtrava nada
    await c.dispose()
  })
})
