import { test, expect } from '@playwright/test'
import { anonymous, uid } from './helpers'
import { setupCompany, newChat } from './gw'
import { testDb } from './db'

// Alertas por e-mail (P4/T13): regra com canal "email" → fila por destinatário (quem VÊ o alerta), intervalo por regra
// com resumo, horário de silêncio (crítico passa), novas tentativas com limite e link "parar de receber".
// Sem MAIL_PROVIDER nos testes: o e-mail fica no EmailOutbox ('queued') e toda nova tentativa falha de propósito.

const BASE = 'http://127.0.0.1:3100'
const RULE = 'Cliente sem primeira resposta' // no_response, 10 min, padrão de toda empresa nova
const NEUTRO = 'Olá, tudo bem? Meu telefone é 11 98765-4321'

const alertMails = (email: string) =>
  testDb.emailOutbox.findMany({ where: { toEmail: email, kind: { in: ['alert', 'alert_digest'] } }, orderBy: { createdAt: 'asc' } })

/** HH:MM em São Paulo (fuso padrão da empresa) deslocado em minutos. */
const spTime = (offsetMin: number) =>
  new Date(Date.now() + offsetMin * 60_000).toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).replace(/^24/, '00')

/** Empresa nova em que só a regra "sem primeira resposta" manda e-mail e não há horário de silêncio. */
async function company() {
  const c = await setupCompany()
  const orgId = ((await (await c.admin.get('/api/me')).json()).organizationId) as string
  await testDb.alertRule.updateMany({ where: { organizationId: orgId }, data: { notificationChannels: '["in_app"]' } })
  await testDb.alertRule.updateMany({ where: { organizationId: orgId, name: RULE }, data: { notificationChannels: '["in_app","email"]' } })
  await c.settings({ silenceStart: '00:00', silenceEnd: '00:00' }) // início = fim: sem silêncio
  const member = (role: string, extra: Partial<{ team: string; status: string; alertEmails: boolean }> = {}) => {
    const email = `${role}.${uid()}@cliente.test`
    return testDb.organizationMember.create({ data: { organizationId: orgId, userId: email, name: role, email, role, status: 'active', ...extra } })
  }
  return { ...c, orgId, member }
}

test.describe('Alertas por e-mail', () => {
  test('regra com e-mail enfileira para quem vê o alerta, sem texto nem telefone do cliente', async () => {
    const c = await company()
    const supervisor = await c.member('supervisor', { team: 'Vendas' }) // conversa sem atendente: a equipe dele vê
    const viewer = await c.member('viewer')
    const atendente = await c.member('atendente') // só vê conversas dele: não vê
    const convidado = await c.member('gestor', { status: 'invited' })
    const desligado = await c.member('gestor', { alertEmails: false })

    const chat = newChat()
    await c.send(chat, NEUTRO, { minutes: 40, pushName: 'Maria Cliente' })
    const r = await c.tick({ onlyThisCompany: true })
    expect(r.alertEmails.sent).toBeGreaterThanOrEqual(3)

    for (const to of [c.email, supervisor.email, viewer.email]) expect(await alertMails(to), to).toHaveLength(1)
    for (const to of [atendente.email, convidado.email, desligado.email]) expect(await alertMails(to), to).toHaveLength(0)

    const [mail] = await alertMails(c.email)
    expect(mail.subject).toMatch(new RegExp(`^Alerta: ${RULE} \\(gravidade crítica\\) · Empresa `))
    expect(mail.status).toBe('queued')
    expect(mail.organizationId).toBe(c.orgId)
    expect(mail.body).toContain(`${BASE}/#alerts`)
    expect(mail.body).toContain(`${BASE}/descadastrar?token=`)
    for (const proibido of ['Olá', 'tudo bem', 'Maria', '98765', '4321', chat.slice(4, 12)]) expect(mail.body, proibido).not.toContain(proibido)
    const headers = JSON.parse(mail.headers || '{}') as Record<string, string>
    expect(headers['List-Unsubscribe']).toMatch(new RegExp(`^<${BASE}/api/public/unsubscribe\\?token=.+>$`))
    expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    await c.dispose()
  })

  test('intervalo por regra: alertas seguintes esperam e saem juntos num resumo', async () => {
    const c = await company()
    await c.send(newChat(), NEUTRO, { minutes: 40 })
    await c.tick({ onlyThisCompany: true })
    expect(await alertMails(c.email)).toHaveLength(1)

    await c.send(newChat(), NEUTRO, { minutes: 40 })
    await c.send(newChat(), NEUTRO, { minutes: 40 })
    const held = await c.tick({ onlyThisCompany: true })
    expect(held.alertEmails).toMatchObject({ sent: 0, held: 2 })
    expect(await alertMails(c.email)).toHaveLength(1) // dentro dos 15 min: nada novo

    // passa o intervalo (o último envio "foi" há 20 min)
    await testDb.alertEmailItem.updateMany({ where: { organizationId: c.orgId, status: 'sent' }, data: { sentAt: new Date(Date.now() - 20 * 60_000) } })
    await c.tick({ onlyThisCompany: true })
    const mails = await alertMails(c.email)
    expect(mails).toHaveLength(2)
    expect(mails[1].kind).toBe('alert_digest')
    expect(mails[1].subject).toMatch(new RegExp(`^2 alertas: ${RULE} · `))
    expect(mails[1].body).toContain('no máximo um e-mail a cada 15 min')
    await c.dispose()
  })

  test('horário de silêncio segura alerta não crítico; crítico passa; o retido sai quando o silêncio acaba', async () => {
    const c = await company()
    await testDb.alertRule.updateMany({ where: { organizationId: c.orgId, name: RULE }, data: { severity: 'high' } })
    await testDb.alertRule.create({
      data: { organizationId: c.orgId, name: 'Sem resposta (crítico)', type: 'no_response', severity: 'critical', limitMinutes: 10, notificationChannels: '["in_app","email"]' },
    })
    await c.settings({ silenceStart: spTime(-60), silenceEnd: spTime(60) }) // agora está no meio do silêncio

    await c.send(newChat(), NEUTRO, { minutes: 40 })
    const r = await c.tick({ onlyThisCompany: true })
    expect(r.alertEmails).toMatchObject({ sent: 1, held: 1 })
    let mails = await alertMails(c.email)
    expect(mails.map((m) => m.subject)).toEqual([expect.stringMatching(/^Alerta: Sem resposta \(crítico\) \(gravidade crítica\) · /)])

    await c.settings({ silenceStart: '00:00', silenceEnd: '00:00' })
    await c.tick({ onlyThisCompany: true })
    mails = await alertMails(c.email)
    expect(mails).toHaveLength(2)
    expect(mails[1].subject).toMatch(new RegExp(`^Alerta: ${RULE} \\(gravidade alta\\) · `))
    await c.dispose()
  })

  test('e-mail que falhou é tentado de novo com espera e para no limite, com aviso no sino', async () => {
    const c = await company()
    await c.send(newChat(), NEUTRO, { minutes: 40 })
    await c.tick({ onlyThisCompany: true })
    const [mail] = await alertMails(c.email)
    const past = () => new Date(Date.now() - 60_000)
    await testDb.emailOutbox.update({ where: { id: mail.id }, data: { status: 'failed', attempts: 1, nextAttemptAt: past(), error: 'Resend HTTP 500' } })

    for (const attempts of [2, 3]) {
      await c.tick({ onlyThisCompany: true })
      const row = await testDb.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })
      expect(row).toMatchObject({ status: 'failed', attempts })
      expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now()) // próxima tentativa no futuro (espera)
      await testDb.emailOutbox.update({ where: { id: mail.id }, data: { nextAttemptAt: past() } })
    }
    await c.tick({ onlyThisCompany: true })
    let row = await testDb.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })
    expect(row).toMatchObject({ status: 'failed', attempts: 4, nextAttemptAt: null })
    expect(row.error).toContain('desistiu após 4 tentativas')
    const aviso = await testDb.notification.findFirst({ where: { organizationId: c.orgId, type: 'email_failed' } })
    expect(aviso?.title).toBe('Alerta por e-mail não foi entregue')

    // no limite não tenta mais, mesmo com a data vencida
    await testDb.emailOutbox.update({ where: { id: mail.id }, data: { nextAttemptAt: past() } })
    await c.tick({ onlyThisCompany: true })
    row = await testDb.emailOutbox.findUniqueOrThrow({ where: { id: mail.id } })
    expect(row.attempts).toBe(4)
    await c.dispose()
  })

  test('link "parar de receber" desliga a preferência e nada mais é enviado; o perfil religa', async () => {
    const c = await company()
    await c.send(newChat(), NEUTRO, { minutes: 40 })
    await c.tick({ onlyThisCompany: true })
    const [mail] = await alertMails(c.email)
    const token = mail.body.match(/descadastrar\?token=([A-Za-z0-9_.-]+)/)?.[1]
    expect(token).toBeTruthy()
    const oneClick = (JSON.parse(mail.headers || '{}') as Record<string, string>)['List-Unsubscribe'].slice(1, -1)
    const owner = () => testDb.organizationMember.findFirstOrThrow({ where: { organizationId: c.orgId, email: c.email } })

    const anon = await anonymous()
    expect((await anon.post('/api/public/unsubscribe?token=abc.def')).status()).toBe(400)
    expect((await anon.post('/api/public/unsubscribe', { data: { token: `${token}x` } })).status()).toBe(400)
    expect((await anon.get(`/api/public/unsubscribe?token=${token}`)).status()).toBe(405) // GET (antivírus) não desliga
    expect((await owner()).alertEmails).toBe(true)
    expect((await anon.get(`/descadastrar?token=${token}`)).status()).toBe(200) // a página do link abre

    // clique único do provedor de e-mail (RFC 8058): POST form no endereço do cabeçalho
    const r = await anon.post(oneClick.replace(BASE, ''), { form: { 'List-Unsubscribe': 'One-Click' } })
    expect(r.status(), await r.text()).toBe(200)
    expect((await owner()).alertEmails).toBe(false)
    expect((await anon.post('/api/public/unsubscribe', { data: { token } })).status()).toBe(200) // repetir não quebra

    await c.send(newChat(), NEUTRO, { minutes: 40 })
    await c.tick({ onlyThisCompany: true })
    expect(await alertMails(c.email)).toHaveLength(1) // nada novo
    expect(await testDb.auditLog.count({ where: { organizationId: c.orgId, action: 'account.alert_emails_changed' } })).toBe(1)

    // a própria pessoa religa em Meu perfil
    expect((await c.admin.patch('/api/profile/notifications', { data: { alertEmails: 'sim' } })).status()).toBe(400)
    expect((await c.admin.patch('/api/profile/notifications', { data: { alertEmails: true } })).status()).toBe(200)
    expect(await (await c.admin.get('/api/profile/notifications')).json()).toEqual({ alertEmails: true })
    expect((await (await c.admin.get('/api/profile')).json()).profile.alertEmails).toBe(true)
    await anon.dispose()
    await c.dispose()
  })
})
