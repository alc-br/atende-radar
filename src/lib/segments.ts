// Páginas de anúncio por segmento (/para/<slug>, docs/operacao/medicao.md): fora do Google (noindex), sem menu de saída,
// com o botão de cadastro levando a campanha do anúncio. As conversas são exemplos inventados.

export interface Segment {
  slug: string
  nome: string
  titulo: string
  destaque: string
  texto: string
  dores: { t: string; p: string }[]
  conversa: { cliente: string; equipe: string; pendente: string }
  alerta: string
}

export const SEGMENTS: Segment[] = [
  {
    slug: 'clinicas',
    nome: 'Clínicas',
    titulo: 'Quantos pacientes pedem horário no WhatsApp',
    destaque: 'e nunca chegam a agendar?',
    texto:
      'O AtendeRadar acompanha as conversas da recepção e mostra quem perguntou valor ou horário e ficou sem retorno, antes que o paciente marque em outro lugar.',
    dores: [
      { t: 'Pedido de horário sem resposta', p: 'O paciente pergunta a agenda, a recepção fica de ver e a conversa para ali.' },
      { t: 'Orçamento de tratamento esquecido', p: 'O valor foi enviado e ninguém voltou a falar com o paciente.' },
      { t: 'Retorno prometido que não acontece', p: '"Te aviso quando abrir vaga" vira silêncio.' },
    ],
    conversa: {
      cliente: 'Oi! Quanto fica a avaliação e tem horário na quinta à tarde?',
      equipe: 'Oi! Vou confirmar com a agenda e já te falo.',
      pendente: 'Sem retorno há 2 dias',
    },
    alerta: 'Paciente pediu horário e ficou sem retorno.',
  },
  {
    slug: 'servicos',
    nome: 'Serviços',
    titulo: 'Quantos orçamentos pedidos no WhatsApp',
    destaque: 'ficam sem resposta?',
    texto:
      'O AtendeRadar acompanha as conversas da equipe e aponta o cliente que pediu orçamento, a proposta que ninguém retomou e a promessa de retorno que ficou para depois.',
    dores: [
      { t: 'Pedido de orçamento parado', p: 'O cliente explica o que precisa e a resposta não chega.' },
      { t: 'Proposta enviada e esquecida', p: 'O orçamento foi mandado e ninguém perguntou se ficou alguma dúvida.' },
      { t: 'Prazo combinado e não cumprido', p: '"Amanhã te mando" que passa da semana.' },
    ],
    conversa: {
      cliente: 'Bom dia, consegue me passar um orçamento para a manutenção?',
      equipe: 'Bom dia! Vou montar e te envio ainda hoje.',
      pendente: 'Orçamento prometido há 3 dias',
    },
    alerta: 'Cliente pediu orçamento e ficou sem retorno.',
  },
  {
    slug: 'imobiliarias',
    nome: 'Imobiliárias',
    titulo: 'Quantos interessados pedem visita no WhatsApp',
    destaque: 'e somem sem ninguém perceber?',
    texto:
      'O AtendeRadar acompanha as conversas dos corretores e mostra quem pediu visita, quem recebeu proposta e quem ficou esperando um retorno que não veio.',
    dores: [
      { t: 'Pedido de visita sem agenda', p: 'O interessado quer conhecer o imóvel e a visita nunca é marcada.' },
      { t: 'Proposta sem acompanhamento', p: 'A contraproposta foi enviada e a conversa esfriou.' },
      { t: 'Lead que ninguém retomou', p: 'Perguntou condições, recebeu fotos e ficou por isso.' },
    ],
    conversa: {
      cliente: 'Olá, o apartamento do anúncio ainda está disponível? Dá para visitar no sábado?',
      equipe: 'Olá! Está sim, vou ver o horário com o proprietário.',
      pendente: 'Visita sem confirmação há 2 dias',
    },
    alerta: 'Interessado pediu visita e ficou sem retorno.',
  },
  {
    slug: 'escolas',
    nome: 'Escolas',
    titulo: 'Quantas famílias perguntam sobre matrícula no WhatsApp',
    destaque: 'e não recebem retorno?',
    texto:
      'O AtendeRadar acompanha as conversas da secretaria e mostra quem pediu valores, quem queria agendar uma visita e quem ficou esperando a resposta.',
    dores: [
      { t: 'Pedido de valores sem resposta', p: 'A família pergunta mensalidade e material e a conversa para.' },
      { t: 'Visita à escola não agendada', p: 'O interesse em conhecer a escola não vira visita marcada.' },
      { t: 'Retorno prometido na matrícula', p: '"Vou ver se ainda tem vaga" sem resposta depois.' },
    ],
    conversa: {
      cliente: 'Boa tarde! Vocês ainda têm vaga no 3º ano para o ano que vem? Qual o valor?',
      equipe: 'Boa tarde! Vou confirmar com a coordenação e te retorno.',
      pendente: 'Sem retorno há 4 dias',
    },
    alerta: 'Família perguntou sobre matrícula e ficou sem retorno.',
  },
  {
    slug: 'agencias',
    nome: 'Agências',
    titulo: 'Quantos contatos pedem proposta no WhatsApp',
    destaque: 'e esfriam antes do fechamento?',
    texto:
      'O AtendeRadar acompanha as conversas do comercial e mostra o contato que pediu proposta, a reunião que não foi marcada e o retorno que ficou para depois.',
    dores: [
      { t: 'Proposta pedida e não enviada', p: 'O contato explica o projeto e a proposta não sai.' },
      { t: 'Reunião que não foi marcada', p: 'Combinaram de conversar e ninguém mandou o horário.' },
      { t: 'Contato que esfriou', p: 'Recebeu a proposta e ninguém perguntou o que achou.' },
    ],
    conversa: {
      cliente: 'Oi, queria uma proposta de gestão de redes para a minha loja. Como funciona?',
      equipe: 'Oi! Vou preparar e te mando até amanhã.',
      pendente: 'Proposta prometida há 3 dias',
    },
    alerta: 'Contato pediu proposta e ficou sem retorno.',
  },
]

export const segmentBySlug = (slug: string) => SEGMENTS.find((s) => s.slug === slug) ?? null

/** Parâmetros de campanha que o botão de cadastro repassa ao app. */
const CAMPAIGN_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid', '_gl']

/** Query do botão de cadastro: modo=cadastro e a campanha da visita (só os parâmetros conhecidos, até 300 caracteres cada). */
export function signupQuery(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams({ modo: 'cadastro' })
  for (const k of CAMPAIGN_PARAMS) {
    const v = params[k]
    const s = Array.isArray(v) ? v[0] : v
    if (s) q.set(k, s.slice(0, 300))
  }
  return q.toString()
}
