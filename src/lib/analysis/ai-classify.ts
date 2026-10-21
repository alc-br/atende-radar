import { createHash } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { db } from '../db'
import { recordAiUsage } from '../product-events'
import { STAGE_BY_INTENT, type AnalysisMessage, type Classification } from './classify'

// Item 8 · classificação por IA (Claude). Desligada por padrão: só roda com AI_CLASSIFIER=claude e ANTHROPIC_API_KEY no
// ambiente (docs/operacao/ia.md). Qualquer falha (sem chave, limite do dia, erro da API, recusa) cai nas regras de palavras.
// O texto já chega mascarado (CPF, cartão) pelo motor. Do Claude só se guardam os rótulos (AiClassification), nunca o texto.

const INTENTS = ['cancelamento', 'compra', 'negociacao', 'agendamento', 'reclamacao', 'disponibilidade', 'preco', 'suporte', 'pos_venda', 'consulta', 'nenhuma'] as const
const Saida = z.object({
  intent: z.enum(INTENTS),
  urgency: z.enum(['low', 'normal', 'high', 'critical']),
  sentiment: z.enum(['neutral', 'positive', 'frustrated', 'anxious', 'confused']),
  confidence: z.enum(['alta', 'media', 'baixa']),
})
type Saida = z.infer<typeof Saida>
const CONFIDENCE: Record<Saida['confidence'], number> = { alta: 0.9, media: 0.75, baixa: 0.55 }

const SYSTEM = `Você classifica conversas de WhatsApp entre um cliente e uma empresa brasileira (clínica, loja, escola, oficina, prestador de serviço).
Responda só com os rótulos pedidos, olhando o que o CLIENTE escreveu. O que a empresa diz não define a intenção do cliente.

intent: o assunto principal do cliente. Se houver mais de um, vale o primeiro desta lista que aparecer:
- cancelamento: quer cancelar, desmarcar ou desistir.
- compra: decidiu comprar ou contratar, pede link, pix ou boleto para pagar, pede para separar um produto.
- negociacao: pede desconto, contraproposta ou condição para fechar.
- agendamento: quer marcar, reservar, reagendar, pergunta se tem horário ou vaga para ser atendido. Candidato perguntando por vaga de emprego não é agendamento.
- reclamacao: reclama do produto, do serviço ou do atendimento.
- disponibilidade: pergunta se tem o produto em estoque.
- preco: pergunta preço, valor, orçamento, parcelamento ou forma de pagamento.
- suporte: tem um problema ou dúvida de uso.
- pos_venda: garantia, troca, nota fiscal, algo depois da compra.
- consulta: endereço, como funciona, horário de funcionamento, informação geral.
- nenhuma: só saudação, mídia sem texto, assunto pessoal ou sem relação com compra ou atendimento.

sentiment: como o cliente está AGORA, no último bloco de mensagens dele desde a última resposta da empresa. Irritação que a empresa já respondeu e o cliente agradeceu não vale mais.
- frustrated: irritado, cobrando resposta ("??", "ninguém responde"), reclamando da demora, ameaçando desistir.
- anxious: preocupado, aflito, com dor.
- confused: não entendeu a explicação.
- positive: agradeceu, elogiou, confirmou satisfeito.
- neutral: nenhum dos anteriores.

urgency (no último bloco do cliente): critical = emergência, dor forte, "urgente"; high = precisa para hoje ou o quanto antes; low = disse que não tem pressa; normal = o resto.

confidence: alta quando a conversa deixa claro; media quando dá para inferir; baixa quando é um palpite.`

const MAX_MESSAGES = 40
const MAX_CHARS = 6000

export function aiEnabled(): boolean {
  return process.env.AI_CLASSIFIER === 'claude' && !!process.env.ANTHROPIC_API_KEY
}

const aiModel = () => process.env.AI_MODEL || 'claude-opus-5-5'

/** Transcrição curta: só as últimas mensagens com texto, marcadas por quem falou. */
export function transcript(messages: AnalysisMessage[]): string {
  const lines = messages.filter((m) => m.text).slice(-MAX_MESSAGES).map((m) => `${m.direction === 'inbound' ? 'CLIENTE' : 'EMPRESA'}: ${m.text!.replace(/\s+/g, ' ').trim()}`)
  let out = lines.join('\n')
  while (out.length > MAX_CHARS && lines.length > 1) out = (lines.shift(), lines.join('\n'))
  return out
}

export interface AiContext { segment?: string; terms?: string }

/** Chave do cache: muda quando o texto da conversa, o modelo ou o contexto da empresa mudam. */
export function aiKey(text: string, ctx: AiContext): string {
  return createHash('sha256').update(`${aiModel()}\n${ctx.segment ?? ''}\n${ctx.terms ?? ''}\n${text}`).digest('hex')
}

export function fromSaida(s: Saida): Classification {
  const intent = s.intent === 'nenhuma' ? null : s.intent
  return {
    intent,
    stage: intent ? STAGE_BY_INTENT[intent] ?? 'discovery' : 'discovery',
    urgency: s.urgency,
    sentiment: s.sentiment,
    confidence: CONFIDENCE[s.confidence],
    source: 'llm',
  }
}

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 }))

export async function callClaude(text: string, ctx: AiContext): Promise<{ saida: Saida; inputTokens: number; outputTokens: number } | null> {
  const contexto = [
    ctx.segment ? `Segmento da empresa: ${ctx.segment}.` : '',
    ctx.terms?.trim() ? `Termos e abreviações do setor (termo = significado):\n${ctx.terms.trim().slice(0, 1500)}` : '',
  ].filter(Boolean).join('\n')
  const response = await anthropic().messages.parse({
    model: aiModel(),
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: 'low', format: zodOutputFormat(Saida) },
    messages: [{ role: 'user', content: `${contexto ? `${contexto}\n\n` : ''}Conversa:\n${text}` }],
  })
  if (response.stop_reason === 'refusal' || !response.parsed_output) return null
  return { saida: response.parsed_output, inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens }
}

/**
 * Classifica com o Claude as conversas que mudaram desde a última chamada (as outras vêm do cache).
 * Devolve só as que têm resultado de IA; quem não está no mapa segue nas regras de palavras.
 */
export async function aiClassifyMany(
  orgId: string,
  convs: Array<{ id: string; messages: AnalysisMessage[] }>,
  ctx: AiContext,
  now = new Date(),
): Promise<Map<string, Classification>> {
  const out = new Map<string, Classification>()
  if (!aiEnabled() || convs.length === 0) return out
  const items = convs
    .map((c) => ({ id: c.id, text: transcript(c.messages) }))
    .filter((c) => /^CLIENTE:/m.test(c.text))
    .map((c) => ({ ...c, key: aiKey(c.text, ctx) }))
  const cached = await db.aiClassification.findMany({ where: { conversationId: { in: items.map((i) => i.id) } } })
  const byConv = new Map(cached.map((c) => [c.conversationId, c]))
  const todo: typeof items = []
  for (const it of items) {
    const hit = byConv.get(it.id)
    if (hit && hit.inputHash === it.key) {
      const parsed = Saida.safeParse(JSON.parse(hit.resultJson))
      if (parsed.success) { out.set(it.id, fromSaida(parsed.data)); continue }
    }
    todo.push(it)
  }

  // Limites que protegem a conta de um laço ou de um pico: por rodada do motor e por empresa no dia (contado no AiUsage,
  // o mesmo registro do custo em Admin › Produto). O que passar do limite fica nas regras de palavras até a próxima rodada.
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0)
  const usedToday = await db.aiUsage.count({ where: { organizationId: orgId, feature: 'classify', createdAt: { gte: dayStart } } })
  const left = Math.max(0, (Number(process.env.AI_DAILY_LIMIT_PER_ORG) || 500) - usedToday)
  const queue = todo.slice(0, Math.min(Number(process.env.AI_MAX_CALLS_PER_TICK) || 20, left))
  const worker = async () => {
    for (let it = queue.shift(); it; it = queue.shift()) {
      try {
        const r = await callClaude(it.text, ctx)
        if (!r) continue
        out.set(it.id, fromSaida(r.saida))
        const data = { organizationId: orgId, inputHash: it.key, resultJson: JSON.stringify(r.saida), model: aiModel(), inputTokens: r.inputTokens, outputTokens: r.outputTokens }
        await db.aiClassification.upsert({ where: { conversationId: it.id }, create: { conversationId: it.id, ...data }, update: data })
        await recordAiUsage({ organizationId: orgId, conversationId: it.id, provider: 'anthropic', model: aiModel(), feature: 'classify', inputTokens: r.inputTokens, outputTokens: r.outputTokens })
      } catch (e) {
        // sem retentar aqui: a conversa fica nas regras de palavras e entra de novo na próxima rodada em que mudar
        if (e instanceof Anthropic.AuthenticationError) { console.error('[ia] chave do Claude recusada; seguindo nas regras de palavras'); queue.length = 0; return }
        console.error('[ia] classificação falhou', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e instanceof Error ? e.message : e)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker))
  return out
}
