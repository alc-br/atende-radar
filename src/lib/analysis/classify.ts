import { norm, normChat } from './text'

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

// Ordem = prioridade: a intenção mais forte vence. Querer comprar/agendar/negociar vem antes de reclamação: o cliente
// irritado que quer marcar continua sendo uma venda em risco (a irritação aparece no sentimento).
const ABSURDO = /\b(absurd[oa]s?|que absurdo)\b/ // "absurdamente bom" é elogio
const INTENTS: Array<[string, RegExp[]]> = [
  ['cancelamento', [/cancel/, /desmarcar/, /desist/, /nao vou mais/]],
  ['compra', [
    /(quero|queria|gostaria de|vou) (comprar|fechar|contratar|encomendar|alugar|levar|comecar)/, /vou levar/, /\bpara fechar\b/,
    /pode mandar (o |a )?(link|pix|boleto|chave|dados)/, /link de pagamento/, /como pago/, /como faco (para )?(pagar|comecar|contratar|comprar|fechar)/,
    /\bfechado\b/, /\bfechou\b/, /\bdecidi (fazer|comprar|fechar|contratar)/, /\b(eu|a gente|nos) (fecho|fecha|fechamos)\b/, /(quero|gostaria de|vou) fazer a (matricula|compra|encomenda)/,
    /\b(me )?separa (para mim )?\d/, /\bme separa\b/, /\bseparar para mim\b/, /\bpasso (ai |la )?(para |hoje )?(pegar|buscar|retirar)\b/,
  ]],
  ['negociacao', [/negoci/, /faz por/, /melhor preco/, /abaixa/, /fecha por/, /consegue melhorar/, /\bproposta\b/, /\bse (fizer|fizerem|fazer) .{0,40}\b(fecho|fecha|fechamos|levo)\b/]],
  ['agendamento', [
    /agendar/, /marcar/, /reagendar/, /consulta (marcada|agendada)/, /\bvisitar\b/, /visita tecnica/, /\breservar\b/, /(quero|queria|gostaria de|vou) matricul/,
    /\btem (vaga|horario|hora)\b/, /\bvaga para\b/, /\bencaixe\b/, /\bencaixar\b/,
  ]],
  // "ninguém responde" é irritação com a espera (vai para o sentimento), não o assunto da conversa
  ['reclamacao', [ABSURDO, /pessim/, /horrivel/, /nao gostei/, /(?<!nao (estou|e) )reclam/, /insatisf/, /descaso/, /inaceitavel/, /procon/, /reclame aqui/]],
  ['disponibilidade', [/disponivel/, /estoque/]],
  ['preco', [/preco/, /\bvalor(es)?\b/, /\bquanto\b(?! tempo)/, /orcamento/, /custa/, /desconto/, /parcel/, /\bpix\b/, /formas? de pagamento/, /\binvestimento\b/, /\bcobram?\b/, /\bcota(r|cao|coes)\b/]],
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

const FRUSTRATED = [
  ABSURDO, /pessim/, /horrivel/, /nao gostei/, /(?<!nao (estou|e) )reclam/, /irritad/, /inaceitavel/, /vergonha/, /descaso/, /cansad[oa] de esperar/,
  /falta de respeito/, /desrespeit/, /chatead/, /decepcion/, /indignad/, /revoltad/, /procon/, /reclame aqui/, /que demora/, /\bcade\b/,
  // esperando sem resposta
  /(ninguem|nao) (me )?(respond|atend)(e|em)/, /\b(alguem|voces) (pode |podem |vai |vao )?(me )?(responder|atender)\b/, /ninguem (nem )?(me )?(avisou|ligou|retornou|respondeu)/,
  /desde ontem/, /\bha horas\b/, /\b(faz|ha) (\d+|dois|tres|quatro|varios|muitos) (dias|semanas|meses)\b/, /\bfaz (dois |tres |quatro )?dias\b/,
  /(aguardando|esperando) (ha|faz|desde)\b/, /\bate agora (nada|ninguem|nao)\b/, /parad[oa] esperando/,
  // já cobrou antes / coisa que devia ter acontecido
  /(segunda|terceira|quarta|quinta|varias|\d+a?) vez(es)? que/, /\bja (perguntei|pedi|cobrei|liguei|mandei mensagem|falei)\b/,
  /era para (ser|ter|estar) (entreg|instal|feit|pront|cheg)/, /(parou|quebrou|estragou|deu problema|voltou a dar) de novo/, /\bperdi (tudo|o dia|meu tempo)/, /cara na porta/,
  /(procurar|ir para) outr[ao] (lugar|loja|clinica|oficina|empresa)/,
]
// Mensagem que é só cobrança de resposta: "?", "oi??", "alô?"
const NUDGE = /^\s*(oi|ola|alo|e ai|alguem|bom dia|boa tarde|boa noite)?\s*\?+\s*$/i
const CONFUSED = [/nao entendi/, /como assim/, /confus/, /nao compreendi/, /pode explicar/]
const ANXIOUS = [/preocupad/, /ansios/, /nervos/, /aflit/, /dor forte/]
const POSITIVE = [/obrigad/, /otimo/, /perfeito/, /adorei/, /excelente/, /maravilh/, /combinado/, /parabens/]

const CRITICAL = [/urgente/, /emergencia/, /dor forte/, /agora mesmo/, /imediat/, /socorro/]
const HIGH = [/\bhoje\b/, /o quanto antes/, /preciso rapido/, /amanha cedo/, /para ja/]
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
  const allText = normChat(customer.map((m) => m.text).join(' \n '))
  // Sentimento e urgência olham o ÚLTIMO bloco do cliente (o que ele disse desde a última resposta da empresa):
  // irritação que já foi atendida ("ninguém responde?" → empresa responde → "ah, obrigada") não vale mais.
  let lastOut = -1
  let lastIn = -1
  messages.forEach((m, i) => { if (m.direction === 'outbound') lastOut = i; else if (m.text) lastIn = i })
  const blockStart = lastIn > lastOut ? lastOut + 1 : messages.slice(0, lastOut).map((m) => m.direction).lastIndexOf('outbound') + 1
  const block = messages.slice(blockStart).filter((m) => m.direction === 'inbound' && m.text)
  const recent = (block.length ? block : customer).slice(-5)
  const recentText = normChat(recent.map((m) => m.text).join(' \n '))
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
  const happy = any(POSITIVE, recentText)
  if (any(FRUSTRATED, recentText) || recent.some((m) => NUDGE.test(norm(m.text))) || (!happy && (/!{3,}/.test(rawRecent) || shoutingRatio(rawRecent) > 0.6))) sentiment = 'frustrated'
  else if (any(CONFUSED, recentText)) sentiment = 'confused'
  else if (any(ANXIOUS, recentText)) sentiment = 'anxious'
  else if (happy) sentiment = 'positive'

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
