import { test, expect } from '@playwright/test'
import { mapBaileysMessage } from '../../src/lib/whatsapp/map'

// Formato real das mensagens do Baileys (proto.IWebMessageInfo) → evento do sistema.
const key = (over: Record<string, unknown> = {}) => ({ remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'ABC123', ...over })
const ts = 1790000000

test.describe('mapeamento de mensagens do WhatsApp', () => {
  test('texto simples recebido', () => {
    const e = mapBaileysMessage({ key: key(), message: { conversation: 'Oi, tudo bem?' }, messageTimestamp: ts, pushName: 'Maria' })!
    expect(e.type).toBe('message.received')
    expect(e.payload).toMatchObject({ externalId: 'ABC123', chatId: '5511988887777@s.whatsapp.net', isGroup: false, fromMe: false, text: 'Oi, tudo bem?', messageType: 'text', pushName: 'Maria' })
    expect(e.occurredAt).toBe(new Date(ts * 1000).toISOString())
  })

  test('mensagem enviada pela empresa', () => {
    const e = mapBaileysMessage({ key: key({ fromMe: true }), message: { conversation: 'Olá!' }, messageTimestamp: ts })!
    expect(e.type).toBe('message.sent')
    expect(e.payload.fromMe).toBe(true)
  })

  test('texto estendido (resposta/link) e legenda de imagem', () => {
    expect(mapBaileysMessage({ key: key(), message: { extendedTextMessage: { text: 'veja isso' } }, messageTimestamp: ts })!.payload.text).toBe('veja isso')
    const img = mapBaileysMessage({ key: key(), message: { imageMessage: { caption: 'foto do dente' } }, messageTimestamp: ts })!
    expect(img.payload).toMatchObject({ text: 'foto do dente', messageType: 'image' })
  })

  test('mídia sem texto guarda só o tipo (áudio, imagem, documento, vídeo, figurinha)', () => {
    for (const [k, t] of [['audioMessage', 'audio'], ['imageMessage', 'image'], ['documentMessage', 'document'], ['videoMessage', 'video'], ['stickerMessage', 'sticker']] as const) {
      const e = mapBaileysMessage({ key: key(), message: { [k]: {} }, messageTimestamp: ts })!
      expect(e.payload.messageType).toBe(t)
      expect(e.payload.text ?? null).toBeNull()
    }
  })

  test('mensagens embrulhadas (temporárias, visualização única) são abertas', () => {
    const e = mapBaileysMessage({ key: key(), message: { ephemeralMessage: { message: { conversation: 'some em 24h' } } }, messageTimestamp: ts })!
    expect(e.payload.text).toBe('some em 24h')
    const v = mapBaileysMessage({ key: key(), message: { viewOnceMessage: { message: { imageMessage: { caption: 'uma vez' } } } }, messageTimestamp: ts })!
    expect(v.payload.text).toBe('uma vez')
  })

  test('grupos são marcados como grupo', () => {
    const e = mapBaileysMessage({ key: key({ remoteJid: '120363000000000001@g.us', participant: '5511911112222@s.whatsapp.net' }), message: { conversation: 'oi galera' }, messageTimestamp: ts })!
    expect(e.payload.isGroup).toBe(true)
  })

  test('o que não é conversa é ignorado (status, protocolo, reação, sem conteúdo)', () => {
    expect(mapBaileysMessage({ key: key({ remoteJid: 'status@broadcast' }), message: { conversation: 'story' }, messageTimestamp: ts })).toBeNull()
    expect(mapBaileysMessage({ key: key(), message: { protocolMessage: { type: 0 } }, messageTimestamp: ts })).toBeNull()
    expect(mapBaileysMessage({ key: key(), message: { reactionMessage: { text: '👍' } }, messageTimestamp: ts })).toBeNull()
    expect(mapBaileysMessage({ key: key(), messageTimestamp: ts })).toBeNull()
    expect(mapBaileysMessage({ key: key({ id: undefined }), message: { conversation: 'x' }, messageTimestamp: ts })).toBeNull()
  })

  test('timestamp em formato Long do protobuf', () => {
    const e = mapBaileysMessage({ key: key(), message: { conversation: 'oi' }, messageTimestamp: { low: ts, high: 0, toNumber: () => ts } as unknown as number })!
    expect(e.occurredAt).toBe(new Date(ts * 1000).toISOString())
  })
})
