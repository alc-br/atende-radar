# CRM comercial — resultado da homologação técnica (QA mestre)

Relatório único pedido no § 13.1 da especificação mestre v1.0. Junta commit, ambiente, execuções, falhas, retestes,
rastreabilidade de cada requisito e de cada cenário, metas do § 13.4, checklist do § 14 e riscos residuais. Os números
vêm da saída dos comandos, registrada em `08-testes-e2e.md` § 3; este documento não traz resultado que não esteja lá.

## 1. Veredito

**HOMOLOGAÇÃO PARCIAL — PENDÊNCIAS DOCUMENTADAS**

A homologação é técnica, em ambiente local descartável, e não encontrou nenhuma das condições de reprovação
automática do § 14 (§ 8 abaixo). Não é total por três motivos, todos documentados: nenhum dos 12 requisitos está
completo (as lacunas H1–H29 estão no § 4 e em `10-handoff-e-suporte.md` § 9); três cenários do § 13.2 não têm teste
automático (T01.07, T07.07 e T08.07) e um fica fora do escopo técnico (T12.02); e o canário em produção, a revisão
jurídica e a definição de RTO e RPO dependem do dono (itens 13 e 15 do § 7, R8–R10). O CRM segue desligado em toda
empresa (D7) e nada foi publicado em produção.

## 2. Identificação

| Item | Valor |
|---|---|
| Branch | `crm/integracao` (fora da `main`; nada foi publicado em produção) |
| Base | `eac8042` (`origin/main` em 30/10/2026 16:56) |
| Commit homologado | `cf1aeb4` na branch `crm/integracao` (o código de produto é o mesmo da completa nº 5 e da direcionada seguinte; depois dela só mudaram documentos) |
| PR | [alc-br/atende-radar#3](https://github.com/alc-br/atende-radar/pull/3), para a `main`, sem merge automático |
| Arquitetura | nativa, B (`ADR-001-arquitetura-crm.md`): mesmo app, mesmo deploy, mesmo SQLite. Open Mercato descartado pela POC (`02-poc-open-mercato.md`) |
| Migrações | `20261031120000_crm_base` (16 tabelas `Crm*` e 45 índices, só `CREATE`) e `20261031140000_crm_indices_empresa` (2 índices, só `CREATE INDEX`). Nenhuma tabela existente muda |
| Flag | `crm.enabled` desligada em toda empresa (D7); `CRM_DISABLED=1` desliga para todas |
| Dependências novas | nenhuma (`package.json` e `bun.lock` iguais aos da `main`) |
| Máquina | Windows 11 Pro, 12 núcleos lógicos, Bun 1.3.14, Node 24.13 |
| App | Next.js 16.4.1 (`next dev` na porta 3111), React 19, Prisma 6.19.3 com SQLite (`prisma/test.db` recriado a cada execução, com o seed de teste) |
| Testes | Playwright 1.63 com axe; Chromium (desktop 1280×800, Pixel 7, iPad Mini), Firefox e WebKit (Safari de desktop e iPhone 14) |
| Dados | só sintéticos (seed de teste e `scripts/carga/`); nenhum dado de cliente |

## 3. Execuções

Comandos e detalhes em `08-testes-e2e.md` § 1 e § 3. Todas em 31/10/2026, no worktree `crm`, um Playwright por vez.

| Rodada | Quando | Resultado |
|---|---|---|
| Completa nº 3 | 31/10 | 2554 passaram, 7 falharam (1 de produto, corrigida; 6 tempo esgotado com a CPU tomada), 14 pulados |
| Completa nº 4 (código da F9) | 31/10, 08:03–09:20 | 3040 passaram, 4 falharam (tempo esgotado à espera do tick global; 2 já falhavam na F0), 57 pulados, 11 não rodaram. Causa no CRM do tick, corrigida |
| Direcionada depois da correção do tick | 31/10 | 126 passaram, sem falha (os 4 da nº 4 entre eles) |
| Comparação visual final | 31/10, 09:47–10:01 | `design.ui` 12 passaram, 9 pulados; `a11y.ui` 5 passaram; 121 capturas das telas antigas comparadas com a F0 |
| Outros navegadores, todas as telas do CRM | 31/10, 10:10–10:39 | Firefox, WebKit e iPhone: 92 passaram, 2 falharam (espera do teste do quadro), 2 pulados |
| Direcionada depois da verificação da rastreabilidade | 31/10, 10:47–10:55 | 124 passaram, 1 falhou (checagem nova do teclado, ajustada no teste) |
| Quadro em quatro navegadores | 31/10, 10:57–11:18 | Chromium, Firefox, WebKit e iPhone, duas vezes cada: 38 passaram, 2 pulados, sem falha |
| Direcionada depois da revisão do T05.07 | 31/10, 11:34–11:40 | 120 passaram, sem falha (3 testes novos e 1 reforçado da tarefa por causa) |
| Completa nº 5 (commit homologado) | 31/10, a partir de 11:42 | 3046 passaram, 12 falharam, 57 pulados, 11 não rodaram (1,2 h). 8 falhas: limite de cadastro por IP (429) nos testes do CRM no celular, corrigido no teste; 4: espera do tick global, as mesmas de antes; os 11 são do `nfse` em modo serial |
| Direcionada das falhas da nº 5 | 31/10, 12:59–13:11 | 72 passaram, 2 pulados, sem falha: os 12 que falharam e os 11 que não rodaram, com os arquivos inteiros |

Rodadas menores (interface por tela, matriz, contrato da API, carga, T07.01 com 100 entregas) estão na mesma tabela
do `08-testes-e2e.md` § 3.

Retestes: toda falha teve causa registrada (`08-testes-e2e.md` § 3, "O que as falhas dessas rodadas ensinaram"). As
falhas de produto foram corrigidas antes da rodada seguinte; as de tempo esgotado repetiram sem mudança de código depois
de liberar a CPU.

## 4. Rastreabilidade dos requisitos CRM-01 a CRM-12 (§ 13.1)

Para cada requisito: um teste positivo, um negativo (autorização ou dado inválido) e um de interface, quando a
interface existe. "Lacuna" é o que a especificação pede e o produto não faz; cada uma tem número em
`10-handoff-e-suporte.md` § 9.

| Requisito | Positivo | Negativo | Interface | Situação | O que falta (lacunas) |
|---|---|---|---|---|---|
| CRM-01 · Contatos (pessoas) e empresas | 11 (`crm-api:92` …) | 16 (`crm-api:163` …) | 9 (`crm-contatos.ui:114` …) | parcial | desfazer mescla e lote (H1, H2); arquivado sem reativar (H3); campos, consentimento, base legal, vários telefones (H4); etiquetas na tela (H5); CNPJ em texto (H6); identidade só pelo telefone, duplicados prováveis, `lastInteractionAt`, números da própria empresa, filtro por origem, mescla sem teste de tela (H28) |
| CRM-02 · Funis e etapas | 3 (`crm-api:72` …) | 7 (`crm-api:287` …) | 4 (`crm-ajustes-visao.ui:110` …) | parcial | probabilidade e SLA só pela API, funis sem reordenar, etapa não cria tarefa (H23) |
| CRM-03 · Negócios (oportunidades) | 10 (`crm-api:210` …) | 11 (`crm-reabrir:54` …) | 4 (`crm.ui:29` …) | parcial | comentário e anexo (H11); equipe, origem da probabilidade, ligar conversa a negócio existente, aviso de negócio parecido (H27) |
| CRM-04 · Tarefas e agenda | 9 (`crm-api:425` …) | 7 (`crm-agenda:90` …) | 4 (`crm-agenda.ui:76` …) | parcial | lembretes (H12); resultado na tela, filtro por responsável, conclusão no histórico, SLA de tarefa (H24) |
| CRM-05 · CRM dentro da conversa (Negócios relacionados) | 3 (`crm-f5:163` …) | 5 (`crm-f5:163` …) | 2 (`crm-f5.ui:28` …) | parcial | pessoa, empresa, última atividade e próxima ação no bloco; vazio sem ação; links sem filtro (H22); fuso de quem vê (H25) |
| CRM-06 · Sincronização com o AtendeRadar e sugestões | 10 (`crm-api:543` …) | 12 (`crm-matriz:550` …) | 3 (`crm-dados-sugestoes.ui:297` …) | parcial | automações e sugestões que faltam (H13); eventos da captura que faltam e reconciliação que só conta (H21) |
| CRM-07 · Recuperação unificada | 5 (`crm-matriz:1431` …) | 5 (`crm-f5:84` …) | 2 (`crm-f5.ui:28` …) | parcial | a tela de recuperação não mostra o negócio; tarefa sem vínculo; sem "reunião marcada"; reflexo só pelas conversas de origem (H19) |
| CRM-08 · Dashboards e indicadores | 5 (`crm-api:425` …) | 5 (`crm-api:444` …) | 2 (`crm-ajustes-visao.ui:283` …) | parcial | conversão por etapa, equipe, tempo de resposta, confiança, filtros e drill-down (H9) |
| CRM-09 · Configuração, segurança e administração | 6 (`crm-api:72` …) | 7 (`crm-api:49` …) | 6 (`admin-crm.ui:30` …) | parcial | campos e limiar (H4); probabilidade e SLA na tela, papéis fixos (H23); estado `offline` e saúde por empresa no Admin (H20); responsável sem checar papel (H14) |
| CRM-10 · Onboarding, ajuda e treinamento | 3 (`crm-telas.ui:86` …) | 4 (`crm-telas.ui:86` …) | 3 (`crm-ajustes-visao.ui:283` …) | parcial | guias de Contatos, Tarefas e Visão comercial, passo a passo inicial, capítulo no guia geral (H10) |
| CRM-11 · Importação/exportação e portabilidade | 8 (`crm-api:496` …) | 7 (`crm-api:460` …) | 4 (`crm-dados-sugestoes.ui:92` …) | parcial | desfazer lote (H1); 10.000 linhas num envio (H7); exportar empresas, tarefas e auditoria (H8); idempotência e mapeamento da importação, escopo da exportação, retenção (H26) |
| CRM-12 · Relatórios e governança comercial | 5 (`crm-matriz:937` …) | 6 (`crm-api:444` …) | 2 (`crm-ajustes-visao.ui:378` …) | parcial | relatórios por equipe, período e origem, efetividade das tarefas, PDF/XLSX e envio agendado (H9) |

Os 12 de 12 requisitos têm os três tipos de teste pedidos no § 13.1. Nenhum está completo: todos têm parte da especificação que o produto não faz, com número em `10-handoff-e-suporte.md` § 9. A lista de cada teste, com o que ele afirma, está no Anexo A.

## 5. Matriz T01–T12 (§ 13.2)

85 cenários: 41 cobertos, 40 parciais, 3 não cobertos e 1 fora do escopo técnico. "Coberto" quer dizer que há teste automático que afirma o cenário inteiro; "parcial", que há teste de parte dele e a lacuna diz o resto.


**T01 — Baseline do legado**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T01.01 Cadastro, login, logout, reset de senha, demo, email e convite continuam. | coberto | `auth:8`, `auth:59`, `auth:134`, `brute-force:34`, `auth:194`, `auth:255`, `auth:323`, `email:13` | — |
| T01.02 Trial/planos/assinaturas Pagar.me e lock de plano permanecem com mesma semântica. | coberto | `billing:136`, `billing:46`, `billing-pagarme:61`, `billing-pagarme:467`, `delinquency:24`, `analysis-plan-gate:55` | — |
| T01.03 Conexões WA, QR, status, sessões cifradas e monitoramento read-only funcionam. | coberto | `gateway:71`, `gateway:93`, `gateway:47`, `whatsapp-auth-store.unit:54`, `qr.ui:6`, `conexao-faixa.ui:9`, `crm-matriz.unit:246` | O "só leitura" é provado por varredura do código do gateway, não com uma sessão real do WhatsApp. |
| T01.04 Ingestão idempotente de mensagens, ordenação, exclusões, máscara e atribuição de agente. | coberto | `gateway:123`, `gateway:156`, `gateway:166`, `privacy:12`, `mask-sensitive:11`, `agent-identities:57` | — |
| T01.05 Motor de regras/IA, alertas agrupados, recuperação, resultados humanos e relatórios não regrediram. | coberto | `analysis:81`, `analysis-outcomes:26`, `analysis-outcomes:40`, `analysis-outcomes:174`, `reports:22`, `ia-classificacao.unit:16` | — |
| T01.06 Backup, restauração, emails, NFSe desligada/configurada, webhooks e administração preservados. | parcial | `backup:18`, `backup:128`, `email:51`, `webhooks:152`, `nfse:47`, `nfse.unit:118`, `session:93`, `admin-plans:53` | NFS-e desligada só é provada na leitura da configuração. O caminho "não emite" de enqueueNfse não tem teste, e o e2e roda com NFS-e ligada. |
| T01.07 Screenshots de todas as telas antigas permanecem conformes à baseline. | não coberto | — | Não há toHaveScreenshot nem toMatchSnapshot. design.ui.spec.ts confere estouro de largura, vazamento, sobreposição e erros de console e de API e salva capturas, mas não compara com a baseline. A comparação com a baseline foi feita à mão (docs/crm/01-baseline-visual.md, seções 'Comparação depois do CRM' e 'Comparação final (F9)') com os scripts de scripts/visual, fora do CI; as capturas e os diffs ficaram fora do repositório. |

**T02 — Tenant e identidade**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T02.01 Criar 2+ tenants; membro A não lê, pesquisa, exporta ou altera registros de B. | coberto | `crm-matriz:1061`, `crm-api:303`, `crm-matriz:1130` | — |
| T02.02 Tentar IDOR por detalhe, busca, paginação, filtro, import, relatório, histórico, attachment, worker e link. | parcial | `crm-matriz:1130`, `crm-matriz:1061`, `crm-api:303`, `crm-f5:84`, `crm-f5:163`, `crm-matriz:757` | Nenhum teste manda ao consumidor (worker) um evento que aponte para dado de outra empresa. Sem teste de from-opportunity nem de item de recuperação de outra empresa. A importação não aceita IDs, e nenhum teste importa na B o telefone ou a empresa da A. O CRM não tem anexos. |
| T02.03 Impedir `organizationId`/`tenantId` do body/header/URL de substituir identidade do servidor. | coberto | `crm-matriz:1182`, `crm-matriz:1743` | — |
| T02.04 Revogar membro/assinatura e provar negação imediata de novas consultas e mutações CRM. | coberto | `crm-matriz:176`, `crm-matriz:953`, `session:19` | — |
| T02.05 Alterar equipes e confirmar escopo do supervisor e owner comercial. | parcial | `crm-matriz:204`, `crm-agenda:217` | Sem teste de troca de equipe com negócios já existentes. Sem teste de reatribuir o responsável do negócio com o novo dono passando a vê-lo (só tarefas). |
| T02.06 Não criar tenant duplicado em retries de cadastro/provisionamento. | parcial | `auth:42`, `crm-api:72` | Sem retry de cadastro em paralelo. Nenhum teste conta Organization depois da recusa, nem CrmTenantLink depois de repetir o provisionamento (o teste conta só o funil). |

**T03 — Contatos e empresas**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T03.01 CRUD, campos obrigatórios, limite/tamanho, caracteres especiais e busca paginada. | parcial | `crm-matriz:1216`, `crm-api:92`, `crm-api:141`, `crm-api:163`, `crm-contatos.ui:175`, `crm-contatos.ui:364`, `crm-matriz:279` | Busca com página 2 (page/limit) sem teste. Editar e arquivar empresa só aparecem como tentativa de outra empresa (404); o caminho que grava não tem teste. |
| T03.02 Contato sem telefone; dois contatos com mesmo sobrenome; telefone normalizado; merge e undo. | parcial | `crm-matriz:279`, `crm-contatos.ui:294`, `crm.unit:60`, `crm-contatos.ui:245`, `crm-api:185` | Não existe desfazer mescla (undo): src/lib/crm/people.ts só guarda mergeDataJson, e a tela avisa que não dá para desfazer. Nada testa isso. |
| T03.03 Importar 1, 100, 10.000 linhas com preview, erro parcial, reexecução idempotente. | parcial | `crm-matriz:302`, `crm-api:496`, `crm-dados-sugestoes.ui:92` | 10.000 linhas não são testadas. O limite do sistema é 5.000 (src/lib/crm/schemas.ts). |
| T03.04 Excluir contato restrito; grupos/excluídos não entram automaticamente. | coberto | `crm-matriz:337`, `crm-matriz:357`, `crm-matriz:374`, `crm-matriz:391`, `crm-f5:84` | — |
| T03.05 Exportação respeita escopo, máscara, autorização e auditoria. | coberto | `crm-api:460`, `crm-matriz:1061`, `crm-dados-sugestoes.ui:182`, `crm-dados-sugestoes.ui:265`, `crm-contatos.ui:449` | — |
| T03.06 Campos personalizados, empresa, owner e links permanecem após reload e reinício. | parcial | `crm.ui:29`, `crm-contatos.ui:114`, `backup:128` | Não há campos personalizados no modelo. Sem teste de reinício do servidor. Nenhum reload na tela confere empresa, responsável e vínculos do contato. |

**T04 — Funis e negócios**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T04.01 Criar dois pipelines, etapas, reordenar, criar deal, mover, editar e fechar. | coberto | `crm-api:210`, `crm-api:287`, `crm-matriz:456`, `crm-ajustes-visao.ui:110`, `crm-ajustes-visao.ui:170`, `crm-matriz:1279`, `crm.ui:29` | — |
| T04.02 Kanban DnD, alternativa por menu e mobile sem arrastar. | coberto | `crm.ui:29` | — |
| T04.03 Impedir remover estágio usado por negócios sem migrá-los. | coberto | `crm-matriz:456`, `crm-ajustes-visao.ui:170` | — |
| T04.04 Concorrência: duas pessoas editam/movem o mesmo negócio; conflito tratado sem perda silenciosa. | coberto | `crm-matriz:1279`, `crm-api:268`, `crm-reabrir.ui:13` | — |
| T04.05 Status ganho/perdido, motivos, reabertura, histórico e permissões. | coberto | `crm-api:210`, `crm-reabrir:54`, `crm-reabrir:85`, `crm-reabrir:143`, `crm-reabrir:158`, `crm-reabrir.ui:13`, `crm-matriz:1352`, `crm-matriz:1771` | — |
| T04.06 Vários negócios por contato e várias conversas por negócio. | coberto | `crm-matriz:490`, `crm-matriz:893` | — |
| T04.07 Valor não informado não aparece como receita nem R$ 0 fictício. | coberto | `crm.unit:22`, `crm.unit:47`, `crm-matriz:563`, `crm-ajustes-visao.ui:283` | — |
| T04.08 Exibição de moeda, centavos, negativo/NaN/overflow e timezone corretamente validados. | parcial | `crm-matriz:511`, `crm.unit:15`, `crm.unit:30`, `crm-agenda.ui:76` | Datas nas telas de negócio, contato e empresa (deal-detail, deals-view, contact-detail, contacts-view, company-detail), no bloco Negócios relacionados da conversa (related-deals: prazo da próxima tarefa com hora), na Visão comercial (overview-view: período) e nos Ajustes do CRM (crm-settings-view) usam Intl sem timeZone, isto é, o fuso do navegador. Nenhum teste cobre isso: só a Agenda é testada com o navegador em outro fuso (crm-agenda.ui.spec.ts:76). Somas acima de 2^31 centavos só aparecem no script de carga. |

**T05 — Inteligência e correspondência semântica**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T05.01 Conversa comercial elegível cria sugestão/negócio sem duplicata. | coberto | `crm-api:543`, `crm-matriz:676` | — |
| T05.02 Reanálise N vezes não cria N negócios. | coberto | `crm-matriz:676`, `crm-api:543`, `crm-matriz:708` | — |
| T05.03 Mudança de estágio inferida não substitui etapa manual. | coberto | `crm-matriz:1383`, `crm-dados-sugestoes.ui:297` | — |
| T05.04 Cliente pergunta "se eu pagar" e motor não confirma receita. | coberto | `crm-matriz:550` | — |
| T05.05 Cliente confirma pagamento mas sem evidência monetária: negócio não inventa valor. | coberto | `crm-matriz:563` | — |
| T05.06 Correção humana de ganho/perda permanece após reprocessamento e novos eventos. | coberto | `crm-matriz:1494`, `crm-api:601` | — |
| T05.07 Alerta recorrente não cria tarefa duplicada quando já existe a mesma causa aberta. | coberto | `crm-matriz:584`, `crm-matriz:1801`, `crm-matriz:1845`, `crm-matriz:1868`, `crm-matriz:1907`, `crm-matriz:1943` | A "mesma causa" é o tipo do alerta na mesma conversa (groupKey). A tarefa criada à mão para o alerta novo da mesma causa, com a do anterior ainda aberta, não é barrada (o botão promete uma tarefa aberta por alerta). |
| T05.08 Conversa de grupo, excluída, seed/simulada e contato fora de escopo não criam negócio. | parcial | `crm-matriz:337`, `crm-matriz:357`, `crm-matriz:374`, `crm-matriz:391`, `crm-matriz:421` | A empresa de exemplo (seed/demo) não tem bloqueio na captura: capturePaused em src/lib/crm/capture.ts só checa isSimulationOrg. Nenhum teste cobre a empresa de exemplo. |
| T05.09 Nenhuma mensagem é enviada ou marcada como lida via Baileys. | coberto | `crm-matriz.unit:122`, `crm-matriz.unit:246` | Prova por varredura do código (CRM e gateway), não com uma sessão real do WhatsApp. |
| T05.10 Motor de IA falha e segue fallback determinístico existente, sem travar CRM. | parcial | `ia-classificacao.unit:11`, `crm-api:543` | Nenhum teste liga a IA e simula falha (erro ou timeout) para provar o fallback das regras. O teste da IA desligada não afirma que o motor segue nas regras. O catch do crmTick em src/app/api/gateway/tick/route.ts não tem teste. |

**T06 — Tarefas/recuperação**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T06.01 Criar e concluir follow-up, reatribuir, prazo vencido e lembrete. | parcial | `crm-api:425`, `crm-agenda:159`, `crm-agenda:217`, `crm-agenda.ui:134` | Não existe lembrete (aviso antes do prazo) nem teste dele. "Lembrete" só aparece como texto na tela e na ajuda. |
| T06.02 Finalizar recuperação atualiza vínculos e desfecho comercial de acordo com a política. | parcial | `crm-matriz:1431`, `crm-f5:138`, `crm-matriz:1606` | A captura do RecoveryItem concluído roda de passagem no teste (crm-matriz.spec.ts:1606, via gwTick; capture.ts:133-143), mas nada confere o resultado: sem negócio aberto na conversa, o consumidor descarta o evento como no_open_deal (consumer.ts). Nenhum teste prova o caminho captura real → vínculo → efeito no negócio. Negócio ligado só pelo vínculo recovery, sem a conversa de origem, não reflete o fechamento no item (outcome.ts). |
| T06.03 Conclusão de tarefa não fecha alerta automaticamente sem evidência. | coberto | `crm-matriz:1475` | — |
| T06.04 Duas pessoas concluem mesma tarefa; efeito ocorre uma vez. | coberto | `crm-matriz:613` | — |
| T06.05 Timezone America/Sao_Paulo, UTC, horários de verão históricos e prazos no limite do dia. | parcial | `crm-matriz:629`, `crm-agenda:112`, `crm-agenda.ui:76` | Empresa em UTC e horário de verão histórico (datas até 2019 em -02:00) não são testados. Os testes assumem deslocamento fixo (-03:00 em São Paulo, -04:00 em Manaus). |

**T07 — Integração e resiliência**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T07.01 Evento idêntico entregue 2, 10 e 100 vezes não duplica negócio ou tarefa. | coberto | `crm-matriz:676`, `crm-api:114`, `crm-api:130`, `crm-api:543`, `crm-matriz:1431`, `crm-matriz:1675`, `crm-matriz:1962` | As 100 entregas cobrem a oportunidade (com e sem criação automática) e o alerta com tarefa aceita. Os outros tipos passam pelo mesmo inbox (efeito e linha do inbox na mesma transação, worker.ts), sem teste de 100 entregas de cada um. |
| T07.02 Evento versão 4 chega depois da 5: estado 5 permanece. | coberto | `crm-matriz:708`, `crm-matriz:735` | — |
| T07.03 CRM cai por 10 min: auditoria e recebimento continuam, outbox acumula, retorno reconcilia. | parcial | `crm-matriz:982`, `crm-api:543` | Nenhum teste injeta falha no crmTick ou no consumidor para provar que auditoria e recebimento seguem; o catch de gateway/tick/route.ts:75-78 não é exercitado. Falta o ciclo CRM fora do ar e volta, com a outbox acumulando e a reconciliação no retorno. |
| T07.04 Token inválido e 401/403: nenhum fallback permissivo. | coberto | `api-auth:19`, `rbac:241`, `crm-matriz:176`, `analysis:10`, `gateway:47` | — |
| T07.05 Timeout/429/500: backoff, DLQ, retry e observabilidade. | parcial | `crm-matriz:1553`, `crm-matriz:757`, `crm.unit:104`, `crm-api:529` | Timeout não tem teste: o evento preso em processing com a trava vencida (worker.ts:116) não é exercitado. A observação só prova o status degraded; lagSeconds e o status syncing não são conferidos. O 429 é testado na API, não como resposta repetida pelo cliente. |
| T07.06 Restauro SQLite e PostgreSQL em pontos diferentes não duplica eventos. | parcial | `backup:128`, `backup:175` | Falta restaurar um ponto antigo, rodar a fila de novo e provar que nenhum evento duplica. O teste só compara contagens. A parte PostgreSQL não se aplica hoje (o app usa SQLite). |
| T07.07 Reconciliação detecta e trata contato/negócio órfão. | não coberto | — | Nenhum teste roda a reconciliação; só o teste do kill switch chama reconcileDue (crm-matriz.unit.spec.ts:29). reconcileCrm (capture.ts:274) reemite 7 dias de eventos e só conta vínculos órfãos, oportunidades sumidas, telefones duplicados, eventos presos, eventos na DLQ e sugestões pendentes. Não procura contato nem negócio órfão e não corrige nada. |
| T07.08 Mutação falha após resposta do backend: cliente reenvia com idempotency key e não repete efeito. | parcial | `crm-api:114`, `crm-api:130`, `crm-api:210` | O reenvio com a mesma chave só é provado na criação de contato. Negócio, tarefa e empresa não têm teste de reenvio. O cliente da tela gera chave nova a cada envio (client.ts:66), então o reenvio pela tela não reaproveita a chave; nenhum teste cobre isso. |

**T08 — Segurança e privacidade**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T08.01 Escaladas de papel e campos sensíveis por mass assignment bloqueadas. | coberto | `crm.unit:136`, `crm-api:163`, `crm-matriz:1182`, `crm-api:345`, `crm-matriz:204`, `crm-agenda:188`, `rbac:241` | — |
| T08.02 XSS em nomes, descrição, notas, etiquetas; HTML não executa scripts. | parcial | `crm.ui:223`, `crm-matriz.unit:229`, `crm-api:163`, `crm-reabrir:115` | O negócio não tem campo de descrição nem de notas. Na tela, faltam etiquetas da pessoa, título e notas de tarefa, nota de fechamento e próxima ação do negócio e notas da empresa. |
| T08.03 CSRF, SSRF, acesso a redes privadas, upload perigoso, brute-force e rate limit. | parcial | `crm-api:163`, `crm-api:529`, `crm-matriz:302`, `crm.unit:173`, `crm-dados-sugestoes.ui:92`, `api-json:66`, `brute-force:19`, `webhooks:126` | SSRF e força bruta só têm teste fora do CRM. O CRM não faz pedido a URL do cliente, mas nada prova isso (ex.: site da empresa). O limite de corpo (413) só é testado numa rota fora do CRM. A recusa de arquivo não CSV é só na tela. |
| T08.04 Logs, trace e exports não contêm token, telefone completo não autorizado nem mensagem original. | parcial | `crm-matriz.unit:203`, `crm-matriz:1310`, `crm-api:460`, `crm-api:543`, `crm-matriz.unit:264` | A checagem de log é estática: olha src/lib/crm, src/app/api/crm, as rotinas do CRM em src/lib/background.ts e o tick do gateway, e 'token' entrou na lista de proibidos. Nenhum teste captura o log real nem o trace. |
| T08.05 Excluir organização remove dados de todas as bases, índices e caches conforme política. | coberto | `crm-matriz:832` | — |
| T08.06 CPF/telefone cifrado, autorização para revelar e prova de acesso. | coberto | `crm-matriz:1310`, `crm-api:460`, `crm-dados-sugestoes.ui:182`, `phone-crypto:41` | — |
| T08.07 Dependências e licenças do build realmente implantado; nenhum pacote Enterprise não autorizado. | não coberto | — | Nenhum teste de licenças. O CI só roda bun audit (vulnerabilidade high/critical). O levantamento de licenças (docs/crm/reports/licencas-baseline.md) é manual, na máquina de desenvolvimento, não no build implantado. Nada confere a ausência de pacote Enterprise. |
| T08.08 Injeção de prompt presente em mensagem não altera instruções do sistema nem aciona tool perigosa. | parcial | `crm-matriz:865` | Só o caminho determinístico roda no teste. Com o motor de IA ligado, a injeção não é testada, nem a ausência de ferramenta perigosa. |

**T09 — Interface, acessibilidade e usabilidade**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T09.01 Temas claro/escuro; fontes Inter/Jakarta; tokens e geometria preservados. | parcial | `crm.ui:150` | Fontes Inter e Jakarta, tokens e geometria não são conferidos por teste. A comparação de hashes é manual e foi feita com o CRM desligado. |
| T09.02 320, 375/390, 768, 1024, 1440, 1920px sem overflow ou sobreposição indevida. | parcial | `crm.ui:201`, `crm.ui:150` | Sobreposição indevida não é medida; só a rolagem lateral. 390 px só aparece no iPhone 14 do job browsers. Detalhes e diálogos não passam pela varredura de larguras. |
| T09.03 Firefox, Chromium, WebKit e viewport iPhone, teclado e leitor de telas. | parcial | `crm.ui:29`, `crm.ui:150`, `crm-f5.ui:28` | Não há teste com leitor de telas real; só o axe. Todas as telas crm*.ui rodam também em Firefox, WebKit e iPhone (playwright.config.ts:14); só admin-crm.ui fica só no Chromium. |
| T09.04 Modal, drawer, menus, foco, Escape, aria, badges e feedback visual. | parcial | `crm.ui:29`, `crm-agenda.ui:134`, `crm-reabrir.ui:13`, `crm-contatos.ui:175`, `crm-ajustes-visao.ui:170`, `crm-ajustes-visao.ui:63` | Escape fechando modal, gaveta e menu não é conferido (crm-f5.ui.spec.ts:138 aperta Escape sem verificar nada). A volta do foco é conferida só no menu Mover (crm.ui.spec.ts:63) e no diálogo de reabrir (crm-reabrir.ui.spec.ts:124); os demais diálogos e a gaveta não têm essa checagem. Os selos de situação da tarefa (Atrasada, Aberta, Em andamento) são conferidos (crm-agenda.ui.spec.ts:122, :146 e :176; crm-ajustes-visao.ui.spec.ts:370); faltam o contraste dos selos fora do axe e os selos de negócio e etapa. |
| T09.05 Empty/loading/error de cada uma das novas telas; nenhum estado branco. | parcial | `crm.ui:29`, `crm-contatos.ui:114`, `crm-contatos.ui:294`, `crm-contatos.ui:364`, `crm-ajustes-visao.ui:283`, `crm-ajustes-visao.ui:378`, `crm-ajustes-visao.ui:63`, `crm.ui:150` | Os estados de carregamento e de erro existem nos componentes, mas nenhum teste confere o carregamento. Erro só é simulado no interruptor dos Ajustes; falha ao carregar Negócios, Contatos, Empresas, Tarefas ou Visão comercial não tem teste. O vazio de Tarefas não tem teste. |
| T09.06 Hash/deep links e navegação da lateral sem regressão ao login/tour. | parcial | `crm-telas.ui:46`, `crm-telas.ui:86`, `crm-dados-sugestoes.ui:446` | Link direto sem sessão (passar pelo login e voltar à tela do CRM) não é testado. Só #crm-deals e #crm-overview são abertos por link. |
| T09.07 Contraste AA e redução de movimento. | parcial | `crm.ui:150` | Redução de movimento não é testada nas telas do CRM; o reducedMotion só aparece em a11y.ui.spec.ts:52 (página de vendas) e system-tour.ui.spec.ts:480 (guia das telas), fora do CRM. |
| T09.08 Diferenças da baseline justificada por alteração aprovada, não mascarada de forma geral. | parcial | — | Não há teste automático; não há toHaveScreenshot na suíte. A comparação (scripts/visual/) roda à mão, fora do CI e com o CRM desligado. A rodada final (docs/crm/01-baseline-visual.md, 31/10) já usou o código com os ajustes de painel-ajustes.css e comparou as 121 capturas pixel a pixel com o F0: 53 idênticas e 68 diferentes, justificadas no documento. As imagens de referência ficam numa pasta temporária fora do Git, e ninguém pode repetir a comparação sem elas. |

**T10 — Indicadores e relatórios**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T10.01 Valor estimado e confirmado sempre separados e rotulados. | coberto | `crm-ajustes-visao.ui:283`, `crm-api:543`, `crm-api:444` | — |
| T10.02 Funil por etapa soma corretamente sem duplicar negócio em várias conversas. | coberto | `crm-matriz:893` | — |
| T10.03 Períodos, equipe, owner e timezone coerentes com filtros. | parcial | `crm-api:444`, `crm-matriz:204`, `crm-ajustes-visao.ui:378`, `crm-agenda.ui:76` | Nenhum teste prova que negócio fechado fora do período sai dos números. O período da Visão comercial é cortado no fuso do navegador de quem vê (overview-view.tsx:81-85), não no fuso da empresa (America/Sao_Paulo) como em Tarefas; sem período, a API usa os últimos 30 dias corridos a partir de agora. A visão comercial não tem filtro de equipe ou responsável; só o escopo do papel. |
| T10.04 CSV/PDF respeitam dados e autorização; não vaza outros tenants. | parcial | `crm-matriz:1061`, `crm-api:460`, `crm-dados-sugestoes.ui:265`, `crm-api:627` | O CRM não gera PDF; só o CSV tem teste. |
| T10.05 Indicadores antigos preservam definições e valores com mesmo dataset. | parcial | `reports:73`, `reports:135` | Os testes dos indicadores antigos rodam com o CRM desligado. Nenhum teste roda o mesmo conjunto de dados com o CRM ligado e desligado e compara os números antigos. |
| T10.06 Correções de resultado recomputam métricas sem inconsistência. | coberto | `crm-matriz:1352` | — |

**T11 — Operação e deployment**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T11.01 Build reproduzível com lockfiles fixos e migrações idempotentes. | parcial | — | Não há teste. O CI instala com --frozen-lockfile (deploy.yml:36 e :97), mas o servidor instala sem ele (deploy.yml:132). O db:check só confere que o schema tem migração. Nenhum teste aplica as migrações duas vezes; as do CRM não usam IF NOT EXISTS. |
| T11.02 Pipeline falha corretamente ao quebrar unitário, contrato, isolamento, e2e ou a11y. | parcial | — | Não há prova de que o pipeline cai. O deploy depende dos jobs test e browsers (deploy.yml:121), e unitários, isolamento e a11y estão na suíte, mas nenhum teste quebrado de propósito mostrou o pipeline falhar. |
| T11.03 Backup criptografado e restauração conjunta demonstrados em ambiente descartável. | parcial | `backup:128`, `backup:45`, `backup:65`, `backup:175` | O backup não é criptografado; scripts/backup-db.ts não cifra nada. A restauração conferida (backup.spec.ts:128 e scripts/restore-drill.ts) é só do banco: sessões e uploads aparecem só como copiados para o backup (backup.spec.ts:45 e :65), sem ensaio de volta junto com o banco. |
| T11.04 Healthchecks, alertas de lag e reprocessamento manual auditado. | parcial | `crm-matriz:1553`, `crm-matriz:757`, `crm-api:543` | Não há alerta de lag. lagSeconds e o status syncing não são conferidos. O healthcheck do deploy só chama a raiz do app (deploy.yml:277) e não olha a fila do CRM. |
| T11.05 Feature flag OFF faz o app operar como antes, sem falhas de import/runtime. | coberto | `crm-matriz.unit:29`, `crm-api:61`, `crm-f5.ui:118` | — |
| T11.06 Rollback em canário preserva dados locais e não perde eventos. | parcial | `crm-api:72`, `crm-matriz:953` | Não há teste de rollback. Com o CRM desligado, o evento consumido vira processado sem efeito (worker.ts:83-85) e se perde; nenhum teste cobre isso, e o comportamento contradiz o requisito. O canário em si depende de produção. |

**T12 — Comercial e jornada do cliente**

| Cenário | Situação | Testes | Lacuna |
|---|---|---|---|
| T12.01 Conta nova com CRM liberado e 0 registros; onboarding funcional. | coberto | `crm-ajustes-visao.ui:283`, `crm-telas.ui:86`, `crm-api:72` | — |
| T12.02 Conta antiga com dados reais consentidos é migrada sem distorcer histórico. | fora do escopo técnico | — | Depende de dados reais e consentidos de conta antiga. |
| T12.03 Cliente sem CRM continua na interface antiga sem menu quebrado. | coberto | `crm-f5.ui:118`, `crm-api:61`, `crm-matriz.unit:29` | — |
| T12.04 Administrador, gestor, atendente, analista e visualizador veem apenas o permitido. | coberto | `crm-telas.ui:46`, `crm-ajustes-visao.ui:236`, `crm-ajustes-visao.ui:378`, `crm-contatos.ui:449`, `crm-dados-sugestoes.ui:398`, `rbac:241`, `crm-matriz:204` | — |
| T12.05 Fluxo completo: WhatsApp observado → oportunidade → negócio → tarefa → recuperação → desfecho confirmado → relatório. | parcial | `crm-matriz:916`, `crm-f5.ui:28`, `crm-matriz:1431` | O fluxo único não passa pela recuperação; ela é testada à parte. No relatório, só se confere que a recuperação com venda confirmada não conta ganho antes do aceite (crm-matriz.spec.ts:1470). Nenhum teste aceita a sugestão de ganho vinda da recuperação e confere o ganho no painel. |
| T12.06 Fluxo completo manual sem WhatsApp: contato → negócio → tarefa → ganho/perda → relatório. | coberto | `crm-matriz:937`, `crm.ui:29` | — |
| T12.07 Trial vencido, plano suspenso e reativação respeitam acesso e preservação contratual. | parcial | `crm-matriz:953`, `crm-matriz:982`, `crm-matriz:176` | Só o teste grátis vencido é testado. Plano suspenso por falta de pagamento e plano cancelado não têm teste no CRM. |

## 6. Metas do § 13.4

| Indicador | Meta | Medido | Situação | Onde |
|---|---|---|---|---|
| Auditoria com CRM fora | sem interrupção | a gravação do evento não lança erro; o agendador isola cada tarefa (`safely`); com o CRM desligado ou com `CRM_DISABLED=1` as telas antigas seguem iguais | atendida | `crm-matriz.unit` › T11.05, `crm-f5.ui` (desligado), comparação visual (`01-baseline-visual.md`) |
| Sincronização em regime normal | p95 ≤ 60 s | p95 6,9 s entre gravar e processar (até cerca de 22 s somando o intervalo de 15 s da captura) | atendida | `08-testes-e2e.md` § 4 |
| Leitura de lista | p95 ≤ 500 ms | pior p95 107 ms (quadro do supervisor) | atendida | `08-testes-e2e.md` § 4 |
| Mutação básica | p95 ≤ 800 ms | pior p95 60 ms (criar tarefa) | atendida, com ressalva: medida nas funções que as rotas usam, sem a camada HTTP | `08-testes-e2e.md` § 4 |
| Jobs idempotentes | zero duplicados em T07 | dez rodadas seguidas sem duplicar; o mesmo evento entregue 2, 10 e 100 vezes não repete sugestão, negócio nem tarefa; segunda captura emitiu 0 eventos | atendida | `crm-matriz` › T07.01, carga |
| Isolamento entre empresas | zero violações no conjunto negativo | nenhuma: busca, filtro por ID, quadro com cursor, painel, exportação, ID de outra empresa em cada rota, `organizationId` no corpo ou na URL | atendida | `crm-api`, `crm-matriz` › T02.01–T02.03, T10.04 |
| Acessibilidade | zero violações sérias ou críticas | nenhuma nas telas novas, em claro e escuro, nem nas antigas | atendida | `crm.ui`, `a11y.ui` |
| Regressão funcional | 100% executada e aprovada | completa nº 5: 3046 passaram, 57 pulados pela condição do próprio teste, 12 falharam e 11 não rodaram; esses 23 passaram na direcionada logo depois (72 passaram, sem falha). Nenhuma falha de produto | atendida, com ressalva: os 23 foram aprovados em rodada direcionada, não numa completa nova; a espera do `nfse.spec:47` já falhava assim na F0 | `08-testes-e2e.md` § 3 |
| Restauração | RTO e RPO definidos e ensaiados | ensaio de restauração com contagem das 16 tabelas `Crm*`, em cópia descartável. RTO e RPO não estão escritos em lugar nenhum do projeto: pelo calendário, a perda máxima é de até um dia (backup diário às 03:00 e um antes de cada deploy, `docs/operacao/backup-e-restauracao.md`), e o tempo de restauração não foi medido | **parcial**: ensaio feito, metas por definir (H18) | `backup.spec.ts` › F8, `09-deploy-e-rollback.md` § 5 |

Volume declarado da carga (§ 13.4 pede): 1 empresa grande com 30 membros, 2.000 empresas, 10.000 pessoas, 5.000
negócios e 15.000 tarefas; 20 empresas pequenas; 25.000 conversas e 237.073 mensagens no mesmo arquivo. Medição com uma
operação por vez (sem operações simultâneas). Os números foram tirados com a CPU saturada por processos alheios
(`08-testes-e2e.md` § 4).

## 7. Checklist do § 14

| # | Item | Situação | Prova |
|---|---|---|---|
| 1 | POC Open Mercato ou fallback nativo selecionado formalmente | feito: fallback nativo (B) | `ADR-001-arquitetura-crm.md`, `02-poc-open-mercato.md` |
| 2 | Telas atuais sem regressão funcional nem visual não aprovada | feito: telas antigas sem diferença visual não aprovada (121 capturas comparadas com a F0) e sem falha funcional, com a ressalva do § 6 (falhas da completa nº 5 aprovadas na direcionada) | `01-baseline-visual.md`, completa nº 5 |
| 3 | Contatos, empresas e negócios: CRUD, filtros, busca, detalhe, atribuição, histórico | feito, com lacunas H2–H5 | § 4, CRM-01 e CRM-03 |
| 4 | Vários funis, etapas, transição, fechamento e reabertura com validação e rastro | feito | § 4, CRM-02 e CRM-03 |
| 5 | Tarefas, prazos, responsável e acompanhamento, sem envio de WhatsApp | feito, sem lembretes (H12) | § 4, CRM-04 |
| 6 | Oportunidades ligadas a negócios com ID estável, sem duplicar e sem confundir estimativa com receita | feito | `crm-matriz` › T07.01 (o mesmo evento 100 vezes), T07.02, CRM-06 (`autoCreateDeals` ligado cria, desligado só sugere); `crm-ajustes-visao.ui` › T04.07, T10.01 |
| 7 | Recuperação e CRM reconciliados; ação humana não sobrescrita | feito | `crm-matriz` › T05.06, T06.02 (recuperação concluída reflete no negócio; fechar o negócio reflete na recuperação, com o motivo da perda) |
| 8 | Plano, papéis e equipes no menu e em cada API | feito | `crm-telas.ui` › T12.04, `rbac.spec`, `crm-matriz` › T02.04, T12.07 |
| 9 | Dois ou mais tenants isolados, com testes negativos | feito | § 6, isolamento |
| 10 | Eventos idempotentes, DLQ, replay e reconciliação, também depois de falha e reinício | feito, com S9 (evento na fila no desligamento) | `crm-matriz` › T07.01–T07.05, `05-sincronizacao.md` |
| 11 | UI segue o guia; claro e escuro, celular e acessibilidade testados | feito | `06-ux-e-design.md`, `crm.ui` |
| 12 | Navegadores, segurança, suíte antiga e nova, backup e restauração sem bloqueador | feito, sem bloqueador: Firefox, WebKit e iPhone nas telas do CRM; segurança e SCA com 5 exceções justificadas do `node-forge`; suíte antiga e nova (completa nº 5 e a direcionada); backup e ensaio de restauração. RTO e RPO por definir (H18) | § 3 |
| 13 | Domínio real com canário e smoke, telemetria e custo medidos, rollback ensaiado | **não feito**: depende de deploy e de liberar uma empresa real, que esta execução não tem autorização para fazer (H17) | `09-deploy-e-rollback.md` |
| 14 | Ajuda, guias, contratos de API, arquitetura, inventário, runbooks, changelog e handoff | feito, com H10 (guias das outras telas) | `docs/crm/`, `CHANGELOG.md`, `handoff.md` |
| 15 | Aprovação de quem responde por mudança comercial e jurídica | **pendente do dono**: política de privacidade e termos para o CRM (P1) | `10-handoff-e-suporte.md` § 8 |

## 8. Reprovação automática (§ 14)

| Condição | Encontrada? | Por quê |
|---|---|---|
| Perda de dados | não | migrações só criam; desligar não apaga; exclusão da empresa apaga só as tabelas dela (`crm-matriz` › T08.05); backup e restauração levam as 16 tabelas (`backup.spec` › F8). O evento que estava na fila no instante do desligamento vira processado sem efeito (S9): é sugestão, não dado do AtendeRadar |
| Vazamento entre empresas | não | § 6, isolamento |
| Contorno de assinatura ou permissão | não | `rbac.spec` (cada rota por papel), `crm-matriz` › T02.04 (suspenso 401, bloqueada 402) e T12.07 (plano vencido 402) |
| Envio de WhatsApp | não | nenhum arquivo do CRM alcança `src/lib/whatsapp` nem chama função de envio (`crm-matriz.unit` › T05.09) |
| Estimativa promovida a receita | não | `estimatedAmountCents` separado; ganho sem valor não vira R$ 0; "se eu pagar" não sugere ganho; injeção de instrução não marca ganho (`crm-matriz` › T05.04, T05.05, T08.08; `crm-ajustes-visao.ui` › T04.07, T10.01) |
| Restauração impossível | não | `backup.spec` › F8 |
| Licença paga não autorizada | não | nenhuma dependência nova; Open Mercato sem os módulos Enterprise ficou fora (`reports/om-licencas.md`) |
| Mudança visual não aprovada em tela existente | não no layout; uma de comportamento espera o OK do dono | com o CRM desligado, as 121 capturas das telas antigas comparadas pixel a pixel com a F0 só mudam hora relativa, nome sorteado e o momento da animação (`01-baseline-visual.md` › Comparação final). O guia das telas mudou no caso em que o cartão não cabia (R6): vai para o dono no PR, num commit separado que pode ser revertido sozinho |

## 9. Evidências (§ 13.5)

| Evidência | Onde |
|---|---|
| Saída de cada rodada (comando, contagem, duração, falhas e causa) | `08-testes-e2e.md` § 3 |
| Trace do percurso principal com dados sintéticos | `.tmp/evidencias/trace-crm-negocios-desktop.zip` (quadro: criar, mover, ganho e perda) e `.tmp/evidencias/trace-crm-f5-alerta-recuperacao-desktop.zip` (alerta e recuperação viram tarefa; negócios na conversa), com `sha256.txt`. Fora do Git (tamanho); abrir com `bunx playwright show-trace <arquivo>` |
| Capturas das telas novas | `docs/crm/screenshots/crm/` |
| Capturas comparativas das telas antigas | `docs/crm/screenshots/baseline/` e a comparação em `01-baseline-visual.md` |
| Carga | `08-testes-e2e.md` § 4; JSON e planos de consulta em `.tmp/carga-crm-*.json` e `.txt` (fora do Git) |
| SCA e SBOM | `reports/sca-baseline.md`, `reports/sbom-baseline.json`, `reports/licencas-baseline.md`. Sem dependência nova, o resultado do baseline vale para este commit. Os 5 avisos altos do `node-forge` ≤1.4.0 já existiam na `main` (S1) |
| Logs sanitizados | o log do CRM, inclusive o da falha do CRM no tick (`/api/gateway/tick`), leva só `requestId`, tipo e código do erro, sem corpo, nome, telefone, e-mail nem `e.message` (`crm-matriz.unit` › T08.04) |
| Registro de cada fase, tarefa e decisão | `EXECUCAO-AUTONOMA.md` |

## 10. Riscos residuais e divergências

| # | Risco ou divergência | Efeito | Tratamento |
|---|---|---|---|
| R1 | `node-forge` ≤1.4.0 com 5 avisos altos (S1), na `main` também | o passo `bun audit` do deploy só passa com as 5 exceções justificadas | trocar para 1.4.2 a partir de 10/11/2026 (regra das 2 semanas) e tirar as exceções |
| R2 | CNPJ em texto puro (S8, H6) | quem vê a empresa vê o CNPJ inteiro | decisão de produto: cifrar e mascarar como o telefone |
| R3 | Evento na fila no instante do desligamento (S9, H16, T11.06) | vira processado sem efeito; religar não o repete | ensaiar no canário com fila pendente |
| R4 | Memória e disputa de escrita no SQLite com o CRM ligado não medidas (`09-deploy-e-rollback.md` § 7, D5) | o CRM divide o teto de memória do app (`MemoryMax` 1.536 MiB) e o mesmo arquivo do banco | medir no canário, antes de ligar uma segunda empresa |
| R5 | Carga medida sem a camada HTTP, uma operação por vez, com a CPU saturada por processos alheios | os p95 medem banco e escopo, não a rota inteira nem operações simultâneas | os números ficaram muito abaixo das metas (107 ms e 60 ms contra 500 e 800); repetir pela rota no canário |
| R6 | Mudança no guia de todas as telas (`tour-overlay.tsx`, F9-03) | o cartão abre do outro lado do alvo quando não cabe, e um guia sem o último alvo fica gravado como visto. Antes, o cartão ficava cortado e o "Próximo" não dava clique | correção de defeito em componente compartilhado: **precisa do OK do dono no PR**, porque muda o comportamento das telas antigas no caso em que o cartão não cabia |
| R7 | Lacunas da especificação H1–H29 (`10-handoff-e-suporte.md` § 9) | o CRM entregue não faz tudo o que os CRM-01 a CRM-12 pedem (§ 4) | nenhuma delas causa perda de dado, vazamento ou envio; ficam para depois da liberação controlada, por prioridade do dono |
| R8 | Canário, smoke, telemetria e custo em produção não feitos (H17) | a homologação é técnica, em ambiente local descartável | depende de merge, deploy e liberação de uma empresa piloto, todos com autorização do dono |
| R9 | Política de privacidade e termos não revistos para o CRM (P1) | o CRM é um tratamento novo de dados | dono do produto (jurídico), antes de ligar para cliente real |
| R10 | RTO e RPO não definidos (H18) | o ensaio de restauração prova que volta, não em quanto tempo | definir com o dono e cronometrar no ensaio |
| R11 | Custo do CRM no tick com muitas empresas ligadas | cada rodada da captura passava por toda empresa com o CRM ligado e regravava 5 checkpoints mesmo sem linha nova; com 149 empresas, 4,8 s e 740 gravações por rodada no banco de teste | mitigado: a rodada ociosa regrava no máximo uma vez por minuto (2,4 s e 0 gravações na mesma medição, `08-testes-e2e.md` § 3). Com o CRM ligado em poucas empresas, como previsto no canário, o custo é pequeno; medir de novo antes de ligar em muitas (R4) |

Divergências entre documento e código achadas nesta execução. Nas cinco primeiras o código estava certo e o documento
foi corrigido; as três últimas pediram mudança no código:

- `03-modelo-dados.md` dizia que o CNPJ era cifrado e tinha `taxIdLast4`. O código nunca fez isso (R2).
- `03-modelo-dados.md` listava o tipo `linked` no histórico do negócio. Nenhum fluxo o grava; o vínculo fica em
  `CrmBusinessLink`.
- A primeira redação do S9 dizia que a captura relia 30 dias ao religar. Ela segue de um cursor, e só a reconciliação
  relê 7 dias.
- `08-testes-e2e.md` § 2 trazia `crm-matriz` com 28 testes e `crm-agenda` com 6. A execução contou 40 e 8.
- `03-modelo-dados.md` trazia equipe e `deletedAt` no negócio e dava `amountSource = inferred` como valor em uso. O
  negócio não tem equipe nem exclusão lógica, e `amountSource` só usa `manual` e `unknown`, porque a estimativa vai em
  `estimatedAmountCents` (H27).
- O `CROSS_BROWSER` do `playwright.config.ts` deixava fora as telas novas da F9. Passou a pegar todo `crm*.ui`.
- O H8 dizia que a exportação da organização levava todo o CRM. Os vínculos (`CrmBusinessLink` e `CrmIdentityLink`)
  ficavam fora. Esta divergência foi corrigida no código: a exportação passou a levá-los, sem a chave interna
  (`org-export.ts`; `crm-matriz` › CRM-11).
- O log do tick ainda gravava `e.message` quando o CRM falhava, apesar do T08.04. Corrigido no código: vai só o tipo e o
  código do erro (`errTag`, `api/gateway/tick/route.ts`).

## 11. Rollback

Do mais leve ao mais pesado, sem apagar dado do CRM (`09-deploy-e-rollback.md` § 4):

1. Desligar numa empresa: Admin › Organizações › a empresa › "Desligar o CRM comercial". As rotas dela voltam a 404
   `crm_disabled`, o menu some, a captura e a fila param.
2. Desligar em todas: `CRM_DISABLED=1` no `app.env` e reiniciar o serviço.
3. Código com defeito: `git revert` do código na `main`, mantendo a migração e o `schema.prisma`. As tabelas `Crm*`
   ficam sem uso.
4. Dado estragado: restaurar o backup do deploy, que perde tudo o que entrou depois dele, do app inteiro.

Ensaiado: ligar, desligar e religar (`admin-crm.ui`, `crm-api`), `CRM_DISABLED=1` (`crm-matriz.unit` › T11.05),
backup e restauração com as tabelas do CRM (`backup.spec` › F8), todos em ambiente descartável. Rollback em produção:
não ensaiado (H17).

## Anexo A. Testes por requisito

O que cada teste afirma, conferido contra o código do teste (a verificação corrigiu as frases que diziam mais do que o teste prova). Caminho curto: `crm-api:89` é `tests/e2e/crm-api.spec.ts`, linha 89; `crm.unit:60` é `tests/unit/crm.unit.spec.ts`.

### CRM-01 — Contatos (pessoas) e empresas

**Implementado.** Pessoas e empresas com cadastro, busca, duplicidade por telefone ou e-mail dentro da empresa, arquivamento, mescla (só admin e gestor), importação de até 5.000 linhas com prévia e exportação mascarada (src/lib/crm/people.ts, src/lib/crm/schemas.ts). O telefone é cifrado, com hash por empresa e 4 finais. Grupo, contato excluído e empresa simulada não entram.

**Positivo**

- `crm-api:92` — cria pessoa mostrando só os 4 últimos do telefone; duplicado na empresa é recusado e devolve o ID existente
- `crm-api:114` — com a mesma Idempotency-Key, repetir devolve a mesma resposta sem criar de novo; outro corpo dá 422
- `crm-api:141` — versão velha recebe 409; arquivar libera o telefone para novo cadastro
- `crm-api:185` — mescla feita pelo admin: os negócios passam para a pessoa que fica e a mesclada fica com status merged (conferido no banco)
- `crm-api:385` — empresas: as contagens da lista batem com as do detalhe e trazem o responsável
- `crm-api:460` — exportar: desligado dá 403; ligado, CSV com telefone mascarado e célula sem fórmula; o número completo só sai com confirmação e fica auditado
- `crm-api:496` — importação: a prévia não grava; ao gravar, cria as válidas e pula duplicadas e linhas com erro
- `crm-matriz:279` — busca por nome sem acento, e-mail e 4 últimos dígitos; aceita contato sem telefone
- `crm-matriz:302` — importa 1, 100 e 5.000 linhas; repetir a planilha acusa duplicadas
- `crm.unit:60` — telefone normalizado (só dígitos, DDI 55, faixa de 10 a 15 dígitos)
- `crm.unit:69` — a chave de duplicidade inclui a empresa

**Negativo (autorização ou dado inválido)**

- `crm-api:163` — sem JSON dá 415; campo desconhecido dá 400; HTML é guardado como texto; ID inexistente dá 404
- `crm-api:185` — atendente não consegue mesclar
- `crm-api:303` — ID de outra empresa dá 404 e nada muda lá
- `crm-api:331` — o mesmo telefone em duas empresas não conta como duplicado
- `crm-api:460` — gestor recebe 403 ao exportar
- `crm-matriz:1216` — cadastro inválido dá 400 sem gravar; o limite exato é aceito; a edição usa a mesma regra
- `crm-matriz:302` — 5.001 linhas são recusadas
- `crm-matriz:1130` — ID da empresa A usado na B dá 404 em pessoa, empresa e mescla
- `crm-matriz:337` — mensagem de grupo é ignorada: sem conversa, sem evento e sem sugestão
- `crm-matriz:357` — conversa antiga de grupo: a captura pula e a conversão manual é recusada (409)
- `crm-matriz:374` — contato excluído: a sugestão expira e não vira negócio por nenhum caminho
- `crm-matriz:421` — empresa simulada não alimenta o CRM
- `crm-matriz:1310` — o banco guarda só o valor cifrado, o hash e os 4 finais
- `crm-contatos.ui:449` — a API recusa com 403 importar, mesclar e exportar pelo atendente
- `crm-dados-sugestoes.ui:265` — gestor recebe 403 ao importar e exportar, mesmo com a exportação ligada, e nada é gravado
- `crm.unit:136` — campo desconhecido é recusado (bloqueia mass assignment)

**Interface**

- `crm-contatos.ui:114` — novo contato pelo diálogo entra na lista com o telefone mascarado e fica gravado; Cancelar não grava
- `crm-contatos.ui:175` — cadastro inválido mostra o erro no campo e não grava
- `crm-contatos.ui:245` — telefone ou e-mail repetido mostra o aviso e oferece "Abrir contato existente"
- `crm-contatos.ui:294` — busca por nome, e-mail e 4 dígitos; filtro de empresa; "Limpar filtros"; resultado vazio
- `crm-contatos.ui:364` — nova empresa: CNPJ e site inválidos são barrados no campo; CNPJ repetido mostra aviso
- `crm-contatos.ui:449` — atendente cadastra contato e não vê Importar, Exportar nem Mesclar
- `crm-dados-sugestoes.ui:92` — importar mostra a prévia com contagens e o erro na linha; nada é gravado antes de confirmar
- `crm-dados-sugestoes.ui:182` — com exportar desligado, a tela avisa; ligado, baixa CSV com telefone mascarado
- `crm-dados-sugestoes.ui:265` — gestor não vê Importar nem Exportar na tela de Contatos

**Falta.** Não há como desfazer a mescla nem um lote de importação: mergeDataJson e importBatchId só guardam os dados, e src/components/crm/contact-detail.tsx:398 diz que não dá para desfazer pela tela. Faltam consentimento e preferências de contato, base legal, campos personalizados e prazo de retenção. Cada pessoa tem um só telefone e um só e-mail. A lista não filtra por etiqueta nem por origem. Na tela, as etiquetas só aparecem: o formulário não tem campo de etiqueta. Contato arquivado não pode ser reativado (personUpdate não tem status). lastInteractionAt só é gravado quando a pessoa nasce de uma conversa e na mescla; depois não é atualizado. Não há detecção de prováveis duplicados além da chave exata. Ao converter uma conversa, a pessoa é casada só pelo telefone (personFromContact em src/lib/crm/deals.ts): não distingue mesmo telefone de mesma pessoa. O mapeamento de colunas da importação é automático pelo cabeçalho, sem ajuste manual. A criação automática só liga e desliga, sem limiar nem filtros. Não há regra do CRM para números da própria empresa, e só a captura checa empresa simulada (a conversão manual não). O CNPJ fica em texto puro e só é checado como 14 dígitos, sem dígito verificador (risco S8 aceito em docs/crm/07-seguranca-e-privacidade.md). A mescla não é exercitada na tela: o teste só checa se o botão aparece.

### CRM-02 — Funis e etapas

**Implementado.** Ao ligar o CRM, o sistema cria um funil padrão com 5 etapas (src/lib/crm/tenant.ts). Em Ajustes do CRM dá para criar, renomear, tornar padrão, desativar e reativar funis e etapas, e reordenar etapas (src/components/crm/crm-settings-view.tsx). Ganho e perda são situações, não etapas. Etapa com negócio aberto não pode sair.

**Positivo**

- `crm-api:72` — ligar o CRM cria o funil padrão com as 5 etapas na ordem, uma única vez, e audita
- `crm-api:210` — ciclo completo: cria na 1ª etapa, move, ganha, reabre, perde com motivo e arquiva
- `crm-api:287` — funil novo é criado com as etapas na ordem enviada

**Negativo (autorização ou dado inválido)**

- `crm-api:287` — etapa de outro funil é recusada
- `crm-api:268` — duas pessoas movem o mesmo negócio ao mesmo tempo: uma vence e a outra recebe 409
- `crm-matriz:456` — etapa ou funil com negócio aberto não sai; o funil padrão não é desativado; a recusa não muda nada
- `crm-matriz:1130` — ID da empresa A usado na B dá 404 em funil e etapas
- `crm-ajustes-visao.ui:236` — supervisor e atendente recebem 403 ao ler ou mudar ajustes, criar funil e reordenar etapas
- `rbac:241` — cada papel fora de admin e gestor recebe 403 ao criar ou mudar funil e etapas e nos ajustes do CRM
- `crm.unit:200` — configuração, funil e mescla: admin e gestor têm, atendente não; reprocessar, importar e exportar: só admin

**Interface**

- `crm-ajustes-visao.ui:110` — cria funil pelo diálogo; sem nome ou sem etapa com nome mostra o erro e não envia nada
- `crm-ajustes-visao.ui:170` — reordena etapas com Subir e Descer e salva; a ordem continua depois de recarregar; etapa sem nome ou com negócio aberto não sai
- `crm-ajustes-visao.ui:236` — gestor muda os Ajustes do CRM pela tela
- `crm.ui:29` — move negócio de etapa pelo menu, pelo teclado e arrastando

**Falta.** Probabilidade e SLA por etapa existem no banco e na API, mas a tela não tem campo para editá-los: crm-settings-view.tsx:627 só reenvia os valores atuais. Nenhum teste cobre a mudança desses dois campos. O funil padrão vem sem SLA. Os funis não podem ser reordenados (pipelineUpdate não tem posição). Mudar de etapa não dispara tarefa nem automação. O quadro devolve o cartão à etapa anterior quando a API recusa (deals-view.tsx:447), mas nenhum teste de tela prova isso.

### CRM-03 — Negócios (oportunidades)

**Implementado.** O negócio tem valor em centavos, origem do valor, estimativa separada, probabilidade da etapa, próxima ação, responsável e versão (src/lib/crm/deals.ts). Ganho exige valor ou confirmação, perda exige motivo, e reabrir exige motivo gravado no histórico. O Kanban aceita arrastar, menu e teclado, e recarrega quando há conflito de versão (src/components/crm/deals-view.tsx).

**Positivo**

- `crm-api:210` — ciclo completo do negócio: ganho sem valor exige confirmação, perda exige motivo, reabrir e histórico (o ganho com valor declarado está em tests/e2e/crm-api.spec.ts:256)
- `crm-api:256` — o ganho usa o valor já declarado, em centavos inteiros
- `crm-api:543` — aceitar a sugestão cria o negócio com a estimativa separada do valor, sem duplicar
- `crm-reabrir:85` — reabrir com motivo dá 200; o evento traz motivo, autor e data; a auditoria não guarda o texto
- `crm-reabrir:115` — motivo de 500 caracteres e motivo com HTML são gravados inteiros, como texto; reabre ganho, perdido e arquivado
- `crm-matriz:490` — pessoa com vários negócios: filtro, detalhe e contagem batem
- `crm-matriz:563` — aceitar o ganho exige valor ou a confirmação de valor desconhecido
- `crm-matriz:1352` — ganho, reabertura e perda: o painel tira o ganho e conta a perda com o motivo
- `crm-matriz:916` — jornada da conversa até o ganho com valor: painel e histórico batem
- `crm-matriz:937` — perdido por preço: o painel conta a perda pelo motivo e a conversão fica 0

**Negativo (autorização ou dado inválido)**

- `crm-reabrir:54` — motivo ausente ou inválido dá 400 e o negócio continua ganho
- `crm-reabrir:143` — analista recebe 403 ao reabrir
- `crm-reabrir:158` — atendente recebe 404 em negócio fora do escopo
- `crm-reabrir:186` — negócio de outra empresa dá 404 e nada muda
- `crm-api:268` — movimento simultâneo: um recebe 409
- `crm-api:345` — atendente não atribui negócio a outra pessoa; analista só vê os números
- `crm-matriz:511` — valor negativo, texto, fração, acima do limite ou NaN dá 400
- `crm-matriz:1279` — duas edições na mesma versão: uma grava e a outra recebe 409
- `crm-matriz:865` — texto com injeção de instrução não fecha o negócio nem apaga o histórico
- `crm.unit:158` — a perda exige um motivo da lista
- `crm.unit:150` — valor em centavos inteiros, não negativo e com teto

**Interface**

- `crm.ui:29` — cria negócio pelo diálogo, move de etapa e fecha como ganho e como perdido
- `crm-reabrir.ui:13` — Reabrir pede o motivo; vazio mostra erro; com motivo reabre e o histórico mostra o motivo
- `crm.ui:223` — texto hostil gravado aparece como texto nas listas e nos detalhes
- `crm-ajustes-visao.ui:283` — Visão comercial mostra a estimativa separada e não exibe ganho sem valor como R$ 0,00

**Falta.** Não há comentários nem anexos (nem verificação de vírus). Não há campo de equipe nem origem da probabilidade. amountSource só recebe manual ou unknown (src/lib/crm/deals.ts); inferred e verified_external estão previstos e não são usados (docs/crm/03-modelo-dados.md). Não há ação na tela para ligar uma conversa a um negócio existente, e linkDeal não grava evento 'linked'. A criação manual não avisa quando já existe um negócio parecido aberto. O CrmDeal não tem deletedAt: o arquivamento é feito pelo status.

### CRM-04 — Tarefas e agenda

**Implementado.** Cada tarefa tem prazo, prioridade, responsável, situação (aberta, em andamento, concluída ou cancelada) e uma chave contra duplicidade (src/lib/crm/activities.ts). A agenda tem Hoje, Próximos 7 dias e Atrasadas no fuso da empresa (src/lib/crm/agenda.ts, src/components/crm/activities-view.tsx). Tarefas criadas de alerta ou item de recuperação não duplicam, e a reatribuição é auditada.

**Positivo**

- `crm-api:425` — tarefa vencida aparece no filtro e na visão geral; depois de concluída, sai
- `crm-f5:49` — cria uma tarefa por alerta, liga o negócio à conversa e audita
- `crm-f5:138` — cria uma tarefa por item de recuperação e liga o item ao negócio e à conversa
- `crm-agenda:68` — dueAfter (inclusivo) e dueBefore (estrito) devolvem só as tarefas da janela
- `crm-agenda:112` — Hoje e Próximos 7 dias contam o dia no fuso da empresa (São Paulo e Manaus)
- `crm-agenda:159` — tarefa em andamento conta como pendente e como atrasada quando vence
- `crm-agenda:217` — admin reatribui e conclui; a auditoria guarda campos, situação e IDs de membro, nunca o texto
- `crm-matriz:629` — vencidas na virada do dia (America/Sao_Paulo): só o que já passou de agora
- `crm-matriz:1475` — concluir a tarefa criada do alerta não resolve o alerta

**Negativo (autorização ou dado inválido)**

- `crm-agenda:90` — filtro inválido dá 400; "pending" só vale na leitura
- `crm-agenda:188` — atendente não troca o responsável (403) nem vê ou altera tarefa de outra pessoa (404)
- `crm-agenda:274` — visualizador e analista são recusados como responsáveis (400)
- `crm-agenda:256` — PATCH sem mudança real não gasta versão nem gera auditoria
- `crm-f5:84` — alerta e recuperação juntos dão 400; outra empresa dá 404; contato excluído dá 404
- `crm-f5:109` — atendente só vê alertas das próprias conversas; tarefa de outra pessoa não vaza
- `crm-matriz:613` — duas pessoas concluindo a mesma tarefa: a outra recebe 409

**Interface**

- `crm-agenda.ui:76` — Hoje, Próximos 7 dias e Atrasadas seguem o dia da empresa, mesmo com o navegador em outro fuso
- `crm-agenda.ui:134` — em Editar tarefa, título vazio não salva; título, responsável e Em andamento ficam gravados
- `crm-agenda.ui:186` — atendente edita a própria tarefa sem o campo Responsável
- `crm-f5.ui:28` — na tela, o alerta vira tarefa do CRM e o segundo clique não duplica; a recuperação vira uma tarefa (o "sem duplicar" da recuperação está em tests/e2e/crm-f5.spec.ts:138)

**Falta.** Não há lembrete na plataforma nem por e-mail: a opção de avisos fica escondida porque nada a usa (crm-settings-view.tsx:143). Não há SLA de tarefa nem horário comercial. Mudar de etapa não cria tarefa (nenhum código usa a origem 'stage'). O campo de resultado não aparece na tela. A tela de tarefas mostra a equipe toda ou só as suas ("Só as minhas"): não filtra por outro responsável nem por equipe, embora a API aceite ownerMemberId. Concluir ou cancelar uma tarefa não entra no histórico do negócio, só na auditoria.

### CRM-05 — CRM dentro da conversa (Negócios relacionados)

**Implementado.** O detalhe da conversa mostra "Negócios relacionados" com título, situação, etapa, responsável, valor (ou estimativa) e próxima tarefa, mais "Abrir no CRM" e "Criar tarefa" (src/components/crm/related-deals.tsx). O bloco respeita o escopo e some quando o CRM está desligado. Nada é enviado pelo WhatsApp.

**Positivo**

- `crm-f5:163` — a API por conversa lista só os negócios ligados, com etapa e próxima tarefa; conversa sem vínculo dá lista vazia
- `crm-matriz:893` — negócio ligado a duas conversas conta uma vez; o filtro por conversa acha o negócio
- `crm-f5:49` — criar tarefa a partir do alerta liga o negócio à conversa

**Negativo (autorização ou dado inválido)**

- `crm-f5:163` — respeita o escopo da conversa e do negócio; outra empresa dá 404
- `crm-f5:84` — contato excluído: a lista de negócios da conversa dá 404
- `crm-api:61` — com o CRM desligado, contatos, negócios e visão geral dão 404 crm_disabled e nada é gravado
- `crm-matriz:1310` — API de contatos e auditoria não trazem o número completo (essa empresa não gera eventos na fila do CRM; o payload da fila sem nome e sem texto está em tests/e2e/crm-api.spec.ts:543)
- `crm-matriz.unit:122` — nenhum arquivo do CRM chega ao WhatsApp nem chama função de envio

**Interface**

- `crm-f5.ui:28` — a conversa mostra os negócios relacionados com a próxima tarefa; dali cria tarefa ligada ao negócio e abre o negócio no CRM
- `crm-f5.ui:118` — com o CRM desligado, alerta, recuperação e conversa não mostram nada do CRM

**Falta.** O bloco não mostra a pessoa e a empresa do CRM (os dados vêm no payload), nem a última atividade, nem a próxima ação do negócio. Não há ação própria "Contato feito externamente": o caminho é criar tarefa do tipo "WhatsApp (fora do AtendeRadar)". O estado vazio não oferece criar tarefa nem negócio. No detalhe do negócio, Voltar leva a Negócios, não à conversa (deal-detail.tsx:242). A data no bloco usa o fuso do navegador. "Ir para Negócios" abre a lista sem filtrar pela conversa.

### CRM-06 — Sincronização com o AtendeRadar e sugestões

**Implementado.** Oito eventos do AtendeRadar entram por uma fila, com payload estrito e chave de idempotência (src/lib/crm/events.ts, src/lib/crm/consumer.ts). Por padrão o sistema só sugere: criar negócio, criar tarefa (alerta alto ou crítico) e confirmar desfecho. A sugestão de mudar etapa só aparece com a opção "Sugerir mudança de etapa" ligada, e ela vem desligada. Com a opção de criar negócios automaticamente ligada, a oportunidade vira negócio sem revisão (src/lib/crm/consumer.ts:72). A pessoa aceita ou descarta, e fica registrado quem decidiu e a versão da regra (src/lib/crm/suggestions.ts). Há nova tentativa com espera e DLQ, e o desfecho humano vence.

**Positivo**

- `crm-api:543` — oportunidade da conversa vira sugestão; aceitar cria o negócio sem duplicar
- `crm-matriz:563` — "já paguei" sugere confirmar o ganho
- `crm-matriz:584` — alerta que volta não repete a sugestão nem a tarefa
- `crm-matriz:676` — dez rodadas seguidas não duplicam negócio, pessoa, sugestão, histórico nem eventos
- `crm-matriz:708` — estimativa fora de ordem: a mais nova fica e a antiga é ignorada
- `crm-matriz:1383` — etapa escolhida por pessoa só recebe sugestão, nunca é movida; com a opção desligada, nada acontece
- `crm-matriz:1431` — recuperação concluída liga o item ao negócio; só "venda confirmada" sugere ganho
- `crm-matriz:1553` — erro temporário tenta de novo com espera; na 8ª tentativa vai para a DLQ
- `crm.unit:114` — a chave de idempotência usa tipo, agregado e versão
- `crm-matriz:1648` — com a criação automática ligada, a oportunidade vira negócio uma vez só, sem valor confirmado, ligado à conversa, sem sugestão pendente; três rodadas a mais não duplicam

**Negativo (autorização ou dado inválido)**

- `crm-matriz:550` — "se eu pagar" e "ainda não paguei" não sugerem ganho
- `crm-matriz:735` — "alerta criado" que chega depois do "resolvido" não abre sugestão
- `crm-matriz:865` — injeção de instrução no texto não fecha o negócio
- `crm-matriz:1494` — o desfecho da pessoa vence o da conversa; grava uma única divergência
- `crm-api:601` — nova rodada da análise não desfaz o perdido marcado por pessoa
- `crm-matriz:374` — contato excluído: a sugestão expira
- `crm-matriz:391` — com a criação automática ligada, contato excluído não é capturado e o evento atrasado é ignorado sem erro e sem negócio
- `crm-matriz:421` — empresa simulada não alimenta o CRM
- `crm-matriz:757` — só o admin reprocessa a DLQ; outra empresa dá 404
- `crm.unit:120` — payload do evento com campo extra (nome do cliente, texto da mensagem) é recusado; o telefone não é testado
- `crm-matriz.unit:122` — o CRM não chega ao WhatsApp
- `crm-dados-sugestoes.ui:398` — a API dá 403 ao analista em listar, aceitar e descartar

**Interface**

- `crm-dados-sugestoes.ui:297` — aceitar aplica o efeito com evento; descartar grava motivo; sugestão de etapa que ficou velha expira; decidir duas vezes dá 409
- `crm-dados-sugestoes.ui:398` — analista não vê o painel de Sugestões
- `crm-ajustes-visao.ui:63` — liga e desliga pela tela a opção 'Sugerir mudança de etapa' (fica gravada depois de recarregar); com falha 500 simulada ao ligar 'Exportar dados do CRM', o interruptor volta e nada é gravado

**Falta.** Faltam os eventos de intenção detectada, mudança de qualificação, alerta atualizado (a recorrência reemite alert.created), recuperação criada e atribuída, desfecho confirmado por humano e contato atualizado. Não há sugestão de próximo contato, de texto para copiar nem checklist. As sugestões vêm por data, sem prioridade por risco ou valor. "Negócios parados" na visão geral abre a lista sem filtro. Promessa perto do prazo não vira tarefa, porque só alertas alto e crítico viram, e só quando a conversa já tem negócio aberto. Não há cota de automação por empresa.

### CRM-07 — Recuperação unificada

**Implementado.** A fila RecoveryItem segue como fonte. O evento recovery.completed (src/lib/crm/capture.ts:133-143) liga o item ao negócio pelo vínculo recovery e grava o resultado no histórico (src/lib/crm/consumer.ts:200). A tela de recuperação só ganhou "Criar tarefa no CRM" (src/components/recovery/recovery-view.tsx).

**Positivo**

- `crm-matriz:1431` — recovery.completed liga o item ao negócio, grava o resultado no histórico, sem duplicar; só sale_confirmed sugere ganho e nada vira ganho sozinho
- `crm-f5:138` — uma tarefa aberta por item; com dealId cria o vínculo recovery com o item e a conversa
- `crm-matriz:1494` — T05.06: a correção da pessoa vence; uma divergência por fechamento
- `crm-api:601` — fechar o negócio como perdido reflete na conversa (reflected 1, kept 0; status operacional lost) e o tick seguinte não desfaz a perda
- `crm-matriz:1606` — ganho fecha o item aberto da recuperação como recuperado e perda como perdido, com o motivo; item já concluído não muda

**Negativo (autorização ou dado inválido)**

- `crm-f5:84` — alerta e recuperação juntos dão 400; alerta de outra empresa ou inexistente dá 404; item de recuperação de contato excluído dá 404
- `crm-f5:138` — atendente recebe 404 no item de recuperação de outra pessoa
- `crm-api:210` — transição inválida dá 409: fechar de novo, reabrir negócio aberto, mover negócio fechado
- `crm-api:268` — troca de etapa simultânea com versão velha dá 409
- `crm-matriz:1606` — outra empresa fechando o negócio recebe 404 e o item da recuperação não muda

**Interface**

- `crm-f5.ui:28` — o menu da recuperação cria uma tarefa do CRM (source recovery, tipo call)
- `crm-f5.ui:118` — com o CRM desligado, a recuperação não mostra o menu do CRM

**Falta.** A tela de recuperação não mostra negócio, etapa, probabilidade, próxima tarefa, owner nem histórico. A tarefa criada pela tela vai sem dealId, então não cria vínculo (src/app/api/crm/activities/route.ts:83 só liga com dealId). Não existe o resultado meeting_booked; result é texto livre (events.ts:21). Item not_recovered também ganha o vínculo recovery e, se o negócio for ganho, entra como recuperado no painel. Negócio ligado só por recovery não reflete o fechamento no item (outcome.ts:30 usa só origin/opportunity). A compensação com o CRM fora do ar não tem teste. O histórico mostra texto fixo, sem o resultado (deal-detail.tsx:196).

### CRM-08 — Dashboards e indicadores

**Implementado.** A Visão comercial (src/lib/crm/overview.ts e src/components/crm/overview-view.tsx) mostra abertos por etapa, valor declarado e estimado separados, sem próxima ação, tarefas vencidas, tempo na etapa, perdas por motivo, ganho confirmado e por responsável, com Recharts, legenda e metodologia em texto. O período é filtrado (7, 30 e 90 dias). A exportação de negócios traz declarado e estimado em colunas separadas (src/lib/crm/exports.ts:65).

**Positivo**

- `crm-api:425` — tarefa vencida conta em overdueTasks; concluída sai da lista de vencidas
- `crm-matriz:916` — T12.05: ganho com valor entra no painel com conversão 1
- `crm-matriz:937` — T12.06: perda por preço aparece em byReason e conversão 0
- `crm-matriz:893` — T10.02: negócio com duas conversas conta uma vez por etapa
- `crm-matriz:1352` — T10.06: ganho reaberto sai do painel; a perda conta com motivo

**Negativo (autorização ou dado inválido)**

- `crm-api:444` — período inválido ou acima de 366 dias dá 400
- `crm-matriz:204` — escopo por papel no painel; visualizador vê só números e recebe 403 nas listas
- `crm-matriz:1061` — T02.01/T10.04: painel e exportação da empresa B não trazem dados da A
- `crm-matriz:953` — T12.07: plano vencido recebe 402
- `crm-matriz:865` — T08.08: injeção de instrução não vira ganho nem valor

**Interface**

- `crm-ajustes-visao.ui:283` — conta nova sem números; estimativa separada; ganho sem valor não vira R$ 0,00; atalho abre tarefas atrasadas
- `crm-ajustes-visao.ui:378` — analista e visualizador veem só agregados, sem tabela por responsável; API de negócios dá 403

**Falta.** Não há conversão por etapa (só a global), quebra por equipe nem tempo de resposta antes/depois. Não há índice de confiança, e a metodologia não cobre conversão, tempo na etapa nem a tabela por responsável. O filtro aceita só from/to (schemas.ts:208): sem owner, equipe ou funil. Drill-down só nas tarefas vencidas; "Ver negócios" abre a lista sem filtro e etapa, motivo e responsável não abrem nada. recoveredCents não aparece na tela. Nenhum teste confere recoveredCents, byOwner pela API, nem as colunas separadas de declarado e estimado na exportação.

### CRM-09 — Configuração, segurança e administração

**Implementado.** O operador liga o CRM por empresa (src/app/api/admin/organizations/[id]/crm/route.ts e admin-view.tsx). Os Ajustes (src/components/crm/crm-settings-view.tsx) têm automações, funis e etapas, e a seção Sincronização com status, atraso, fila, conferência e DLQ (reprocessar só admin).

**Positivo**

- `crm-api:72` — ligar cria o funil padrão uma vez, audita; desligar esconde sem apagar
- `crm-api:287` — funil novo com etapas e ordem
- `crm-matriz:757` — T07.05: DLQ sem payload; admin reprocessa com auditoria; gestor vê com canRetry false
- `crm-matriz:1553` — status vira degraded depois da 8ª tentativa
- `crm-api:543` — status da integração traz checkpoints, canRetry e DLQ vazia
- `crm-matriz.unit:29` — T11.05: CRM_DISABLED desliga flags, captura e fila sem consultar o banco

**Negativo (autorização ou dado inválido)**

- `crm-api:49` — só o operador liga; corpo inválido 400/415; empresa inexistente 404
- `crm-api:61` — desligado: as quatro rotas testadas (listar contatos, negócios e visão; criar contato) dão 404 crm_disabled e nada é gravado
- `crm-matriz:757` — gestor e visualizador recebem 403 no retry; outra empresa 404
- `crm-matriz:176` — T02.04: membro suspenso 401; empresa bloqueada 402
- `crm-matriz:1182` — T02.03: organizationId no corpo ou URL dá 400
- `crm.unit:200` — ajustes, funis e mescla incluem admin e gestor e não o atendente; reprocessar, importar e exportar são só admin
- `rbac:241` — matriz de permissões das rotas do CRM por papel

**Interface**

- `admin-crm.ui:30` — operador liga e desliga o CRM da empresa com confirmação
- `crm-ajustes-visao.ui:63` — liga e desliga uma automação; com falha 500 o interruptor volta
- `crm-ajustes-visao.ui:236` — gestor muda os ajustes e vê a Sincronização; supervisor e atendente 403
- `crm-ajustes-visao.ui:110` — cria funil; sem nome ou sem etapa mostra erro e não envia
- `crm-ajustes-visao.ui:170` — reordena etapas; etapa sem nome ou com negócio aberto é recusada
- `crm-telas.ui:46` — menu por papel; supervisor e atendente sem Ajustes

**Falta.** Sem campos adicionais, limiar de criação automática, política de owner, edição de probabilidade e SLA na tela e configuração de papéis. O status não tem o estado offline (worker.ts:193 só tem operational, syncing e degraded). O admin da plataforma não mostra health, jobs nem reconciliação por empresa; só ligado e kill switch. Nenhum teste de interface confere o rótulo do status da sincronização.

### CRM-10 — Onboarding, ajuda e treinamento

**Implementado.** Há um guia só para Negócios ('crm-deals', 5 passos, src/lib/tours.ts:151), com seenTours. Há o artigo crm-comercial (src/content/ajuda.ts:235). A Visão comercial tem o checklist de 3 itens (overview-view.tsx:238).

**Positivo**

- `crm-telas.ui:86` — o guia de Negócios abre na primeira visita, percorre os passos e fica gravado como visto
- `crm-dados-sugestoes.ui:446` — a busca da ajuda acha o artigo do CRM e abre o guia de Negócios
- `crm-api:72` — ligar o CRM já cria o funil padrão

**Negativo (autorização ou dado inválido)**

- `crm-telas.ui:86` — o guia não volta depois de concluído; na Visão geral nenhum guia abre
- `crm-dados-sugestoes.ui:446` — palavra sem resultado avisa
- `crm-ajustes-visao.ui:378` — analista e visualizador não veem o checklist nem os botões
- `crm-f5.ui:118` — com o CRM desligado, o menu já carregado não tem o grupo Comercial, o link direto #crm-deals volta à Visão geral e /api/crm/deals responde 404; alerta, recuperação e conversa não mostram ações do CRM (o artigo de ajuda do CRM continua visível)

**Interface**

- `crm-ajustes-visao.ui:283` — checklist "Comece por aqui" com 0 de 3 e botões; some depois dos negócios
- `crm-telas.ui:86` — guia de Negócios na tela
- `crm-dados-sugestoes.ui:446` — artigo do CRM na Central de ajuda

**Falta.** Contatos, Empresas, Tarefas, Visão comercial e Ajustes não têm guia. src/lib/system-tour/* não tem capítulo do CRM, e ROLE_STEPS e ROLE_DESCRIPTIONS não citam o CRM. O checklist não tem "Criar primeiro funil", "Importar contatos", "Associar conversa" nem "Acompanhar próxima tarefa". O item do negócio nunca fica marcado, pois o checklist some no primeiro negócio. Nenhum teste do tour do sistema cobre o CRM.

### CRM-11 — Importação/exportação e portabilidade

**Implementado.** A importação de CSV (src/app/api/crm/imports/route.ts, src/lib/crm/imports.ts) tem prévia (a tela obriga a conferir antes de importar; a API aceita gravar direto com dryRun false e revalida as linhas), erros por linha e deduplicação por telefone e e-mail, só para admin. A exportação (src/lib/crm/exports.ts) gera CSV de pessoas ou negócios com telefone mascarado e auditoria. A exportação e a exclusão da empresa incluem o CRM (org-export.ts, org-deletion.ts).

**Positivo**

- `crm-api:496` — a prévia não grava; gravar cria as válidas e pula duplicadas e erros por linha
- `crm-matriz:302` — T03.03: 1, 100 e 5.000 linhas; repetir acusa duplicadas
- `crm-api:460` — CSV com telefone mascarado, sem fórmula; auditoria crm.exported
- `crm-api:627` — a exportação da empresa leva o CRM sem chaves internas
- `crm-matriz:832` — T08.05: a exclusão da empresa apaga as 16 tabelas do CRM
- `backup:128` — as 16 tabelas do CRM voltam do backup
- `crm.unit:85` — célula com = + - @ ganha apóstrofo
- `crm-matriz:1716` — a exportação da empresa leva os vínculos do negócio e da identidade

**Negativo (autorização ou dado inválido)**

- `crm-api:460` — exportação desligada 403; telefone completo sem confirmação 400; gestor 403
- `crm-matriz:302` — 5.001 linhas recusadas
- `crm-api:529` — limite por minuto: 429 com Retry-After
- `crm-matriz:832` — a exclusão não toca na outra empresa
- `crm-matriz:1061` — a exportação da B não traz a A
- `crm.unit:173` — dryRun obrigatório; lista vazia e 5.001 linhas recusadas; exportar atividades é recusado
- `crm-matriz:1716` — a exportação não leva vínculo, negócio nem ID de outra empresa, nem a chave interna linkKey

**Interface**

- `crm-dados-sugestoes.ui:92` — prévia com contagens e erro na linha; nada gravado antes de confirmar; recusa .xlsx
- `crm-dados-sugestoes.ui:182` — exportação desligada avisa; ligada baixa CSV mascarado; completo só com confirmação
- `crm-dados-sugestoes.ui:265` — gestor não vê Importar nem Exportar e a API dá 403
- `crm-contatos.ui:449` — atendente sem Importar, Exportar e Mesclar

**Falta.** O limite é 5.000 linhas; T03.03 pede 10.000. Não há reversão de lote: importBatchId é gravado, mas não há rota nem botão. A rota não usa Idempotency-Key, e linha só com nome não é deduplicada. O mapeamento de colunas é automático. A tela do CRM não exporta empresas, atividades nem auditorias (a exportação de dados da empresa, em Configurações › Privacidade, para o administrador da empresa, leva empresas, tarefas e registros e a auditoria em JSON). Só o admin exporta, e sempre a empresa toda, sem recorte por escopo. Nenhum teste confere a auditoria crm.imported. Não há retenção para os dados de negócio (pessoas, empresas, negócios, tarefas, vínculos); só a fila técnica do CRM é limpa (outbox e inbox em 30 dias, idempotência em 24 h; src/lib/crm/worker.ts:146-151). Os backups guardam o CRM da empresa apagada. A parte do Open Mercato não se aplica (CRM nativo).

### CRM-12 — Relatórios e governança comercial

**Implementado.** A Visão comercial (src/lib/crm/overview.ts) cobre período, etapa, responsável e perdas por motivo, e conta os negócios ganhos no período ligados a um item da Fila de Recuperação (recoveredCount; o valor recoveredCents é calculado, mas não aparece na tela). Os vínculos guardam IDs de negócio, alerta, conversa e item, com horário. A metodologia diz que a ligação não prova causa e a tela usa "da Fila de Recuperação".

**Positivo**

- `crm-matriz:937` — T12.06: perda por motivo e conversão no painel
- `crm-matriz:916` — T12.05: ganho com valor no painel e no histórico
- `crm-matriz:1352` — T10.06: reabertura tira o ganho; a perda conta com motivo
- `crm-matriz:893` — T10.02: um negócio aberto ligado a duas conversas conta uma vez no painel (por etapa) e na lista; o filtro por conversa encontra o negócio
- `crm-matriz:1431` — recuperação ligada ao negócio sem ganho automático

**Negativo (autorização ou dado inválido)**

- `crm-api:444` — período inválido dá 400
- `crm-matriz:204` — o painel respeita o escopo do papel
- `rbac:241` — acesso às rotas por papel
- `crm-matriz:953` — T12.07: plano vencido recebe 402
- `crm-matriz:865` — injeção de instrução não vira ganho
- `crm-matriz:1061` — nada de outra empresa no painel nem na exportação

**Interface**

- `crm-ajustes-visao.ui:378` — papéis de leitura veem só agregados; API de negócios 403
- `crm-ajustes-visao.ui:283` — números da Visão comercial na tela, com a linha "Sem responsável"

**Falta.** Não há relatório por equipe nem por origem (origem só como filtro da lista, schemas.ts:151). Não há efetividade das tarefas; completedAt é gravado (activities.ts:122), mas nenhum indicador usa. src/lib/reports (geração, PDF, XLSX, e-mail agendado) não tem nada do CRM, e o painel não exporta. O painel não abre os registros por trás dos números. O impacto na recuperação conta itens not_recovered quando o negócio ligado é ganho. Nenhum teste confere recoveredCount nem recoveredCents.
