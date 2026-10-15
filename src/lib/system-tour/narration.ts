// Narração falada de cada passo do "Tour pelo sistema" (chave: "capítulo/passo").
// A tela mostra o texto curto (content.ts); a voz EXPLICA: o que é, para que serve e por que importa para quem vende e
// atende pelo WhatsApp. Regras: segunda pessoa, frases curtas, sem markdown, emojis ou siglas que a voz leria mal
// (escreva por extenso), até NARRATION_MAX caracteres. Mudar um texto gera um áudio novo (a chave do cache é o texto).
// Descreva só o que o sistema faz hoje (sem IA ligada; e-mail só com provedor configurado).
import type { NarrationCue } from './types'

export const NARRATIONS: Record<string, string> = {
  // ── 1. Primeiros passos ──
  'primeiros-passos/boas-vindas':
    'Olá! Este manual vai com você pelas telas do Atende Radar, uma de cada vez. A ideia é simples: o sistema acompanha as conversas de WhatsApp da sua empresa e mostra onde o atendimento está deixando venda escapar. Em cada passo eu destaco um item e explico para que ele serve. Às vezes vou pedir que você clique em algo ou faça um cadastro de verdade, e eu sigo sozinho quando perceber que deu certo. Eu leio sozinho, mostro onde clicar e espero o seu clique. Cadastros eu só mostro. Pode fechar quando quiser: o seu progresso fica guardado.',
  'primeiros-passos/menu':
    'Este é o menu lateral, o caminho para todas as telas. Cada item abre uma tela: o destacado agora, Visão Geral, é o painel principal, por onde você começa o dia. Repare que o menu muda conforme o seu papel: um atendente vê só o que precisa para o dia a dia, enquanto o administrador vê também conexões, membros e plano. Isso evita confusão e protege informações sensíveis. No celular, o menu fica escondido atrás do botão de três tracinhos, no alto da tela.',
  'primeiros-passos/clicar-alertas':
    'Vamos praticar. Os Alertas são o lugar onde o sistema avisa que algo saiu do combinado, por exemplo um cliente esperando resposta há tempo demais. Clique em Alertas no menu e eu continuo a explicação lá dentro.',
  'primeiros-passos/busca':
    'Pronto, você chegou aos Alertas. Agora repare na busca, no alto da tela: ela está em todas as páginas. Quando um cliente liga reclamando, por exemplo, você digita o nome ou o telefone dele, aperta Enter, e o sistema abre as conversas já filtradas. É o atalho mais rápido para achar um atendimento específico.',
  'primeiros-passos/notificacoes':
    'O sino reúne os avisos do sistema, como um alerta novo. Quando aparece uma bolinha, há algo que você ainda não viu. Vale olhar de tempos em tempos: é por ali que você fica sabendo de um problema sem precisar abrir tela por tela. Na lista completa dá para marcar tudo como lido de uma vez.',
  'primeiros-passos/menu-usuario':
    'Clicando no seu nome, você abre o seu menu pessoal. Ali você troca o nome e a senha, e pode sair de todos os aparelhos, útil se esqueceu a conta aberta num computador da loja. Também ficam ali a Central de ajuda, os tours, a escolha entre tema claro e escuro e o botão para sair.',
  'primeiros-passos/onde-fica':
    'Para voltar a este manual depois, use o botão Tour pelo sistema, no rodapé do menu, logo acima de Precisa de ajuda. Lá você vê a lista de capítulos e quais já concluiu. Com isso terminamos o primeiro capítulo. Os próximos mostram, uma a uma, as telas que o seu papel usa.',

  // ── 2. WhatsApp (Conexões) ──
  'whatsapp/abrir-conexoes':
    'Tudo começa pelo WhatsApp. O Atende Radar só enxerga as conversas dos números que você conectar a ele, então sem conexão não há análise nem alerta. Clique em Conexões no menu para ver como isso funciona.',
  'whatsapp/lista':
    'Cada cartão desta tela é um número de WhatsApp da empresa, como o número de vendas ou o do pós-venda. O resumo do topo diz quantos estão funcionando, quantos caíram e quantas mensagens chegaram nas últimas vinte e quatro horas. Se esse número de mensagens zerar de repente, desconfie: pode ser uma conexão que caiu. Só o administrador cria e mexe nas conexões; gestor e supervisor acompanham.',
  'whatsapp/nova':
    'Vamos criar uma conexão. O botão Nova conexão pede só um nome, por exemplo Vendas, e o número. Um aviso importante: a ligação usa o WhatsApp Web por um caminho que não é o oficial da Meta. Funciona bem, mas existe o risco de o WhatsApp restringir o número, e por isso o formulário pede que você confirme que está ciente.',
  'whatsapp/criar':
    'Preencha o nome e o número, marque a confirmação do risco e clique em Criar conexão. Use um nome que a equipe reconheça, porque ele aparece em várias telas. Se preferir conectar depois, tudo bem: é só pular este passo.',
  'whatsapp/qr':
    'Agora vem a parte no celular. O sistema mostra um código quadriculado, o mesmo usado para entrar no WhatsApp Web. No celular do número, abra o WhatsApp, toque em Aparelhos conectados, depois em Conectar um aparelho, e aponte a câmera para a tela. Se o código expirar ou você não estiver com o celular agora, não tem problema: o botão Gerar QR, no cartão da conexão, cria um código novo quando você quiser.',
  'whatsapp/acoes':
    'Cada cartão tem as ações da conexão. Se ela cair, use Reconectar ou gere um código novo. Pausar interrompe a coleta sem desconectar, bom para um número pessoal fora do expediente. O Diagnóstico mostra os detalhes técnicos, útil quando o suporte pedir. Excluir pede confirmação e para de receber mensagens daquele número, mas o histórico já coletado continua no sistema.',

  // ── 3. Visão Geral ──
  'visao-geral/abrir':
    'A Visão Geral é o painel do dono do negócio: em poucos segundos você sabe se o atendimento está bem ou se tem cliente esfriando. Clique em Visão Geral no menu.',
  'visao-geral/periodo':
    'Comece sempre pelo período. Todos os números da tela obedecem a esta escolha: hoje, ou os últimos sete, catorze, trinta ou noventa dias. Uma dica: use Hoje para agir no dia e trinta dias para enxergar tendência. Se você é supervisor de uma equipe, os números mostrados são só os da sua equipe.',
  'visao-geral/kpis':
    'Estes cartões são o termômetro do atendimento. Clientes aguardando conta quem está sem resposta há mais de cinco minutos. O tempo mediano da primeira resposta mostra quanto o cliente costuma esperar. Promessas vencidas são os famosos já te retorno que ficaram sem retorno. E o valor em risco estima, em reais, quanto pode ser perdido nas oportunidades paradas. Se só der tempo de olhar dois números, olhe clientes aguardando e valor em risco.',
  'visao-geral/prioridades':
    'Aqui está a sua lista de tarefas do momento: até dez conversas que mais precisam de atenção agora, como um cliente esperando há muito tempo ou uma venda em risco. Em vez de garimpar conversa por conversa, comece por aqui. Clique em Ver conversa para abrir o detalhe e agir.',
  'visao-geral/secoes':
    'Descendo a tela, você encontra três visões. O funil mostra quantas conversas viraram oportunidade e quantas terminaram em venda ou em perda. As falhas por tipo revelam o problema que mais se repete, por exemplo demora na primeira resposta. E a evolução mostra a tendência das últimas duas semanas, para saber se as mudanças que você fez estão dando resultado.',
  'visao-geral/equipe':
    'Esta tabela compara os atendentes entre si: volume de conversas, tempo de resposta e nota. Serve para reconhecer quem está indo bem e para orientar quem precisa de ajuda, sempre com dados. Atenção: só aparecem aqui as pessoas cujas identidades no WhatsApp foram confirmadas, o que você aprende no capítulo Equipe.',
  'visao-geral/nota':
    'Cada conversa ganha uma nota de zero a cem, calculada por regras simples, sem inteligência artificial. A velocidade da primeira resposta pesa trinta por cento, comparada com o tempo de resposta combinado nas Configurações. Atender uma oportunidade a tempo, não deixar pendências e o tom do cliente valem vinte por cento cada. Recuperar uma venda em risco vale os dez restantes. Por exemplo: responder em dois minutos e cumprir o que prometeu já garante boa parte da nota.',

  // ── 4. Alertas ──
  'alertas/abrir':
    'Os alertas são o seu sistema de alarme. Eles avisam quando algo saiu do combinado: um cliente sem resposta, uma promessa que venceu, uma oportunidade parada. Agir rápido em um alerta costuma ser a diferença entre fechar e perder a venda. Clique em Alertas no menu.',
  'alertas/abas':
    'As abas organizam o trabalho. Ativos é o que precisa de ação agora. Em acompanhamento mostra o que alguém já está cuidando, para ninguém fazer o mesmo trabalho duas vezes. Resolvidos e Ignorados guardam o histórico, com o motivo de cada decisão. E Regras define quando um alerta nasce. O número de ativos também aparece no menu lateral, para você não esquecer.',
  'alertas/filtros':
    'Com muitos alertas, os filtros ajudam a escolher por onde começar. Você pode filtrar por gravidade, tipo, atendente, equipe, valor e confiança. Uma boa rotina é olhar primeiro os críticos e os de maior valor: são os que mais pesam no faturamento.',
  'alertas/acoes':
    'Cada alerta tem botões de ação. Abrir conversa leva direto ao atendimento. Atribuir escolhe quem vai cuidar, e Acompanhar sinaliza que alguém já está nisso. Para Resolver ou Ignorar, o sistema pede um motivo, que fica registrado. E se o alerta não fazia sentido, marque Falso positivo: isso ajuda a melhorar as regras. Se o seu papel não puder fazer alguma ação, o sistema avisa na hora.',
  'alertas/aba-regras':
    'Todo alerta nasce de uma regra. O sistema já vem com regras prontas, como cliente sem primeira resposta, promessa vencida e oportunidade sem retorno, cada uma com o seu tempo limite. Clique na aba Regras para ver como elas estão configuradas.',
  'alertas/regras':
    'Cada linha é uma regra. A gravidade diz o quanto o alerta é urgente. O intervalo de espera evita repetição: é o tempo mínimo entre dois alertas iguais da mesma conversa, para a equipe não ser bombardeada. O interruptor Ativa liga e desliga a regra sem apagar. Os alertas aparecem no sino e nesta tela, e as regras com o canal e-mail também avisam por e-mail quem enxerga aquele alerta.',
  'alertas/nova-regra':
    'Você também pode criar as suas próprias regras, ajustadas ao seu negócio. O botão Nova regra abre um formulário com nome, tipo, gravidade e intervalo de espera. Se não mexer, a gravidade começa em Atenção e o intervalo em trinta minutos.',
  'alertas/criar-regra':
    'Dê um nome que explique a regra para qualquer pessoa da equipe, por exemplo Orçamento sem resposta. Escolha o tipo e a gravidade e clique em Criar regra. Se preferir criar outra hora, é só pular este passo.',
  'alertas/depois':
    'Pronto, a regra entrou na lista e já está ativa. A partir de agora ela vale para as conversas analisadas. Se em algum momento ela gerar alertas demais, por exemplo numa época de promoção, use o interruptor Ativa para desligar sem perder a configuração.',

  // ── 5. Conversas ──
  'conversas/abrir':
    'A tela de Conversas reúne todos os atendimentos coletados do WhatsApp, já analisados pelo sistema. É aqui que você investiga um caso a fundo. Clique em Conversas no menu.',
  'conversas/busca':
    'Use esta busca quando souber quem procura: nome do cliente, telefone ou o nome do atendente. É o caminho mais curto, por exemplo, para checar como foi o atendimento de um cliente que reclamou.',
  'conversas/filtros':
    'Os filtros transformam a lista em uma fila de trabalho. Por exemplo: só conversas com cliente esperando, ou só as que têm alerta aberto. Combinando filtros, cada pessoa da equipe sabe exatamente o que atacar primeiro no dia.',
  'conversas/tabela':
    'Cada linha resume uma conversa: o cliente, o responsável, há quanto tempo ele espera, o humor do cliente, os alertas, o valor e a nota. Clique no título de uma coluna para ordenar, por exemplo pelo maior valor. Marcando várias linhas, você faz ações em lote, como atribuir a um atendente ou exportar uma planilha, que leva só os dados gerais, nunca o texto das mensagens.',
  'conversas/detalhe':
    'Ao abrir uma conversa, você vê o raciocínio do sistema. A classificação diz o que o cliente quer e com que urgência. Perguntas em aberto e promessas mostram o que ficou devendo. As falhas apontam o que deu errado. E a composição da nota e o cálculo do valor explicam cada número. O botão Como calculamos mostra a conta do valor: o ticket médio da empresa multiplicado pela chance de fechar.',
  'conversas/corrigir':
    'A análise usa regras de palavras e de tempo, então às vezes erra. Quando isso acontecer, corrija: você pode mudar a intenção, a urgência e o responsável, e confirmar a venda ou a perda. Confirmar vendas é especialmente útil, porque deixa os números de faturamento mais próximos da realidade. Em Mais opções ficam o envio para a recuperação e a marcação de revisada.',

  // ── 6. Recuperação ──
  'recuperacao/abrir':
    'A Recuperação é onde vendas quase perdidas ganham uma segunda chance. Ficam aqui as oportunidades que esfriaram, como o cliente que pediu orçamento e sumiu. Clique em Recuperação no menu.',
  'recuperacao/metricas':
    'Estes números mostram se o esforço de recuperação está valendo a pena: quantos itens entraram, quantos foram trabalhados, a taxa de contato e, principalmente, a receita recuperada. É um ótimo indicador para mostrar à equipe o dinheiro que voltou por causa dela.',
  'recuperacao/fila':
    'A fila já vem ordenada por prioridade, então comece de cima. Cada item passa pelas etapas nova, atribuída, tentada, contactada e, no fim, recuperada ou perdida. Assim você sabe em que pé está cada cliente. Também dá para mandar uma conversa para cá a partir da tela de Conversas.',
  'recuperacao/acoes':
    'No menu de cada linha você trabalha o item: atribui a alguém, abre a conversa, muda o prazo e registra tentativas e o resultado. A ação copiar o contexto é uma mão na roda: ela copia um resumo com o cliente, o motivo, o valor e a última interação, para você colar onde precisar, como numa mensagem para quem vai ligar. Importante: quem fala com o cliente é você, pelo WhatsApp. O Atende Radar não envia mensagens.',

  // ── 7. Equipe ──
  'equipe/abrir':
    'A tela Equipe mostra como cada atendente está indo, com números iguais para todos. É a base para uma conversa justa de desempenho. Clique em Equipe no menu.',
  'equipe/resumo':
    'Os cartões do topo trazem a média da equipe inteira no período. Use como régua: comparando cada pessoa com a média, fica fácil ver quem está acima e quem precisa de apoio.',
  'equipe/tabela':
    'Cada linha é um atendente. Clicando nela, você abre o perfil da pessoa, com os números e as conversas dela. Na hora de dar um retorno, mostrar uma conversa real ajuda muito mais do que falar só de números.',
  'equipe/identidades':
    'No WhatsApp, várias pessoas podem responder pelo mesmo número. Por isso o sistema tenta descobrir quem é quem, pela assinatura nas mensagens, pelo aparelho ou pelo número, e sugere a ligação. O administrador ou o gestor confirma, troca a pessoa ou marca que não é atendente. Isso é importante: só as identidades confirmadas entram nos números de cada atendente.',

  // ── 8. Membros ──
  'membros/abrir':
    'Membros são as pessoas da sua empresa que entram no Atende Radar. Aqui você controla quem acessa e o que cada um pode fazer. Clique em Membros no menu.',
  'membros/papeis':
    'O papel define o que cada pessoa vê e faz. O administrador tem acesso a tudo, inclusive plano e encerramento da conta. O gestor cuida de configurações, regras, equipes e relatórios. O supervisor acompanha a equipe. O analista fica nos indicadores. O atendente vê as próprias conversas e alertas. E o visualizador só consulta. Uma boa prática é dar a cada pessoa só o acesso que ela realmente precisa.',
  'membros/botao':
    'Para trazer alguém para o sistema, use o botão Adicionar membro. O convite pede nome, e-mail, papel e, se fizer sentido, a equipe da pessoa.',
  'membros/convidar':
    'Preencha os dados e clique em Adicionar. Se o servidor tiver o envio de e-mail configurado, o convite chega na caixa de entrada da pessoa. Se não tiver, o sistema mostra o link do convite e já copia para você, aí é só mandar pelo WhatsApp, por exemplo.',
  'membros/depois':
    'A pessoa aparece na lista com o convite pendente até criar a própria senha. Pelo menu da linha você muda o papel, define a equipe, reenvia ou cancela o convite e remove o acesso. Quando alguém sair da empresa, remova o membro no mesmo dia: é uma questão de segurança.',

  // ── 9. Equipes ──
  'equipes/abrir':
    'Equipes servem para organizar atendentes em grupos, cada um com um supervisor. Com isso, o supervisor passa a ver os números só da equipe dele. Clique em Equipes no menu.',
  'equipes/lista':
    'Cada cartão é uma equipe, com o nome, o supervisor e quantos atendentes ativos ela tem. Separar por equipe, por exemplo vendas e pós-venda, ajuda a comparar resultados de forma justa.',
  'equipes/botao':
    'Vamos montar uma equipe. O botão Criar equipe abre um formulário bem curto, só com o nome e o supervisor responsável.',
  'equipes/criar':
    'Escreva o nome da equipe e escolha o supervisor. A lista de supervisores vem das pessoas já identificadas nas conversas. Depois clique em Criar. Se preferir fazer isso mais tarde, use pular este passo.',
  'equipes/depois':
    'A equipe nova já está na lista, com o supervisor escolhido, mas ainda sem atendentes. Para colocar pessoas nela, vá em Membros, abra o menu da linha e use Definir equipe. Se um dia a equipe deixar de existir, desative em vez de apagar: o histórico continua guardado.',

  // ── 10. Relatórios ──
  'relatorios/abrir':
    'Os Relatórios levam os números do sistema para fora dele, para uma reunião, para a contabilidade ou para quem não usa o Atende Radar. Clique em Relatórios no menu.',
  'relatorios/exportar':
    'Os botões de Indicadores baixam os números do painel em planilha, num arquivo do Excel ou num formato para outros sistemas. É útil para montar a sua própria análise. Só lembre que cada exportação conta no limite mensal do seu plano.',
  'relatorios/abas':
    'Duas abas organizam esta tela. Tipos de Relatório traz os modelos prontos. Histórico guarda o que já foi gerado, e de lá você pode reenviar um relatório ou tentar de novo um envio que falhou.',
  'relatorios/tipos':
    'Cada cartão é um modelo de relatório. Ele mostra se há envio agendado, quando foi a última execução e quantas pessoas recebem. Assim você confere de relance se o relatório da semana realmente saiu.',
  'relatorios/gerar':
    'Vamos gerar um relatório agora. Clique em Gerar agora em qualquer cartão. Ele cobre os últimos sete dias e vai para o Histórico, e o aviso que aparece tem um botão para abrir na hora.',
  'relatorios/configurar':
    'Em Configurar você agenda o relatório para sair sozinho, no horário de Brasília, e escolhe quem recebe, um e-mail por linha. O relatório vai anexado em arquivo para impressão. Por exemplo, mande toda segunda de manhã para os sócios. O envio só acontece quando o servidor tem e-mail configurado; sem isso, ele fica na fila e aparece no Histórico.',

  // ── 11. Configurações ──
  'configuracoes/abrir':
    'As Configurações ensinam o sistema a medir do jeito da sua empresa. Um horário de atendimento errado, por exemplo, faz parecer que a equipe demorou quando a loja estava fechada. Clique em Configurações no menu.',
  'configuracoes/abas':
    'Cada aba cuida de um assunto. Em Atendimento fica o tempo de resposta combinado: dez minutos para a primeira resposta e trinta para continuar a conversa, se você não mudar. Em Financeiro ficam o ticket médio, a taxa de conversão e um teto por conversa, que alimentam o valor em risco. Ajuste esses números à sua realidade: se o seu ticket médio é de trezentos reais, o padrão de mil e quinhentos vai exagerar o valor em risco.',
  'configuracoes/limites':
    'Uma transparência importante: a aba Análise guarda preferências para quando a análise por inteligência artificial for ligada, mas hoje ela não muda o resultado. Em Notificações você controla os alertas por e-mail: o resumo, que junta vários alertas num e-mail só para não lotar a caixa de entrada, e o horário de silêncio. Os alertas críticos podem chegar mesmo no silêncio. A lista de destinatários fica guardada para uso futuro: hoje o e-mail vai para quem enxerga o alerta.',
  'configuracoes/webhook':
    'O webhook é um aviso automático para outro sistema seu: quando um alerta é criado ou resolvido, o Atende Radar avisa, por exemplo, o seu sistema de vendas. Já a Auditoria registra quem mudou o quê e quando, para você nunca ficar sem saber por que uma configuração mudou.',
  'configuracoes/salvar':
    'Escolha uma aba, por exemplo Atendimento, revise os valores e clique em Salvar. Cada aba é salva separadamente, então lembre de salvar antes de trocar de aba. Se não quiser mudar nada agora, pode pular este passo.',
  'configuracoes/depois':
    'O aviso no canto da tela confirma que salvou. As mudanças de tempo de resposta, horários e valores passam a valer nas próximas análises das conversas, não reescrevem o passado de uma vez. E a mudança fica registrada na Auditoria, com o seu nome.',

  // ── 12. Planos ──
  'planos/abrir':
    'Em Planos você acompanha a sua assinatura. Toda empresa nova começa com catorze dias de teste grátis, tempo suficiente para ver o sistema funcionando com as suas próprias conversas. Clique em Planos no menu.',
  'planos/uso':
    'Este quadro mostra quanto você já usou de cada limite do plano neste mês. Fique de olho quando chegar perto do fim: é o sinal de que a sua operação cresceu e talvez valha comparar os planos logo abaixo.',
  'planos/comparar':
    'Aqui você compara os planos e escolhe o ciclo, mensal ou anual. O pagamento é feito com cartão, numa tela de pagamento do próprio sistema. Se cancelar, nada é cortado na hora: o plano continua valendo até o fim do período já pago. As faturas ficam listadas nesta mesma tela.',

  // ── 13. Privacidade ──
  'privacidade/aba':
    'As conversas dos seus clientes são dados pessoais, e a Lei Geral de Proteção de Dados exige cuidado com eles. As regras de privacidade ficam na aba Privacidade, dentro das Configurações. Clique nela.',
  'privacidade/retencao':
    'Aqui você decide por quanto tempo guardar cada coisa: o conteúdo das conversas, os dados gerais e os anexos. Guardar só o necessário reduz o risco. O mascaramento esconde números de documento e de cartão nas análises. Você também pode listar números que nunca devem ser monitorados, como o de um sócio, e informar a base legal e o contato do responsável pela proteção de dados na empresa.',
  'privacidade/titular':
    'Quando um cliente pedir para ver ou apagar os dados dele, é um direito garantido por lei, e você resolve por aqui. Abra a conversa desse cliente e use o menu Privacidade. Dá para exportar todos os dados dele num arquivo, parar de monitorar aquele contato ou apagar os dados de vez.',
  'privacidade/encerrar':
    'Na zona de perigo, o administrador pode pedir a exclusão da empresa inteira. Para evitar acidentes, o sistema pede a senha e o nome da empresa. Depois do pedido, ainda há sete dias para mudar de ideia. Passado esse prazo, os dados são apagados de forma definitiva.',

  // ── 14. Central de ajuda ──
  'ajuda/abrir':
    'Bateu uma dúvida? A Central de ajuda é o primeiro lugar para procurar, com respostas na hora, a qualquer momento. Clique em Precisa de ajuda, no rodapé do menu.',
  'ajuda/guias':
    'Aqui ficam os guias passo a passo: este manual, o guia rápido da tela em que você estava e o tour de boas-vindas. O link Status do serviço mostra se o sistema está funcionando normalmente. Antes de abrir um chamado por lentidão, vale dar uma olhada nele.',
  'ajuda/artigos':
    'Os artigos explicam cada conceito em linguagem simples. Busque por palavras como valor em risco, conectar o WhatsApp ou cancelar. Muitas vezes a resposta está a uma busca de distância.',
  'ajuda/suporte':
    'Se não encontrar a resposta, fale com o suporte. Descreva o problema e, se puder, anexe uma captura da tela: isso acelera muito o atendimento. A versão do sistema e a tela em que você estava vão junto automaticamente. A resposta chega no seu e-mail, e os seus chamados ficam listados logo abaixo do formulário.',

  // ── 15. Admin ──
  'admin/abrir':
    'Este capítulo é para a equipe que opera a plataforma Atende Radar. O painel Admin mostra todas as empresas clientes de uma vez, e só aparece para quem tem esse acesso. Clique em Admin no menu.',
  'admin/kpis':
    'Estes números dão a saúde da plataforma: quantas empresas e pessoas usam o sistema e o volume de uso geral. É o primeiro lugar para perceber crescimento ou uma queda fora do normal.',
  'admin/abas':
    'Nas abas você aprofunda. Em Organizações, abre uma empresa para ver e ajustar a assinatura. Usuários globais lista as pessoas de todas as empresas, e Sistema mostra a situação do servidor. Produto traz ativação, retenção, uso por tela e a taxa de conclusão dos tours, inclusive deste manual. E Suporte reúne os chamados dos clientes, que você marca como resolvidos ou reabre.',
}

/**
 * Destaque acompanhando a voz (mesma chave): a partir de cada trecho, a região (menu, topo) ou o item do passo fica em
 * foco. Antes do primeiro trecho, e com a voz parada, o foco é o item. O trecho precisa existir na narração (teste).
 */
export const NARRATION_CUES: Record<string, NarrationCue[]> = {
  'primeiros-passos/menu': [
    { at: 'Este é o menu lateral', focus: 'area' },
    { at: 'o destacado agora, Visão Geral', focus: 'target' },
    { at: 'Repare que o menu muda', focus: 'area' },
  ],
  'primeiros-passos/busca': [
    { at: 'no alto da tela', focus: 'area' },
    { at: 'Quando um cliente liga', focus: 'target' },
  ],
  'primeiros-passos/onde-fica': [
    { at: 'no rodapé do menu', focus: 'area' },
    { at: 'Lá você vê a lista', focus: 'target' },
  ],
}
