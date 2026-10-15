import { test, expect } from '@playwright/test'
import { createUser, loginAs, STRONG, uid } from './helpers'
import { newChat, setupCompany } from './gw'
import { testDb } from './db'
import { PHONE_ENC_TEST_KEY } from './media-env'
import { decryptPhone, encryptPhone, formatPhone, parsePhoneKey } from '../../src/lib/phone-crypto'

// B5/B9 · telefone completo do cliente: guardado CIFRADO (AES-256-GCM, PHONE_ENC_KEY) em Contact.phoneEncrypted,
// nunca em texto. Aparece só para quem já abre a conversa, sob pedido e auditado; entra na exportação LGPD.

const KEY = parsePhoneKey(PHONE_ENC_TEST_KEY).key!

async function contactOf(c: Awaited<ReturnType<typeof setupCompany>>, name: string) {
  const conv = (await c.conversations(name))[0]
  const orgId = (await (await c.admin.get('/api/me')).json()).organizationId as string
  const row = await testDb.conversation.findUniqueOrThrow({ where: { id: conv.id as string }, select: { contact: true } })
  return { conv, orgId, contact: row.contact! }
}

test.describe('B5/B9 · cifra (unidade)', () => {
  test('cifra e decifra; outra empresa, outra chave ou valor adulterado não abrem; sem chave não grava', () => {
    const enc = encryptPhone('org-a', '5511987654321', KEY)!
    expect(enc).toMatch(/^v1:/)
    expect(enc).not.toContain('987654321')
    expect(encryptPhone('org-a', '5511987654321', KEY)).not.toBe(enc) // IV aleatório
    expect(decryptPhone('org-a', enc, KEY)).toBe('5511987654321')
    expect(decryptPhone('org-b', enc, KEY)).toBeNull()
    expect(decryptPhone('org-a', enc, Buffer.alloc(32, 7))).toBeNull()
    const raw = Buffer.from(enc.slice(3), 'base64')
    raw[raw.length - 1] ^= 1
    expect(decryptPhone('org-a', `v1:${raw.toString('base64')}`, KEY)).toBeNull()
    expect(encryptPhone('org-a', '5511987654321', null)).toBeNull()
    expect(parsePhoneKey('curta').key).toBeNull()
    expect(parsePhoneKey(undefined).key).toBeNull()
    expect(formatPhone('5511987654321')).toBe('+55 (11) 98765-4321')
    expect(formatPhone('14155550100')).toBe('+14155550100')
  })
})

test.describe('B5/B9 · telefone completo na ingestão', () => {
  test('fica cifrado no banco (não em texto); dono vê com "Mostrar" (auditado); outra empresa não', async () => {
    const c = await setupCompany()
    const chat = newChat()
    const digits = chat.split('@')[0]
    const name = `Cliente Fone ${uid()}`
    await c.send(chat, 'Oi, quero um orçamento', { minutes: 5, pushName: name })
    const { conv, orgId, contact } = await contactOf(c, name)

    expect(contact.phoneEncrypted).toMatch(/^v1:/)
    expect(contact.phoneEncrypted).not.toContain(digits)
    expect(contact.phoneEncrypted).not.toContain(digits.slice(-8))
    expect(contact.phoneLast4).toBe(digits.slice(-4))
    expect(decryptPhone(orgId, contact.phoneEncrypted, KEY)).toBe(digits)
    // nenhuma coluna do contato guarda os dígitos em texto
    expect(JSON.stringify(contact)).not.toContain(digits)

    // detalhe e lista continuam mascarados; o detalhe só diz que há número guardado
    const detail = await (await c.admin.get(`/api/conversations/${conv.id}`)).json()
    expect(detail.contact.hasFullPhone).toBe(true)
    expect(JSON.stringify(detail)).not.toContain(digits)
    expect(JSON.stringify(await c.conversations(name))).not.toContain(digits)

    const r = await c.admin.get(`/api/conversations/${conv.id}/phone`)
    expect(r.status()).toBe(200)
    expect(r.headers()['cache-control']).toBe('no-store')
    expect((await r.json()).phone).toBe(formatPhone(digits))
    const audit = (await (await c.admin.get('/api/audit?limit=50')).json()).entries as Array<{ action: string; targetId: string; details: Record<string, unknown> | null }>
    const seen = audit.find((e) => e.action === 'contact.phone_viewed')
    expect(seen?.targetId).toBe(contact.id)
    expect(JSON.stringify(seen)).not.toContain(digits)

    const other = await setupCompany()
    expect((await other.admin.get(`/api/conversations/${conv.id}/phone`)).status()).toBe(404)

    // atendente só vê o telefone das conversas dele (aqui: nenhuma)
    const att = `att.fone.${uid()}@test.local`
    await createUser(c.admin, { email: att, role: 'atendente' })
    const attApi = await loginAs(att, STRONG)
    expect((await attApi.get(`/api/conversations/${conv.id}/phone`)).status()).toBe(404)
    // visualizador não abre conversas
    const viewer = `viewer.fone.${uid()}@test.local`
    await createUser(c.admin, { email: viewer, role: 'viewer' })
    const viewerApi = await loginAs(viewer, STRONG)
    expect((await viewerApi.get(`/api/conversations/${conv.id}/phone`)).status()).toBe(403)

    await attApi.dispose()
    await viewerApi.dispose()
    await other.dispose()
    await c.dispose()
  })

  test('contato antigo (sem número cifrado) ganha o número na próxima mensagem', async () => {
    const c = await setupCompany()
    const chat = newChat()
    const name = `Cliente Antigo ${uid()}`
    await c.send(chat, 'primeira', { minutes: 10, pushName: name })
    const { contact, orgId, conv } = await contactOf(c, name)
    await testDb.contact.update({ where: { id: contact.id }, data: { phoneEncrypted: null } }) // como antes da chave
    expect((await c.admin.get(`/api/conversations/${conv.id}/phone`)).status()).toBe(404)
    await c.send(chat, 'segunda', { minutes: 5, pushName: name })
    const after = await testDb.contact.findUniqueOrThrow({ where: { id: contact.id } })
    expect(decryptPhone(orgId, after.phoneEncrypted, KEY)).toBe(chat.split('@')[0])
    await c.dispose()
  })

  test('LGPD: exportação traz o telefone completo; excluir do monitoramento apaga o número cifrado', async () => {
    const c = await setupCompany()
    const chat = newChat()
    const digits = chat.split('@')[0]
    const name = `Titular Fone ${uid()}`
    await c.send(chat, 'Oi', { minutes: 5, pushName: name })
    const { conv, contact } = await contactOf(c, name)

    const exp = await c.admin.get(`/api/conversations/${conv.id}/privacy/export`)
    expect(exp.status()).toBe(200)
    const data = await exp.json()
    expect(data.contact.phone).toBe(formatPhone(digits))
    expect(data.contact.phoneLast4).toBe(digits.slice(-4))

    expect((await c.admin.post(`/api/conversations/${conv.id}/privacy`, { data: { action: 'exclude' } })).status()).toBe(200)
    const after = await testDb.contact.findUniqueOrThrow({ where: { id: contact.id } })
    expect(after.excluded).toBe(true)
    expect(after.phoneEncrypted).toBeNull()
    await c.dispose()
  })
})
