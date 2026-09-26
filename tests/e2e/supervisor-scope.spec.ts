import { test, expect } from '@playwright/test'
import { createUser, loginAs, uid } from './helpers'
import { newChat, setupCompany } from './gw'

// B4 · Supervisor com equipe definida enxerga só a SUA equipe (conversas, alertas, recuperação, atendentes)
// + o que ainda não tem atendente atribuído. Supervisor sem equipe continua vendo a organização toda.
test('supervisor da Recepção vê a Recepção e o não atribuído; não vê o Comercial', async () => {
  const c = await setupCompany()
  const agent = async (name: string, team: string) => {
    const r = await c.admin.post('/api/team', { data: { name, email: `${name.toLowerCase()}.${uid()}@empresa.test`, role: 'atendente', team } })
    if (r.status() !== 201) throw new Error(`agente ${name}: ${r.status()} ${await r.text()}`)
    return (await r.json()).agent as { id: string }
  }
  await agent('Carla', 'Recepção')
  await agent('Bruno', 'Comercial')

  const chatCarla = newChat(), chatBruno = newChat(), chatNinguem = newChat()
  await c.send(chatCarla, 'Quanto custa a limpeza?', { minutes: 90, pushName: 'Cliente Da Carla' })
  await c.send(chatCarla, '*Carla*: Olá! Custa R$ 200.', { minutes: 85, fromMe: true })
  await c.send(chatCarla, 'Pode ser amanhã?', { minutes: 60, pushName: 'Cliente Da Carla' })
  await c.send(chatBruno, 'Quero fechar o pacote', { minutes: 90, pushName: 'Cliente Do Bruno' })
  await c.send(chatBruno, '*Bruno*: Ótimo! Vou te passar o link.', { minutes: 85, fromMe: true })
  await c.send(chatBruno, 'Ok, aguardo', { minutes: 60, pushName: 'Cliente Do Bruno' })
  await c.send(chatNinguem, 'Alguém me atende?', { minutes: 60, pushName: 'Cliente Sem Dono' })
  await c.tick()

  // todos atribuídos como esperado
  const all = await c.conversations()
  expect(all.find((x) => x.customerName === 'Cliente Da Carla')?.agentName).toBe('Carla')
  expect(all.find((x) => x.customerName === 'Cliente Do Bruno')?.agentName).toBe('Bruno')

  const supEmail = `sup.${uid()}@test.local`
  const sup = await createUser(c.admin, { email: supEmail, role: 'supervisor' })
  await c.admin.patch(`/api/members/${sup.id}`, { data: { team: 'Recepção' } })
  const s = await loginAs(supEmail, 'Senha-Forte-2026x')

  const convs = (await (await s.get('/api/conversations?limit=100')).json()).conversations as Array<{ customerName: string }>
  const names = convs.map((x) => x.customerName)
  expect(names).toContain('Cliente Da Carla')
  expect(names).toContain('Cliente Sem Dono')
  expect(names).not.toContain('Cliente Do Bruno')

  const alerts = (await (await s.get('/api/alerts?limit=100')).json()).alerts as Array<{ customerName: string }>
  expect(alerts.some((a) => a.customerName === 'Cliente Da Carla' || a.customerName === 'Cliente Sem Dono')).toBe(true)
  expect(alerts.some((a) => a.customerName === 'Cliente Do Bruno')).toBe(false)

  const rec = (await (await s.get('/api/recovery')).json()).items as Array<{ customerName: string }>
  expect(rec.some((r) => r.customerName === 'Cliente Do Bruno')).toBe(false)

  const team = (await (await s.get('/api/team')).json()).agents as Array<{ name: string }>
  expect(team.map((a) => a.name)).toEqual(['Carla'])

  // detalhe da conversa do Comercial: não existe para este supervisor
  const bruno = all.find((x) => x.customerName === 'Cliente Do Bruno')!
  expect((await s.get(`/api/conversations/${bruno.id}`)).status()).toBe(404)

  // sem equipe → vê tudo (comportamento de gestão geral)
  await c.admin.patch(`/api/members/${sup.id}`, { data: { team: '' } })
  const allAgain = (await (await s.get('/api/conversations?limit=100')).json()).conversations as Array<{ customerName: string }>
  expect(allAgain.map((x) => x.customerName)).toEqual(expect.arrayContaining(['Cliente Da Carla', 'Cliente Do Bruno', 'Cliente Sem Dono']))
  await s.dispose()
  await c.dispose()
})
