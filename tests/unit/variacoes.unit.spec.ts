import { test, expect } from '@playwright/test'
import { classifyMessages } from '../../src/lib/analysis/classify'
import { extractPromise } from '../../src/lib/analysis/promises'
import { isQuestion } from '../../src/lib/analysis/questions'
import { extractSignature } from '../../src/lib/analysis/agents'

// Bateria de variações de escrita do WhatsApp (pedido do dono, 20/10/2026): abreviação, erro de digitação, sem acento,
// maiúsculas, emoji, pontuação esquecida ou fora do lugar e mensagem quebrada em várias. Cada caso que escapar no uso
// real entra aqui. Os "não" seguram o alarme falso: um padrão novo que pega mais não pode pegar o que não é.

type Msg = { id: string; direction: 'inbound' | 'outbound'; text: string; occurredAt: Date }
/** Mensagens do cliente; "\n\n" separa mensagens diferentes (a mesma pessoa mandando em sequência). */
const cliente = (t: string) =>
  classifyMessages(t.split('\n\n').map((x, i): Msg => ({ id: String(i), direction: 'inbound', text: x, occurredAt: new Date(2026, 9, 20, 10, i) })) as never)

const PRECO = [
  'quanto custa', 'qnto custa a limpeza', 'qto custa', 'QUANTO CUSTA', 'qual o valor', 'valor?', 'qual valor', 'preço?', 'preco',
  'quanto fica', 'quanto sai', 'ta quanto', 'tá qnto', 'quanto é', 'qunto custa', 'quato custa', 'cuanto custa', 'me passa o valor',
  'tabela de preços', 'orçamento', 'faz um orçamento pra mim', 'qual o investimento', 'valores?', 'quanto vcs cobram', 'é caro?',
  'precinho', 'R$?', 'quanto custa 💅', 'Quanto custa\n?', 'oi\n\nquanto\n\ncusta', 'Oi, boa tarde!\n\nQuanto custa a limpeza de pele',
]
const ALTA = [
  'quero agendar', 'qro agendar', 'quero marcar', 'tem horário amanhã', 'tem horario amanha?', 'tem vaga hj', 'quero fechar', 'vou querer',
  'pode marcar pra mim', 'marca pra mim', 'bora marcar', 'consigo encaixe hoje', 'quero comprar', 'como faço pra pagar', 'manda o pix',
  'me manda o link', 'quero contratar', 'fechado', 'pode reservar', 'reserva pra mim', 'agenda pra mim sabado 10h', 'quero 2', 'vou levar',
  'tem disponibilidade amanha', 'qual horario tem livre', 'QUERO AGENDAR', 'quero agendar 🙏', 'oi\n\nqueria marcar\n\npra amanha',
]
const SEM_INTENCAO_ALTA = ['bom dia', 'Ok, obrigada', 'quero 2 dias pra pensar', 'Vou pensar e te aviso', 'Pode ser']
const IRRITADO = [
  'Absurdo!!!', 'NINGUEM RESPONDE', 'ngm responde aqui', 'que demora', 'q demora hein', 'pessimo atendimento', 'vou desistir', 'desisto',
  'que falta de respeito', '???', 'alo?', 'oi???', 'e aí, vão responder?', 'to esperando ha 1 hora', 'vou procurar outro lugar',
  'nunca mais compro aqui', 'que palhaçada', 'ridiculo', 'decepcionada', 'estou muito chateada', 'cadê a resposta', 'aff', 'Afff',
  'sério que ninguém vai responder', 'vou reclamar no reclame aqui', '😡😡', 'pqp', 'vcs são muito lentos', 'oi\n\n?\n\n??',
]
const NAO_IRRITADO = [
  'Ok, obrigada!', 'Perfeito, combinado', 'não vou desistir não, quero agendar', 'quanto tempo que demora?', 'kkkk ok', 'Pode ser amanhã',
  'Vocês atendem sábado?', 'Oi, tudo bem?',
]
const PROMESSA = [
  'ja te retorno', 'já te falo', 'vou ver e te aviso', 'um minutinho que vou verificar', 'te retorno em 5 min', 'te mando amanha',
  'daqui a pouco te respondo', 'vou confirmar e te chamo', 'deixa eu ver aqui e já te digo', 'até as 18h te mando', 'logo mais te passo',
  'assim que tiver te aviso', 'vou checar com a dra e retorno', 'te envio hj ainda', 'aguarde que ja verifico',
  'Desculpe a demora! Vou verificar a agenda e te retorno em 5 minutos.',
]
const NAO_PROMESSA = ['Segue o endereço: Rua X, 10', 'Obrigada pela preferência!', 'Bom dia! Como posso ajudar?', 'A limpeza custa R$ 180']
const PERGUNTA = [
  'Quanto custa?', 'quanto custa', 'Quanto custa\n?', 'Aceita cartão\n?', 'O valor é 180 mesmo\n?', 'vcs abrem sabado', 'qnto fica o pacote',
  'Posso ir de maquiagem', 'consigo parcelar em 3x', 'e pra levar alguma coisa', 'tem estacionamento', 'onde fica', 'Qual o endereço',
  'QUAL O ENDEREÇO', 'que horas abre', 'como funciona', 'da pra ir amanha 10h', 'vcs conseguem me encaixar hoje', 'Oi! Tudo bem? Qual o valor?',
]
const NAO_PERGUNTA = ['Oi, tudo bem?', 'oi??', '?', 'Bom dia', 'Ok, obrigada!', 'Posso sim', 'Consigo sim, obrigada', 'Pode ser amanhã', 'Oi\n?']

test.describe('variações de escrita', () => {
  for (const t of PRECO) test(`preço: ${JSON.stringify(t)}`, () => expect(cliente(t).intent).toBe('preco'))
  for (const t of ALTA) test(`intenção alta: ${JSON.stringify(t)}`, () => expect(['compra', 'agendamento', 'negociacao']).toContain(cliente(t).intent))
  for (const t of SEM_INTENCAO_ALTA) test(`não é intenção alta: ${JSON.stringify(t)}`, () => expect(['compra', 'agendamento', 'negociacao']).not.toContain(cliente(t).intent))
  for (const t of IRRITADO) test(`irritado: ${JSON.stringify(t)}`, () => expect(cliente(t).sentiment).toBe('frustrated'))
  for (const t of NAO_IRRITADO) test(`não irritado: ${JSON.stringify(t)}`, () => expect(cliente(t).sentiment).not.toBe('frustrated'))
  for (const t of PROMESSA) test(`promessa: ${JSON.stringify(t)}`, () => expect(extractPromise(t, new Date(2026, 9, 20, 10))).not.toBeNull())
  for (const t of NAO_PROMESSA) test(`não é promessa: ${JSON.stringify(t)}`, () => expect(extractPromise(t, new Date(2026, 9, 20, 10))).toBeNull())
  for (const t of PERGUNTA) test(`pergunta: ${JSON.stringify(t)}`, () => expect(isQuestion(t)).toBe(true))
  for (const t of NAO_PERGUNTA) test(`não é pergunta: ${JSON.stringify(t)}`, () => expect(isQuestion(t)).toBe(false))

  test('prazo da promessa: "em 5 minutos", "até as 18h", "amanhã"', () => {
    const now = new Date(2026, 9, 20, 10, 0)
    expect(extractPromise('te retorno em 5 minutos', now)!.dueAt).toEqual(new Date(2026, 9, 20, 10, 5))
    expect(extractPromise('até as 18h te mando', now)!.dueAt).toEqual(new Date(2026, 9, 20, 18, 0))
    expect(extractPromise('te mando amanha', now)!.dueAt.getDate()).toBe(21)
  })

  test('vários atendentes no mesmo número: assinatura no começo ou no fim', () => {
    expect(extractSignature('*Carlos*: Pronto, conferi a agenda!')).toBe('Carlos')
    expect(extractSignature('Ana: bom dia, tudo bem?')).toBe('Ana')
    expect(extractSignature('Temos horário às 9h. Att, Juliana')).toBe('Juliana')
    expect(extractSignature('Pode vir amanhã — Marcos')).toBe('Marcos')
    expect(extractSignature('Pix: 123.456.789-00')).toBeNull()
    expect(extractSignature('Obs: chegar 10 min antes')).toBeNull()
    expect(extractSignature('Pode vir amanhã')).toBeNull()
  })
})
