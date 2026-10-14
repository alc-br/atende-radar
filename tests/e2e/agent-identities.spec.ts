import { test, expect, type APIRequestContext } from '@playwright/test'
import { loginAs } from './helpers'
import { newChat, setupCompany } from './gw'

// P5 · Equipe › Identidades do WhatsApp (§18.2): o sistema detecta e SUGERE quem é o atendente; só admin/gestor
// confirma, troca, desfaz ou marca "não é atendente". Só o vínculo confirmado vira atendente da conversa (e conta nos indicadores).

type Ident = { id: string; kind: string; displayName: string; status: string; agent: { id: string; name: string } | null; suggestedAgent: { id: string; name: string } | null; confidence: number | null; confidenceLevel: string | null; reason: string | null; conversationCount: number; lastSeenAt: string | null }

async function company() {
  const c = await setupCompany()
  const agent = async (name: string) => (await (await c.admin.post('/api/team', { data: { name, email: `${name.split(' ')[0].toLowerCase()}@empresa.test`, role: 'atendente' } })).json()).agent as { id: string }
  // dois atendentes: o número inteiro da conexão não aponta sozinho para ninguém
  const carlos = await agent('Carlos Mendes')
  const ana = await agent('Ana Souza')
  const um = newChat(), dois = newChat(), tres = newChat()
  await c.send(um, 'Quanto custa a limpeza?', { minutes: 60, pushName: 'Ident Um' })
  await c.send(um, '*Carlos*: Olá! Custa R$ 200.', { minutes: 55, fromMe: true })
  await c.send(dois, 'Tem horário amanhã?', { minutes: 50, pushName: 'Ident Dois' })
  await c.send(dois, 'Temos sim, às 10h. — Carlos', { minutes: 45, fromMe: true })
  await c.send(tres, 'Bom dia', { minutes: 40, pushName: 'Ident Tres' })
  await c.send(tres, 'Bom dia! Em que posso ajudar?', { minutes: 35, fromMe: true })
  await c.tick()
  const list = async (ctx: APIRequestContext = c.admin) => (await (await ctx.get('/api/agent-identities')).json()) as { canManage: boolean; agents: Array<{ id: string }>; connections: Array<{ id: string; identities: Ident[] }>; summary: Record<string, number> }
  const identity = async (kind: string) => (await list()).connections.flatMap((x) => x.identities).find((i) => i.kind === kind)!
  const conv = async (name: string) => (await c.conversations(name))[0]
  const act = (id: string, data: Record<string, unknown>, ctx: APIRequestContext = c.admin) => ctx.patch(`/api/agent-identities/${id}`, { data })
  const audits = async (action: string) => ((await (await c.admin.get(`/api/audit?action=${action}`)).json()).entries as Array<{ targetId: string; targetLabel: string; details: Record<string, unknown> }>)
  return { ...c, carlos, ana, list, identity, conv, act, audits }
}

test.describe('P5 · identidades do WhatsApp', () => {
  test('lista: assinatura sugerida com confiança e motivo; número sem sugestão; conversa fica "sugerida", sem atendente', async () => {
    const c = await company()
    const sig = await c.identity('signature')
    expect(sig.displayName).toBe('Carlos')
    expect(sig.status).toBe('suggested')
    expect(sig.suggestedAgent?.id).toBe(c.carlos.id)
    expect(sig.confidence).toBeGreaterThan(0)
    expect(['alta', 'media', 'baixa']).toContain(sig.confidenceLevel)
    expect(sig.reason).toContain('primeiro nome')
    expect(sig.conversationCount).toBe(2)
    expect(sig.lastSeenAt).toBeTruthy()

    const num = await c.identity('number')
    expect(num.status).toBe('unconfirmed')
    expect(num.suggestedAgent).toBeNull()
    expect(num.conversationCount).toBe(3)

    const um = await c.conv('Ident Um')
    expect(um.agentName).toBe('Sem agente') // sugestão NÃO conta nos indicadores
    expect(um.suggestedAgentName).toBe('Carlos Mendes')
    expect((await c.list()).summary.suggestedConversations).toBe(2)
    await c.dispose()
  })

  test('confirmar → conversas passam a ser do atendente (lista, detalhe e indicadores) e fica auditado', async () => {
    const c = await company()
    const sig = await c.identity('signature')
    const before = ((await (await c.admin.get('/api/team')).json()).agents as Array<{ id: string; conversations: number; whatsappIdentity: string | null }>).find((a) => a.id === c.carlos.id)!
    expect(before.conversations).toBe(0)
    expect(before.whatsappIdentity).toBeNull()

    const r = await c.act(sig.id, { action: 'confirm' })
    expect(r.status()).toBe(200)
    const body = await r.json()
    expect(body.identity.status).toBe('confirmed')
    expect(body.identity.agent.name).toBe('Carlos Mendes')
    expect(body.conversationsUpdated).toBe(2)

    const um = await c.conv('Ident Um')
    expect(um.agentName).toBe('Carlos Mendes')
    expect(um.agentAttribution).toBe('identity')
    expect(um.suggestedAgentName).toBeNull()
    expect((await c.conv('Ident Tres')).agentName).toBe('Sem agente') // sem assinatura: não muda
    const detail = await (await c.admin.get(`/api/conversations/${um.id}`)).json()
    expect(detail.agent.name).toBe('Carlos Mendes')
    expect(detail.agentAttribution).toBe('identity')

    const after = ((await (await c.admin.get('/api/team')).json()).agents as Array<{ id: string; conversations: number; whatsappIdentity: string | null }>).find((a) => a.id === c.carlos.id)!
    expect(after.conversations).toBeGreaterThan(0)
    expect(after.whatsappIdentity).toBe('Carlos')

    const [entry] = await c.audits('agent_identity.confirmed')
    expect(entry.targetId).toBe(sig.id)
    expect(entry.targetLabel).toBe('Carlos · Recepção')
    expect(entry.details).toMatchObject({ kind: 'signature', agentId: c.carlos.id, previousStatus: 'unconfirmed', conversations: 2, changed: 2 })
    await c.dispose()
  })

  test('trocar → conversas vão para o outro atendente; desfazer → voltam a "sugerido", sem atendente', async () => {
    const c = await company()
    const sig = await c.identity('signature')
    await c.act(sig.id, { action: 'confirm' })

    const sw = await c.act(sig.id, { action: 'confirm', agentId: c.ana.id })
    expect(sw.status()).toBe(200)
    expect((await sw.json()).identity.agent.name).toBe('Ana Souza')
    expect((await c.conv('Ident Dois')).agentName).toBe('Ana Souza')
    const [changed] = await c.audits('agent_identity.changed')
    expect(changed.details).toMatchObject({ agentId: c.ana.id, previousAgentId: c.carlos.id })

    const undo = await c.act(sig.id, { action: 'undo' })
    expect(undo.status()).toBe(200)
    expect((await undo.json()).identity.status).toBe('suggested')
    const dois = await c.conv('Ident Dois')
    expect(dois.agentName).toBe('Sem agente')
    expect(dois.suggestedAgentName).toBe('Carlos Mendes')
    expect(await c.audits('agent_identity.undone')).toHaveLength(1)
    await c.dispose()
  })

  test('"não é atendente": a identidade sai da atribuição; escolha manual na conversa nunca é desfeita', async () => {
    const c = await company()
    // número inteiro confirmado como Ana → a conversa sem assinatura vira da Ana; a assinatura (sugerida) continua só sugestão
    const num = await c.identity('number')
    expect((await c.act(num.id, { action: 'confirm', agentId: c.ana.id })).status()).toBe(200)
    expect((await c.conv('Ident Tres')).agentName).toBe('Ana Souza')
    // vínculo confirmado (de qualquer nível) vale mais que sugestão
    expect((await c.conv('Ident Um')).agentName).toBe('Ana Souza')

    const ign = await c.act(num.id, { action: 'ignore' })
    expect(ign.status()).toBe(200)
    expect((await ign.json()).identity.status).toBe('ignored')
    expect((await c.conv('Ident Tres')).agentName).toBe('Sem agente')
    expect(await c.audits('agent_identity.ignored')).toHaveLength(1)

    // escolha manual: confirmar a assinatura depois não tira a conversa da Ana
    const um = await c.conv('Ident Um')
    expect((await c.admin.patch(`/api/conversations/${um.id}`, { data: { agentId: c.ana.id } })).status()).toBe(200)
    await c.act((await c.identity('signature')).id, { action: 'confirm' })
    const after = await c.conv('Ident Um')
    expect(after.agentName).toBe('Ana Souza')
    expect(after.agentAttribution).toBe('manual')
    expect((await c.conv('Ident Dois')).agentName).toBe('Carlos Mendes')
    await c.dispose()
  })

  test('validação: ação inválida e confirmar sem atendente → 400', async () => {
    const c = await company()
    const num = await c.identity('number')
    expect((await c.act(num.id, { action: 'apagar' })).status()).toBe(400)
    expect((await c.act(num.id, { action: 'confirm' })).status()).toBe(400) // sem sugestão e sem agentId
    expect((await c.act(num.id, { action: 'confirm', agentId: 'nao-existe' })).status()).toBe(400)
    await c.dispose()
  })

  test('RBAC: só admin e gestor alteram; supervisor e analista só veem; atendente nem vê', async () => {
    for (const role of ['supervisor', 'analista', 'atendente']) {
      const ctx = await loginAs(`${role}.a@test.local`)
      expect((await ctx.patch('/api/agent-identities/qualquer', { data: { action: 'undo' } })).status(), role).toBe(403)
      const get = await ctx.get('/api/agent-identities')
      if (role === 'atendente') expect(get.status()).toBe(403)
      else {
        expect(get.status(), role).toBe(200)
        expect((await get.json()).canManage).toBe(false)
      }
      await ctx.dispose()
    }
    const gestor = await loginAs('gestor.a@test.local')
    expect((await gestor.patch('/api/agent-identities/qualquer', { data: { action: 'undo' } })).status()).toBe(404) // passou do RBAC
    expect((await (await gestor.get('/api/agent-identities')).json()).canManage).toBe(true)
    await gestor.dispose()
  })

  test('isolamento: outra empresa não vê nem altera; atendente de outra empresa não é aceito', async () => {
    const c = await company()
    const sig = await c.identity('signature')
    const b = await loginAs('admin.b@test.local')
    expect((await b.patch(`/api/agent-identities/${sig.id}`, { data: { action: 'confirm' } })).status()).toBe(404)
    const seenByB = (await c.list(b)).connections.flatMap((x) => x.identities).map((i) => i.id)
    expect(seenByB).not.toContain(sig.id)
    const agentB = ((await (await b.get('/api/team')).json()).agents as Array<{ id: string }>)[0]
    expect((await c.act(sig.id, { action: 'confirm', agentId: agentB.id })).status()).toBe(400)
    expect((await c.identity('signature')).status).toBe('suggested') // nada mudou
    await b.dispose()
    await c.dispose()
  })
})
