// Central de ajuda do painel (manual do usuário). Mesmo formato de blocos dos artigos do site (src/content/artigos.ts):
// **negrito** vira <strong>. Regra: escrever a partir do que o sistema FAZ (código em src/lib/analysis, src/lib/quotas.ts,
// src/lib/privacy.ts...). Mudou a regra no código? Atualize o artigo. Linguagem simples, sem termo técnico.
import type { Bloco } from './artigos'

export type CategoriaAjuda = 'comecar' | 'entender' | 'alertas' | 'conta'

export const CATEGORIAS_AJUDA: { id: CategoriaAjuda; nome: string }[] = [
  { id: 'comecar', nome: 'Primeiros passos' },
  { id: 'entender', nome: 'Entendendo os números' },
  { id: 'alertas', nome: 'Alertas' },
  { id: 'conta', nome: 'Conta, planos e privacidade' },
]

/** Blocos que a central de ajuda mostra (os do blog sem a chamada de venda e os blocos de layout do site). */
export type BlocoAjuda = Extract<Bloco, { t: 'p' | 'h2' | 'check' | 'passos' | 'exemplo' }>

export interface ArtigoAjuda {
  slug: string
  titulo: string
  resumo: string
  categoria: CategoriaAjuda
  /** Palavras que a pessoa pode digitar na busca e que não aparecem no título (sinônimos). */
  palavras: string[]
  corpo: BlocoAjuda[]
}

export const ARTIGOS_AJUDA: ArtigoAjuda[] = [
  {
    slug: 'tour-pelo-sistema',
    titulo: 'Tour pelo sistema: o manual passo a passo',
    resumo: 'Um passeio guiado pelas telas que o seu papel usa, com leitura em voz alta e progresso salvo.',
    categoria: 'comecar',
    palavras: ['manual', 'tutorial', 'treinamento', 'guia', 'passo a passo', 'aprender', 'ouvir', 'voz alta', 'leitura'],
    corpo: [
      { t: 'p', x: 'O **Tour pelo sistema** fica no rodapé do menu lateral, logo acima de **Precisa de ajuda?**, e também no menu com o seu nome. Ele abre uma lista de capítulos com **só o que o seu papel usa**: o atendente vê menos capítulos que o administrador.' },
      { t: 'h2', x: 'Como funciona' },
      {
        t: 'check',
        itens: [
          'Cada passo destaca um item da tela e explica para que ele serve. O próprio manual abre a tela certa.',
          'Em alguns passos você **clica** no item destacado; em outros faz um **cadastro de verdade** (como criar uma equipe). O manual segue sozinho quando percebe que deu certo.',
          'Sempre dá para **Voltar** ou **Pular este passo**. Passos que dependem de algo fora do sistema, como ler o QR Code no celular, só explicam o que fazer.',
          'As setas ← e → do teclado voltam e avançam; **Esc** fecha o manual.',
        ],
      },
      { t: 'h2', x: 'Progresso salvo' },
      { t: 'p', x: 'O progresso de cada capítulo fica guardado na sua conta. Na lista você vê o que já concluiu e pode **Continuar de onde parei** ou **Recomeçar** qualquer capítulo, inclusive em outro computador.' },
      { t: 'h2', x: 'Leitura em voz alta' },
      { t: 'p', x: 'O botão **Ouvir** explica o passo em voz alta, em português e sem custo: a narração vai além do texto da tela e conta para que serve cada item. A voz natural é gerada uma única vez por um serviço de voz da Microsoft (só o texto do manual, nunca dados seus ou dos seus clientes) e fica guardada no AtendeRadar; se ela não estiver disponível, o sistema usa a voz do seu navegador. O botão **Ler automaticamente**, no rodapé do passo, lê cada passo e avança sozinho até o fim do capítulo. Nos passos de clique, um cursor na tela aponta o item e espera o seu clique; nos passos de cadastro (criar, salvar, convidar, conectar, pagar), ele mostra onde preencher e salvar e espera você terminar: o manual nunca cadastra nada sozinho, e o botão **Próximo** pula o cadastro. Seu clique continua valendo a qualquer momento; toque de novo no botão para pausar. Dá para pausar, parar e escolher a velocidade (de 0,8× a 2×), que fica guardada. Sem nenhuma das duas vozes, os botões não aparecem.' },
    ],
  },
  {
    slug: 'conectar-whatsapp',
    titulo: 'Como conectar o seu WhatsApp',
    resumo: 'Leia o QR Code com o celular da empresa e o AtendeRadar começa a acompanhar as conversas.',
    categoria: 'comecar',
    palavras: ['qr code', 'conexão', 'número', 'celular', 'aparelhos conectados', 'desconectado', 'reconectar'],
    corpo: [
      { t: 'p', x: 'Você continua usando o mesmo número e o mesmo aplicativo do WhatsApp. O AtendeRadar entra como um **aparelho conectado**, do mesmo jeito que o WhatsApp Web, e só lê as conversas para analisar. Ele **não envia mensagens** pelo seu número.' },
      { t: 'h2', x: 'Passo a passo' },
      {
        t: 'passos',
        itens: [
          ['1.', 'No menu, abra **Conexões** e clique em **Nova conexão**. Dê um nome (por exemplo, "Recepção") e informe o número.'],
          ['2.', 'Na conexão criada, clique em **Gerar QR**.'],
          ['3.', 'No celular da empresa, abra o WhatsApp e toque em Configurações → Aparelhos conectados.'],
          ['4.', 'Toque em Conectar um aparelho e aponte a câmera para o QR Code da tela.'],
          ['5.', 'Pronto: a conexão aparece como conectada e as próximas mensagens já entram na análise.'],
        ],
      },
      { t: 'h2', x: 'Se a conexão cair' },
      { t: 'p', x: 'O celular precisa ficar ligado e com internet de vez em quando. Se o WhatsApp desconectar o aparelho (por exemplo, depois de muito tempo com o celular desligado), o alerta **Conexão desconectada** avisa. Para voltar, use **Reconectar** e depois **Gerar QR** na tela Conexões, e leia o QR Code de novo.' },
      { t: 'p', x: 'Quer parar de acompanhar um número por um tempo? Use **Pausar** na própria conexão e depois **Retomar**.' },
      { t: 'p', x: 'Cada plano permite um número de conexões. Se aparecer o aviso de limite, veja o artigo sobre planos.' },
    ],
  },
  {
    slug: 'nota-da-conversa',
    titulo: 'Como ler a nota da conversa',
    resumo: 'A nota vai de 0 a 100 e mostra a qualidade do atendimento em cinco pontos, sempre comparando com o seu prazo de resposta.',
    categoria: 'entender',
    palavras: ['score', 'pontuação', 'nota', 'qualidade', 'velocidade', 'sla', 'prazo de resposta'],
    corpo: [
      { t: 'p', x: 'Cada conversa recebe uma nota de **0 a 100**. Ela não é um palpite de inteligência artificial: são regras simples e iguais para todas as conversas. A nota só passa a contar nas médias quando a conversa tem **pelo menos 2 mensagens**.' },
      { t: 'h2', x: 'O que pesa na nota' },
      {
        t: 'check',
        itens: [
          '**Velocidade (30%)**: quanto tempo o cliente esperou pela primeira resposta.',
          '**Oportunidades (20%)**: se havia chance de venda, se ela foi atendida a tempo.',
          '**Pendências (20%)**: se o cliente está esperando agora e se há promessas sem retorno. Cada promessa em aberto tira pontos.',
          '**Qualidade (20%)**: o tom do cliente. Cliente satisfeito puxa a nota para cima; cliente irritado puxa para baixo.',
          '**Recuperação (10%)**: se uma venda que estava se perdendo foi recuperada.',
        ],
      },
      { t: 'h2', x: 'A nota acompanha o seu prazo' },
      { t: 'p', x: 'Os tempos são medidos em relação ao prazo de resposta que a sua empresa definiu em **Configurações › Atendimento** (padrão: 10 minutos para a primeira resposta e 30 minutos durante a conversa). Responder em até **metade do prazo** dá a nota máxima em velocidade. Demorar **12 vezes o prazo** zera esse ponto.' },
      { t: 'exemplo', x: 'Exemplo ilustrativo: com prazo de 10 minutos, responder em 4 minutos é nota cheia em velocidade; responder depois de 2 horas zera a velocidade.' },
      { t: 'p', x: 'Em **Configurações › Horários** você escolhe o que acontece fora do expediente: ignorar esse tempo, contar como atraso ou só alertar sem baixar a nota.' },
    ],
  },
  {
    slug: 'como-funcionam-os-alertas',
    titulo: 'Como funcionam os alertas',
    resumo: 'Quando um alerta aparece, quando ele some sozinho e o que fazer com cada um.',
    categoria: 'alertas',
    palavras: ['alerta', 'aviso', 'notificação', 'ignorar', 'falso positivo', 'resolver', 'regras'],
    corpo: [
      { t: 'p', x: 'O AtendeRadar confere as conversas **a cada minuto** e também logo depois que chegam mensagens novas. Quando uma regra é atingida (por exemplo, cliente esperando além do prazo), nasce um alerta. As regras ficam em **Configurações › Regras**.' },
      { t: 'h2', x: 'O alerta some sozinho quando o problema acaba' },
      { t: 'p', x: 'Se a situação deixa de existir (o atendente respondeu, a promessa foi cumprida, a conexão voltou), o alerta é **resolvido automaticamente**. Você não precisa fechar um por um.' },
      { t: 'h2', x: 'O que você pode fazer com um alerta' },
      {
        t: 'check',
        itens: [
          '**Resolver**: você tratou o problema.',
          '**Ignorar**: o alerta está certo, mas não precisa de ação. Ele não volta a abrir durante o intervalo de espera da regra.',
          '**Falso positivo**: o sistema entendeu errado a conversa. Isso também evita que o mesmo alerta volte logo em seguida e fica registrado para revisar a regra.',
        ],
      },
      { t: 'h2', x: 'Fora do horário comercial' },
      { t: 'p', x: 'Em **Configurações › Horários** você define o expediente, feriados e o que fazer fora dele: **ignorar** (alertas e nota só contam o expediente), **contar como atraso** (tempo corrido, 24 horas) ou **alertar** em tempo corrido sem baixar a nota.' },
      { t: 'h2', x: 'Regras próprias' },
      { t: 'p', x: 'Toda empresa começa com 8 regras prontas (veja o artigo "Cada alerta, um por um"). Você pode ajustar prazos e gravidade delas e criar regras suas. As 8 regras padrão **não contam** no limite do plano; só as que você cria.' },
    ],
  },
  {
    slug: 'cada-alerta',
    titulo: 'Cada alerta, um por um',
    resumo: 'O que dispara cada uma das 8 regras padrão e o que fazer quando ela aparecer.',
    categoria: 'alertas',
    palavras: ['sem resposta', 'primeira resposta', 'preço', 'orçamento', 'intenção', 'promessa', 'irritado', 'frustrado', 'conexão desconectada', 'regra'],
    corpo: [
      { t: 'p', x: 'Os prazos abaixo são os que vêm de fábrica. Você pode mudar cada um em **Configurações › Regras**.' },
      { t: 'h2', x: 'Cliente sem primeira resposta' },
      { t: 'p', x: 'O cliente mandou mensagem e **ninguém respondeu ainda**, passados **10 minutos**. Gravidade crítica. Responda o quanto antes: é o momento em que mais se perde cliente.' },
      { t: 'h2', x: 'Cliente sem resposta após interação' },
      { t: 'p', x: 'A conversa já tinha começado, o cliente voltou a escrever e está esperando há mais de **30 minutos**. Gravidade alta.' },
      { t: 'h2', x: 'Pedido de preço sem retorno' },
      { t: 'p', x: 'O cliente perguntou **preço, valor ou orçamento** e está sem resposta há mais de **15 minutos**. Gravidade alta.' },
      { t: 'h2', x: 'Intenção alta sem resposta' },
      { t: 'p', x: 'O cliente mostrou que quer **comprar, agendar ou negociar** e está sem resposta há mais de **5 minutos**. Gravidade crítica: é a venda mais perto de fechar.' },
      { t: 'h2', x: 'Promessa próxima do vencimento' },
      { t: 'p', x: 'Um atendente prometeu um retorno ("vou verificar e te retorno", "te mando até as 15h") e o prazo vence nas próximas **2 horas**. Gravidade média.' },
      { t: 'p', x: 'Como o prazo é lido: "em 30 minutos", "em 2 horas", "até as 15h", "amanhã" e "hoje" são entendidos. Sem prazo dito, o sistema considera **24 horas**. A promessa é dada como cumprida quando a empresa manda uma nova mensagem depois dela.' },
      { t: 'h2', x: 'Promessa vencida' },
      { t: 'p', x: 'O prazo prometido passou e a empresa não voltou a falar com o cliente. Gravidade crítica.' },
      { t: 'h2', x: 'Cliente irritado' },
      { t: 'p', x: 'As últimas mensagens do cliente mostram **irritação ou frustração** (reclamação, cobrança de resposta, palavras fortes). Gravidade alta. Vale um retorno com mais atenção ou a ajuda de um supervisor.' },
      { t: 'h2', x: 'Conexão desconectada' },
      { t: 'p', x: 'Um número de WhatsApp saiu do ar ou pede um novo QR Code depois de já ter sido conectado. Gravidade crítica: **enquanto estiver desconectado, as mensagens desse número não chegam ao AtendeRadar**. Reconecte em **Conexões**.' },
      { t: 'h2', x: 'E a Recuperação?' },
      { t: 'p', x: 'Quando um alerta de demora acontece numa conversa com chance de venda, ela entra também na tela **Recuperação**, para alguém retomar o contato. Se o cliente com chance de venda some por mais tempo que o **tempo de abandono** (padrão: 4 horas, em Configurações › Atendimento), a conversa é marcada como perdida por abandono e também entra na Recuperação.' },
    ],
  },
  {
    slug: 'valor-em-risco',
    titulo: 'Como é calculado o valor em risco',
    resumo: 'Uma estimativa, em reais, do que está parado em conversas com chance de venda em que o cliente espera resposta.',
    categoria: 'entender',
    palavras: ['dinheiro', 'receita', 'oportunidade', 'ticket médio', 'conversão', 'estimativa', 'reais', 'potencial'],
    corpo: [
      { t: 'p', x: 'O **valor em risco** soma o valor estimado das oportunidades de venda que estão abertas em conversas onde o **cliente está esperando a resposta da empresa**. Respondeu, o valor sai da conta.' },
      { t: 'h2', x: 'Quando uma conversa vira oportunidade' },
      { t: 'p', x: 'Só quando o cliente mostra interesse de compra. Pela conversa, o sistema identifica a intenção. Cada intenção tem um peso, porque umas estão mais perto de virar venda que outras:' },
      {
        t: 'check',
        itens: [
          'Quer **comprar**: peso 3,3',
          'Está **negociando**: peso 2,8',
          'Quer **agendar**: peso 2,5',
          'Pergunta sobre **disponibilidade**: peso 1,9',
          'Pergunta **preço**: peso 1,6',
          'Faz uma **consulta** geral: peso 0,8',
        ],
      },
      { t: 'p', x: 'Suporte, reclamação, cancelamento e outros assuntos **não** contam como oportunidade.' },
      { t: 'h2', x: 'A conta' },
      { t: 'passos', itens: [['1.', 'Chance de fechar = sua taxa de conversão × peso da intenção (nunca passa de 95%).'], ['2.', 'Valor estimado = seu ticket médio × chance de fechar.'], ['3.', 'A tela mostra também uma faixa de 30% para menos e para mais, porque é uma estimativa.']] },
      { t: 'exemplo', x: 'Exemplo ilustrativo: ticket médio de R$ 1.500 e conversão de 18%. Um cliente que quer agendar tem chance de 18% × 2,5 = 45%. Valor estimado: R$ 1.500 × 45% = R$ 675 (faixa de R$ 473 a R$ 878).' },
      { t: 'h2', x: 'Deixe a conta com a cara da sua empresa' },
      { t: 'p', x: 'Enquanto você não preenche, o sistema usa **ticket médio de R$ 1.500** e **conversão de 18%**. Ajuste em **Configurações › Financeiro**. No detalhe de cada conversa, **Como calculamos** mostra cada passo da conta com os seus números.' },
    ],
  },
  {
    slug: 'planos-e-cobranca',
    titulo: 'Planos, teste grátis e cobrança',
    resumo: 'O que o teste grátis inclui, o que cada plano limita e como cancelar.',
    categoria: 'conta',
    palavras: ['assinatura', 'pagamento', 'cartão', 'boleto', 'pix', 'cancelar', 'limite', 'trial', 'fatura', 'preço do plano'],
    corpo: [
      { t: 'p', x: 'Toda conta nova começa com **14 dias de teste grátis**. Você recebe um aviso **3 dias** e **1 dia** antes de o teste acabar. Os planos e preços atuais ficam na tela **Planos** (só o administrador da conta vê).' },
      { t: 'h2', x: 'O que cada plano limita' },
      {
        t: 'check',
        itens: [
          '**Conexões de WhatsApp**, **atendentes ativos** e **regras de alerta próprias**: são limites fixos. Ao chegar no limite, o sistema não deixa cadastrar mais e explica o motivo. As 8 regras padrão não contam.',
          '**Exportações** de relatórios: contadas por mês. A contagem recomeça todo dia 1º.',
          '**Conversas e mensagens**: limite flexível. As conversas continuam sendo analisadas mesmo se passar.',
        ],
      },
      { t: 'h2', x: 'Trocar de plano' },
      { t: 'p', x: 'Para ir a um plano menor, o uso atual precisa caber nele. Se você tem mais conexões ou atendentes do que o novo plano permite, o sistema avisa o que precisa ser removido antes.' },
      { t: 'h2', x: 'Cancelar' },
      { t: 'p', x: 'Ao cancelar, o plano **continua valendo até o fim do período já pago**. Depois disso, novos cadastros (conexões, atendentes, regras) ficam bloqueados até você contratar um plano de novo.' },
      { t: 'p', x: 'Mudou de ideia? Até o fim do período pago, **Planos → Reativar renovação** volta a cobrança automática no mesmo cartão e pelo mesmo valor. Nada é cobrado na hora: a próxima cobrança fica para o fim do período.' },
    ],
  },
  {
    slug: 'privacidade-lgpd',
    titulo: 'Privacidade e LGPD',
    resumo: 'Quanto tempo os dados ficam guardados e como atender um pedido de um cliente seu.',
    categoria: 'conta',
    palavras: ['lgpd', 'dados pessoais', 'apagar', 'excluir', 'exportar', 'retenção', 'cpf', 'cartão', 'encerrar conta'],
    corpo: [
      { t: 'p', x: 'Números de **CPF e de cartão** que os clientes mandam na conversa são escondidos (aparecem como •••) antes de serem guardados.' },
      { t: 'h2', x: 'Por quanto tempo os dados ficam' },
      { t: 'p', x: 'Em **Configurações › Privacidade** você define a retenção. Por padrão, o **texto das mensagens** é apagado depois de **365 dias**, e a conversa inteira (com os registros dela) depois de **730 dias**.' },
      { t: 'h2', x: 'Pedido de um cliente seu' },
      { t: 'p', x: 'No detalhe da conversa, o menu de privacidade tem três opções:' },
      {
        t: 'check',
        itens: [
          '**Exportar dados deste cliente**: baixa um arquivo com tudo o que existe sobre ele.',
          '**Parar de monitorar este contato**: a conversa some das telas e das análises, e as próximas mensagens dele deixam de ser guardadas. O que já existe não é apagado.',
          '**Apagar dados deste cliente**: remove de vez conversas, mensagens, alertas, promessas e itens de recuperação. Não dá para desfazer.',
        ],
      },
      { t: 'h2', x: 'Encerrar a conta da empresa' },
      { t: 'p', x: 'O dono da conta pode pedir a exclusão da empresa no fim de **Configurações › Privacidade**. A empresa fica **7 dias** aguardando, e dá para desistir nesse prazo em **Configurações › Privacidade**. Depois disso, tudo é apagado de forma definitiva.' },
    ],
  },
  {
    slug: 'glossario',
    titulo: 'Glossário: o que quer dizer cada termo',
    resumo: 'Os nomes que aparecem no painel, em poucas palavras.',
    categoria: 'entender',
    palavras: ['significado', 'termos', 'dicionário', 'o que é'],
    corpo: [
      {
        t: 'check',
        itens: [
          '**Alerta**: aviso de que algo precisa de atenção agora (cliente esperando, promessa vencida, número desconectado).',
          '**Regra**: a condição que faz um alerta nascer, com prazo e gravidade.',
          '**Gravidade**: o quanto o alerta é urgente (crítica, alta, média ou baixa).',
          '**Intenção**: o que o cliente quer na conversa (comprar, agendar, saber o preço, reclamar...).',
          '**Oportunidade**: conversa em que o cliente mostrou interesse de compra.',
          '**Valor em risco**: soma estimada das oportunidades em que o cliente está esperando resposta.',
          '**Promessa**: quando o atendente diz que vai dar um retorno ("vou verificar e te aviso").',
          '**Recuperação**: lista de conversas com chance de venda que esfriaram e merecem um novo contato.',
          '**Abandono**: cliente com chance de venda que parou de responder por mais tempo que o limite definido.',
          '**Nota da conversa**: de 0 a 100, mede velocidade, oportunidades, pendências, qualidade e recuperação.',
          '**Prazo de resposta (SLA)**: o tempo que a sua empresa considera aceitável para responder.',
          '**Conexão**: um número de WhatsApp ligado ao AtendeRadar pelo QR Code.',
          '**Falso positivo**: alerta que apareceu por engano, porque a conversa foi mal interpretada.',
        ],
      },
    ],
  },
]

/** Minúsculas e sem acentos: a busca acha "preco" e "preço". */
export const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

const textoDoBloco = (b: BlocoAjuda): string => {
  switch (b.t) {
    case 'check':
      return b.itens.join(' ')
    case 'passos':
      return b.itens.map(([a, x]) => `${a} ${x}`).join(' ')
    default:
      return b.x
  }
}

/**
 * Busca simples no próprio navegador: todas as palavras digitadas precisam aparecer no artigo. Título e sinônimos
 * pesam mais que o corpo. Sem nada digitado, volta a lista na ordem original.
 */
export function buscarAjuda(consulta: string, artigos: ArtigoAjuda[] = ARTIGOS_AJUDA): ArtigoAjuda[] {
  const termos = semAcento(consulta).replace(/\*/g, '').split(/\s+/).filter(Boolean)
  if (termos.length === 0) return artigos
  const pontuados = artigos.map((a) => {
    const topo = semAcento(`${a.titulo} ${a.resumo} ${a.palavras.join(' ')}`)
    const corpo = semAcento(a.corpo.map(textoDoBloco).join(' ').replace(/\*\*/g, ''))
    let pontos = 0
    for (const t of termos) {
      if (topo.includes(t)) pontos += 3
      else if (corpo.includes(t)) pontos += 1
      else return { a, pontos: 0 }
    }
    return { a, pontos }
  })
  return pontuados.filter((p) => p.pontos > 0).sort((x, y) => y.pontos - x.pontos).map((p) => p.a)
}
