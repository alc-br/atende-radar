import { norm } from './text'

export interface AnalysisMessage {
  direction: 'inbound' | 'outbound'
  text: string | null
  occurredAt: Date
}

export interface Classification {
  intent: string | null
  stage: string
  urgency: 'low' | 'normal' | 'high' | 'critical'
  sentiment: 'neutral' | 'positive' | 'frustrated' | 'anxious' | 'confused'
  confidence: number
  /** 'heuristic' = regras de palavras (sem IA). Um provedor de IA pode devolver 'llm' com o mesmo formato. */
  source: 'heuristic' | 'llm'
}

// Ordem = prioridade: a intenção mais forte vence.
const INTENTS: Array<[string, RegExp[]]> = [
  ['cancelamento', [/cancel/, /desmarcar/, /desist/, /nao vou mais/]],
  ['reclamacao', [/absurd/, /pessim/, /horrivel/, /nao gostei/, /reclam/, /ninguem (me )?responde/, /insatisf/, /descaso/, /inaceitavel/]],
  ['compra', [/quero (comprar|fechar|contratar)/, /vou levar/, /pode mandar/, /como pago/, /como faco (para |pra )?pagar/, /\bfechado\b/, /\bfechou\b/]],
  ['negociacao', [/negoci/, /faz por/, /melhor preco/, /abaixa/, /fecha por/, /consegue melhorar/]],
  ['agendamento', [/agendar/, /marcar/, /reagendar/, /consulta (marcada|agendada)/]],
  ['disponibilidade', [/disponivel/, /tem (vaga|horario|hora)\b/, /\bvaga/, /estoque/]],
  ['preco', [/preco/, /valor/, /quanto/, /orcamento/, /custa/, /desconto/, /parcel/, /\bpix\b/]],
  ['suporte', [/problema/, /\berro\b/, /nao funciona/, /\bajuda\b/, /duvida/, /travou/]],
  ['pos_venda', [/garantia/, /\btroca\b/, /nota fiscal/, /depois da compra/, /pos[- ]venda/]],
  ['consulta', [/onde fica/, /endereco/, /como funciona/, /informac/, /gostaria de saber/, /horario de funcionamento/]],
]

const STAGE_BY_INTENT: Record<string, string> = {
  preco: 'price',
  agendamento: 'qualification',
  disponibilidade: 'qualification',
  compra: 'decision',
  negociacao: 'negotiation',
  consulta: 'discovery',
  suporte: 'post_sale',
  pos_venda: 'post_sale',
  reclamacao: 'evaluation',
  cancelamento: 'evaluation',
}

const FRUSTRATED = [/absurd/, /pessim/, /horrivel/, /nao gostei/, /reclam/, /ninguem (me )?responde/, /\bha horas\b/, /\bfaz (dois |tres |quatro |\d+ )?dias\b/, /irritad/, /inaceitavel/, /vergonha/, /descaso/, /cansad[oa] de esperar/]
const CONFUSED = [/nao entendi/, /como assim/, /confus/, /nao compreendi/, /pode explicar/]
const ANXIOUS = [/preocupad/, /ansios/, /nervos/, /aflit/, /dor forte/]
const POSITIVE = [/obrigad/, /otimo/, /perfeito/, /adorei/, /excelente/, /maravilh/, /combinado/, /parabens/]

const CRITICAL = [/urgente/, /emergencia/, /dor forte/, /agora mesmo/, /imediat/, /socorro/]
const HIGH = [/\bhoje\b/, /o quanto antes/, /preciso rapido/, /amanha cedo/, /pra ja/]
const LOW = [/sem pressa/, /semana que vem/, /mes que vem/, /quando (der|puder)/, /depois eu vejo/]

const any = (res: RegExp[], t: string) => res.some((r) => r.test(t))

function shoutingRatio(raw: string): number {
  const letters = raw.replace(/[^A-Za-zÀ-ÿ]/g, '')
  if (letters.length < 12) return 0
  const upper = letters.replace(/[^A-ZÀ-Þ]/g, '').length
  return upper / letters.length
}

/** Classifica a conversa olhando SÓ o que o cliente escreveu (o que a empresa diz não define a intenção dele). */
export function classifyMessages(messages: AnalysisMessage[]): Classification {
  const customer = messages.filter((m) => m.direction === 'inbound' && m.text)
  const allText = norm(customer.map((m) => m.text).join(' \n '))
  const recent = customer.slice(-5)
  const recentText = norm(recent.map((m) => m.text).join(' \n '))
  const rawRecent = recent.map((m) => m.text ?? '').join(' ')

  let intent: string | null = null
  let hits = 0
  for (const [name, patterns] of INTENTS) {
    const matched = patterns.filter((r) => r.test(allText)).length
    if (matched > 0) {
      intent = name
      hits = matched
      break
    }
  }

  let sentiment: Classification['sentiment'] = 'neutral'
  if (any(FRUSTRATED, recentText) || /!{3,}/.test(rawRecent) || shoutingRatio(rawRecent) > 0.6) sentiment = 'frustrated'
  else if (any(CONFUSED, recentText)) sentiment = 'confused'
  else if (any(ANXIOUS, recentText)) sentiment = 'anxious'
  else if (any(POSITIVE, recentText)) sentiment = 'positive'

  let urgency: Classification['urgency'] = 'normal'
  if (any(CRITICAL, recentText)) urgency = 'critical'
  else if (any(HIGH, recentText)) urgency = 'high'
  else if (any(LOW, recentText)) urgency = 'low'

  return {
    intent,
    stage: intent ? STAGE_BY_INTENT[intent] ?? 'discovery' : 'discovery',
    urgency,
    sentiment,
    confidence: intent ? Math.min(0.75, 0.55 + 0.05 * (hits - 1)) : 0.3,
    source: 'heuristic',
  }
}
