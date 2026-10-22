import { db } from '../db'
import { maskSensitive } from '../mask-sensitive'

// Situações novas · a frase que o Claude devolve em "novidade" (ai-classify.ts). Separado de novelty.ts para não
// fazer import circular com ai-classify. A frase deve vir genérica; aqui ainda se tiram e-mail, número longo e CPF/cartão.

const MAX_LEN = 160
/** A frase fica 30 dias (privacy.ts › purgeProductEvents); o tema agrupado fica sem ela. */
export const NOVELTY_RETENTION_DAYS = 30

export function cleanNovelty(text: string): string | null {
  const out = maskSensitive(text)
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[e-mail]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[número]')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“]+|["'”.]+$/g, '')
  if (out.length < 8 || /^(null|nenhuma?|n\/a)$/i.test(out)) return null
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN - 1).trimEnd()}…` : out
}

/** Guarda a frase da conversa. Enquanto não foi agrupada, a conversa tem uma frase só (a mais recente). */
export async function saveNovelSignal(organizationId: string, conversationId: string, raw: string, now = new Date()): Promise<void> {
  const description = cleanNovelty(raw)
  if (!description) return
  try {
    const open = await db.novelSignal.findFirst({ where: { conversationId, clusterId: null }, select: { id: true } })
    if (open) await db.novelSignal.update({ where: { id: open.id }, data: { description } })
    else await db.novelSignal.create({ data: { organizationId, conversationId, description, createdAt: now } })
  } catch (e) {
    console.error('[novidade] falha ao guardar', e instanceof Error ? e.message : e)
  }
}
