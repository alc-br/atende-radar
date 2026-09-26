// Converte uma mensagem no formato do Baileys (proto.IWebMessageInfo) no evento que o sistema entende.
// Função pura: não depende do Baileys em si, só do formato dos dados.

export interface MappedEvent {
  type: 'message.received' | 'message.sent'
  occurredAt: string
  payload: {
    externalId: string
    chatId: string
    isGroup: boolean
    fromMe: boolean
    text: string | null
    messageType: string
    pushName?: string | null
  }
}

const MEDIA: Array<[string, string]> = [
  ['audioMessage', 'audio'],
  ['imageMessage', 'image'],
  ['videoMessage', 'video'],
  ['documentMessage', 'document'],
  ['documentWithCaptionMessage', 'document'],
  ['stickerMessage', 'sticker'],
  ['contactMessage', 'contact'],
  ['locationMessage', 'location'],
]

/** Abre os "embrulhos" (mensagem temporária, visualização única, edição). */
function unwrap(message: any): any {
  let m = message
  for (let i = 0; i < 5 && m; i++) {
    const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message ?? m.documentWithCaptionMessage?.message ?? m.editedMessage?.message
    if (!inner) break
    m = inner
  }
  return m
}

function toDate(t: any): Date {
  const n = typeof t === 'number' ? t : typeof t?.toNumber === 'function' ? t.toNumber() : Number(t?.low ?? t)
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date()
}

export function mapBaileysMessage(msg: any): MappedEvent | null {
  const key = msg?.key
  const chatId: string | undefined = key?.remoteJid
  const id: string | undefined = key?.id
  if (!chatId || !id || chatId === 'status@broadcast' || !msg.message) return null

  const m = unwrap(msg.message)
  if (!m || m.protocolMessage || m.reactionMessage || m.senderKeyDistributionMessage) {
    // mensagem só de protocolo ou reação: não é conversa
    if (!m || m.protocolMessage || m.reactionMessage) return null
  }

  let text: string | null = null
  let messageType = 'text'
  if (typeof m.conversation === 'string') text = m.conversation
  else if (m.extendedTextMessage?.text != null) text = m.extendedTextMessage.text
  else {
    const found = MEDIA.find(([k]) => m[k])
    if (!found) return null
    messageType = found[1]
    text = m[found[0]]?.caption ?? null
  }

  const fromMe = !!key.fromMe
  return {
    type: fromMe ? 'message.sent' : 'message.received',
    occurredAt: toDate(msg.messageTimestamp).toISOString(),
    payload: {
      externalId: id,
      chatId,
      isGroup: chatId.endsWith('@g.us'),
      fromMe,
      text: text && text.length > 0 ? text : null,
      messageType,
      pushName: msg.pushName ?? null,
    },
  }
}
