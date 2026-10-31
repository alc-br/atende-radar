# UX e design do CRM comercial (F4 e F5)

Como as telas do CRM foram desenhadas para parecer parte do AtendeRadar, e o que prova isso. Regra de base: o guia
`docs/design/guia-de-ui.md` vale para o CRM do mesmo jeito que para o resto do painel. Nenhum componente, tela ou estilo
do Open Mercato foi usado (ADR-001, decisão B).

## 1. Regras seguidas

| Regra | Como ficou |
|---|---|
| Mesma linguagem visual | só as classes reais do painel (`cartao`, `bloco`, `cab-pagina`, `btn`, `tag`, `aviso`, `vazio`, `tabela-wrap`, `segmentado`, `paginacao`, `contador-pill`) e os componentes de `src/components/ui/` |
| CSS novo num lugar só | tudo em `src/styles/painel-ajustes.css`, com escopo `.ar .crm-*` e só com tokens de `painel.css`: nenhum hex, nenhum `!important`. `painel.css` e `conta.css` não mudaram |
| Mesmos cortes de tela | 1024, 720 e 480 px, como o painel; `prefers-reduced-motion` respeitado no quadro |
| Quem não usa não paga | as telas do CRM entram por `next/dynamic` em `src/app/page.tsx`. Empresa sem CRM não baixa o código delas |
| Menu | seção "Comercial" no menu lateral só com `crm.enabled` ligado e só com os itens que o papel pode abrir (`canOpenView`) |
| Diálogos | `DialogTitle` e `DialogDescription` sempre; o "X" diz "Fechar" (era "Close" no componente compartilhado: corrigido em `dialog.tsx` e `sheet.tsx`, vale para o painel todo) |
| Telefone | sempre mascarado (`•••• 1234`); o número completo só sai na exportação, com pedido, confirmação e auditoria |
| Valor | o valor declarado e a estimativa tirada da conversa nunca se somam. A estimativa aparece como "Estimado: R$ …" com o aviso "não é receita" |
| D3 | nenhum botão envia mensagem. O tipo de tarefa "WhatsApp (fora do AtendeRadar)" só registra um contato feito por fora, e o diálogo diz isso |

## 2. Telas

| Tela (`view`) | O que mostra | Ações principais |
|---|---|---|
| Visão comercial (`crm-overview`) | "Comece por aqui", negócios abertos por etapa, por responsável, motivos de perda, tarefas atrasadas, negócios parados e a estimativa (separada, "não é receita") | ir para Negócios e Tarefas |
| Negócios (`crm-deals`) | quadro por etapa (Kanban) ou lista paginada; filtros de busca, responsável e situação | novo negócio, mover de etapa, abrir |
| Detalhe do negócio | resumo, edição, histórico, conversas vinculadas, tarefas | mover, marcar como ganho ou perdido, reabrir (diálogo «Reabrir negócio» com o motivo obrigatório, que aparece na linha do tempo com as quebras de linha), arquivar |
| Contatos (`crm-contacts`) | pessoas do CRM (separadas dos contatos observados, D4) | novo contato, importar CSV, exportar |
| Detalhe do contato | dados, negócios, conversas no WhatsApp, tarefas | editar, mesclar com outro contato |
| Empresas (`crm-companies`) e detalhe | dados da empresa, pessoas e negócios dela | nova empresa, editar |
| Tarefas (`crm-activities`) | filtros Abertas, Hoje, Próximos 7 dias, Atrasadas, Concluídas e Todas, no escopo de quem vê. Hoje e Próximos 7 dias contam o dia no fuso da empresa (aviso quando o navegador está em outro fuso); prazos e campos de data também seguem o fuso da empresa | criar, editar («Editar tarefa»: título, responsável para quem pode atribuir, Aberta ou Em andamento, prioridade, observações), reagendar, concluir, cancelar |
| Ajustes do CRM (`crm-settings`) | funis e etapas, automações (desligadas por padrão), saúde da sincronização e eventos parados | editar funil, ligar automação, reprocessar evento parado |
| Conversa (F5) | bloco "Negócios relacionados", logo depois de "Classificação" | abrir no CRM, criar tarefa para o negócio |
| Alertas (F5) | botão "Tarefa no CRM" em cada alerta ativo | criar tarefa ligada ao alerta |
| Recuperação (F5) | item "Criar tarefa no CRM" no menu de cada linha | criar tarefa ligada ao item |

Com o CRM desligado, nada disso aparece: nem o menu, nem o bloco da conversa, nem os botões de tarefa
(`crm-f5.ui.spec.ts`, segundo teste).

## 3. Quadro de negócios

Três caminhos para trocar a etapa, todos com o mesmo resultado no servidor (`POST /api/crm/deals/:id/stage` com a
versão do negócio):

1. **Arrastar** pela alça do cartão (ponteiro e toque). A alça é a única origem do arraste; o resto do cartão continua
   clicável e selecionável.
2. **Teclado**: foco na alça, Espaço ou Enter pega, setas para a esquerda e para a direita trocam de coluna, Espaço ou
   Enter solta, Esc cancela. Os anúncios para leitor de tela são em português e dizem o negócio e a etapa.
3. **Botão "Mover"** com o menu "Mover para a etapa". Funciona em qualquer largura e é o caminho que o guia da tela
   mostra. Depois de mover, o foco volta ao botão "Mover" do cartão, que agora está em outra coluna.

A troca aparece na hora (otimista). Se o servidor recusar, o cartão volta para onde estava e a mensagem diz por quê;
conflito de versão, negócio que sumiu ou transição inválida recarregam o quadro. Nenhum negócio muda de etapa sozinho
(D2): a sugestão de etapa é uma sugestão, que uma pessoa aceita ou dispensa.

## 4. Estados de cada tela

Como no guia (seção "Estados de uma tela"):

- **Carregando**: esqueleto do tamanho do conteúdo, com `aria-busy` e um texto só para leitor de tela.
- **Vazia**: diz o que é a coisa e como ela aparece, com a ação para criar a primeira. Ex.: "Nenhum negócio aberto".
- **Com erro**: "Não foi possível carregar …" e "Tentar novamente".
- **Dado antigo**: se a atualização falha com dado já na tela, um aviso âmbar diz que é a última versão carregada.

## 5. Textos

Português simples, frases curtas, o verbo da ação no botão ("Criar negócio", "Confirmar ganho", "Criar tarefa").
"Tentar novamente" em toda falha (teste `ui-text.unit.spec.ts`). As telas não prometem o que o servidor não faz: os
textos das automações foram conferidos com `consumer.ts` (ex.: a sugestão de etapa nunca volta etapa nem move sozinha),
e a opção "Avisos do CRM" saiu da tela de Ajustes: a flag `crm.notifications` existe no servidor, mas nada gera aviso a
partir dela (seção 10).

## 6. Acessibilidade

Um `h1` por tela; diálogos com título e descrição; regiões que rolam (quadro e tabelas) são focáveis e têm nome;
etiquetas de situação têm texto além da cor; campos com `Label`; erros de formulário com `role="alert"`; botões
repetidos (um por negócio ou por linha) têm nome próprio ("Abrir no CRM: …", "Ações para …", "Mover … para outra
etapa").

Verificado com axe (WCAG 2.1 A e AA, falha em crítico e sério) nas 6 telas do CRM, nos 3 detalhes, no diálogo de novo
negócio, no diálogo de tarefa e no bloco de negócios relacionados, em tema claro e escuro, no desktop e no celular
(`crm.ui.spec.ts` e `crm-f5.ui.spec.ts`). Resultado na seção 9.

## 7. Larguras

O quadro rola para o lado dentro da própria região (com `scroll-snap`); a página não. O teste
`crm.ui.spec.ts` › "nenhuma tela rola para o lado" abre as 6 telas em 320, 375, 768, 1024, 1440 e 1920 px e falha se a
página inteira passar da largura da janela.

Duas correções saíram desse teste (só em `painel-ajustes.css`, escopo do CRM):

- **Quadro de negócios:** o texto só para leitor de tela dos cartões (`sr-only`, `position: absolute`) tomava como
  referência um ancestral fora da área que rola; os das colunas fora da vista esticavam a página 530 px para o lado.
  `.crm-quadro` e `.crm-coluna__lista` ganharam `position: relative`.
- **Visão comercial:** o cartão "Negócios abertos por etapa" crescia junto com o gráfico e a tabela de dentro
  (`min-width: auto` de item de grade) e a página rolava 377 px em 320 e 322 px em 375. As grades do CRM levam a
  classe `crm-grade`, e `.crm-grade > *` tem `min-width: 0`.

Revisão visual das capturas da interface nº 6 (31/10), feita olhando cada tela em 1280 px e no celular. O teste de
larguras passava em todas, porque nada rolava a página; os defeitos estavam dentro dos cartões. Correções só em
`painel-ajustes.css`, mais uma classe em `overview-view.tsx`:

- **Visão comercial, indicadores:** em 1280 px as 6 colunas deixavam uns 120 px para o valor, e "R$ 2.500,00" quebrava
  no meio do número ("R$ 2.500,0" e "0"). `.crm-kpis` passou a 3 colunas até 1799 px e 6 a partir de 1800, 2 no celular
  (valor em 18 px) e 1 até 360 px.
- **Visão comercial, tabelas:** "Negócios abertos por etapa" (5 colunas) e "Por responsável" (4) dividiam a linha, e as
  tabelas ficavam cortadas ("Estimativa (não é r…"), rolando dentro do cartão. Agora ficam uma embaixo da outra até
  1799 px (`.crm-visao__tabelas`).
- **Detalhe do negócio, Tarefas:** na coluna lateral (uns 380 px) os botões Concluir, Reagendar e Cancelar ficavam ao
  lado do título e o cobriam. Na lista compacta (`.crm-tarefas--compacta`, também usada no detalhe do contato) os
  botões vão para baixo do texto.
- **Detalhe do negócio, alinhamento:** no Resumo, "Sem estimativa" ficava mais baixo que "R$ 2.500,00" ao lado; em
  "Editar negócio", o select da Prioridade ficava mais baixo que o campo Valor declarado. Causa nos dois: o item de
  grade esticava até a altura do vizinho com nota embaixo, e a grade interna distribuía a sobra. `.crm-dados > div` e
  `.crm-edicao > .campo` ganharam `align-content: start`.

## 8. Guias e ajuda

- Guia da tela de negócios (`crm-deals` em `src/lib/tours.ts`): menu Comercial, novo negócio, quadro, botão Mover,
  sugestões. Abre na primeira visita; o detalhe do negócio usa o mesmo guia em "Guia desta tela".
- Duas correções no guia, que valem para todos os guias do painel (`tour-overlay.tsx`, F9-03):
  - O cartão vai para o outro lado do alvo quando não cabe no lado pedido. Antes, em 1280×800, o cartão do passo
    "Mudar de etapa" ficava cortado no pé da tela e o "Próximo" não dava clique.
  - Quando o último alvo não está na tela (as sugestões só aparecem quando existem), o guia termina como concluído e
    fica gravado no servidor, desde que tenha mostrado ao menos um passo. Antes, ele voltava a cada carga.
  - Prova em `crm-telas.ui.spec.ts`, no teste do CRM-10: o "Próximo" fica inteiro na tela em todos os passos e o guia
    não volta depois de recarregar.
- Artigo "CRM comercial" na Ajuda (`src/content/ajuda.ts`): o que é, quem vê o quê, automações desligadas por padrão,
  telefone mascarado, exportação. Na F9 ganhou a agenda (Hoje e Próximos 7 dias no fuso da empresa, "em andamento" conta
  como aberta, quem pode trocar o responsável) e a reabertura com motivo, que fica no histórico do negócio.
- Só o quadro de negócios tem guia próprio. Contatos, empresas, tarefas, Visão comercial, ajustes e importação não têm, e
  o guia geral do sistema (`system-tour`) não tem capítulo do CRM (§ 10).

## 9. Evidência

Números e comandos em `08-testes-e2e.md` § 3. Em resumo, na rodada de 31/10/2026:

| O que | Onde | Resultado |
|---|---|---|
| Quadro (criar, mover pelo menu, teclado e arrastando, ganho e perda), F5 e axe nas 6 telas, 3 detalhes e diálogo, em claro e escuro | `crm.ui.spec.ts`, `crm-f5.ui.spec.ts`, Chromium desktop | 6 passaram |
| Os mesmos fluxos no celular (gaveta, sem arrastar) | ui-mobile | 5 passaram, 1 pulado (a varredura de larguras roda só no desktop) |
| Firefox, Safari (WebKit) e iPhone (WebKit) | `CROSS_BROWSER=1` | `crm.ui` e `crm-f5.ui`: 17 passaram, 1 pulado (varredura no iPhone). Todas as telas do CRM (8 arquivos `crm*.ui`): 92 passaram, 2 falharam por espera do teste do quadro, 2 pulados; corrigido o teste, `crm.ui` duas vezes em Chromium, Firefox, WebKit e iPhone: 38 passaram, 2 pulados |
| Nenhuma rolagem lateral em 320, 375, 390, 768, 1024, 1440 e 1920 px | `crm.ui.spec.ts` › larguras | passou em Chromium, Firefox e Safari |
| Liga e desliga no Admin | `admin-crm.ui.spec.ts` | 1 passou |
| Interface por requisito (F9): contatos e empresas, ajustes e Visão comercial, importação, exportação e sugestões, reabertura com motivo, agenda e edição de tarefa, menu por papel e guia | `crm-contatos.ui`, `crm-ajustes-visao.ui`, `crm-dados-sugestoes.ui`, `crm-reabrir.ui`, `crm-agenda.ui`, `crm-telas.ui`, `crm.ui`, desktop e celular | 58 passaram, 2 pulados (menu por papel e larguras, só no desktop) |

Capturas da rodada final em `docs/crm/screenshots/` (telas antigas antes do CRM em `screenshots/baseline/`).

## 10. Pendências de UX (documentadas, não bloqueiam)

| Item | Efeito | Proposta |
|---|---|---|
| 409 durante a edição do negócio | o formulário recarrega com a versão nova e quem editava perde o que digitou (fica o aviso) | guardar o rascunho por cima da versão nova (decisão de produto) |
| Ganho sem valor num negócio que já tem valor | é preciso apagar o valor em "Editar negócio" antes | confirmar com o produto se o fechamento deve limpar o valor |
| Dica do "Confirmar ganho" | a frase com `aria-live` aparece de forma condicional; nem todo leitor de tela anuncia | o botão continua desabilitado, então não há envio errado |
| Seletor de empresa | lista até 100 empresas | busca no servidor quando alguma empresa passar disso |
| Telefone mascarado | o leitor de tela lê "ponto ponto ponto ponto 1234" | texto só para leitor de tela "final 1234" |
| Funções repetidas entre `deals-view` e `deal-detail` | manutenção | juntar em `src/lib/crm/ui-helpers.ts` |
| "Avisos do CRM" (`crm.notifications`) | a flag existe no servidor, mas nada gera aviso a partir dela; a opção saiu da tela de Ajustes para não prometer o que não acontece | ligar à central de avisos (tarefa vencendo, sugestão nova) e voltar a mostrar a opção |
| Mensagem de conflito (409) no servidor | o `message` da API diz "Recarregue e tente de novo". A tela não o mostra: usa o texto próprio de `crmErrorMessage` ("A versão atual foi carregada: confira e tente novamente") | alinhar o texto da API com o da tela |
| Visão comercial | os nomes de responsável vêm da lista de membros da empresa, não da resposta | mandar `members` na resposta, como já fazem as listas |
| Guias das outras telas do CRM | só Negócios tem guia; o guia geral do sistema não passa pelo grupo Comercial (CRM-10 pede guia por tela) | guias curtos de Contatos, Tarefas e Visão comercial, e um capítulo do CRM no guia geral |
| Etiquetas | a API grava e devolve etiquetas, mas a tela não edita nem filtra por elas | campo de etiquetas no contato e filtro na lista |
| Arquivados | contato, empresa e negócio arquivados somem das listas; não há filtro "Arquivados" nem "Reativar" | filtro e ação de reativar, auditada |
| Visão comercial sem detalhamento | os números não abrem a lista filtrada; "Negócios parados" abre a lista sem filtro | cada número abre a lista com o mesmo filtro |
| Avisos ao responsável | tarefa vencendo e sugestão nova não geram aviso (mesmo item de "Avisos do CRM") | central de avisos |
