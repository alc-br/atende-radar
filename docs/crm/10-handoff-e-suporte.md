# CRM — passagem e suporte

Para quem atende o cliente ou cuida da operação depois da entrega. Como ligar o CRM, o que ele faz e o que não faz,
como responder às dúvidas mais comuns e onde olhar quando algo dá errado.

Documentos técnicos: `04-api-crm.md` (contrato), `05-sincronizacao.md` (fila), `07-seguranca-e-privacidade.md`,
`09-deploy-e-rollback.md` (ligar, desligar, desfazer).

## 1. O que é, em uma frase

Um CRM comercial dentro do AtendeRadar: contatos, empresas, funil de negócios (Kanban), tarefas e uma visão comercial,
alimentados pelas oportunidades que o AtendeRadar já detecta nas conversas, como **sugestões** que uma pessoa aceita
ou descarta.

## 2. O que ele não faz

Respostas prontas para o cliente:

| Pergunta | Resposta |
|---|---|
| "O CRM manda mensagem pelo WhatsApp?" | Não. O AtendeRadar só observa o WhatsApp. A tarefa "WhatsApp (fora do AtendeRadar)" é um lembrete para a pessoa fazer no próprio celular |
| "Ele cria negócio sozinho?" | Não, por padrão. A conversa vira sugestão. Criar sozinho é uma opção que o admin da empresa liga em Ajustes do CRM |
| "O valor estimado é receita?" | Não. O estimado vem do que foi dito na conversa e aparece separado, com o aviso "não é receita". Receita é o valor declarado por uma pessoa no negócio ganho |
| "Por que não vejo o menu Comercial?" | O CRM é liberado empresa por empresa pela ALC. Sem liberação, o menu não aparece. Com liberação, cada papel vê só o que pode (seção 3) |
| "Copiou as mensagens dos meus clientes para o CRM?" | Não. O CRM guarda ligações (qual conversa, qual oportunidade), nunca o texto das mensagens |

## 3. Quem vê o quê

| Papel | Visão comercial | Contatos, empresas, negócios, tarefas | Ajustes do CRM e funis | Mesclar contatos | Importar, exportar, reprocessar fila |
|---|---|---|---|---|---|
| Admin | sim | tudo | sim | sim | sim |
| Gestor | sim | tudo | sim | sim | não |
| Supervisor | sim | a equipe e os sem dono | não | não | não |
| Atendente | só os números dele | só o que é dele | não | não | não |
| Analista | sim | não | não | não | não |
| Visualizador | sim | não | não | não | não |
| Membro sem papel definido | não | não | não | não | não |

Fonte: `src/lib/permissions.ts` (`crm.*`) e `src/lib/crm/scope.ts`. A visão comercial usa o mesmo escopo das listas.
O servidor decide; esconder o botão é só conforto.

## 4. Ligar para um cliente

Só a ALC liga, e só com o OK do dono para aquela empresa. Passo a passo em `09-deploy-e-rollback.md` § 3.

Depois de ligar:

1. Peça para a pessoa recarregar o painel. O grupo "Comercial" aparece no menu lateral.
2. O funil "Funil comercial" já vem com 5 etapas (Novo interesse, Qualificação, Proposta/orçamento, Negociação,
   Aguardando cliente). Ganho e perdido não são etapas: são o fechamento do negócio.
3. Em até 15 s, as oportunidades das conversas dos últimos 30 dias começam a aparecer como sugestões.
4. As opções extras (criar negócio sozinho, sugerir etapa, exportação) começam desligadas. O admin da empresa
   liga em Ajustes do CRM.

## 5. Dúvidas e erros comuns

| O que a pessoa vê | Por quê | O que fazer |
|---|---|---|
| "Alguém alterou este registro enquanto você editava" | outra pessoa salvou antes (versão) | a tela já carrega a versão atual: conferir e salvar de novo. Nada foi perdido |
| "Muitas ações seguidas. Aguarde um minuto" | limite de 120 gravações por minuto por pessoa, ou 10 importações, exportações e mesclas por minuto | esperar um minuto |
| "O CRM comercial está desligado nesta empresa" | a liberação foi tirada, ou o CRM foi desligado em todas (`CRM_DISABLED`) | conferir com a operação (§ 6). Os dados continuam guardados |
| "Registro não encontrado" | arquivado, de outra pessoa (para atendente) ou de outra empresa | conferir o papel e o dono do registro |
| Ganho pede valor ou confirmação | regra: ganho sem valor só com "fechou sem valor" marcado | informar o valor ou marcar a confirmação |
| Perda pede motivo | regra: perda sempre com motivo da lista | escolher o motivo |
| Contato duplicado recusado | o mesmo telefone já existe na empresa | a mensagem traz o contato que já existe; abrir ou mesclar |
| Sugestão sumiu | aceita, descartada ou vencida (sugestão tem validade) | aceitar ou descartar a tempo; vencida não volta |
| Exportar sem telefone completo | o telefone completo só sai para o admin, com a opção de exportação ligada e confirmação, e fica registrado | é o comportamento esperado (LGPD) |

## 6. Onde olhar quando algo dá errado

- **Saúde da sincronização da empresa:** Ajustes do CRM (admin ou gestor), que lê `GET /api/crm/integration/status`:
  fila pendente, com falha e parada, última captura e última reconciliação.
- **Evento parado:** o admin reprocessa na mesma tela (`POST /api/crm/integration/dlq/<id>/retry`, auditado).
- **Log do servidor** (`journalctl -u atende-radar.service`): o erro do CRM é uma linha `[crm] <requestId> <tipo>
  <código>`. A pessoa vê o mesmo `requestId` na resposta; peça para ela mandar esse código. O log não tem dado de
  cliente.
- **Auditoria** (Configurações › Auditoria): toda gravação do CRM, com ação `crm.*`, quem fez e quando.
- **Desligar com urgência:** `09-deploy-e-rollback.md` § 4.

## 7. Pedidos de dados (LGPD)

- **Exportação dos dados da empresa** (já existente): leva também o CRM (configurações, empresas, pessoas, funis,
  negócios com histórico, tarefas e sugestões).
- **Exclusão da empresa** (já existente): apaga as tabelas do CRM junto. O teste que confere tabela por tabela está na
  matriz da F7.
- **Uma pessoa pede para sair:** hoje o CRM só arquiva o contato (some das listas, os dados ficam). Arquivar não mexe
  no contato do WhatsApp, e o contrário também vale (são registros ligados, mas separados). Apagar ou anonimizar um
  contato a pedido do titular **não existe ainda**: pendência P2 abaixo.

## 8. Antes de ligar para clientes de verdade

A especificação (seção de LGPD) pede que a política de privacidade, os direitos do titular e a transparência do uso de
IA sejam revistos antes de ativar um tratamento novo de dados. O CRM é um tratamento novo (organiza contatos e
oportunidades comerciais). Mudar política ou termo não está autorizado para a equipe técnica: **fica com o dono**.

| # | Pendência | Dono |
|---|---|---|
| P1 | Revisar a política de privacidade e os termos para o CRM comercial | dono do produto (jurídico) |
| P2 | Apagar ou anonimizar um contato do CRM a pedido do titular (hoje só arquiva) | produto, depois técnico |

## 9. O que está em aberto na entrega

Ver as pendências de `07-seguranca-e-privacidade.md` § 7, de `09-deploy-e-rollback.md` § 7 e o resultado da
homologação em `QA-MESTRE-RESULTADO.md`.

Do lado do produto, fora das listas acima:

| # | Pendência | Situação |
|---|---|---|
| H1 | Desfazer uma importação de contatos inteira (a especificação pede "reversão de lote", CRM-11) | cada contato e empresa importado guarda o lote (`importBatchId`); falta a ação de desfazer |
| H2 | Desfazer uma mescla de contatos (CRM-01, "merge/undo") | a mescla guarda em `mergeDataJson` o que foi movido e deixa o contato com `status = merged`; não há ação nem rota de desfazer |
| H3 | Contato e empresa arquivados (CRM-01) | a API lista com `status=archived`, mas a tela de contatos não tem o filtro e nenhum dos dois tem "Reativar". Negócios arquivados têm filtro na tela |
| H4 | Campos do cadastro pedidos no CRM-01 e no CRM-09 | faltam campos personalizados, preferências e consentimentos, base legal, mais de um telefone e e-mail por pessoa, limiar e filtros da criação automática e política de responsável |
| H5 | Etiquetas na tela (CRM-01) | a API grava e devolve; a tela não edita nem filtra |
| H6 | CNPJ em texto puro (`07-seguranca-e-privacidade.md`, S8) | decidir com o produto se cifra e mascara como o telefone |
| H7 | Importação de 10.000 linhas (T03.03) | o limite é 5.000 por envio (`importBody`); 10.000 linhas vão em dois envios. Provado com 1, 100 e 5.000 (`crm-matriz` › T03.03) |
| H8 | Exportação de empresas, tarefas e auditoria (CRM-11) | pela tela, só contatos e negócios exportam. A exportação da organização inteira (Admin) leva configuração, empresas, pessoas, funis, negócios com o histórico, tarefas, sugestões e, desde 31/10, os vínculos (`CrmBusinessLink` e `CrmIdentityLink`); ficam fora só as tabelas de operação da fila (outbox, inbox, checkpoints, chaves de idempotência e o vínculo da empresa) |
| H9 | Indicadores e relatórios do CRM-08 e do CRM-12 | a Visão comercial não abre a lista filtrada a partir de cada número, não tem conversão por etapa, tempo médio na etapa nem filtro por equipe, responsável, funil ou período; não há relatório por equipe, período ou origem, nem de efetividade das tarefas |
| H10 | Onboarding e guias (CRM-10) | só Negócios tem guia; faltam os guias de Contatos, Tarefas e Visão comercial, o passo a passo inicial ("Criar primeiro funil", "Importar contatos", "Criar primeiro negócio", "Associar conversa", "Acompanhar próxima tarefa") e o capítulo do CRM no guia geral (`src/lib/system-tour`) |
| H11 | Comentário e anexo no negócio (CRM-03) | não existem. Anexo pede armazenamento com controle de acesso e antivírus, que o app não tem |
| H12 | Lembretes de tarefa (CRM-04) | a flag `crm.notifications` existe, mas nada gera aviso nem e-mail; a opção saiu dos Ajustes |
| H13 | Automações do CRM-06 que faltam | tarefa por proposta sem retorno ou por promessa perto do prazo (hoje só alertas alto e crítico viram sugestão de tarefa), prioridade por risco e valor, sugestão de próximo contato, de texto para copiar e de checklist, e cota de automação por empresa |
| H14 | Papel do responsável | a criação e a troca de responsável conferem se a pessoa pode ver tarefas só nas tarefas; em negócios e contatos, qualquer membro ativo da empresa pode ser responsável (a conversão do sistema entrega ao membro da conversa) |
| H15 | Empresa de simulação e empresa de exemplo | `dealFromOpportunity` não recusa empresa de simulação, e a captura barra a de simulação mas não a de exemplo (demo). Nenhuma das duas tem o CRM ligado: o efeito só aparece se alguém ligar o CRM nelas |
| H16 | Evento na fila no instante do desligamento (T11.06; `07-seguranca-e-privacidade.md`, S9) | fica como processado sem efeito; ensaiar no canário com fila pendente |
| H17 | Canário em domínio real, smoke, telemetria e custo medidos, rollback ensaiado em produção (§ 14 da especificação) | depende de deploy e de liberação numa empresa real, que não estão autorizados nesta execução. O rollback foi ensaiado só em ambiente descartável (`09-deploy-e-rollback.md` § 4 e § 5) |
| H18 | RTO e RPO (§ 13.4 da especificação) | não estão definidos no projeto. Pelo calendário de backup, a perda máxima é de até um dia; o tempo de restauração não foi medido. Definir com o dono e medir no ensaio de restauração |
| H19 | Recuperação ligada ao negócio (CRM-07) | a tela de recuperação não mostra negócio, etapa, probabilidade, próxima tarefa, responsável nem histórico, e a tarefa criada nela vai sem negócio (sem vínculo). Não há o resultado "reunião marcada": o resultado do evento é texto livre. Fechar o negócio atualiza o item de recuperação só pelas conversas de origem e de oportunidade (`outcome.ts`); negócio ligado ao item só pela recuperação não o atualiza. A Visão comercial conta como recuperado todo ganho ligado a um item, mesmo "não recuperado" (a metodologia na tela avisa que mostra a ligação, não a causa). O histórico mostra texto fixo, sem o resultado |
| H20 | Saúde da sincronização (CRM-09, T11.04) | o status tem `operational`, `syncing` e `degraded`, sem `offline`. O Admin da plataforma mostra só ligado ou desligado e o kill switch, sem saúde, fila nem reconciliação por empresa. Não há alerta de atraso da fila, e o healthcheck do deploy não olha a fila do CRM |
| H21 | Eventos da captura e reconciliação (CRM-06, T07.07) | faltam os eventos de intenção detectada, mudança de qualificação, alerta atualizado (a recorrência reemite `alert.created`), recuperação criada e atribuída, desfecho confirmado por pessoa e contato atualizado. A reconciliação (`reconcileCrm`) reemite 7 dias de eventos e só conta divergências (vínculo órfão, oportunidade sumida, telefone duplicado, evento preso): não procura contato nem negócio órfão e não corrige nada |
| H22 | Bloco "Negócios relacionados" na conversa (CRM-05) | não mostra a pessoa e a empresa do CRM, a última atividade nem a próxima ação do negócio; o estado vazio não oferece criar negócio nem tarefa; "Ir para Negócios" abre a lista sem filtrar pela conversa; no negócio, "Voltar" leva a Negócios, não à conversa. "Contato feito externamente" é a tarefa do tipo "WhatsApp (fora do AtendeRadar)", sem ação própria |
| H23 | Funis, etapas e papéis pela tela (CRM-02, CRM-09) | probabilidade e SLA por etapa existem no banco e na API, mas a tela não os edita (o funil padrão vem sem SLA). Funis não são reordenados. Mudar de etapa não cria tarefa (a origem `stage` da tarefa não é usada). Os papéis são os do AtendeRadar, sem configuração própria do CRM |
| H24 | Tarefas (CRM-04) | o campo resultado não aparece na tela; a tela mostra "Só as minhas" ou a equipe toda, sem escolher outro responsável nem equipe (a API aceita `ownerMemberId`); concluir ou cancelar uma tarefa vai para a auditoria, não para o histórico do negócio; não há SLA de tarefa nem horário comercial (lembretes: H12) |
| H25 | Fuso nas telas (T04.08, T10.03) | a agenda de tarefas usa o fuso da empresa. As outras datas do CRM (negócio, contato, empresa, bloco da conversa) e os dias do período da Visão comercial usam o fuso de quem vê, como as telas de conversas e alertas. Para quem está no fuso da empresa, o resultado é o mesmo; nenhum teste cobre outro fuso nessas telas, nem UTC ou o horário de verão antigo na agenda |
| H26 | Importação e exportação, detalhes (CRM-11) | a importação não usa `Idempotency-Key` e não deduplica linha só com nome; o mapeamento de colunas é automático pelo cabeçalho; só o admin exporta, e sempre a empresa toda; não há retenção por objeto, e os backups guardam o CRM de uma empresa apagada até o backup sair do giro |
| H27 | Negócio: campos e ligações (CRM-03) | não há equipe nem origem da probabilidade. `amountSource` fica em `manual` ou `unknown`: o `inferred` previsto no modelo não é usado, porque a estimativa vai separada em `estimatedAmountCents`. Não há ação na tela para ligar uma conversa a um negócio que já existe, e a criação manual não avisa de negócio parecido aberto |
| H28 | Contatos: regras de identidade (CRM-01) | a conversão casa a pessoa só pelo telefone (`personFromContact`); não há detecção de prováveis duplicados além da chave exata; `lastInteractionAt` só é gravado quando a pessoa nasce de uma conversa e na mescla; não há regra para os números da própria empresa; a lista não filtra por origem; a mescla não é feita na tela por nenhum teste (o teste só confere o botão) |
| H29 | Testes que a suíte não tem (T01.07, T08.07, T09, T11.01, T11.02) | comparação visual automática no CI (hoje `scripts/visual/*` roda à mão); checagem de licenças e de pacote Enterprise no CI (`reports/licencas-baseline.md` é manual); aplicar as migrações duas vezes; quebrar um teste de propósito para ver o pipeline cair; leitor de telas real; redução de movimento, Escape e volta do foco nas telas do CRM; carregamento e erro de cada tela; IA ligada com falha e com injeção. O servidor instala sem `--frozen-lockfile` (`deploy.yml`, passo do servidor), ao contrário do CI |
