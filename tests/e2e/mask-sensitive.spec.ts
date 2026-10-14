import { test, expect } from '@playwright/test'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'

// B9/T17 · LGPD: CPF, cartão e CVV que o cliente cola no WhatsApp já entram mascarados (banco, motor, telas, exportação).
const CPF = '529.982.247-25'
const CARD = '4111 1111 1111 1111'
const RAW = [CPF, '52998224725', CARD, '4111111111111111', 'cvv 123']

test.describe('LGPD · máscara de CPF e cartão nas conversas', () => {
  test('mensagem com CPF + cartão + CVV: guardada, exibida, alertada e exportada só mascarada', async () => {
    const c = await setupCompany()
    const chat = newChat()
    await c.send(chat, 'Me liga no (11) 99999-8888, CEP 01310-100, valor R$ 1.234,56', { minutes: 31, pushName: 'Cliente Mascarado' })
    // a ÚLTIMA mensagem do cliente é a que o alerta cita
    await c.send(chat, `Oi, quero fechar. Meu CPF é ${CPF} e o cartão ${CARD} validade 12/28 cvv 123`, { minutes: 30, pushName: 'Cliente Mascarado' })
    await c.tick()

    // no banco: nada em claro (telefone/CEP/valor ficam como vieram)
    const conv = (await c.conversations('Cliente Mascarado'))[0] as { id: string }
    expect(conv).toBeTruthy()
    const stored = await testDb.message.findMany({ where: { conversationId: conv.id }, orderBy: { occurredAt: 'asc' } })
    expect(stored).toHaveLength(2)
    expect(stored[0].text).toBe('Me liga no (11) 99999-8888, CEP 01310-100, valor R$ 1.234,56')
    expect(stored[1].text).toBe('Oi, quero fechar. Meu CPF é •••.•••.•••-•• e o cartão •••• 1111 validade 12/28 cvv •••')

    // tela da conversa
    const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).text()
    expect(detail).toContain('•••• 1111')
    for (const raw of RAW) expect(detail).not.toContain(raw)

    // alerta/notificação citam a última mensagem do cliente: também mascarada
    const alerts = (await (await c.admin.get('/api/alerts?limit=100')).json()).alerts as Array<{ customerName: string; description: string | null }>
    const mine = alerts.filter((a) => a.customerName === 'Cliente Mascarado')
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.some((a) => (a.description ?? '').includes('•••• 1111'))).toBe(true)
    const notifs = JSON.stringify((await (await c.admin.get('/api/notifications')).json()).notifications)
    for (const raw of RAW) {
      for (const a of mine) expect(a.description ?? '').not.toContain(raw)
      expect(notifs).not.toContain(raw)
    }
    const findings = await testDb.auditFinding.findMany({ where: { conversationId: conv.id } })
    for (const f of findings) for (const raw of RAW) expect(f.evidence ?? '').not.toContain(raw)

    // exportação para o titular (LGPD, portabilidade)
    const exp = await (await c.admin.get(`/api/conversations/${conv.id}/privacy/export`)).text()
    expect(exp).toContain('•••• 1111')
    for (const raw of RAW) expect(exp).not.toContain(raw)
    await c.dispose()
  })
})
