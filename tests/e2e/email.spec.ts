import { test, expect, request } from '@playwright/test'
import { BASE_URL, loginAs, signupOrg, uid } from './helpers'
import { gatewayClient, setupCompany, newChat } from './gw'
import { mailsTo, testDb } from './db'

// E-mails do produto: todo e-mail passa pelo EmailOutbox (o provedor real, Brevo, entra com MAIL_PROVIDER=brevo).
// Aqui se prova o que o sistema manda, para quem, quando e que os links levam a páginas que funcionam.

const BASE = BASE_URL
const linkIn = (body: string) => body.match(/https?:\/\/\S+/)?.[0] ?? ''

test.describe('E-mails: links das mensagens de conta', () => {
  test('cadastro, esqueci a senha e convite levam a páginas do app que abrem', async () => {
    const { email, password } = await signupOrg()
    const anon = await request.newContext({ baseURL: BASE })
    expect((await anon.post('/api/auth/forgot', { data: { email } })).status()).toBe(200)
    const admin = await loginAs(email, password)
    const convidado = `convidado.${uid()}@cliente.test`
    expect((await admin.post('/api/members', { data: { name: 'Convidado', email: convidado, role: 'atendente' } })).status()).toBe(201)

    const mails = [...(await mailsTo(email)), ...(await mailsTo(convidado))]
    const paths = mails.map((m) => new URL(linkIn(m.body)).pathname).sort()
    expect(paths).toEqual(['/accept-invite', '/reset-password', '/verify-email'])
    for (const m of mails) {
      expect(m.subject.length, m.body).toBeGreaterThan(5)
      const url = linkIn(m.body)
      expect(url.startsWith(`${BASE}/`), url).toBe(true) // sempre o endereço do app (NEXTAUTH_URL), nunca outro host
      const page = await anon.get(url)
      expect(page.status(), url).toBe(200)
    }
    // sem provedor configurado o e-mail fica na fila (registrado), nunca "enviado" de mentira
    expect(new Set(mails.map((m) => m.status))).toEqual(new Set(['queued']))
    await anon.dispose()
    await admin.dispose()
  })
})

test.describe('E-mails: relatórios agendados', () => {
  // Segunda-feira, 7/1/2030, 18:00 em Brasília = 21:00 UTC (sem horário de verão)
  const at = (iso: string) => ({ reportsAt: iso })
  const SEG_1759 = '2030-01-07T20:59:00Z'
  const SEG_1800 = '2030-01-07T21:00:00Z'
  const SEG_1805 = '2030-01-07T21:05:00Z'
  const SAB_1800 = '2030-01-12T21:00:00Z'
  const SEG2_1800 = '2030-01-14T21:00:00Z'

  test('no horário e dia agendados gera o relatório e manda UM e-mail por destinatário; não repete nem acumula', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Oi, quero saber o preço da limpeza', { minutes: 120, pushName: 'Cliente Agenda' })
    await c.tick({ onlyThisCompany: true })
    const orgId = ((await (await c.admin.get('/api/me')).json()).organizationId) as string
    const gerente = `gerente.${uid()}@cliente.test`

    // só o Diário (seg–sex) e o de Promessas (seg–sex) às 18:00; os demais sem envio automático
    const defs = (await (await c.admin.get('/api/reports')).json()).definitions as Array<{ id: string }>
    for (const d of defs) {
      const schedule = d.id === 'daily' || d.id === 'promises' ? '18:00' : ''
      const r = await c.admin.patch(`/api/reports/${d.id}`, { data: { schedule, recipients: [c.email, gerente.toUpperCase()] } })
      expect(r.status(), await r.text()).toBe(200)
    }
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId }, data: { sendEmpty: true } })
    const runs = () => testDb.reportRun.count({ where: { organizationId: orgId } })
    const before = await runs()

    const tick = async (iso: string) => {
      const r = await c.gw.post('/api/gateway/tick', { data: { organizationId: orgId, ...at(iso) } })
      expect(r.status(), await r.text()).toBe(200)
      return (await r.json()) as { generated: number; emails: number }
    }

    expect(await tick(SEG_1759)).toMatchObject({ generated: 0, emails: 0 }) // um minuto antes: nada
    expect(await tick(SEG_1800)).toMatchObject({ generated: 2, emails: 2 })
    expect(await runs()).toBe(before + 2)

    for (const to of [c.email, gerente]) {
      const mails = await mailsTo(to)
      const rel = mails.filter((m) => /relatórios do AtendeRadar/.test(m.subject))
      expect(rel, to).toHaveLength(1) // os dois relatórios do mesmo horário vão juntos
      expect(rel[0].subject).toMatch(/^2 relatórios do AtendeRadar · Empresa /)
      expect(rel[0].body).toContain('Relatório Diário')
      expect(rel[0].body).toContain('Relatório de Promessas')
      expect(linkIn(rel[0].body)).toBe(`${BASE}/#reports`)
      // o PDF executivo de cada relatório vai em anexo (o outbox guarda nome e tamanho)
      const anexos = JSON.parse(rel[0].attachments || '[]') as Array<{ filename: string; size: number }>
      expect(anexos.map((a) => a.filename).sort()).toEqual([expect.stringMatching(/^atenderadar-daily-.*\.pdf$/), expect.stringMatching(/^atenderadar-promises-.*\.pdf$/)])
      expect(anexos.every((a) => a.size > 500)).toBe(true)
    }
    const run = await testDb.reportRun.findFirstOrThrow({ where: { organizationId: orgId, reportType: 'daily' }, orderBy: { createdAt: 'desc' } })
    expect(JSON.parse(run.recipientEmails)).toEqual([c.email.toLowerCase(), gerente])
    expect(run.periodEnd!.getTime() - run.periodStart!.getTime()).toBe(24 * 3600_000) // diário = últimas 24 h

    expect(await tick(SEG_1805)).toMatchObject({ generated: 0 }) // mesmo horário não repete
    expect(await tick(SAB_1800)).toMatchObject({ generated: 0 }) // sábado não está nos dias do relatório
    expect(await tick(SEG2_1800)).toMatchObject({ generated: 2, emails: 2 }) // semana seguinte volta a enviar
    await c.dispose()
  })

  test('descadastro do relatório: link e clique único (Gmail) tiram só aquele endereço dos relatórios da empresa', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const gw = await gatewayClient()
    const orgId = ((await (await admin.get('/api/me')).json()).organizationId) as string
    const gerente = `gerente.${uid()}@cliente.test`
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId }, data: { schedule: null, recipients: JSON.stringify([email, gerente]) } })
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId, reportType: 'daily' }, data: { schedule: '18:00', sendEmpty: true } })
    expect(await (await gw.post('/api/gateway/tick', { data: { organizationId: orgId, reportsAt: SEG_1800 } })).json()).toMatchObject({ emails: 2 })

    const [mail] = (await mailsTo(gerente)).filter((m) => m.kind !== 'alert')
    const token = mail.body.match(/descadastrar\?token=(r\.[A-Za-z0-9_.-]+)/)?.[1]
    expect(token, mail.body).toBeTruthy()
    const headers = JSON.parse(mail.headers || '{}') as Record<string, string>
    expect(headers['List-Unsubscribe']).toBe(`<${BASE}/api/public/unsubscribe?token=${token}>`)
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    // cada destinatário tem o próprio link
    const [mine] = await mailsTo(email).then((ms) => ms.filter((m) => /Relatório Diário/.test(m.subject)))
    expect(mine.body).not.toContain(token!)

    const anon = await request.newContext({ baseURL: BASE })
    expect((await anon.post('/api/public/unsubscribe', { data: { token: `${token}x` } })).status()).toBe(400)
    expect((await anon.get(`/api/public/unsubscribe?token=${token}`)).status()).toBe(405) // GET (antivírus) não tira
    const page = await anon.get(`/descadastrar?token=${token}`)
    expect(page.status()).toBe(200)

    const r = await anon.post(headers['List-Unsubscribe'].slice(1, -1).replace(BASE, ''), { form: { 'List-Unsubscribe': 'One-Click' } })
    expect(r.status(), await r.text()).toBe(200)
    expect((await anon.post('/api/public/unsubscribe', { data: { token } })).status()).toBe(200) // repetir não quebra
    for (const d of await testDb.reportDefinition.findMany({ where: { organizationId: orgId } })) expect(JSON.parse(d.recipients)).toEqual([email])
    expect(await testDb.auditLog.count({ where: { organizationId: orgId, action: 'report.unsubscribed', actorEmail: gerente } })).toBe(1)

    const before = (await mailsTo(gerente)).length
    expect(await (await gw.post('/api/gateway/tick', { data: { organizationId: orgId, reportsAt: SEG2_1800 } })).json()).toMatchObject({ emails: 1 })
    expect((await mailsTo(gerente)).length).toBe(before)
    await anon.dispose()
    await admin.dispose()
    await gw.dispose()
  })

  test('relatório sem dados não manda e-mail (a menos que "enviar vazio" esteja ligado), mas fica no histórico', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const gw = await gatewayClient()
    const orgId = ((await (await admin.get('/api/me')).json()).organizationId) as string
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId }, data: { schedule: null } })
    await testDb.reportDefinition.updateMany({ where: { organizationId: orgId, reportType: 'recovery' }, data: { schedule: '18:00', daysOfWeek: '[]', sendEmpty: false } })
    const before = (await mailsTo(email)).length
    const r = await gw.post('/api/gateway/tick', { data: { organizationId: orgId, reportsAt: SEG_1800 } })
    expect(await r.json()).toMatchObject({ generated: 1, emails: 0 })
    expect((await mailsTo(email)).length).toBe(before)
    await admin.dispose()
    await gw.dispose()
  })

  test('a empresa de demonstração nunca dispara e-mail', async () => {
    const gw = await gatewayClient()
    const r = await gw.post('/api/gateway/tick', { data: { organizationId: 'org_seed_1', reportsAt: SEG_1800 } })
    expect(await r.json()).toMatchObject({ generated: 0, emails: 0 })
    await gw.dispose()
  })

  test('configuração recusa horário e e-mail inválidos e normaliza a lista', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    expect((await admin.patch('/api/reports/daily', { data: { schedule: '25:00' } })).status()).toBe(400)
    expect((await admin.patch('/api/reports/daily', { data: { schedule: 'amanhã' } })).status()).toBe(400)
    const bad = await admin.patch('/api/reports/daily', { data: { recipients: ['ok@cliente.test', 'nao-e-email'] } })
    expect(bad.status()).toBe(400)
    expect((await bad.json()).error).toContain('nao-e-email')
    const ok = await admin.patch('/api/reports/daily', { data: { schedule: ' 07:30 ', recipients: [' Ana@Cliente.test ', 'ana@cliente.test', ''] } })
    expect(ok.status()).toBe(200)
    expect((await ok.json()).definition).toMatchObject({ schedule: '07:30', recipients: '["ana@cliente.test"]' })
    expect((await admin.patch('/api/reports/daily', { data: { schedule: '' } })).status()).toBe(200)
    expect((await testDb.reportDefinition.findFirstOrThrow({ where: { organization: { adminEmail: email }, reportType: 'daily' } })).schedule).toBeNull()
    await admin.dispose()
  })
})
