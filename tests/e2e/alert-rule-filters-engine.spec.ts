import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'

// Filtros da regra pelo caminho real (mensagem do WhatsApp → motor → alerta), sem simulador: o gestor edita as regras
// pela API da tela e o motor respeita equipe, exceção e "encerrar sozinho". O simulador cobre os horários e o resto
// (docs/operacao/simulacao.md, cenários regra-*).
type Setup = Awaited<ReturnType<typeof setupCompany>>

/** Aplica o mesmo filtro em todas as regras (o alerta agrupado só some quando nenhuma regra do grupo vale). */
async function patchAllRules(c: Setup, data: Record<string, unknown>) {
  const rules = (await (await c.admin.get('/api/alert-rules')).json()).rules as Array<{ id: string }>
  for (const r of rules) {
    const put = await c.admin.put(`/api/alert-rules/${r.id}`, { data })
    expect(put.status(), await put.text()).toBe(200)
  }
}

const open = async (c: Setup, name: string) => (await c.alerts()).alerts.filter((a) => a.customerName === name && (a.status === 'new' || a.status === 'in_progress'))

test.describe('regra de alerta: filtros no motor', () => {
  test('exceção por etiqueta: a conversa marcada sai da regra e o alerta fecha', async () => {
    const c = await setupCompany()
    await patchAllRules(c, { exceptions: ['Cliente VIP'] })
    await c.send(newChat(), 'Bom dia, preciso de ajuda', { minutes: 40, pushName: 'Cliente Etiqueta' })
    await c.send(newChat(), 'Bom dia, também preciso', { minutes: 40, pushName: 'Cliente Comum' })
    await c.tick({ onlyThisCompany: true })
    expect((await open(c, 'Cliente Etiqueta')).length).toBeGreaterThan(0)

    const conv = (await c.conversations('Cliente Etiqueta'))[0]
    expect((await c.admin.patch(`/api/conversations/${conv.id}`, { data: { addTag: 'cliente vip' } })).status()).toBe(200)
    await c.tick({ onlyThisCompany: true })
    expect(await open(c, 'Cliente Etiqueta')).toHaveLength(0)
    expect((await open(c, 'Cliente Comum')).length).toBeGreaterThan(0) // a outra conversa segue com alerta
    await c.dispose()
  })

  test('equipe: regra de outra equipe não abre alerta; a equipe dona do número abre', async () => {
    const c = await setupCompany()
    const team = async (name: string, connectionIds: string[]) => (await (await c.admin.post('/api/teams', { data: { name, code: name.slice(0, 3).toUpperCase(), connectionIds } })).json()).team.id as string
    const recepcao = await team('Recepção', [c.connectionId])
    const outra = await team('Financeiro', [])
    await patchAllRules(c, { scopeTeams: [outra] })
    await c.send(newChat(), 'Olá, alguém pode me atender?', { minutes: 40, pushName: 'Cliente Equipe' })
    await c.tick({ onlyThisCompany: true })
    expect(await open(c, 'Cliente Equipe')).toHaveLength(0)

    await patchAllRules(c, { scopeTeams: [recepcao] })
    await c.tick({ onlyThisCompany: true })
    expect((await open(c, 'Cliente Equipe')).length).toBeGreaterThan(0)
    await c.dispose()
  })

  test('encerrar sozinho: fecha pelo prazo, marca "encerrado sozinho" e não reabre com o mesmo problema', async () => {
    test.setTimeout(150_000)
    const c = await setupCompany()
    await patchAllRules(c, { autoCloseMinutes: 1 })
    await c.send(newChat(), 'Oi, tudo bem? Preciso de um orçamento', { minutes: 40, pushName: 'Cliente Prazo' })
    await c.tick({ onlyThisCompany: true })
    const opened = await open(c, 'Cliente Prazo')
    expect(opened.length).toBeGreaterThan(0)

    await new Promise((r) => setTimeout(r, 62_000)) // prazo real de 1 minuto (o motor usa o relógio de verdade)
    const s = await c.tick({ onlyThisCompany: true })
    expect(s.alertsAutoClosed).toBeGreaterThan(0)
    expect(await open(c, 'Cliente Prazo')).toHaveLength(0)
    const resolved = ((await (await c.admin.get('/api/alerts?status=resolved&limit=100')).json()).alerts as Array<{ id: string; customerName: string; autoClosed: boolean }>)
      .filter((a) => a.customerName === 'Cliente Prazo')
    expect(resolved.length).toBeGreaterThan(0)
    expect(resolved.every((a) => a.autoClosed)).toBe(true)

    // o cliente continua esperando (mesmo problema): não reabre
    await c.tick({ onlyThisCompany: true })
    expect(await open(c, 'Cliente Prazo')).toHaveLength(0)
    await c.dispose()
  })
})
