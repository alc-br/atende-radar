import { test, expect } from '@playwright/test'
import { createUser, loginAs, signupOrg, uid } from './helpers'
import { newChat, setupCompany } from './gw'

// B4/B9 · Registro de auditoria: quem fez o quê, quando (papéis, configurações, regras, conexões, privacidade, acesso a conversa).
// Nunca guarda texto de mensagem nem telefone.

type Entry = { id: string; action: string; actorEmail: string; actorRole: string; targetType: string | null; targetId: string | null; targetLabel: string | null; details: Record<string, unknown> | null; createdAt: string }
const entries = async (api: Awaited<ReturnType<typeof loginAs>>, q = '') => (await (await api.get(`/api/audit${q}`)).json()).entries as Entry[]

test.describe('Registro de auditoria', () => {
  test('troca de papel, remoção de membro, configuração e regra ficam registradas com autor', async () => {
    const { email, password } = await signupOrg()
    const admin = await loginAs(email, password)
    const m = await createUser(admin, { email: `aud.${uid()}@test.local`, role: 'member' })

    expect((await admin.patch(`/api/members/${m.id}`, { data: { role: 'gestor' } })).status()).toBe(200)
    expect((await admin.patch('/api/settings', { data: { settings: { slaFirst: '7', outsideRule: 'atraso' } } })).status()).toBe(200)
    const rule = await (await admin.post('/api/alert-rules', { data: { name: 'Regra auditada', type: 'no_response', severity: 'high', limitMinutes: 15 } })).json()
    expect((await admin.delete(`/api/members/${m.id}`)).status()).toBe(200)

    const list = await entries(admin)
    const roleChange = list.find((e) => e.action === 'member.role_changed')
    expect(roleChange).toBeTruthy()
    expect(roleChange!.actorEmail).toBe(email)
    expect(roleChange!.actorRole).toBe('admin')
    expect(roleChange!.targetId).toBe(m.id)
    expect(roleChange!.details).toMatchObject({ from: 'member', to: 'gestor' })

    expect(list.find((e) => e.action === 'member.removed')?.targetId).toBe(m.id)
    expect(list.find((e) => e.action === 'member.invited')?.targetId).toBe(m.id)
    const settings = list.find((e) => e.action === 'settings.updated')
    expect(settings!.details).toMatchObject({ keys: expect.arrayContaining(['slaFirst', 'outsideRule']) })
    expect(list.find((e) => e.action === 'alert_rule.created')?.targetId).toBe(rule.rule.id)
    // mais recente primeiro
    expect(list[0].action).toBe('member.removed')
    await admin.dispose()
  })

  test('privacidade e acesso ao conteúdo de uma conversa ficam registrados, sem texto nem telefone', async () => {
    const c = await setupCompany()
    await c.send(newChat(), 'Meu CPF é 123.456.789-00, quanto custa?', { minutes: 5, pushName: 'Titular' })
    const conv = (await c.conversations('Titular'))[0]
    expect((await c.admin.get(`/api/conversations/${conv.id}`)).status()).toBe(200)
    expect((await c.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'exclude' } })).status()).toBe(200)

    const list = await entries(c.admin)
    expect(list.find((e) => e.action === 'conversation.viewed')?.targetId).toBe(conv.id)
    expect(list.find((e) => e.action === 'privacy.exclude')?.targetId).toBe(conv.id)
    const raw = JSON.stringify(list)
    expect(raw).not.toContain('123.456')
    expect(raw).not.toContain('quanto custa')
    expect(raw).not.toMatch(/55119\d{8}/)
    await c.dispose()
  })

  test('isolamento e papel: a Org B não vê o registro da Org A; papéis sem configuração não abrem', async () => {
    const admA = await loginAs('admin.a@test.local')
    const admB = await loginAs('admin.b@test.local')
    // o registro guarda só as CHAVES alteradas (valores podem ser sensíveis): a chave é a marca
    const marker = `marca_${uid()}`
    await admA.patch('/api/settings', { data: { settings: { [marker]: 'valor-que-nao-deve-aparecer' } } })
    const rawA = JSON.stringify(await entries(admA))
    expect(rawA).toContain(marker)
    expect(rawA).not.toContain('valor-que-nao-deve-aparecer')
    expect(JSON.stringify(await entries(admB))).not.toContain(marker)

    for (const role of ['supervisor', 'analista', 'atendente', 'viewer', 'member']) {
      const api = await loginAs(`${role}.a@test.local`)
      expect((await api.get('/api/audit')).status(), role).toBe(403)
      await api.dispose()
    }
    // filtro por ação e limite
    const only = await entries(admA, '?action=settings.updated&limit=5')
    expect(only.length).toBeLessThanOrEqual(5)
    expect(only.every((e) => e.action === 'settings.updated')).toBe(true)
    await admA.dispose()
    await admB.dispose()
  })
})
