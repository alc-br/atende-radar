// Artigos do blog (página /conteudos). Texto em blocos simples; **negrito** vira <strong>.
// Regra: nada de estatística inventada. Números só como exemplo ilustrativo, e marcados como tal.

export type Bloco =
  | { t: 'p'; x: string }
  | { t: 'h2'; x: string }
  | { t: 'check'; itens: string[] }
  | { t: 'passos'; itens: [string, string][] }
  | { t: 'exemplo'; x: string }
  | { t: 'comCitacao'; h2: string; p: string; itens: string[]; citacao: string }
  | { t: 'pilares'; itens: { ic: string; b: string; s: string }[] }
  | { t: 'cta' }

export type Filtro = 'vendas' | 'atendimento' | 'whatsapp' | 'clinicas' | 'operacao' | 'recuperacao'

export const FILTROS: { id: Filtro; nome: string }[] = [
  { id: 'vendas', nome: 'Vendas' },
  { id: 'atendimento', nome: 'Atendimento' },
  { id: 'whatsapp', nome: 'WhatsApp' },
  { id: 'clinicas', nome: 'Clínicas' },
  { id: 'operacao', nome: 'Operação' },
  { id: 'recuperacao', nome: 'Recuperação' },
]

export interface Artigo {
  slug: string
  titulo: string
  resumo: string
  linhaFina: string
  tag: string
  filtros: Filtro[]
  /** Índice em CAPAS (assets.ts) */
  capa: number
  data: string
  destaque?: boolean
  /** Ilustração grande no topo (só o artigo modelo tem) */
  ilustracao?: boolean
  corpo: Bloco[]
}

export const ARTIGOS: Artigo[] = [
  {
    slug: 'vendas-perdidas-whatsapp',
    titulo: 'Quantas vendas sua empresa perde depois que o cliente chama no WhatsApp?',
    resumo:
      'Entenda os principais motivos que fazem oportunidades se perderem no WhatsApp e veja como evitá-los com processo, acompanhamento e visibilidade.',
    linhaFina:
      'Entenda por que oportunidades se perdem no atendimento, como identificar falhas recorrentes e o que fazer para recuperar resultado sem precisar ler conversa por conversa.',
    tag: 'Vendas',
    filtros: ['vendas', 'whatsapp', 'atendimento', 'recuperacao', 'clinicas'],
    capa: 0,
    data: '2026-10-12',
    destaque: true,
    ilustracao: true,
    corpo: [
      { t: 'p', x: 'Você investe em anúncios, atrai novos clientes, eles chamam no WhatsApp interessados… mas, de alguma forma, a conversa esfria e a venda não acontece. Parece familiar?' },
      { t: 'p', x: 'Na prática, muitas empresas perdem uma parte importante das oportunidades comerciais depois que o cliente chama no WhatsApp, não por falta de demanda, mas por falhas no atendimento, falta de acompanhamento e ausência de visibilidade sobre o que está acontecendo.' },
      {
        t: 'comCitacao',
        h2: 'Por que tantas vendas se perdem no WhatsApp?',
        p: 'O WhatsApp se tornou o principal canal de venda de muitas empresas, mas também é um dos maiores pontos de perda de oportunidades. Alguns dos motivos mais comuns são:',
        itens: [
          'Respostas demoradas',
          'Promessas de retorno que não acontecem',
          'Falta de organização para acompanhar os próximos passos',
          'Atendentes que não têm visibilidade do histórico completo',
          'Falta de métricas para identificar onde estão os gargalos',
        ],
        citacao: 'Muitas empresas não perdem vendas por falta de clientes, mas por falta de acompanhamento do que já têm.',
      },
      { t: 'p', x: 'O exemplo da ilustração é comum: o cliente pergunta preço e prazo, o atendente promete verificar e retornar, e a conversa fica parada. Ninguém faz nada de errado de propósito. O retorno simplesmente se perde entre dezenas de outras conversas abertas no mesmo dia.' },
      { t: 'h2', x: 'Quanto isso custa na prática?' },
      { t: 'p', x: 'Faça a conta com os números da sua operação. Um exemplo ilustrativo:' },
      { t: 'exemplo', x: 'Uma empresa recebe **300 conversas comerciais por mês**. Se **20%** ficam sem retorno, são **60 oportunidades paradas**. Com um ticket médio de **R$ 800** e uma taxa de conversão de **25%**, isso representa cerca de **R$ 12.000 por mês** que poderiam ter virado venda.' },
      { t: 'p', x: 'O número exato muda de empresa para empresa, mas o ponto é o mesmo: esse dinheiro não aparece em nenhum relatório. Ele só aparece quando alguém olha as conversas com atenção.' },
      { t: 'h2', x: 'Sinais de que sua empresa está perdendo vendas no WhatsApp' },
      {
        t: 'check',
        itens: [
          'Clientes voltam perguntando “e aí, conseguiu ver?”',
          'Orçamentos são enviados e ninguém sabe o que aconteceu depois',
          'Cada atendente responde de um jeito e não há padrão',
          'Você só descobre um problema quando o cliente reclama',
          'A equipe parece ocupada, mas as vendas não acompanham o volume de conversas',
        ],
      },
      { t: 'cta' },
      { t: 'h2', x: 'O que o gestor precisa enxergar' },
      { t: 'p', x: 'Para evitar a perda de vendas, não basta cobrar mais da equipe. É preciso ter visibilidade, dados e processos. Com o AtendeRadar, você consegue:' },
      {
        t: 'pilares',
        itens: [
          { ic: 'olho', b: 'Visibilidade', s: 'Tenha uma visão clara do que está acontecendo nas conversas, sem precisar ler tudo manualmente.' },
          { ic: 'barras', b: 'Inteligência', s: 'Identifique oportunidades em risco, promessas sem retorno e padrões de perda de vendas.' },
          { ic: 'raio', b: 'Ação', s: 'Tome decisões rápidas, treine sua equipe e ajuste processos com base em dados reais.' },
        ],
      },
      { t: 'h2', x: '5 passos para parar de perder vendas no WhatsApp' },
      {
        t: 'passos',
        itens: [
          ['Defina um tempo máximo de resposta.', 'Combine com a equipe uma meta clara para a primeira resposta em horário comercial e acompanhe se ela está sendo cumprida.'],
          ['Trate toda promessa como um compromisso com prazo.', '“Vou verificar e te retorno” precisa virar uma tarefa com hora marcada, não uma intenção.'],
          ['Faça follow-up em até 24 horas.', 'Conversas com intenção de compra que ficaram paradas merecem um novo contato, mesmo que seja só para entender o momento do cliente.'],
          ['Revise as conversas sem desfecho toda semana.', 'Separe as oportunidades que não viraram venda nem perda e decida o próximo passo de cada uma.'],
          ['Meça por atendente, não só no total.', 'A média geral esconde quem precisa de apoio. Indicadores por pessoa mostram onde treinar e onde reconhecer.'],
        ],
      },
      { t: 'h2', x: 'Antes de atrair mais clientes, veja quantas oportunidades você já não está aproveitando' },
      { t: 'p', x: 'Muitas empresas focam em gerar mais tráfego e leads, mas esquecem de olhar para dentro: quantas vendas já estão sendo perdidas no atendimento atual?' },
      { t: 'p', x: 'Recuperar essas oportunidades pode ser mais rápido, mais barato e mais eficiente do que apenas atrair novos clientes. Com visibilidade, acompanhamento e os insights certos, você transforma conversa em resultado.' },
    ],
  },
  {
    slug: 'tempo-de-resposta-whatsapp',
    titulo: 'Como melhorar o tempo de resposta no WhatsApp e vender mais',
    resumo: 'Respostas mais rápidas aumentam a confiança e as chances de conversão. Veja como organizar o atendimento para responder melhor e mais cedo.',
    linhaFina: 'O que medir, que meta definir e quais mudanças simples encurtam a espera do cliente sem sobrecarregar a equipe.',
    tag: 'Atendimento',
    filtros: ['atendimento', 'whatsapp'],
    capa: 1,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Quem chama uma empresa no WhatsApp quase sempre está comparando opções. Enquanto espera a sua resposta, o cliente pode estar conversando com um concorrente. Por isso o tempo de resposta pesa tanto na venda: ele é o primeiro sinal de como será o atendimento depois.' },
      { t: 'p', x: 'A boa notícia é que melhorar esse tempo raramente exige contratar mais gente. Na maioria das operações, a demora vem de organização: mensagens que ninguém assumiu, perguntas que dependem de outra área e falta de uma meta clara.' },
      { t: 'h2', x: 'Primeiro, meça do jeito certo' },
      { t: 'p', x: 'Antes de cobrar velocidade, entenda o ponto de partida. Três números ajudam a enxergar o problema:' },
      {
        t: 'check',
        itens: [
          '**Tempo até a primeira resposta**: quanto o cliente espera depois de mandar a primeira mensagem.',
          '**Tempo médio entre mensagens**: se a conversa anda ou fica parada no meio.',
          '**Conversas sem nenhuma resposta**: as que nunca foram atendidas, que são as mais caras.',
        ],
      },
      { t: 'p', x: 'Olhe esses números por atendente e por horário. Uma média boa no total pode esconder um turno inteiro em que ninguém responde.' },
      { t: 'h2', x: 'Defina uma meta que a equipe consiga cumprir' },
      { t: 'p', x: 'Uma meta de primeira resposta precisa ser clara e realista para o seu volume. O importante é que todos saibam qual é, que ela valha para o horário comercial e que exista uma regra para fora dele, por exemplo uma mensagem automática do próprio WhatsApp Business avisando quando haverá retorno.' },
      { t: 'exemplo', x: 'Exemplo ilustrativo: uma equipe combina responder a **primeira mensagem em até 15 minutos** no horário comercial. Toda conversa que passar disso aparece para o gestor no mesmo dia, e não só no fim do mês.' },
      { t: 'h2', x: 'Mudanças simples que encurtam a espera' },
      {
        t: 'passos',
        itens: [
          ['Tenha respostas prontas para as perguntas mais comuns.', 'Preço, horários, formas de pagamento e prazos podem estar salvos como respostas rápidas, revisadas de tempos em tempos.'],
          ['Deixe claro quem assume cada conversa.', 'Conversa sem dono é conversa esquecida. Defina como as mensagens novas são distribuídas.'],
          ['Responda mesmo quando ainda não tem a resposta completa.', 'Um “recebi, vou confirmar o valor e te respondo até as 16h” mantém o cliente e cria um compromisso com prazo.'],
          ['Cuide dos horários de pico.', 'Se a maior parte das mensagens chega em certos horários, a escala da equipe precisa acompanhar.'],
          ['Revise as conversas que demoraram.', 'Uma vez por semana, veja os casos mais lentos e descubra o motivo: falta de informação, dependência de outra área ou excesso de volume.'],
        ],
      },
      { t: 'cta' },
      { t: 'h2', x: 'Velocidade sem qualidade não resolve' },
      { t: 'p', x: 'Responder rápido e mal também perde a venda. A primeira resposta precisa avançar a conversa: responder o que foi perguntado, fazer a próxima pergunta certa e combinar o próximo passo.' },
      { t: 'p', x: 'O AtendeRadar acompanha o tempo de resposta das conversas do WhatsApp conectado, mostra as que ficaram sem retorno e separa os números por atendente. Assim o gestor vê onde a espera acontece e consegue agir no mesmo dia.' },
    ],
  },
  {
    slug: 'auditoria-comercial-whatsapp',
    titulo: 'Auditoria comercial no WhatsApp: o que é e como fazer na sua empresa',
    resumo: 'Aprenda a identificar falhas, acompanhar o desempenho da equipe e encontrar oportunidades de melhoria nas conversas de venda.',
    linhaFina: 'Um roteiro prático para revisar as conversas de venda, com o que observar em cada uma e como transformar o que você encontrar em ação.',
    tag: 'Operação',
    filtros: ['operacao'],
    capa: 2,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Auditoria comercial é revisar as conversas de venda com um olhar de gestão: não para vigiar a equipe, mas para entender onde as oportunidades avançam, onde travam e o que se repete.' },
      { t: 'p', x: 'Em empresas que vendem pelo WhatsApp, quase todo o processo comercial está escrito nas conversas. O problema é que ninguém consegue ler tudo. A auditoria organiza esse olhar.' },
      { t: 'h2', x: 'O que observar em cada conversa' },
      {
        t: 'check',
        itens: [
          '**Intenção do cliente**: ele quer comprar, agendar, tirar uma dúvida ou reclamar?',
          '**Perguntas sem resposta**: o cliente perguntou algo que ficou para trás?',
          '**Promessas feitas**: o atendente disse que ia retornar, enviar um orçamento ou confirmar algo?',
          '**Próximo passo**: a conversa terminou com algo combinado ou simplesmente parou?',
          '**Desfecho**: virou venda, foi perdida ou está parada sem decisão?',
        ],
      },
      { t: 'h2', x: 'Como fazer uma auditoria manual' },
      {
        t: 'passos',
        itens: [
          ['Escolha uma amostra.', 'Separe conversas de um período curto, de preferência de atendentes diferentes e em horários diferentes.'],
          ['Use sempre os mesmos critérios.', 'Uma ficha simples com os itens acima evita que cada revisão olhe uma coisa diferente.'],
          ['Anote o que se repete.', 'Um erro isolado é um caso; o mesmo erro em várias conversas é um processo a ser corrigido.'],
          ['Separe o que precisa de ação agora.', 'Oportunidades paradas com intenção de compra ainda podem ser recuperadas. Elas vão para a frente da fila.'],
          ['Leve o aprendizado para a equipe.', 'Mostre exemplos reais, combine o padrão esperado e acompanhe nas semanas seguintes.'],
        ],
      },
      { t: 'p', x: 'Feita à mão, a auditoria funciona, mas cobre poucas conversas e leva tempo. Por isso acaba acontecendo só de vez em quando, e o problema é descoberto tarde.' },
      { t: 'cta' },
      { t: 'h2', x: 'Auditoria contínua' },
      { t: 'p', x: 'O AtendeRadar faz essa leitura de forma contínua nas conversas do WhatsApp conectado: identifica a intenção, as perguntas sem resposta, as promessas de retorno e as oportunidades em risco, e organiza tudo em alertas e relatórios.' },
      {
        t: 'pilares',
        itens: [
          { ic: 'lupa', b: 'Cobertura', s: 'As conversas são analisadas conforme chegam, não só uma amostra.' },
          { ic: 'tendencia', b: 'Prioridade', s: 'O que tem chance de virar venda aparece primeiro.' },
          { ic: 'lampada', b: 'Orientação', s: 'Os padrões por atendente mostram onde treinar.' },
        ],
      },
      { t: 'p', x: 'A decisão continua com o gestor e o atendimento continua com a equipe. A auditoria só garante que nada importante passe sem ser visto.' },
    ],
  },
  {
    slug: 'recuperar-clientes-que-pararam-de-responder',
    titulo: 'Como recuperar os clientes que pararam de responder',
    resumo: 'Estratégias práticas para reativar conversas e transformar oportunidades esquecidas em novas vendas.',
    linhaFina: 'Por que o cliente some no meio da conversa, quando vale a pena chamar de novo e como fazer isso sem parecer insistente.',
    tag: 'Recuperação',
    filtros: ['recuperacao', 'vendas'],
    capa: 3,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Todo atendimento tem conversas que simplesmente param. O cliente pediu preço, recebeu a resposta e não falou mais nada. Muita gente trata isso como “não quis” e segue em frente. Mas parte dessas conversas ainda tem interesse e só precisa de um bom próximo contato.' },
      { t: 'h2', x: 'Por que o cliente para de responder' },
      {
        t: 'check',
        itens: [
          'Ficou de pensar e a conversa saiu da cabeça dele',
          'Estava comparando opções e ninguém voltou a falar com ele',
          'Teve uma dúvida que não foi respondida',
          'O preço assustou e faltou explicar o valor',
          'A empresa prometeu retornar e não retornou',
        ],
      },
      { t: 'p', x: 'Os dois últimos motivos são responsabilidade da empresa, e são os mais fáceis de corrigir.' },
      { t: 'h2', x: 'Quais conversas priorizar' },
      { t: 'p', x: 'Nem toda conversa parada merece o mesmo esforço. Comece pelas que tinham sinal claro de compra: pediu orçamento, perguntou disponibilidade, quis saber forma de pagamento ou agendou e não confirmou. E, principalmente, as conversas em que alguém da sua equipe prometeu retorno.' },
      { t: 'h2', x: 'Como retomar a conversa' },
      {
        t: 'passos',
        itens: [
          ['Retome o assunto, não só o contato.', 'Em vez de “oi, tudo bem?”, lembre o que o cliente pediu: “Você me perguntou sobre o horário de quinta; ainda temos vaga às 15h.”'],
          ['Traga algo novo.', 'Uma informação que faltou, uma alternativa de data, uma condição de pagamento. Dê um motivo para responder.'],
          ['Faça uma pergunta simples.', 'Perguntas fáceis de responder (“prefere manhã ou tarde?”) destravam mais do que mensagens longas.'],
          ['Respeite o cliente.', 'Uma ou duas tentativas bem feitas são suficientes. Insistência demais afasta e pode fazer o cliente bloquear o número.'],
          ['Registre o resultado.', 'Venda, perda ou novo prazo: anotar o desfecho é o que permite medir se a recuperação funciona.'],
        ],
      },
      { t: 'exemplo', x: 'Exemplo ilustrativo: “Oi, Ana! Você pediu o valor da avaliação na terça e eu fiquei de confirmar os horários. Tenho **quinta às 10h** ou **sexta às 16h**. Algum desses fica bom pra você?”' },
      { t: 'cta' },
      { t: 'h2', x: 'Encontrar as conversas é a parte difícil' },
      { t: 'p', x: 'Recuperar uma conversa leva poucos minutos. O difícil é saber quais conversas recuperar no meio de centenas. O AtendeRadar aponta as oportunidades em risco e as promessas de retorno não cumpridas no WhatsApp conectado, para a equipe saber por onde começar e o gestor acompanhar o resultado.' },
    ],
  },
  {
    slug: 'funil-de-vendas-whatsapp',
    titulo: 'Funil de vendas no WhatsApp: da conversa ao fechamento',
    resumo: 'Veja como estruturar um funil simples para as conversas do WhatsApp e acompanhar cada etapa até a venda.',
    linhaFina: 'Etapas, critérios de passagem e o que acompanhar em cada fase para saber onde a venda está travando.',
    tag: 'Vendas',
    filtros: ['vendas', 'whatsapp'],
    capa: 4,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Quando a venda acontece toda pelo WhatsApp, o funil existe mesmo que ninguém o tenha desenhado. Cada conversa passa por etapas, e é em alguma delas que a maioria das vendas trava. Deixar essas etapas claras é o primeiro passo para saber onde agir.' },
      { t: 'h2', x: 'Um funil simples para começar' },
      {
        t: 'passos',
        itens: [
          ['Primeiro contato.', 'O cliente chamou. Aqui o que importa é responder e entender o que ele procura.'],
          ['Qualificação.', 'Você descobre a necessidade, o prazo e se faz sentido para os dois lados seguir.'],
          ['Proposta.', 'Preço, orçamento, horário disponível ou condição comercial foram apresentados.'],
          ['Negociação e dúvidas.', 'O cliente pergunta, compara, pede ajuste. É a fase em que mais conversas param.'],
          ['Fechamento.', 'Venda feita, agendamento confirmado ou perda registrada com o motivo.'],
        ],
      },
      { t: 'p', x: 'Adapte os nomes ao seu negócio. Em uma clínica, “proposta” pode ser o horário e o valor da consulta; em uma imobiliária, a visita agendada.' },
      { t: 'h2', x: 'O que acompanhar em cada etapa' },
      {
        t: 'check',
        itens: [
          '**Quantas conversas entram** em cada etapa',
          '**Quantas avançam** para a próxima',
          '**Quanto tempo ficam paradas** antes de avançar ou se perder',
          '**Por que se perdem**: preço, prazo, falta de retorno, concorrência',
        ],
      },
      { t: 'p', x: 'A etapa em que mais conversas param é onde está a maior oportunidade. Muitas vezes não é o preço: é a proposta enviada sem nenhum acompanhamento depois.' },
      { t: 'cta' },
      { t: 'h2', x: 'O funil precisa de próximo passo' },
      { t: 'p', x: 'Toda conversa que sai de uma etapa deveria sair com algo combinado: uma data, uma resposta pendente, uma decisão. Conversa que termina sem próximo passo tende a esfriar.' },
      { t: 'p', x: 'O AtendeRadar identifica a intenção do cliente e as oportunidades nas conversas do WhatsApp conectado, aponta as que ficaram paradas e as promessas sem retorno. É uma forma de enxergar o funil a partir do que de fato aconteceu nas conversas, sem depender de cada atendente atualizar uma planilha.' },
    ],
  },
  {
    slug: 'desempenho-equipe-atendimento',
    titulo: 'Como medir o desempenho da sua equipe de atendimento',
    resumo: 'Indicadores e boas práticas para acompanhar o time, orientar quem precisa e reconhecer quem faz bem.',
    linhaFina: 'Quais indicadores olhar por atendente, como evitar comparações injustas e como transformar números em conversa de desenvolvimento.',
    tag: 'Equipe',
    filtros: ['operacao', 'atendimento'],
    capa: 5,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Medir a equipe de atendimento não é sobre ranking. É sobre saber onde cada pessoa precisa de apoio, que práticas funcionam e o que vale a pena repetir no time inteiro.' },
      { t: 'h2', x: 'Indicadores que fazem sentido' },
      {
        t: 'check',
        itens: [
          '**Tempo de primeira resposta**, por atendente e por horário',
          '**Conversas sem resposta** ou abandonadas no meio',
          '**Promessas cumpridas**: quando o atendente diz que vai retornar, ele retorna?',
          '**Perguntas respondidas**: o cliente teve resposta para o que perguntou?',
          '**Desfechos**: quantas conversas com intenção de compra terminaram em venda ou agendamento',
        ],
      },
      { t: 'h2', x: 'Cuidado com comparações injustas' },
      { t: 'p', x: 'Atendentes diferentes recebem demandas diferentes. Quem cuida de reclamações vai ter números diferentes de quem atende pedidos de orçamento. Compare pessoas com funções parecidas e olhe a evolução de cada um ao longo do tempo, não só a foto do mês.' },
      { t: 'h2', x: 'Como usar os números com a equipe' },
      {
        t: 'passos',
        itens: [
          ['Combine os critérios antes.', 'A equipe precisa saber o que será observado e por quê.'],
          ['Use exemplos reais.', 'Uma conversa bem conduzida ensina mais do que uma meta em planilha.'],
          ['Faça conversas individuais curtas e frequentes.', 'Um retorno semanal sobre dois ou três pontos funciona melhor do que uma avaliação longa e rara.'],
          ['Reconheça o que deu certo.', 'Mostrar o que foi bem feito ajuda a espalhar a boa prática.'],
          ['Acompanhe a evolução.', 'O objetivo é melhorar ao longo das semanas, não acertar tudo de uma vez.'],
        ],
      },
      { t: 'cta' },
      { t: 'h2', x: 'De onde vêm os dados' },
      { t: 'p', x: 'Em muitas empresas, medir a equipe depende de alguém ler conversas por amostragem. O AtendeRadar analisa as conversas do WhatsApp conectado e mostra os indicadores por atendente: tempos de resposta, conversas sem retorno, promessas e oportunidades. Com perfis de acesso, cada pessoa vê o que a sua função permite.' },
    ],
  },
  {
    slug: 'privacidade-whatsapp-empresas',
    titulo: 'Privacidade no WhatsApp para empresas: o que você precisa saber',
    resumo: 'Boas práticas para proteger os dados dos clientes que conversam com a sua empresa pelo WhatsApp.',
    linhaFina: 'O que a LGPD pede de quem atende pelo WhatsApp, cuidados práticos no dia a dia e como lidar com pedidos dos clientes sobre os próprios dados.',
    tag: 'Segurança',
    filtros: ['whatsapp', 'clinicas'],
    capa: 6,
    data: '2026-10-12',
    corpo: [
      { t: 'p', x: 'Nas conversas de atendimento circulam nome, telefone, endereço, dados de pagamento e, em alguns segmentos, informações de saúde. Tudo isso é dado pessoal, e a empresa que conversa com o cliente é responsável por cuidar dele.' },
      { t: 'p', x: 'Este texto traz boas práticas gerais. Para a situação específica da sua empresa, converse com um profissional de proteção de dados ou um advogado.' },
      { t: 'h2', x: 'O que a LGPD pede, em linhas gerais' },
      {
        t: 'check',
        itens: [
          'Usar os dados para finalidades claras e legítimas',
          'Coletar só o necessário para essas finalidades',
          'Proteger os dados contra acesso indevido',
          'Atender os pedidos do titular, como acesso, correção e eliminação',
          'Ser transparente sobre o que é feito com os dados',
        ],
      },
      { t: 'h2', x: 'Cuidados práticos no atendimento' },
      {
        t: 'passos',
        itens: [
          ['Controle quem tem acesso.', 'Cada pessoa da equipe deve ver só o que precisa para o seu trabalho. Quando alguém sai da empresa, o acesso sai junto.'],
          ['Evite pedir o que não precisa.', 'Se o atendimento não depende de um documento, não peça o documento.'],
          ['Cuidado com dados sensíveis.', 'Informações de saúde, por exemplo, pedem atenção redobrada. Clínicas devem combinar com a equipe o que pode e o que não pode ser tratado pelo WhatsApp.'],
          ['Não use aparelhos pessoais sem regra.', 'Conversas comerciais em celulares pessoais, sem controle, são difíceis de proteger e de apagar quando necessário.'],
          ['Tenha um caminho para pedidos de titulares.', 'Se um cliente pedir para apagar os dados dele, alguém precisa saber como fazer isso.'],
        ],
      },
      { t: 'cta' },
      { t: 'h2', x: 'E quando a empresa usa uma ferramenta de análise?' },
      { t: 'p', x: 'Ao usar um sistema que analisa as conversas, a empresa continua responsável pelos dados dos seus clientes, e o sistema atua em nome dela. Vale verificar como a ferramenta controla o acesso e se ela permite atender aos pedidos dos titulares.' },
      { t: 'p', x: 'No AtendeRadar, o acesso é separado por funções (administrador, gestor e atendente), as ações importantes ficam em um registro de auditoria e é possível excluir um contato da análise ou apagar de forma definitiva as conversas e os dados dele. Os detalhes estão na nossa Política de Privacidade.' },
    ],
  },
]

export const artigoPorSlug = (slug: string) => ARTIGOS.find((a) => a.slug === slug)

/** Minutos de leitura estimados pelo texto (cerca de 200 palavras por minuto). */
export function minutosDeLeitura(a: Artigo): number {
  const textos: string[] = [a.titulo, a.linhaFina]
  for (const b of a.corpo) {
    if (b.t === 'p' || b.t === 'h2' || b.t === 'exemplo') textos.push(b.x)
    else if (b.t === 'check') textos.push(...b.itens)
    else if (b.t === 'passos') b.itens.forEach(([x, y]) => textos.push(x, y))
    else if (b.t === 'comCitacao') textos.push(b.h2, b.p, b.citacao, ...b.itens)
    else if (b.t === 'pilares') b.itens.forEach((i) => textos.push(i.b, i.s))
  }
  const palavras = textos.join(' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(palavras / 200))
}

const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.']
/** "12 de out. de 2026", sem depender do fuso de quem lê. */
export function dataPorExtenso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} de ${MESES[m - 1]} de ${y}`
}
