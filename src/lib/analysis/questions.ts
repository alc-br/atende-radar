import { norm, normChat } from './text'

// B6 · Perguntas ignoradas: pergunta do cliente que ficou sem resposta da empresa além do SLA.
// Funções puras (testadas em tests/unit); o motor grava o resultado em OpenQuestion.

// Começo de frase que já é pergunta mesmo sem "?" (texto já passado por normChat: minúsculas, sem acento, "vc" → "voce")
const INTERROGATIVE_START = new RegExp(
  '^(' + [
    'quanto', 'quanta', 'quantos', 'quantas', 'qual', 'quais', 'onde', 'aonde', 'sera que',
    'como (faco|funciona|e que|posso|consigo|eu faco|que faz|fica|seria)',
    'quando (abre|fecha|voces|vai|chega|posso|sera|e|fica|comeca|termina)',
    'que horas', 'que dia', 'ate que horas',
    'voces (tem|fazem|aceitam|atendem|trabalham|abrem|entregam|vendem|parcelam)',
    'tem como', 'teria como', 'da para', 'e possivel', 'aceita', 'aceitam', 'tem (vaga|horario|disponivel|desconto|estacionamento)',
  ].join('|') + ')\\b'
)
// Cumprimento/conversa fiada com "?" não pede resposta de verdade ("tudo bem?", "oi??")
const SMALL_TALK = /^((oi|ola|alo|e ai|bom dia|boa tarde|boa noite|opa)[\s,!.]*)*(tudo (bem|bom|certo|joia|tranquilo)|como vai|como voce esta|blz|beleza|alguem|alguem ai|tem alguem( ai)?)?[\s?!.]*$/

/**
 * A mensagem do cliente é uma pergunta? Olha frase a frase: alguma termina com "?" ou começa com palavra interrogativa
 * ("Oi, tudo bem? Quanto custa?" é pergunta; "Oi, tudo bem? Queria agendar" não é).
 */
export function isQuestion(text: string | null | undefined): boolean {
  if (!norm(text)) return false
  const sentences = String(text).split(/\n+|(?<=[?!.])\s+/)
  return sentences.some((s) => {
    const raw = norm(s)
    if (!raw) return false
    const t = normChat(s)
    if (SMALL_TALK.test(t)) return false
    // "?" no fim da frase (ignora emoji/pontuação depois)
    return /\?[^a-z0-9]*$/.test(raw) || INTERROGATIVE_START.test(t)
  })
}

export interface QuestionMessage {
  id: string
  direction: string // 'inbound' | 'outbound'
  text: string | null
  occurredAt: Date
}

export interface DetectedQuestion {
  messageId: string
  text: string
  askedAt: Date
  /** Mensagem da empresa que respondeu (a primeira depois da pergunta), se já houve. */
  answeredBy: string | null
  /** Minutos que a pergunta ficou (ou está) sem resposta, já no relógio do motor (expediente ou corrido). */
  waitedMinutes: number
}

export interface DetectOptions {
  now: Date
  /** SLA da primeira resposta (minutos) — pergunta antes de a empresa falar qualquer coisa */
  slaFirstMinutes: number
  /** SLA de continuidade (minutos) — pergunta no meio da conversa */
  slaContinuityMinutes: number
  /** Como contar o tempo (expediente ou corrido): o mesmo relógio dos alertas */
  elapsed: (from: Date, to: Date) => number
}

/**
 * Perguntas do cliente que estouraram o SLA sem resposta. Resultado determinístico (não depende de quando o motor roda):
 * entra quem esperou mais que o SLA até a resposta da empresa — ou até agora, se ninguém respondeu.
 */
export function detectIgnoredQuestions(messages: QuestionMessage[], opts: DetectOptions): DetectedQuestion[] {
  const msgs = [...messages].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  const out: DetectedQuestion[] = []
  let companySpoke = false
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i]
    if (m.direction === 'outbound') {
      companySpoke = true
      continue
    }
    if (!isQuestion(m.text)) continue
    const reply = msgs.slice(i + 1).find((x) => x.direction === 'outbound' && x.occurredAt >= m.occurredAt)
    const until = reply ? reply.occurredAt : opts.now
    const waited = opts.elapsed(m.occurredAt, until)
    const sla = companySpoke ? opts.slaContinuityMinutes : opts.slaFirstMinutes
    if (waited < sla) continue
    out.push({ messageId: m.id, text: (m.text ?? '').trim().slice(0, 280), askedAt: m.occurredAt, answeredBy: reply?.id ?? null, waitedMinutes: Math.round(waited) })
  }
  return out
}
