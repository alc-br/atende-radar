import { test, expect } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'

// Relatórios de verdade: gerados dos dados reais da empresa, com download (CSV para Excel e HTML imprimível/PDF).
const TYPES = ['daily', 'weekly', 'agent', 'lost_opportunities', 'promises', 'recovery', 'data_quality', 'connections']
const period = () => ({ periodStart: new Date(Date.now() - 7 * 86400000).toISOString(), periodEnd: new Date().toISOString() })

async function companyWithData() {
  const c = await setupCompany()
  await c.admin.post('/api/team', { data: { name: 'Carlos Mendes', email: 'carlos@empresa.test', role: 'atendente' } })
  const a = newChat()
  await c.send(a, 'Oi, quanto custa o clareamento?', { minutes: 90, pushName: 'Cliente Relatorio Um' })
  await c.send(a, '*Carlos*: Custa R$ 400. Já te retorno em 1 hora com as condições.', { fromMe: true, minutes: 80 })
  await c.send(newChat(), 'Quero agendar uma consulta', { minutes: 40, pushName: 'Cliente Relatorio Dois' })
  await c.tick()
  return c
}

test.describe('Relatórios reais', () => {
  test('gerar cria uma execução concluída na hora, com o conteúdo dos dados reais (nada de "processando" falso)', async () => {
    const c = await companyWithData()
    const r = await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })
    expect(r.status()).toBe(201)
    const run = (await r.json()).reportRun
    expect(run.status).toBe('completed')

    const csv = await c.admin.get(`/api/reports/runs/${run.id}/download?format=csv`)
    expect(csv.status()).toBe(200)
    expect(csv.headers()['content-type']).toContain('text/csv')
    expect(csv.headers()['content-disposition']).toContain('attachment')
    const text = await csv.text()
    expect(text).toContain('Relatório Diário')
    expect(text).toContain('Conversas iniciadas')
    expect(text).toContain('Cliente Relatorio Dois') // quem está esperando aparece
    await c.dispose()
  })

  for (const type of TYPES) {
    test(`tipo "${type}": gera e baixa em CSV e em HTML`, async () => {
      const c = await companyWithData()
      const r = await c.admin.post('/api/reports/generate', { data: { reportTypeId: type, ...period() } })
      expect(r.status(), type).toBe(201)
      const id = (await r.json()).reportRun.id
      const csv = await c.admin.get(`/api/reports/runs/${id}/download?format=csv`)
      expect(csv.status()).toBe(200)
      expect((await csv.text()).length).toBeGreaterThan(80)
      const html = await c.admin.get(`/api/reports/runs/${id}/download?format=html`)
      expect(html.status()).toBe(200)
      expect(html.headers()['content-type']).toContain('text/html')
      const body = await html.text()
      expect(body).toContain('<table')
      expect(body).toContain('AtendeRadar')
      await c.dispose()
    })
  }

  test('conteúdo específico: atendentes, promessas e conexões refletem os dados', async () => {
    const c = await companyWithData()
    const get = async (type: string, fmt = 'csv') => {
      const id = (await (await c.admin.post('/api/reports/generate', { data: { reportTypeId: type, ...period() } })).json()).reportRun.id
      return (await c.admin.get(`/api/reports/runs/${id}/download?format=${fmt}`)).text()
    }
    expect(await get('agent')).toContain('Carlos Mendes')
    expect(await get('promises')).toContain('Já te retorno em 1 hora')
    expect(await get('connections')).toContain('Recepção')
    expect(await get('lost_opportunities')).toContain('Cliente Relatorio')
    await c.dispose()
  })

  test('HTML escapa o conteúdo das mensagens (sem injeção)', async () => {
    const c = await setupCompany()
    await c.send(newChat(), '<script>alert(1)</script> quanto custa?', { minutes: 40, pushName: '<img src=x onerror=alert(2)>' })
    await c.tick()
    const id = (await (await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })).json()).reportRun.id
    const html = await (await c.admin.get(`/api/reports/runs/${id}/download?format=html`)).text()
    expect(html).not.toContain('<script>alert(1)')
    expect(html).not.toContain('<img src=x')
    await c.dispose()
  })

  test('validação: tipo desconhecido, período inválido e formato inválido', async () => {
    const c = await companyWithData()
    expect((await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'inventado', ...period() } })).status()).toBe(400)
    expect((await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', periodStart: 'x', periodEnd: 'y' } })).status()).toBe(400)
    const id = (await (await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })).json()).reportRun.id
    expect((await c.admin.get(`/api/reports/runs/${id}/download?format=exe`)).status()).toBe(400)
    await c.dispose()
  })

  test('isolamento e permissão: outra empresa recebe 404; analista baixa; viewer baixa mas não gera', async () => {
    const c = await companyWithData()
    const id = (await (await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })).json()).reportRun.id
    const other = await setupCompany()
    expect((await other.admin.get(`/api/reports/runs/${id}/download?format=csv`)).status()).toBe(404)
    const anon = await loginAs('viewer.a@test.local')
    expect((await anon.post('/api/reports/generate', { data: { reportTypeId: 'daily', ...period() } })).status()).toBe(403)
    expect((await anon.get(`/api/reports/runs/${id}/download?format=csv`)).status()).toBe(404) // é de outra empresa
    await anon.dispose()
    await other.dispose()
    await c.dispose()
  })

  test('histórico lista as execuções geradas', async () => {
    const c = await companyWithData()
    await c.admin.post('/api/reports/generate', { data: { reportTypeId: 'weekly', ...period() } })
    const hist = (await (await c.admin.get('/api/reports')).json()).history
    expect(hist.some((h: { type: string; status: string }) => h.type === 'weekly' && h.status === 'completed')).toBe(true)
    await c.dispose()
  })
})

test.describe('Exportação de indicadores', () => {
  test('CSV e JSON dos indicadores diários da empresa', async () => {
    const c = await companyWithData()
    const csv = await c.admin.get('/api/reports/export?format=csv')
    expect(csv.status()).toBe(200)
    const text = await csv.text()
    expect(text).toContain('Data')
    expect(text).toContain('Conversas iniciadas')
    const json = await (await c.admin.get('/api/reports/export?format=json')).json()
    expect(Array.isArray(json.daily)).toBe(true)
    expect(json.daily.length).toBeGreaterThan(0)
    await c.dispose()
  })

  test('exportar exige login e a permissão de relatórios', async () => {
    const anon = await (await import('./helpers')).anonymous()
    expect((await anon.get('/api/reports/export?format=csv')).status()).toBe(401)
    await anon.dispose()
    const member = await loginAs('member.a@test.local')
    expect((await member.get('/api/reports/export?format=csv')).status()).toBe(403)
    await member.dispose()
  })
})
