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
  /** 'heuristic' = regras de palavras (sem IA); 'llm' = Claude (ai-classify.ts), com o mesmo formato. */
  source: 'heuristic' | 'llm'
}

// Ordem = prioridade: a intenção mais forte vence. Querer comprar/agendar/negociar vem antes de reclamação: o cliente
// irritado que quer marcar continua sendo uma venda em risco (a irritação aparece no sentimento).
const ABSURDO = /\b(absurd[oa]s?|que absurdo)\b/ // "absurdamente bom" é elogio
// "tem vaga para auxiliar administrativo?" é candidato a emprego, não cliente querendo marcar
const CARGO = String.raw`(?! (de |para |pra )?(emprego|trabalho|trabalhar|auxiliar|assistente|vendedor|atendente|recepcionista|estagi|jovem aprendiz|aprendiz|motorista|cozinheir|garcom|garconete|caixa|repositor|gerente|secretari|tecnic|analista|operador|entregador|faxineir|diarista|cabeleireir|manicure|professor|enfermeir|dentista|esteticista|balconista|estoquista))`
const INTENTS: Array<[string, RegExp[]]> = [
  ['cancelamento', [/cancel/, /desmarcar/, /desist/, /nao vou mais/]],
  ['compra', [
    /(quero|queria|gostaria de|vou) (comprar|fechar|contratar|encomendar|alugar|levar|comecar)/, /vou levar/, /\bpara fechar\b/,
    /pode mandar (o |a )?(link|pix|boleto|chave|dados)/, /link de pagamento/, /como pago/, /como faco (para )?(pagar|comecar|contratar|comprar|fechar)/,
    /\bfechado\b/, /\bfechou\b/, /\bdecidi (fazer|comprar|fechar|contratar)/, /\b(eu|a gente|nos) (fecho|fecha|fechamos)\b/, /(quero|gostaria de|vou) fazer a (matricula|compra|encomenda)/,
    /\b(me )?separa (para mim )?\d/, /\bme separa\b/, /\bseparar para mim\b/, /\bpasso (ai |la )?(para |hoje )?(pegar|buscar|retirar)\b/,
    // "vou querer", "quero 2", "me manda o pix/link" (pedido para pagar, não pergunta de preço)
    /\bvou querer\b/, /\bquero (\d+|duas?|dois|tres|esse|essa|esses|essas)\b(?! (dias|horas|minutos|meses|anos|vezes))/, /\b(me )?manda(r)? (o |a )?(pix|link|chave|boleto|dados (para|do) pagamento)\b/,
  ]],
  ['negociacao', [/negoci/, /faz por/, /melhor preco/, /abaixa/, /fecha por/, /consegue melhorar/, /\bproposta\b/, /\bse (fizer|fizerem|fazer) .{0,40}\b(fecho|fecha|fechamos|levo)\b/]],
  ['agendamento', [
    /agendar/, /marcar/, /reagendar/, /consulta (marcada|agendada)/, /\bvisitar\b/, /visita tecnica/, /\breservar\b/, /(quero|queria|gostaria de|vou) matricul/,
    new RegExp(String.raw`\btem (vaga|horario|hora)\b${CARGO}`), new RegExp(String.raw`\bvaga\b${CARGO} para\b`), /\bencaixe\b/, /\bencaixar\b/,
    /\b(marca|reserva|agenda) (para mim|um horario|uma hora|uma vaga)\b/, /\btem disponibilidade\b/, /\bhorarios?\b.{0,15}\b(livres?|disponive(l|is)|vagos?)\b/,
    /\b(podem|pode|consegue|conseguem) me atender (no |na |nesse |nessa |esse |essa )?(sabado|domingo|amanha|hoje|segunda|terca|quarta|quinta|sexta|feriado|de manha|a tarde|a noite|as \d)/,
  ]],
  // "ninguém responde" é irritação com a espera (vai para o sentimento), não o assunto da conversa
  ['reclamacao', [ABSURDO, /pessim/, /horrivel/, /nao gostei/, /(?<!nao (estou|e) )reclam/, /insatisf/, /descaso/, /inaceitavel/, /procon/, /reclame aqui/]],
  ['disponibilidade', [/disponivel/, /estoque/]],
  ['preco', [/preco/, /\bvalor(es)?\b/, /\bquanto\b(?! tempo)/, /orcamento/, /custa/, /desconto/, /parcel/, /\bpix\b/, /formas? de pagamento/, /\binvestimento\b/, /\bcobram?\b/, /\bcota(r|cao|coes)\b/, /\be caro\b/, /\bprecinho\b/, /\br\$\s*\?/]],
  ['suporte', [/problema/, /\berro\b/, /nao funciona/, /\bajuda\b/, /duvida/, /travou/]],
  ['pos_venda', [/garantia/, /\btroca\b/, /nota fiscal/, /depois da compra/, /pos[- ]venda/]],
  ['consulta', [/onde fica/, /endereco/, /como funciona/, /informac/, /gostaria de saber/, /horario de funcionamento/]],
]
export const STAGE_BY_INTENT: Record<string, string> = {
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
  /falta de respeito/, /desrespeit/, /chatead/, /decepcion/, /indignad/, /revoltad/, /procon/, /reclame aqui/, /\bcade\b/,
  // "que demora!" é queixa; "quanto tempo que demora?" é pergunta
  /(?<!\b(tempo|quanto|quantos|quantas|dias|horas|o|isso|so|ainda)\s)\bque demora\b/,
  // esperando sem resposta (exige a queixa: "vocês podem me atender sábado?" e "não atendem aos sábados?" são perguntas)
  /ninguem (me )?(respond|atend)(e|em)/, /\bnao me (respond|atend)(e|em)\b/,
  /\bnao (respond|atend)(e|em)\b(?=\s*(o |a )?(telefone|celular|ligac|whats|zap|mensag|ninguem|nunca|mais|nada|[?!]*\s*$))/,
  /\balguem (ai )?(pode |vai )?(me )?(responder|atender)\b(?=\s*([?!.]|por favor|pf|$))/, /\bvoces (vao|nao vao) (me )?(responder|atender)\b/,
  /\bvoces (pode |podem )?(me )?responder\s*(\?|!|$|ou nao)/, /ninguem (nem )?(me )?(avisou|ligou|retornou|respondeu)/,
  /desde ontem.{0,40}\b(e nada|nada ainda|sem (resposta|retorno)|ninguem|nao (me )?(respond|retorn|lig))/,
  /\bha horas\b/, /(aguardando|esperando|espero|aguardo) (ha|faz|desde)\b/, /\bate agora (nada|ninguem|nao)\b/, /parad[oa] esperando/,
  // "faz 2 meses que espero" é queixa; "comprei há 2 meses" é informação
  /\b(faz|ha) ((\d+|dois|tres|quatro|cinco|varios|muitos|uns) )?(dias|semanas|meses)\b.{0,40}\b(espero|esperando|aguardo|aguardando|sem (resposta|retorno|solucao)|e nada|nada ainda|ninguem|nao (me )?(respond|retorn|resolv|cheg|entreg|lig)|peco|pedindo|cobro|cobrando|tento|tentando|ligo|ligando)/,
  // já cobrou antes / coisa que devia ter acontecido ("é a segunda vez que compro" é elogio, não cobrança)
  /(segunda|terceira|quarta|quinta|varias|\d+a?) vez(es)? que (eu )?(ja )?(me (falam|falaram|dizem|disseram|prometem|prometeram|enrolam|mandam)|peco|pedi|pergunto|perguntei|ligo|liguei|mando|mandei|cobro|cobrei|falo|falei|escrevo|escrevi|reclamo|reclamei|tento|tentei|chamo|chamei|explico|expliquei|repito|venho aqui|volto|voltei|aconte|da (problema|defeito)|deu (problema|defeito)|quebra|quebrou|estraga|estragou|para de|parou)/,
  /\b(pedi|perguntei|liguei|mandei|cobrei|falei|expliquei|chamei)\b.{0,25}\b(\d+|duas|tres|quatro|varias|mil) vezes\b/,
  /\bja (perguntei|pedi|cobrei|liguei|mandei mensagem|falei|avisei|expliquei)\b.{0,40}\b(e nada|e ninguem|e nao|e ate agora|sem resposta|nao (me )?(respond|retorn|resolv)|ninguem|(\d+|duas|tres|varias|mil) vezes|de novo|mais de uma vez|antes)/,
  /era para (ser|ter|estar) (entreg|instal|feit|pront|cheg)/, /(parou|quebrou|estragou|deu problema|voltou a dar) de novo/, /\bperdi (tudo|o dia|meu tempo)/, /cara na porta/,
  /(procurar|ir para) outr[ao] (lugar|loja|clinica|oficina|empresa)/,
  // desistência, xingamento leve e cobrança irônica ("sério que ninguém vai responder", "e aí, vão responder?")
  /(?<!\bnao )\b(vou desistir|desisto)\b/, /\bnunca mais (compro|volto|venho|faco|peco|indico)\b/, /palhacada/, /\bridicul/, /^\s*af+\b/, /\bpqp\b/, /[\u{1F620}\u{1F621}\u{1F92C}\u{1F624}]/u,
  /\b(muito|tao|super|mt) (lent|demorad)/, /\bserio que (ninguem|voces nao|nao vao)\b/, /\b(voces )?(vao|vai) (me )?responder\b.{0,10}\?/,
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
