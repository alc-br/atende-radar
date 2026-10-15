// Conteúdo do "Tour pelo sistema" (manual interativo). Só texto e roteiro: o motor fica em src/components/system-tour.
// Regra de ouro: descrever o que o sistema FAZ hoje. Não há IA ligada (a análise usa regras de palavras e tempos) e o
// e-mail só sai quando o servidor tem um provedor configurado.
//
// Como escrever um passo:
// - kind 'info'  → explica; avança com "Próximo" (ou seta →).
// - kind 'click' → só avança quando a pessoa clica no item destacado (target = valor do data-tour).
// - kind 'task'  → pede um cadastro; avança sozinho quando a tela emite o tourSignal (ou "Já fiz / pular este passo").
// - view         → o próprio tour abre essa tela antes de mostrar o passo.
// - requires     → o passo só aparece para quem tem a permissão (ex.: criar equipe).
// Se o item destacado não existir na tela, o passo vira explicação sem destaque (nunca trava).
// - narration    → o que a voz fala (explica o item, não repete a tela): fica em narration.ts, chave "capítulo/passo".
import type { SystemTourChapter } from './types'
import { NARRATIONS } from './narration'

const CHAPTERS: SystemTourChapter[] = [
  // ───────────────────────────── 1. Navegação ─────────────────────────────
  {
    id: 'primeiros-passos',
    title: 'Primeiros passos e navegação',
    summary: 'Como o manual funciona, o menu lateral, a busca, as notificações e o seu menu.',
    views: ['dashboard'],
    steps: [
      {
        id: 'boas-vindas',
        kind: 'info',
        title: 'Bem-vindo ao manual do AtendeRadar',
        body: [
          'Este manual mostra o sistema na prática, tela por tela. Em cada passo destacamos um item da tela e explicamos para que ele serve.',
          'Alguns passos pedem que você **clique** no item destacado; outros pedem um **cadastro de verdade** (por exemplo, criar uma equipe). Nesses, o manual segue sozinho quando percebe que deu certo. Você sempre pode usar **Voltar** ou **Pular este passo**.',
          { list: [
            'Setas ← e → do teclado: voltar e avançar.',
            'Esc: fecha o manual. O seu progresso fica salvo e você continua de onde parou.',
            'Ouvir: explica o passo em voz alta.',
            'Ler automaticamente: lê cada passo, mostra com um cursor onde clicar e avança sozinho até o fim do capítulo (escolha a velocidade, até 2×). Cadastros são só mostrados, nunca feitos pelo manual.',
          ] },
        ],
      },
      {
        id: 'menu',
        kind: 'info',
        title: 'O menu lateral',
        target: 'nav-dashboard',
        body: [
          'À esquerda fica o menu com as telas do sistema. Ele mostra **só o que o seu papel pode abrir**: um atendente vê menos itens que um administrador.',
          'No celular o menu fica escondido: toque no botão **Abrir menu** (três tracinhos), no alto da tela, para ver as opções.',
        ],
      },
      {
        id: 'clicar-alertas',
        kind: 'click',
        autoAction: 'click',
        title: 'Experimente: abra os Alertas',
        target: 'nav-alerts',
        body: [
          'Para trocar de tela, basta clicar no nome dela no menu. Vamos testar com a tela de Alertas, onde aparecem os problemas encontrados nas conversas.',
        ],
        action: 'Clique em Alertas no menu.',
      },
      {
        id: 'busca',
        kind: 'info',
        title: 'Busca rápida',
        target: 'header-search',
        view: 'alerts',
        body: [
          'Pronto, você está nos Alertas. No alto de todas as telas fica a busca.',
          'Digite um nome, telefone ou assunto e aperte **Enter**: o sistema abre a tela de Conversas já filtrada pelo que você digitou.',
        ],
      },
      {
        id: 'notificacoes',
        kind: 'info',
        title: 'Notificações',
        target: 'header-notifications',
        body: [
          'O sino mostra os avisos do sistema, como alertas novos. Uma bolinha indica que há avisos não lidos.',
          'Clique em um aviso para ir à lista completa de notificações, onde também dá para **marcar todas como lidas**.',
        ],
      },
      {
        id: 'menu-usuario',
        kind: 'info',
        title: 'O seu menu',
        target: 'header-help',
        body: [
          'Clicando no seu nome você encontra:',
          { list: [
            'Meu perfil: trocar nome e senha e sair de todos os aparelhos.',
            'Central de ajuda e suporte.',
            'Tour pelo sistema (este manual), Tour desta tela e Tour de boas-vindas.',
            'Tema claro ou escuro e o estilo do menu lateral.',
            'Sair.',
          ] },
        ],
      },
      {
        id: 'onde-fica',
        kind: 'info',
        title: 'Onde reabrir este manual',
        target: 'sidebar-tour',
        body: [
          'O botão **Tour pelo sistema** fica no rodapé do menu, logo acima de **Precisa de ajuda?**. Por ele você volta à lista de capítulos e vê o que já concluiu.',
          'Fim do primeiro capítulo. Os próximos explicam cada tela que o seu papel usa.',
        ],
      },
    ],
  },

  // ───────────────────────────── 2. WhatsApp (Conexões) ─────────────────────────────
  {
    id: 'whatsapp',
    title: 'Conectar o WhatsApp',
    summary: 'Como ligar um número de WhatsApp ao AtendeRadar e acompanhar a conexão.',
    views: ['connections'],
    steps: [
      {
        id: 'abrir-conexoes',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra a tela de Conexões',
        target: 'nav-connections',
        body: [
          'O AtendeRadar só analisa conversas de números de WhatsApp conectados a ele. Isso é feito na tela de Conexões.',
        ],
        action: 'Clique em Conexões no menu.',
      },
      {
        id: 'lista',
        kind: 'info',
        title: 'Suas conexões',
        target: 'connections-list',
        view: 'connections',
        body: [
          'Cada cartão é um número de WhatsApp. No topo há um resumo: **Conectadas**, **Desconectadas**, **Com problemas** e o **total de mensagens nas últimas 24 horas**.',
          'Só o **administrador** cria, pausa, reconecta ou exclui conexões. Gestor e supervisor acompanham a situação.',
        ],
      },
      {
        id: 'nova',
        kind: 'click',
        autoAction: 'click',
        title: 'Crie uma conexão',
        target: 'connections-new',
        requires: 'connections.manage',
        body: [
          'O botão **Nova conexão** abre um formulário curto: o nome da conexão (por exemplo, "Vendas") e o número.',
          'A conexão usa o WhatsApp Web por um método **não oficial**. Por isso o formulário pede que você confirme que entende o risco antes de criar.',
        ],
        action: 'Clique em Nova conexão.',
      },
      {
        id: 'criar',
        kind: 'task',
        title: 'Preencha e crie a conexão',
        signal: 'connection.created',
        requires: 'connections.manage',
        body: [
          'Preencha o nome e o número, marque a confirmação do risco e clique em **Criar conexão**.',
          'Se preferir fazer isso depois, use **Pular este passo**.',
        ],
        action: 'Crie a conexão no formulário.',
      },
      {
        id: 'qr',
        kind: 'info',
        title: 'Escaneie o QR Code no celular',
        requires: 'connections.manage',
        body: [
          'Depois de criar, o sistema mostra um **QR Code**. Esta parte acontece no seu celular, fora do AtendeRadar:',
          { list: [
            'Abra o WhatsApp no celular do número.',
            'Toque em Aparelhos conectados e depois em Conectar um aparelho.',
            'Aponte a câmera para o QR Code da tela.',
          ] },
          'Se não puder fazer agora, siga em frente: o QR Code pode ser gerado de novo a qualquer momento pelo botão **Gerar QR** do cartão.',
        ],
      },
      {
        id: 'acoes',
        kind: 'info',
        title: 'O que fazer com cada conexão',
        target: 'connections-list',
        view: 'connections',
        body: [
          'No cartão da conexão aparecem a situação e as ações:',
          { list: [
            'Reconectar e Gerar QR: quando a conexão cai.',
            'Pausar e Retomar: interrompe a coleta sem desconectar.',
            'Renomear e Diagnóstico: o diagnóstico mostra os detalhes técnicos da conexão.',
            'Desconectar e Excluir: **Excluir pede confirmação**; a conexão para de receber mensagens e o histórico fica.',
          ] },
          'As conversas começam a aparecer nas telas assim que as mensagens chegam.',
        ],
      },
    ],
  },

  // ───────────────────────────── 3. Visão Geral ─────────────────────────────
  {
    id: 'visao-geral',
    title: 'Visão Geral e indicadores',
    summary: 'O que significa cada número do painel e como a nota das conversas é calculada.',
    views: ['dashboard'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra a Visão Geral',
        target: 'nav-dashboard',
        body: ['A Visão Geral é a primeira tela do sistema: um resumo do atendimento no período escolhido.'],
        action: 'Clique em Visão Geral no menu.',
      },
      {
        id: 'periodo',
        kind: 'info',
        title: 'Escolha o período',
        target: 'dashboard-period',
        view: 'dashboard',
        body: [
          'Todos os números da tela seguem o período escolhido aqui: **Hoje**, ou os últimos **7, 14, 30 ou 90 dias**.',
          'Para quem tem equipe definida (como o supervisor), os números são os da equipe dele.',
        ],
      },
      {
        id: 'kpis',
        kind: 'info',
        title: 'Os indicadores principais',
        target: 'dashboard-kpis',
        view: 'dashboard',
        body: [
          'Os cartões do topo resumem o atendimento:',
          { list: [
            'Conversas iniciadas no período.',
            'Clientes aguardando: esperando resposta há mais de 5 minutos.',
            'Tempo mediano da 1ª resposta.',
            'Oportunidades detectadas e oportunidades em risco.',
            'Promessas vencidas: quando alguém disse "já te retorno" e não retornou.',
            'Valor em risco: estimativa em reais do que pode ser perdido.',
            'Nota geral do atendimento.',
          ] },
        ],
      },
      {
        id: 'prioridades',
        kind: 'info',
        title: 'Prioridades agora',
        target: 'dashboard-priorities',
        view: 'dashboard',
        body: [
          'Aqui ficam as até 10 conversas que mais precisam de atenção neste momento, como cliente esperando há muito tempo ou oportunidade em risco.',
          'Use **Ver conversa** para abrir o detalhe e agir.',
        ],
      },
      {
        id: 'secoes',
        kind: 'info',
        title: 'Funil, falhas e evolução',
        view: 'dashboard',
        body: [
          'Mais abaixo, a tela mostra:',
          { list: [
            'Funil auditado: quantas conversas viraram oportunidade e quantas terminaram em venda ou perda.',
            'Falhas por tipo: quais problemas mais se repetem.',
            'Evolução: a tendência dos últimos 14 dias.',
          ] },
        ],
      },
      {
        id: 'equipe',
        kind: 'info',
        title: 'Desempenho da equipe',
        target: 'dashboard-team-perf',
        view: 'dashboard',
        body: [
          'Compara os atendentes entre si: volume de conversas, tempo de resposta e nota.',
          'Só entram aqui as identidades do WhatsApp **confirmadas** como de um atendente (veja o capítulo Equipe).',
        ],
      },
      {
        id: 'nota',
        kind: 'info',
        title: 'Como a nota é calculada',
        view: 'dashboard',
        body: [
          'Cada conversa recebe uma nota de 0 a 100 feita com **regras simples e explicáveis**, sem inteligência artificial. Ela soma cinco partes:',
          { list: [
            'Velocidade (30%): o tempo da primeira resposta, comparado com o seu SLA.',
            'Oportunidades (20%): se uma oportunidade de venda foi atendida a tempo.',
            'Pendências (20%): cliente esperando e promessas não cumpridas.',
            'Qualidade (20%): o tom do cliente, por palavras como as de frustração.',
            'Recuperação (10%): se uma oportunidade em risco foi recuperada.',
          ] },
          'Os tempos de SLA são os da tela Configurações, aba Atendimento (padrão: 10 e 30 minutos).',
        ],
      },
    ],
  },

  // ───────────────────────────── 4. Alertas ─────────────────────────────
  {
    id: 'alertas',
    title: 'Alertas e regras',
    summary: 'Como tratar os alertas e como criar as regras que os geram.',
    views: ['alerts'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra os Alertas',
        target: 'nav-alerts',
        body: ['Os alertas avisam quando algo saiu do combinado: cliente sem resposta, promessa vencida, oportunidade parada.'],
        action: 'Clique em Alertas no menu.',
      },
      {
        id: 'abas',
        kind: 'info',
        title: 'As abas dos alertas',
        target: 'alerts-tabs',
        view: 'alerts',
        body: [
          { list: [
            'Ativos: o que precisa de ação agora.',
            'Em acompanhamento: alguém está cuidando.',
            'Resolvidos e Ignorados: o histórico, com o motivo escolhido.',
            'Regras: quando cada alerta é criado.',
          ] },
          'O número ao lado de Ativos também aparece no menu lateral.',
        ],
      },
      {
        id: 'filtros',
        kind: 'info',
        title: 'Filtros',
        target: 'alerts-filterbar',
        view: 'alerts',
        body: [
          'Filtre por **criticidade**, **tipo**, **atendente**, **equipe**, **valor** e **confiança** para achar primeiro o que importa.',
        ],
      },
      {
        id: 'acoes',
        kind: 'info',
        title: 'O que fazer com um alerta',
        view: 'alerts',
        body: [
          'Cada alerta tem botões para agir:',
          { list: [
            'Abrir conversa: vai direto ao detalhe.',
            'Atribuir: escolhe quem vai cuidar.',
            'Acompanhar: move para "Em acompanhamento".',
            'Resolver ou Ignorar: pede um motivo, que fica registrado.',
            'Falso positivo: avisa que o alerta não fazia sentido.',
          ] },
          'Se o seu papel não puder fazer uma ação, o sistema avisa ao tentar.',
        ],
      },
      {
        id: 'aba-regras',
        kind: 'click',
        autoAction: 'select',
        title: 'Veja as regras',
        target: 'alerts-tab-rules',
        view: 'alerts',
        requires: 'alert_rules.view',
        body: [
          'Os alertas nascem de regras. O sistema já vem com regras prontas (por exemplo, cliente sem primeira resposta, promessa vencida e oportunidade sem retorno), cada uma com o seu tempo limite.',
        ],
        action: 'Clique na aba Regras.',
      },
      {
        id: 'regras',
        kind: 'info',
        title: 'Como ler as regras',
        view: 'alerts',
        requires: 'alert_rules.view',
        body: [
          'Cada linha mostra o nome, o tipo, a **severidade**, o **cooldown** (o intervalo mínimo entre dois alertas iguais da mesma conversa) e os canais.',
          'O interruptor **Ativa** liga e desliga a regra. Os alertas aparecem no sino e nesta tela; regras com o canal **e-mail** também avisam por e-mail quem vê o alerta (cada pessoa pode desligar em Meu perfil).',
        ],
      },
      {
        id: 'nova-regra',
        kind: 'click',
        autoAction: 'click',
        title: 'Crie uma regra',
        target: 'alerts-new-rule',
        view: 'alerts',
        requires: 'alert_rules.manage',
        body: ['O botão **Nova regra** abre um formulário com nome, tipo, severidade (padrão: Atenção) e cooldown (padrão: 30 minutos).'],
        action: 'Clique em Nova regra.',
      },
      {
        id: 'criar-regra',
        kind: 'task',
        title: 'Preencha e salve a regra',
        signal: 'alert-rule.created',
        requires: 'alert_rules.manage',
        body: [
          'Dê um nome, escolha o tipo e a severidade e clique em **Criar regra**.',
          'Prefere não criar agora? Use **Pular este passo**.',
        ],
        action: 'Crie a regra no formulário.',
      },
      {
        id: 'depois',
        kind: 'info',
        title: 'Sua regra entrou na lista',
        view: 'alerts',
        requires: 'alert_rules.manage',
        body: [
          'A regra nova aparece na tabela da aba Regras, já ativa. A partir de agora ela vale para as conversas analisadas.',
          'Para desligar sem apagar, use o interruptor **Ativa**.',
        ],
      },
    ],
  },

  // ───────────────────────────── 5. Conversas ─────────────────────────────
  {
    id: 'conversas',
    title: 'Conversas e detalhe',
    summary: 'Encontrar conversas, entender a análise de cada uma e corrigir o que for preciso.',
    views: ['conversations'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra as Conversas',
        target: 'nav-conversations',
        body: ['A tela de Conversas lista os atendimentos coletados do WhatsApp, já analisados.'],
        action: 'Clique em Conversas no menu.',
      },
      {
        id: 'busca',
        kind: 'info',
        title: 'Busca',
        target: 'conversations-search',
        view: 'conversations',
        body: ['Procure por nome do cliente, telefone ou atendente.'],
      },
      {
        id: 'filtros',
        kind: 'info',
        title: 'Filtros',
        target: 'conversations-filters',
        view: 'conversations',
        body: ['Combine os filtros para montar a sua fila de trabalho, por exemplo só as conversas com cliente esperando ou com alerta aberto.'],
      },
      {
        id: 'tabela',
        kind: 'info',
        title: 'A lista de conversas',
        target: 'conversations-table',
        view: 'conversations',
        body: [
          'Cada linha traz o cliente, o responsável, há quanto tempo o cliente espera, o sentimento, os alertas, o valor e a nota. Clique no título de uma coluna para ordenar. **Clique em uma linha** para abrir o detalhe.',
          'Marcando várias linhas aparecem as ações em lote: atribuir atendente, adicionar tag, enviar à recuperação, marcar como revisada e exportar metadados em CSV (sem o texto das mensagens).',
        ],
      },
      {
        id: 'detalhe',
        kind: 'info',
        title: 'O detalhe da conversa',
        view: 'conversations',
        body: [
          'No detalhe você encontra:',
          { list: [
            'Classificação: intenção, urgência e situação.',
            'Perguntas em aberto: marque como respondida quando resolver.',
            'Promessas: confirme quando cumprida ou cancele.',
            'Falhas encontradas: marque falso positivo se não fizer sentido.',
            'Composição da nota e cálculo do valor potencial, com o botão "Como calculamos".',
          ] },
        ],
      },
      {
        id: 'corrigir',
        kind: 'info',
        title: 'Corrigir a análise',
        view: 'conversations',
        body: [
          'A análise usa regras de palavras e tempos, então às vezes erra. No detalhe você pode **alterar a intenção**, **alterar a urgência**, **mudar o responsável**, **confirmar venda** ou **confirmar perda**.',
          'Em **Mais opções** ficam "Enviar para recuperação" e "Marcar como revisada". Administrador e gestor também têm o menu **Privacidade** (veja o capítulo de LGPD).',
        ],
      },
    ],
  },

  // ───────────────────────────── 6. Recuperação ─────────────────────────────
  {
    id: 'recuperacao',
    title: 'Recuperação de vendas',
    summary: 'A fila de clientes para chamar de volta e como registrar o resultado.',
    views: ['recovery'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra a Recuperação',
        target: 'nav-recovery',
        body: ['Na Recuperação ficam as oportunidades que esfriaram e merecem um novo contato.'],
        action: 'Clique em Recuperação no menu.',
      },
      {
        id: 'metricas',
        kind: 'info',
        title: 'Os números da recuperação',
        target: 'recovery-metrics',
        view: 'recovery',
        body: ['Itens criados, itens trabalhados, taxa de contato e **receita recuperada** no período.'],
      },
      {
        id: 'fila',
        kind: 'info',
        title: 'A fila',
        target: 'recovery-table',
        view: 'recovery',
        body: [
          'Os itens vêm ordenados por prioridade. A situação de cada um segue esta ordem:',
          { list: ['Nova', 'Atribuída', 'Tentada', 'Contactada', 'Recuperada ou Perdida'] },
          'Você também pode mandar uma conversa para cá pelo botão "Enviar à recuperação" da tela de Conversas.',
        ],
      },
      {
        id: 'acoes',
        kind: 'info',
        title: 'Trabalhando um item',
        target: 'recovery-table',
        view: 'recovery',
        body: [
          'No menu de cada linha você pode atribuir, abrir a conversa, alterar o prazo, **copiar o contexto** para colar no WhatsApp, registrar uma tentativa, registrar o resultado, informar o valor recuperado e devolver ao responsável original.',
          'O contato com o cliente é feito por você no WhatsApp: o AtendeRadar não envia mensagens.',
        ],
      },
    ],
  },

  // ───────────────────────────── 7. Equipe ─────────────────────────────
  {
    id: 'equipe',
    title: 'Equipe e identidades do WhatsApp',
    summary: 'Desempenho de cada atendente e como ligar quem responde no WhatsApp a uma pessoa.',
    views: ['team'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra a Equipe',
        target: 'nav-team',
        body: ['A tela Equipe mostra como cada atendente está indo.'],
        action: 'Clique em Equipe no menu.',
      },
      {
        id: 'resumo',
        kind: 'info',
        title: 'Resumo',
        target: 'team-summary',
        view: 'team',
        body: ['Os cartões do topo resumem a equipe inteira no período, para comparar com cada pessoa logo abaixo.'],
      },
      {
        id: 'tabela',
        kind: 'info',
        title: 'Cada atendente',
        target: 'team-table',
        view: 'team',
        body: ['Clique em uma linha para abrir o **perfil do atendente**, com os números e as conversas dele.'],
      },
      {
        id: 'identidades',
        kind: 'info',
        title: 'Identidades do WhatsApp',
        target: 'team-identities',
        view: 'team',
        body: [
          'O sistema sugere quem é quem no WhatsApp: pela **assinatura** nas mensagens, pelo **aparelho** ou pelo **número**.',
          'Administrador e gestor confirmam a sugestão, trocam a pessoa, marcam "Não é atendente" ou desfazem.',
          'Importante: só as identidades **confirmadas** contam nos números de cada atendente.',
        ],
      },
    ],
  },

  // ───────────────────────────── 8. Membros ─────────────────────────────
  {
    id: 'membros',
    title: 'Membros e convites',
    summary: 'Quem acessa o sistema, com qual papel, e como convidar alguém.',
    views: ['members'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra Membros',
        target: 'nav-members',
        body: ['Membros são as pessoas que entram no AtendeRadar da sua empresa.'],
        action: 'Clique em Membros no menu.',
      },
      {
        id: 'papeis',
        kind: 'info',
        title: 'Os papéis',
        target: 'members-table',
        view: 'members',
        body: [
          'Cada pessoa tem um papel, que define o que ela vê e faz:',
          { list: [
            'Administrador: tudo, inclusive conexões, membros, plano e encerramento da conta.',
            'Gestor: configurações, regras, equipes e relatórios.',
            'Supervisor: acompanha a equipe, conversas e alertas.',
            'Analista: indicadores e relatórios.',
            'Atendente: as próprias conversas, alertas e recuperação.',
            'Visualizador: só leitura de painel e relatórios.',
          ] },
        ],
      },
      {
        id: 'botao',
        kind: 'click',
        autoAction: 'click',
        title: 'Convide alguém',
        target: 'members-add',
        view: 'members',
        requires: 'members.manage',
        body: ['O botão **Adicionar membro** abre o convite: nome, e-mail, função e equipe.'],
        action: 'Clique em Adicionar membro.',
      },
      {
        id: 'convidar',
        kind: 'task',
        title: 'Envie o convite',
        signal: 'member.invited',
        requires: 'members.manage',
        body: [
          'Preencha e clique em **Adicionar**.',
          'Se o servidor tiver um provedor de e-mail configurado, o convite vai por e-mail. Se não tiver, o sistema mostra o **link do convite** (e já copia) para você enviar à pessoa.',
        ],
        action: 'Adicione o membro no formulário.',
      },
      {
        id: 'depois',
        kind: 'info',
        title: 'O convite na lista',
        target: 'members-table',
        view: 'members',
        requires: 'members.manage',
        body: [
          'A pessoa aparece na tabela com o convite pendente até criar a senha.',
          'No menu da linha você pode mudar o papel, definir a equipe, reenviar ou cancelar o convite e remover o membro.',
        ],
      },
    ],
  },

  // ───────────────────────────── 9. Equipes ─────────────────────────────
  {
    id: 'equipes',
    title: 'Equipes',
    summary: 'Agrupar atendentes com um supervisor e ver números por equipe.',
    views: ['teams'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra Equipes',
        target: 'nav-teams',
        body: ['Equipes agrupam atendentes sob um supervisor. O supervisor passa a ver os números da equipe dele.'],
        action: 'Clique em Equipes no menu.',
      },
      {
        id: 'lista',
        kind: 'info',
        title: 'As equipes cadastradas',
        target: 'teams-list',
        view: 'teams',
        body: ['Cada cartão mostra o nome, o supervisor e quantos atendentes ativos a equipe tem.'],
      },
      {
        id: 'botao',
        kind: 'click',
        autoAction: 'click',
        title: 'Crie uma equipe',
        target: 'teams-create',
        view: 'teams',
        requires: 'teams.manage',
        body: ['O botão **Criar equipe** abre um formulário com o nome e o supervisor.'],
        action: 'Clique em Criar equipe.',
      },
      {
        id: 'criar',
        kind: 'task',
        title: 'Dê um nome e escolha o supervisor',
        signal: 'team.created',
        requires: 'teams.manage',
        body: [
          'Escreva o **nome da equipe**, escolha o **supervisor** na lista e clique em **Criar**.',
          'A lista de supervisores vem dos atendentes já identificados nas conversas.',
        ],
        action: 'Crie a equipe no formulário.',
      },
      {
        id: 'depois',
        kind: 'info',
        title: 'Sua equipe apareceu',
        target: 'teams-list',
        view: 'teams',
        requires: 'teams.manage',
        body: [
          'A equipe nova está na lista, com o supervisor escolhido. Ela começa sem atendentes.',
          'Para colocar pessoas nela, use **Membros → menu da linha → Definir equipe**. O botão **Desativar equipe** tira a equipe de uso sem apagar o histórico.',
        ],
      },
    ],
  },

  // ───────────────────────────── 10. Relatórios ─────────────────────────────
  {
    id: 'relatorios',
    title: 'Relatórios',
    summary: 'Exportar indicadores, gerar relatórios e agendar o envio.',
    views: ['reports'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra os Relatórios',
        target: 'nav-reports',
        body: ['Aqui você tira os números do sistema em arquivo.'],
        action: 'Clique em Relatórios no menu.',
      },
      {
        id: 'exportar',
        kind: 'info',
        title: 'Exportar indicadores',
        target: 'reports-export',
        view: 'reports',
        body: [
          'Os botões **Indicadores** baixam os números do painel em CSV, XLSX (Excel) ou JSON.',
          'Cada exportação conta no limite mensal do seu plano.',
        ],
      },
      {
        id: 'abas',
        kind: 'info',
        title: 'Tipos e histórico',
        target: 'reports-tabs',
        view: 'reports',
        body: ['Em **Tipos de Relatório** ficam os modelos prontos. Em **Histórico** ficam os relatórios já gerados, com as ações Reenviar e Tentar novamente.'],
      },
      {
        id: 'tipos',
        kind: 'info',
        title: 'Os modelos de relatório',
        target: 'reports-types',
        view: 'reports',
        body: ['Cada cartão mostra o agendamento, a última execução e quantos destinatários recebem.'],
      },
      {
        id: 'gerar',
        kind: 'task',
        title: 'Gere um relatório agora',
        target: 'reports-types',
        view: 'reports',
        signal: 'report.generated',
        requires: 'reports.generate',
        body: [
          'Clique em **Gerar agora** em qualquer cartão. O relatório cobre os **últimos 7 dias** e fica no Histórico; o aviso que aparece tem o botão **Abrir**.',
        ],
        action: 'Clique em Gerar agora em um relatório.',
      },
      {
        id: 'configurar',
        kind: 'info',
        title: 'Agendar e enviar por e-mail',
        target: 'reports-types',
        view: 'reports',
        requires: 'reports.configure',
        body: [
          'Em **Configurar** você define o horário do agendamento (horário de Brasília) e os destinatários, um e-mail por linha. O relatório segue em PDF anexo.',
          'O e-mail só é enviado quando o servidor tem um provedor de e-mail configurado. Sem ele, o envio fica na fila e aparece no Histórico.',
        ],
      },
    ],
  },

  // ───────────────────────────── 11. Configurações ─────────────────────────────
  {
    id: 'configuracoes',
    title: 'Configurações',
    summary: 'Empresa, horários, SLA, valores de venda, notificações, webhook e auditoria.',
    views: ['settings'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra as Configurações',
        target: 'nav-settings',
        body: ['As configurações ajustam a análise ao jeito da sua empresa.'],
        action: 'Clique em Configurações no menu.',
      },
      {
        id: 'abas',
        kind: 'info',
        title: 'As abas',
        target: 'settings-tabs',
        view: 'settings',
        body: [
          { list: [
            'Empresa e Horários: dados e horário de atendimento.',
            'Atendimento: SLA da 1ª resposta (padrão 10 min) e de continuidade (30 min), abandono, reabertura e inatividade.',
            'Financeiro: ticket médio (padrão R$ 1.500), taxa de conversão (18%) e teto por conversa (R$ 15.000), usados no valor em risco.',
            'Notificações, Privacidade, Regras, Webhook e Auditoria.',
          ] },
        ],
      },
      {
        id: 'limites',
        kind: 'info',
        title: 'Análise e notificações',
        view: 'settings',
        body: [
          'A aba **Análise** guarda preferências para quando a análise por inteligência artificial for ligada; hoje ela não muda o resultado.',
          'Em **Notificações** ficam o resumo e o horário de silêncio dos alertas por e-mail. A lista de **Destinatários** fica guardada para uso futuro: hoje o e-mail de alerta vai para os membros que veem o alerta.',
        ],
      },
      {
        id: 'webhook',
        kind: 'info',
        title: 'Webhook e auditoria',
        view: 'settings',
        body: [
          'O **Webhook** avisa outro sistema seu quando um alerta é criado ou resolvido.',
          'A **Auditoria** registra quem mudou o quê e quando.',
        ],
      },
      {
        id: 'salvar',
        kind: 'task',
        title: 'Salve uma configuração',
        signal: 'settings.saved',
        view: 'settings',
        body: [
          'Revise uma aba (por exemplo, Atendimento) e clique em **Salvar**. Cada aba é salva separadamente.',
          'Não quer mudar nada agora? Use **Pular este passo**.',
        ],
        action: 'Clique em Salvar em uma das abas.',
      },
      {
        id: 'depois',
        kind: 'info',
        title: 'Quando a mudança vale',
        view: 'settings',
        body: [
          'O aviso de confirmação no canto da tela mostra que gravou. As mudanças de SLA, horários e valores passam a valer nas próximas análises das conversas; a mudança fica registrada na aba **Auditoria**, com o seu nome.',
        ],
      },
    ],
  },

  // ───────────────────────────── 12. Planos ─────────────────────────────
  {
    id: 'planos',
    title: 'Planos e cobrança',
    summary: 'Seu plano, o uso do mês, a troca de plano e as faturas.',
    views: ['plans'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra os Planos',
        target: 'nav-plans',
        body: ['Toda empresa nova começa com **14 dias de teste grátis**.'],
        action: 'Clique em Planos no menu.',
      },
      {
        id: 'uso',
        kind: 'info',
        title: 'Uso deste mês',
        target: 'plans-usage',
        view: 'plans',
        body: ['Mostra quanto você já usou de cada limite do plano neste mês. Perto do limite, vale comparar os planos logo abaixo.'],
      },
      {
        id: 'comparar',
        kind: 'info',
        title: 'Compare e troque de plano',
        target: 'plans-compare',
        view: 'plans',
        body: [
          'Escolha o plano e o ciclo (mensal ou anual). O pagamento é feito com cartão, pelo Pagar.me, numa tela de checkout própria.',
          'Ao cancelar, o plano continua valendo até o fim do período já pago. As faturas ficam listadas nesta tela.',
        ],
      },
    ],
  },

  // ───────────────────────────── 13. Privacidade / LGPD ─────────────────────────────
  {
    id: 'privacidade',
    title: 'Privacidade, LGPD e encerramento da conta',
    summary: 'Retenção dos dados, pedidos de clientes e como encerrar a conta.',
    views: ['settings'],
    requires: 'privacy.manage',
    steps: [
      {
        id: 'aba',
        kind: 'click',
        autoAction: 'select',
        title: 'Abra a aba Privacidade',
        target: 'settings-tab-privacy',
        view: 'settings',
        body: ['As regras de privacidade ficam em Configurações, aba Privacidade.'],
        action: 'Clique na aba Privacidade.',
      },
      {
        id: 'retencao',
        kind: 'info',
        title: 'Retenção e proteção',
        target: 'settings-privacy',
        view: 'settings',
        body: [
          { list: [
            'Retenção: por quantos dias guardar o conteúdo (padrão 365), os metadados (730) e os anexos (90).',
            'Mascaramento: oculta CPF, cartão e outros dados sensíveis nas análises.',
            'Números excluídos: contatos que nunca serão monitorados.',
            'Base legal e contato do encarregado (DPO).',
          ] },
        ],
      },
      {
        id: 'titular',
        kind: 'info',
        title: 'Pedidos de um cliente',
        view: 'settings',
        body: [
          'Quando um cliente pedir os dados dele, abra a conversa e use o menu **Privacidade**:',
          { list: [
            'Exportar dados deste cliente (arquivo JSON).',
            'Parar de monitorar este contato.',
            'Apagar dados deste cliente.',
          ] },
        ],
      },
      {
        id: 'encerrar',
        kind: 'info',
        title: 'Encerrar a conta',
        target: 'settings-danger',
        view: 'settings',
        requires: 'organization.delete',
        body: [
          'Na zona de perigo, o administrador pode pedir a exclusão da empresa. É preciso digitar a **senha** e o **nome da empresa**.',
          'Há **7 dias** para mudar de ideia; depois disso os dados são apagados.',
        ],
      },
    ],
  },

  // ───────────────────────────── 14. Central de ajuda ─────────────────────────────
  {
    id: 'ajuda',
    title: 'Central de ajuda e suporte',
    summary: 'Artigos, guias das telas e como falar com o suporte.',
    views: ['help'],
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra a Central de ajuda',
        target: 'sidebar-help',
        body: ['Sempre que tiver dúvida, comece pela Central de ajuda.'],
        action: 'Clique em Precisa de ajuda? no rodapé do menu.',
      },
      {
        id: 'guias',
        kind: 'info',
        title: 'Guias passo a passo',
        target: 'help-guides',
        view: 'help',
        body: ['Daqui você reabre este manual, o guia rápido da tela em que estava e o tour de boas-vindas. O link **Status do serviço** mostra se o sistema está funcionando normalmente.'],
      },
      {
        id: 'artigos',
        kind: 'info',
        title: 'Artigos',
        target: 'help-search',
        view: 'help',
        body: ['Busque por palavras como "QR Code", "valor em risco" ou "cancelar". Os artigos explicam cada conceito em linguagem simples.'],
      },
      {
        id: 'suporte',
        kind: 'info',
        title: 'Falar com o suporte',
        target: 'help-support',
        view: 'help',
        body: [
          'Não achou a resposta? Descreva o problema e, se quiser, anexe uma captura de tela. A versão do sistema e a tela em que você estava vão junto.',
          'A resposta chega no seu e-mail, e os seus chamados aparecem logo abaixo do formulário.',
        ],
      },
    ],
  },

  // ───────────────────────────── 15. Admin (operador da plataforma) ─────────────────────────────
  {
    id: 'admin',
    title: 'Painel Admin da plataforma',
    summary: 'Para a equipe do AtendeRadar: organizações, usuários, sistema, produto e suporte.',
    views: ['admin'],
    platformOnly: true,
    steps: [
      {
        id: 'abrir',
        kind: 'click',
        autoAction: 'click',
        title: 'Abra o Admin',
        target: 'nav-admin',
        body: ['Este painel só aparece para quem opera a plataforma. Ele mostra todas as empresas clientes.'],
        action: 'Clique em Admin no menu.',
      },
      {
        id: 'kpis',
        kind: 'info',
        title: 'Números da plataforma',
        target: 'admin-kpis',
        view: 'admin',
        body: ['Resumo de organizações, usuários e uso geral.'],
      },
      {
        id: 'abas',
        kind: 'info',
        title: 'As abas do Admin',
        target: 'admin-tabs',
        view: 'admin',
        body: [
          { list: [
            'Organizações: abra uma empresa para ver e editar a assinatura.',
            'Usuários globais: as pessoas de todas as empresas. Sistema: a situação do servidor.',
            'Produto: funil de ativação, retenção, uso por tela e taxa de conclusão dos tours (inclusive deste manual).',
            'Suporte: chamados abertos pelos clientes, com "Marcar como resolvido" e "Reabrir".',
          ] },
        ],
      },
    ],
  },
]

/** Capítulos com a narração falada de cada passo (narration.ts). */
export const SYSTEM_TOUR_CHAPTERS: SystemTourChapter[] = CHAPTERS.map((c) => ({
  ...c,
  steps: c.steps.map((s) => {
    const narration = NARRATIONS[`${c.id}/${s.id}`]
    return narration ? { ...s, narration } : s
  }),
}))
