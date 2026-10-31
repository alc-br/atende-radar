# Execução autônoma — AtendeRadar CRM

Registro persistente da execução da *Especificação Funcional e Técnica Mestre v1.0* (AtendeRadar CRM), fases F0 a F9.
Atualizado a cada tarefa. Vale o que tem evidência executável (comando, log, teste, commit); texto de agente sem prova
não conta como concluído.

## Referência

| Item | Valor |
|---|---|
| Início | 30/10/2026 |
| Commit de referência (baseline) | `eac80423f80616e79772d3cdadff9e624433ffad` (= `origin/main` em 30/10/2026) |
| Branch de integração | `crm/integracao` (worktree `.claude/worktrees/crm`), sem upstream na `main` |
| Regra de produção | push na `main` faz deploy. Nada do CRM entra na `main` sem PR, CI verde, revisão e critérios de liberação |
| Flag | `crm.enabled` desligada por padrão em todos os tenants |
| Orquestrador | sessão Claude Code (Opus 5.5) |

### Estado do CI no commit de referência

- Deploy de `eac8042` (só `handoff.md`) **falhou por infraestrutura**: job `browsers` sem acesso ao `next/font/google`
  e shard 1 (`unit`, `api`, `ui-tablet`) com "Timed out waiting 180000ms from config.webServer". Os shards 2 a 5 passaram.
  Execução 41119332369.
- Último deploy verde: `62ea82f` (26/10/2026). O código em produção é o de `62ea82f`; `eac8042` mudou só documentação.
- Não reexecutei o CI da `main` (reexecutar dispararia deploy). O baseline de testes é medido localmente na F0.

## Mecanismo de agentes

- **Workflow** (orquestração determinística com subagentes, `isolation: 'worktree'` para edições simultâneas) e **Agent**:
  disponíveis nesta sessão. Os 10 papéis da especificação viram agentes de workflow com escopo e arquivos definidos.
- Decisões de schema, auth, contrato e migração ficam centralizadas no orquestrador. Dois agentes nunca editam a mesma
  migração ou o `schema.prisma` ao mesmo tempo.
- Um Playwright por checkout (porta e `prisma/test.db` próprios). No worktree do CRM: `E2E_PORT=3111` e
  `TURBOPACK_ROOT` apontando para a raiz do repositório principal (o `node_modules` é junção para o da raiz).
- Cuidado: o cliente Prisma gerado mora no `node_modules` compartilhado. Depois de gerar com o schema do CRM, quem voltar
  a trabalhar na `main` roda `bunx prisma generate` lá.

## Restrições do ambiente (medidas em 30/10/2026)

- Disco: D: 4,6 GB livres (98%); C: 13 GB livres. A POC do Open Mercato roda no C: (pasta temporária da sessão).
- Node 24.13, Bun 1.3.14, Yarn 1.22 (Yarn 4 via corepack na POC). Docker instalado mas parado.
- WSL Ubuntu com PostgreSQL 16 (cluster parado) e Redis 7.0.15. O disco virtual do WSL fica no D:, então nada pesado
  é instalado dentro do WSL.

## Decisões fixas (D1–D8, não reabrir)

D1 CRM habilitável, modo Auditoria preservado · D2 sugestão antes de automação · D3 sem envio de WhatsApp ·
D4 contato observacional e comercial separados e vinculados · D5 Open Mercato só se passar na POC · D6 SQLite mantido ·
D7 flag desligada até decisão comercial · D8 sem Enterprise ou dependência paga.

## Registro de tarefas

Estados: `pendente`, `em andamento`, `bloqueada`, `concluída`, `descartada`.

| ID | Requisito | Agente | Depende de | Estado | Arquivos | Testes | Evidência | Commit | Próxima ação |
|---|---|---|---|---|---|---|---|---|---|
| F0-01 | Inventário do legado | 01 auditor | — | concluída | `docs/crm/00-inventario.md` | — | riscos R1–R19 com arquivo e linha | — | R1, R2 e R3 tratados na F2 |
| F0-02 | Baseline de testes (tsc, lint, db:check, unit, api) | 08 QA | — | concluída | `docs/crm/reports/f0-testes.md`, `f0-logs/` | suites atuais | tsc/eslint/db:check limpos; unit 566; api 1614 + 4 tempo esgotado que passaram na reexecução | — | comparar a cada rodada completa |
| F0-03 | Baseline visual (design.ui + capturas) | 05 frontend | F0-02 | concluída | `docs/crm/01-baseline-visual.md`, `screenshots/baseline/` | design.ui, a11y.ui | 12 passaram, 9 pulados (previstos); a11y 5 passaram, 0 violação em 32 auditorias; 27 capturas | — | repetir depois da F4 |
| F0-04 | Benchmark e capacidade do servidor | 09 SRE | — | concluída | `docs/crm/01-benchmark-atual.md` | — | 6 vCPU, 11,7 GiB, ~5,3 GiB livres; app 512 MiB no pico; runner 4 GiB no pico | — | — |
| F0-05 | SBOM e licenças do app | 07 segurança | — | concluída com pendência | `docs/crm/reports/sbom-baseline.json`, `licencas-baseline.md`, `sca-baseline.md` | — | 909 pacotes, nenhum AGPL/SSPL; `bun audit` 22 achados (7 altos) | — | **bloqueio de CI:** 5 altos do `node-forge` (≤1.4.0) quebram o passo de auditoria do deploy; ver diário 31/10 |
| F1-01 | Contratos e licença do Open Mercato (v0.9.0) | 02 Open Mercato | — | concluída | `docs/crm/open-mercato-contracts.md`, `reports/om-licencas.md` | — | núcleo MIT; `@open-mercato/enterprise` e `newrelic` precisam sair | — | — |
| F1-02 | POC isolada (2 tenants, CRUD, auth, idempotência) | 02 Open Mercato | F1-01 | concluída | `docs/crm/02-poc-open-mercato.md` | scripts da POC | 93 verificações, 90 passaram; 3 falhas = defeito C15 (etapa de outro tenant aceita) | — | — |
| F1-03 | Portões LIC/TEN/AUTH/CRUD/SYNC/UX/OPS/ECO e ADR-001 | 03 arquiteto + 10 revisor | F1-02, F0-04 | concluída | `docs/crm/ADR-001-arquitetura-crm.md` | evidências da POC | **decisão B (nativo)**: depois da revisão do agente 10, TEN-01 e OPS-01 reprovados; AUTH-01, SYNC-01, UX-01 e ECO-01 inconclusivos; CRUD-01 aprovado; LIC-01 aprovado com ressalva | — | revisão do orquestrador: fatos conferem com a POC e o benchmark; revisão adversarial (agente 10) aplicada no ADR e na nota de correção de `02-poc-open-mercato.md` |
| F2-01 | Modelo de dados e migração aditiva | orquestrador | F0-01 | concluída | `prisma/schema.prisma`, `prisma/migrations/20261031120000_crm_base/`, `docs/crm/03-modelo-dados.md` | `crm.unit`, `crm-api` | só tabelas novas `Crm*`; nenhuma coluna existente muda | — | — |
| F2-02 | Contrato `/api/crm/*` (BFF), erros estáveis, idempotência, versão, limite | orquestrador | F2-01 | concluída | `src/app/api/crm/**`, `src/lib/crm/{http,idempotency,schemas,dto,scope}.ts`, `docs/crm/04-api-crm.md` | `crm-api.spec.ts` (24) | 415/400/404/409/422/429 com `code` e `requestId` provados | — | — |
| F2-03 | Liberação por empresa (D1, D7) e permissões (ADR-003) | orquestrador | F2-01 | concluída | `src/app/api/admin/organizations/[id]/crm/route.ts`, `src/lib/crm/flags.ts`, `src/lib/permissions.ts`, `docs/crm/ADR-003-auth-tenant-rbac.md` | `crm-api`, `rbac.spec.ts`, `crm.unit` | desligado = 404 em todas as rotas; atendente só o próprio; analista só a visão geral | — | — |
| F3-01 | Outbox, worker, consumidor e reconciliação | orquestrador | F2-02 | concluída | `src/lib/crm/{capture,events,worker,consumer,tick}.ts`, `src/lib/background.ts`, `docs/crm/05-sincronizacao.md`, `ADR-002` | `crm-api` › sincronização | oportunidade vira sugestão (D2), sem duplicar no re-tick, payload sem PII, DLQ com reprocessamento auditado | — | — |
| F3-02 | LGPD: exportação e exclusão da empresa incluem o CRM | orquestrador | F2-01 | concluída | `src/lib/org-export.ts`, `src/lib/org-deletion.ts` | `crm-api` › LGPD | export sem `phoneEncrypted`/`phoneKey` | — | — |
| F4-01 | Base da interface: estado de tela, menu Comercial, cliente da API | orquestrador | F2-02 | concluída | `src/lib/store.ts`, `src/lib/crm/{client,labels}.ts`, `src/app/page.tsx`, `app-sidebar.tsx` | tsc | menu só com `crm.enabled`; telas com `next/dynamic` (não pesam no painel de quem não usa) | — | — |
| F4-02 | Telas: negócios (Kanban com teclado), contatos, empresas, tarefas, visão comercial, ajustes | 05 frontend ×4 + revisão | F4-01 | concluída | `src/components/crm/*`, `src/styles/painel-ajustes.css`, `docs/crm/06-ux-e-design.md` | `crm.ui.spec.ts` | rascunhos em `wip/` revisados, levados por cima dos esboços; CSS dos 4 juntado sem seletor repetido; tsc 0, eslint 0, unit 75/75 | — | — |
| F4-03 | Liga/desliga do CRM no Admin (operador), com confirmação | orquestrador | F2-03 | concluída | `src/components/admin/admin-view.tsx`, `src/app/api/admin/route.ts` | `admin-crm.ui.spec.ts` | confirmação antes de gravar, auditoria `crm.enabled_changed` com `operator:true`; desligar não apaga | — | — |
| F5-01 | Tarefa a partir de alerta e de item de recuperação; negócios da conversa (API) | orquestrador | F3-01 | concluída | `src/app/api/crm/activities/route.ts`, `src/app/api/crm/deals/route.ts`, `src/lib/crm/{activities,queries}.ts`, `docs/crm/04-api-crm.md` | `crm-f5.spec.ts` (5) | escopo das telas de alertas e recuperação; contato excluído = 404; uma tarefa aberta por causa; sugestão `create_task` pendente vira `expired` | — | — |
| F5-02 | Interface da F5: "Tarefa no CRM" (alertas), "Criar tarefa no CRM" (recuperação), "Negócios relacionados" (conversa) | orquestrador | F5-01, F4-02 | concluída | `src/components/crm/{crm-task-button,related-deals}.tsx`, `alerts-view.tsx`, `recovery-view.tsx`, `conversation-detail.tsx` | `crm-f5.ui.spec.ts` | com o CRM desligado nada aparece | — | — |
| F7-01 | Matriz T01–T12 da especificação | 08 QA | F5-01 | concluída | `tests/e2e/crm-matriz.spec.ts` (28), `tests/unit/crm-matriz.unit.spec.ts` (4) | `crm-matriz` | escrita afirmando a regra certa; achou 6 faltas do produto (F7-07); rodada nº 1: 87 de 88 com os outros testes do CRM, a falha era do teste (T11.05) | — | códigos T01, T09 e T11 mapeados por tema; a injeção de instrução está em T08.08 (o `07` citava T09, corrigido) |
| F4-04 | Larguras de 320 a 1920 px sem rolagem lateral | orquestrador | F4-02 | concluída | `src/styles/painel-ajustes.css` (`.crm-quadro`, `.crm-coluna__lista`, `.crm-grade`), `overview-view.tsx`, `company-detail.tsx`, `contact-detail.tsx` | `crm.ui.spec.ts` › larguras | quadro rolava 530 px e Visão comercial 377 px em 320; depois, 0 nas 7 larguras em Chromium, Firefox e Safari | — | — |
| F7-02 | Medição de carga (volume declarado) | 09 SRE | F2-02 | concluída | `scripts/carga/medir-crm.ts`, `08-testes-e2e.md` § 4 | carga | 10 mil pessoas, 2 mil empresas, 7 mil negócios, 25 mil conversas: lista p95 ≤ 107 ms (meta 500), mutação p95 ≤ 60 ms (meta 800), fila em regime normal p95 6,9 s (meta 60 s), re-captura 0 duplicados, 1 `SCAN` de 0 ms em 153 consultas; achou 2 defeitos de desempenho (F7-05) | — | — |
| F7-03 | Outros navegadores (Firefox, Safari, iPhone) | 08 QA | F4-04 | concluída | `playwright.config.ts` (`CROSS_BROWSER`) | `crm.ui`, `crm-f5.ui` | 17 passaram, 1 pulado (varredura de larguras no iPhone) em 9,9 min | — | — |
| F7-04 | Contagens da lista de empresas iguais às do detalhe, com nome do responsável | orquestrador | F2-02 | concluída | `src/lib/crm/queries.ts`, `companies-view.tsx`, `company-detail.tsx` | `crm-api.spec.ts` (25) | pessoas ativas e negócios no escopo; `members` sem e-mail | — | — |
| F7-05 | Desempenho das listas com escopo (vendedor e equipe) | orquestrador | F7-02 | concluída | `src/lib/crm/scope.ts`, `prisma/migrations/20261031140000_crm_indices_empresa/` | `crm.unit` › escopo, carga | lista de contatos do vendedor 13,1 s → p95 47 ms; empresas do vendedor 17,1 s → p95 89 ms; empresas da equipe 3,5 s → 58 ms (10 mil pessoas, 2 mil empresas; `08-testes-e2e.md` › Carga) | — | — |
| F7-07 | Seis faltas do produto achadas pela matriz | orquestrador | F7-01 | concluída | `src/lib/crm/{deals,consumer,capture,money,log,events,worker}.ts` | `crm-matriz` (T03.04, T04.08, T07.02, T12.07), T08.04 | grupo não vira negócio (409); evento de excluído ou grupo ignorado sem DLQ; simulada não alimenta o CRM; bloqueada pausa a captura com o cursor parado; teto R$ 20 milhões (cabe na coluna); "criado" atrasado de alerta fechado ignorado; log sem `e.message` | — | eventos já na fila quando a empresa bloqueia continuam sendo processados (só a captura pausa) |
| F7-06 | Opção "Avisos do CRM" sem efeito | orquestrador | F4-02 | concluída | `crm-settings-view.tsx`, `06-ux-e-design.md` § 10 | final nº 4 | a opção prometia aviso que nada gera; saiu da tela, a flag fica no servidor | — | ligar à central de avisos (pendência de produto) |
| F9-01 | Documentação final (README, CHANGELOG, handoff, docs/crm) | orquestrador | F7 | em andamento | `README.md`, `CHANGELOG.md`, `handoff.md`, `docs/crm/*` | — | — | — | QA-MESTRE-RESULTADO depois da final nº 4 |
| F9-02 | Teste de interface por requisito (§ 13.1): menu por papel, guia do CRM | orquestrador | F7-01 | concluída | `tests/e2e/crm-telas.ui.spec.ts`, `tests/e2e/crm-ui.ts` (`unseen`) | `crm-telas.ui` | T12.04 com os 7 papéis e link direto proibido; CRM-10 do guia de Negócios até o fim, sem voltar depois de recarregar | — | demais telas na F9-06 |
| F9-03 | Guia: cartão fora da tela e guia que não ficava gravado | orquestrador | F9-02 | concluída | `src/components/tour/tour-overlay.tsx` | `crm-telas.ui`, `onboarding-tours.ui`, `tour-roles.ui`, `trial-onboarding-polish.ui`, `lock-teams-masks.ui`, `system-tour.ui` | 73 passaram, 3 pulados (previstos), desktop e celular (8,7 min) | — | — |
| F9-04 | Reabertura com motivo obrigatório (CRM-03, "reabrir com justificativa") | 04 backend + 05 frontend (workflow) + revisão adversarial | F4-02 | concluída | `src/lib/crm/{labels,schemas,deals}.ts`, `src/app/api/crm/deals/[id]/reopen/route.ts`, `src/components/crm/deal-detail.tsx`, `04-api-crm.md` | `crm-reabrir.spec`, `crm-reabrir.ui`, `crm-api`, `crm-matriz`, `crm.ui` | motivo de 3 a 500 caracteres (invisíveis não contam; controle e bidi recusados), no histórico e fora da auditoria; diálogo fecha em 409 de reabertura concorrente; 9 apontamentos da revisão, 9 corrigidos (2 partes opcionais recusadas com motivo) | — | — |
| F9-05 | Agenda: Hoje e Próximos 7 dias no fuso da empresa, «Editar tarefa», reatribuição auditada (CRM-04) | 04 backend + 05 frontend (workflow) + revisão adversarial | F4-02 | concluída | `src/lib/crm/{agenda,schemas,queries,activities,deals}.ts`, `src/app/api/crm/activities/[id]/route.ts`, `activity-list.tsx`, `activities-view.tsx`, `crm-task-button.tsx`, `painel-ajustes.css`, `ajuda.ts`, `04-api-crm.md` | `crm-agenda.spec`, `crm-agenda.ui` | `status=pending`, `dueAfter`, `due=today|next7`; prazo e campos de data no fuso da empresa; responsável novo precisa ver tarefas (400); auditoria só do que mudou, com `statusFrom` e `ownerFrom`/`ownerTo`; 9 apontamentos, 9 corrigidos | — | checagem do papel do responsável vale só para tarefas (negócios e contatos sem ela: a conversão do sistema entrega ao membro da conversa) |
| F9-06 | Teste de interface por requisito nas demais telas (§ 13.1) | 08 QA (workflow) + revisão adversarial | F9-02 | concluída | `tests/e2e/crm-contatos.ui.spec.ts`, `crm-ajustes-visao.ui.spec.ts`, `crm-dados-sugestoes.ui.spec.ts` | os mesmos | interface por requisito (F9): 58 passaram, 2 pulados previstos (12,3 min), desktop e celular, na primeira execução | — | — |
| F8-02 | Ensaio de restauração com as tabelas `Crm*` | 09 SRE | F2-01 | concluída | `scripts/restore-drill.ts`, `tests/e2e/backup.spec.ts` | `backup.spec.ts` | as 16 tabelas voltam com as mesmas contagens; funil com etapas na ordem; backup sem `Crm*` não quebra | — | — |
| F7-00 | Segurança e privacidade do CRM (documento) | 07 segurança | F2-02 | concluída (doc) | `docs/crm/07-seguranca-e-privacidade.md` | `crm.unit`, `crm-api` | cada controle com o teste que prova ou marcado como inferência | — | S1 a S6 |
| F8-01 | Deploy, liberação controlada e rollback do CRM | 09 SRE | F2-03 | concluída (doc) | `docs/crm/09-deploy-e-rollback.md`, `.github/workflows/deploy.yml` | `bun audit` | migração só cria; desligar não apaga; `bun audit` com as exceções datadas sai 0 | — | ensaio de restauração com as tabelas `Crm*` na F8 |

## Diário

### 30/10/2026

- Lida a especificação mestre inteira (seções 0 a 18), o handoff, o guia de UI e o código central (`store.ts`,
  `page.tsx`, `permissions.ts`, `app-sidebar.tsx`, `api-auth.ts`, `json-body.ts`, `pagination.ts`, `schema.prisma`).
- Diferença entre o baseline da especificação e o repositório: nenhuma. O commit de referência da especificação é o
  `origin/main` atual.
- Criados o worktree `.claude/worktrees/crm` e a branch `crm/integracao`, com o upstream da `main` removido para que um
  `git push` sem argumentos não vá para a produção.

### 31/10/2026

- **F0 concluída.** Resultados em `reports/f0-testes.md` e no registro acima.
- **Bloqueio de CI achado na F0:** o passo `bun audit` do `deploy.yml` falharia com 5 achados altos do `node-forge`
  (faixa vulnerável ≤1.4.0; correção na 1.4.2). Vale também para a `main`. A correção mexe em `package.json`,
  `bun.lock` e no `deploy.yml`; fica como item próprio, com a regra de idade mínima de 2 semanas do pacote conferida
  antes.
- Cliente Prisma: gerado com o schema do CRM no `node_modules` compartilhado. Quem voltar à `main` roda
  `bunx prisma generate` lá antes de testar.
- `parseBrlToCents` endurecido: milhar só em grupos de 3 (`1,2,3` e `1.2.3,45` agora dão `null` em vez de um valor
  inventado). Teste em `tests/unit/crm.unit.spec.ts`.
- Testes do CRM: `crm.unit` 24 passaram, `crm-api` 24 passaram (1,5 min).
- **Rodada completa unit + api nº 1 inválida:** editei `src/app/page.tsx` (imports das telas do CRM) com o `next dev`
  do Playwright rodando, antes de os arquivos das telas existirem. O servidor passou a responder a página de erro em
  HTML para todas as rotas ("Module not found") e 207 testes falharam em cascata; 1321 não rodaram. Lição: nada em
  `src/` muda durante uma rodada completa.
- A mesma rodada achou duas falhas reais, corrigidas: `CRM_DISABLED` faltava no `.env.example`
  (`env-example.unit.spec.ts`) e duas mensagens usavam "Tente de novo" em vez de "Tentar novamente"
  (`ui-text.unit.spec.ts`).
- **Rodada nº 2 inválida:** o `next/dynamic` do Next 16 exige o objeto de opções escrito em cada chamada; eu tinha
  passado uma constante. O servidor do Playwright não subiu (180 s). Corrigido em `page.tsx`.
- **ADR-001 aceito: CRM nativo (B).** Conferi os fatos com a POC e o benchmark. O Open Mercato fica como referência
  congelada da 0.9.0, com os gatilhos de reavaliação no ADR.
- **node-forge:** a 1.4.2 corrige os 5 achados, mas saiu em 27/10/2026 (regra das 2 semanas: só a partir de 10/11). O
  `deploy.yml` passou a ignorar os 5, com a justificativa de cada um e a data de revisão. `bun audit` sai com 0. Isso
  destrava também a `main`.
- Telas da F4 com 4 agentes em paralelo, escrevendo em `src/components/crm/wip/` (que nada importa), para não mexer no
  que a rodada completa nº 3 está compilando.
- Documentos novos: `07-seguranca-e-privacidade.md` e `09-deploy-e-rollback.md`. Ao conferir o 09 no código, corrigi
  duas frases minhas: o funil padrão nasce quando o operador liga o CRM (não na primeira gravação), e a primeira
  captura lê 30 dias.
- Falta tela no Admin para ligar o CRM numa empresa (hoje só a API). Entra na integração da F4.
- **Admin:** o operador liga e desliga o CRM de uma empresa no detalhe da organização, com confirmação
  (`admin-crm.ui.spec.ts`). Se `CRM_DISABLED=1` estiver no servidor, a tela avisa que a flag não tem efeito.
- **F8, ensaio de restauração:** `scripts/restore-drill.ts` conta as 16 tabelas `Crm*` do backup restaurado e escreve
  só números no log do deploy. Provado em `backup.spec.ts`.
- **Rodada completa nº 3 (unit + api + ui):** 2554 passaram, 7 falharam, 14 pulados, 7 não rodaram (33,3 min). Uma
  falha real: o `h1` "Ajustes do CRM" fora da regra de maiúsculas do `ui-text.unit.spec.ts` (corrigido). As outras 6
  foram tempo esgotado em `analysis-outcomes:199`, `nfse:47` e `settings-effect:12, 25, 56, 91`; 4 delas já falhavam
  assim no baseline da F0. Hipóteses: máquina carregada pelos 5 agentes em paralelo, ou o `crmTick()` sem `orgId`
  capturando todas as empresas com CRM a cada tick global. **Reexecução isolada dos arquivos afetados: 55 passaram
  (7,2 min).** Fica a observação para a F7: medir a duração do tick com e sem CRM.
- **Atenção registrada:** um dos 4 agentes de tela (UI-3) gravou `src/components/crm/suggestions-panel.tsx` direto, fora
  de `wip/`, durante a rodada nº 3. Nenhuma das 7 falhas da rodada tem relação com esse arquivo (são as listadas acima);
  ele passou pela mesma revisão dos outros, e a rodada final (nº 4) roda com ele no lugar.
- **F5 (API):** tarefa a partir de alerta e de item de recuperação, e a lista de negócios de uma conversa
  (`crm-f5.spec.ts`, 5 passaram). Contrato em `04-api-crm.md`.
- **F4, integração:** as 9 telas saíram de `wip/` por cima dos esboços; CSS dos 4 rascunhos juntado em
  `painel-ajustes.css`; cartão dentro de cartão no detalhe do contato corrigido (`framed={false}`); "Close" virou "Fechar"
  em `dialog.tsx` e `sheet.tsx` (vale para o painel todo); a Ajuda reconhece as telas de negócio. tsc 0, eslint 0,
  unit 75/75 (`ui-text`, `tours`, `system-tour`, `crm`, `role-descriptions`).
- **F5 (interface):** botão "Tarefa no CRM" nos alertas ativos, item "Criar tarefa no CRM" no menu da recuperação, e o
  bloco "Negócios relacionados" no detalhe da conversa. Testes de interface em `crm.ui.spec.ts` e `crm-f5.ui.spec.ts`
  (resultado no diário abaixo e em `08-testes-e2e.md`).
- Conferido: a tela Ajustes do CRM lê `GET /api/crm/integration/status` (`crm-settings-view.tsx:1004`), como diz o
  `10-handoff-e-suporte.md` § 6.
- **F7, carga:** medição com o volume declarado (`08-testes-e2e.md` § 4). Todas as metas do § 13.4 foram atendidas. Ela
  achou duas listas com escopo lentas (até 17,1 s), corrigidas em `scope.ts` e com dois índices novos (F7-05), e três
  erros do próprio script de medição: um rótulo de fila sem fila, a captura chamada sem acordar a fila e o nome errado
  de um campo no diagnóstico.
- **F7, matriz:** o agente de QA escreveu `crm-matriz` afirmando a regra certa, com `expect.soft` onde o produto falhava.
  As 6 faltas (F7-07) foram corrigidas, e os `soft` viraram verificações normais. A rodada nº 1 deu 87 de 88. A falha
  era do teste: a pré-condição `expect(delegate).toBe(dublê)` fazia o `expect` procurar `asymmetricMatch` no Proxy e
  contava uma "consulta". Agora compara com `===`.
- **F9, teste de interface por requisito:** `crm-telas.ui.spec.ts` cobre o T12.04, que confere o menu "Comercial" de
  cada um dos 7 papéis contra as permissões. O link direto para uma tela proibida volta à Visão geral e a API responde
  403. O arquivo cobre também o guia de Negócios (CRM-10), que abre na primeira visita, vai até o fim e não volta
  depois de recarregar. Para o teste de link direto valer, ele carrega a página de novo: de `/` para `/#x` o navegador
  só troca o `#`.
- **Dois defeitos do guia, achados pelo teste do CRM-10 e corrigidos em `tour-overlay.tsx`.** Ambos valem para todos os
  guias do painel.
  1. Em 1280×800, o cartão do passo "Mudar de etapa" abria abaixo do botão "Mover" e ficava cortado no pé da tela.
     Não dava para clicar no "Próximo". Agora o cartão vai para o outro lado do alvo quando não cabe no lado pedido.
  2. Quando o último passo não tinha alvo na tela (o painel de sugestões só existe com sugestão), o guia terminava só
     no navegador e voltava a cada carga. Agora ele grava no servidor como concluído. A gravação só acontece se o guia
     mostrou ao menos um passo: um guia que abriu com a tela ainda carregando continua só fechando.
  - Bateria do guia e dos guias antigos, em desktop e celular: 73 passaram, 3 pulados (previstos).
- **F9, reabertura e agenda (F9-04, F9-05):** um workflow escreveu o produto e os testes, e uma revisão adversarial
  achou 9 apontamentos em cada parte, todos corrigidos. Na reabertura (CRM-03), o motivo é obrigatório, de 3 a 500
  caracteres. Caracteres invisíveis não contam para o mínimo, e controle e bidi são recusados. O motivo vai para o
  histórico do negócio e fica fora da auditoria. Na agenda (CRM-04), Hoje e Próximos 7 dias seguem o fuso da empresa,
  "em andamento" conta como pendente e «Editar tarefa» audita só o que mudou. tsc 0, eslint 0.
- **F9, interface por requisito (F9-06):** contatos e empresas, ajustes e Visão comercial, importação, exportação e
  sugestões, além de reabertura e agenda. 58 passaram e 2 foram pulados (previstos), em desktop e celular, na primeira
  execução.
- **F9, API e unidade:** 1307 passaram (8,6 min), sem reexecução. Dentro dessa conta estão os 12 testes novos da
  `crm-matriz` (T02.01–T02.03, T03.01, T04.04, T08.06, T10.06, T05.03, T06.02, T06.03, T05.06, T07.05).
- **Divergências entre documento e código, corrigidas nos documentos:**
  - O CNPJ é guardado em texto puro, não cifrado. Virou o risco aceito S8 e o item H6.
  - O `CrmDealEvent` não tem o tipo `linked` gravado por nenhum fluxo; a lista de tipos foi refeita a partir do código.
  - O evento que estava na fila no instante em que o CRM foi desligado se perde. Virou S9 e H16. A primeira redação dizia
    que a captura relia 30 dias. Conferido em `capture.ts`, ela usa cursor, e só a reconciliação relê 7 dias.
- **Matriz de navegadores:** o `CROSS_BROWSER` do `playwright.config.ts` só pegava `crm.ui` e `crm-f5.ui`. Passou a
  pegar todo `crm*.ui`, menos o `admin-crm.ui`, para que as telas da F9 rodem também em Firefox, Safari e iPhone (T09.03).
- **Lacunas da especificação** documentadas como H2–H17 em `10-handoff-e-suporte.md` § 9 e em
  `QA-MESTRE-RESULTADO.md`.
- **Rastreabilidade (31/10):** um workflow de 8 agentes leu os 12 requisitos (§ 5) e os 85 cenários T01–T12 (§ 13.2)
  contra os testes. Cada afirmação passou por uma verificação adversarial, e eu conferi no código as frases que ela
  marcou como duvidosas. Resultado: os 12 requisitos têm teste positivo, teste negativo (autorização ou dado inválido)
  e teste de interface, como pede o § 13.1, e todos ficam parciais. Dos cenários, 38 estavam cobertos, 43 parciais,
  3 sem cobertura (T01.07, T07.07, T08.07) e 1 fora do escopo técnico (T12.02); depois da verificação abaixo e dos
  testes novos, 41 cobertos e 40 parciais. A tabela inteira está no
  `QA-MESTRE-RESULTADO.md`.
- **O que a conferência no código corrigiu nas conclusões do workflow:**
  - "Período da Visão comercial em UTC" estava impreciso: são os dias de quem vê, mandados ao servidor em ISO.
  - "Backup sem criptografia" precisava de ressalva: o arquivo no servidor não é cifrado, mas a cópia no Drive vai
    cifrada (rclone crypt), e o telefone já é cifrado no banco.
  - O H8 dizia que a exportação da empresa levava todas as tabelas `Crm*`. Não levava os vínculos: corrigido no
    código (ver abaixo) e no H8.
- **Lacunas novas, H19–H29** em `10-handoff-e-suporte.md` § 9: recuperação ligada ao negócio, saúde da
  sincronização, eventos da captura e reconciliação, bloco da conversa, funis pela tela, tarefas, fuso nas telas,
  detalhes de importação e exportação, campos do negócio, identidade dos contatos e os testes que a suíte não tem.
  O H15 passou a citar a empresa de exemplo, que a captura também não barra.
- **`03-modelo-dados.md` conferido contra o schema:** o `CrmDeal` não tem equipe, origem da probabilidade nem
  `deletedAt`, e `amountSource` só recebe `manual` e `unknown` (a estimativa não é marcada `inferred`, fica em
  `estimatedAmountCents`). As três frases foram reescritas.
- **Exportação com os vínculos:** `org-export.ts` passou a levar `CrmBusinessLink` (negócio com conversa, oportunidade,
  alerta e recuperação) e `CrmIdentityLink` (contato do AtendeRadar com pessoa do CRM), sem a chave interna `linkKey`.
- **Log do tick:** a falha do CRM em `/api/gateway/tick` gravava `e.message`. Passou a usar `errTag`, como o resto do
  CRM (T08.04).
- **Testes das lacunas da rastreabilidade:** 4 na `crm-matriz` (reflexo do fechamento na recuperação, T06.02 e CRM-07;
  `autoCreateDeals`, CRM-06; reentrega da mesma oportunidade, T07.01; vínculos na exportação, CRM-11) e 1 na
  `crm-matriz.unit` (o gateway do WhatsApp não envia, não marca lida nem abre a sessão como online, T01.03 e T05.09).
- **Completa nº 4 (08:03–09:20):** 3040 passaram, 4 falharam por tempo esgotado, 57 pulados, 11 não rodaram (1,3 h). As
  quatro (`nfse.spec:47`, `settings-effect.spec:56`, `nfse.ui.spec:47` em desktop e celular) esperam o tick global.
  Medi o tick sobre uma cópia do banco do fim da completa: 536 empresas, 149 com o CRM ligado pelos testes, análise
  global de cerca de 13,5 s (anterior ao CRM; as duas primeiras falhas já estavam na F0) e CRM de 4,8 s, metade em 740
  regravações de checkpoint de rodadas sem linha nova.
- **Correção do custo do tick:** no produto, a rodada ociosa só regrava o checkpoint uma vez por minuto (`IDLE_SAVE_MS`
  em `capture.ts`; medido 2,4 s e 0 gravações). Nos testes, `crmOffAfterFile()` (`tests/e2e/crm-cleanup.ts`) desliga no
  fim de cada arquivo do CRM as empresas que ele ligou. Virou o risco R11, mitigado.
- **Comparação visual da nº 4 descartada como prova:** 49 capturas com dimensão diferente, todas de telas com dados
  (alertas, conexões, membros, recuperação, equipe, times, conversas). Na completa, a empresa do seed acumula o que os
  arquivos anteriores gravaram e essas telas crescem; as da conta vazia mantiveram a dimensão. O procedimento do
  `01-baseline-visual.md` pede `design.ui` e `a11y.ui` isolados, com o banco recriado; foi o que rodou em seguida.
- **Direcionada depois da correção:** 126 passaram (6,3 min), com os 5 testes novos e os 4 que esgotavam o tempo.
- **Comparação visual final (09:47–10:01):** `design.ui` e `a11y.ui` isolados, com o banco recriado: 121 capturas das
  telas antigas com o CRM desligado. 53 idênticas à F0; as 68 diferentes mudam só hora relativa, nome sorteado e o
  momento da animação do gráfico. Uma captura do tablet (Conexões) saiu com outra altura: o "Diagnóstico" só aparece
  depois que a saúde da conexão responde, e a captura às vezes sai antes. Repetida, voltou à dimensão da F0. Detalhe em
  `01-baseline-visual.md` › Comparação final (F9).
- **T07.01 com 2, 10 e 100 entregas:** o teste da reentrega passou a entregar o mesmo evento 100 vezes, conferindo o
  inbox e as contagens de sugestões, negócios e tarefas a cada entrega (passa por 2 e 10), como pede o T07.01 da
  especificação. 1 passou (49,8 s).
- **Referências da rastreabilidade:** o `crmOffAfterFile()` entrou 3 linhas acima em cada arquivo do CRM, e 115 das 194
  referências `arquivo:linha` ficaram apontando para a linha errada. Corrigidas e conferidas por script (0 quebradas).
- **Verificação da rastreabilidade (31/10):** um workflow de 8 agentes conferiu cada frase da tabela contra o código e
  os testes, procurando o que estava otimista. Achou 42 problemas: 17 frases falsas, 15 descrições de teste maiores
  que o teste, 5 situações otimistas, 3 referências de linha erradas e 2 outros. Todos foram tratados:
  - 5 situações otimistas (T02.03, T04.05, T05.07, T07.01, T12.03): em vez de rebaixar, escrevi o teste que faltava
    (5 na `crm-matriz`) ou reforcei o existente (`crm-f5.ui:118`, com o menu já carregado e o link direto). T05.07
    achou um defeito do produto (abaixo).
  - Testes reforçados: `crm-api:460` (a auditoria não traz os 8 últimos dígitos do número) e `crm-api:601` (o
    reflexo na conversa e o status `lost` passam a ser conferidos).
  - As frases falsas, as descrições e as referências foram reescritas a partir das evidências do workflow e
    conferidas no código. Ficam em `overrides.json` do gerador do QA (rascunho fora do Git) e entram no
    `QA-MESTRE-RESULTADO.md`.
- **Defeito achado pela verificação, T05.07 (uma tarefa por causa):** a tarefa criada à mão para um alerta e a tarefa
  da sugestão aceita do mesmo alerta tinham chaves diferentes e duplicavam. E o alerta que voltava depois de resolvido
  (linha nova no motor) pedia outra tarefa com a primeira ainda aberta. Agora as duas usam `alertTaskKey`, aceitar
  expira as outras sugestões de tarefa do alerta, e o consumidor não sugere tarefa quando a mesma causa (`groupKey`)
  já tem tarefa aberta ou sugestão pendente (`consumer.ts`, `suggestions.ts`, `activities.ts`;
  `05-sincronizacao.md` § 6).
- **Revisão adversarial da correção do T05.07 (31/10, 11:2x):** um workflow de 11 agentes (três lentes: correção,
  isolamento e regressão; cada achado com um refutador) leu a mudança. Confirmados, e corrigidos antes da regressão
  completa, que parei com 1.145 de 3.123 testes e sem falha para rodar de novo sobre o código final:
  - **médio:** a sugestão pendente de um alerta marcado como falso positivo (ou já vencida) segurava a sugestão do
    alerta novo da mesma causa. O falso positivo não emitia `alert.resolved`. Agora emite (`capture.ts`), e só conta a
    sugestão no prazo de outro alerta ainda aberto;
  - **médio:** o mesmo alerta reaberto pelo motor (resolvido por ele e voltando, o caminho comum) nunca mais pedia
    tarefa depois da primeira concluída, porque a chave da sugestão era fixa por alerta e negócio. A chave passou a
    levar a ocorrência; a sugestão pendente ou recusada do próprio alerta segura (`suggestion_exists`);
  - **baixo:** a causa olhava só os 50 alertas mais recentes do `groupKey`; agora olha todos;
  - **baixo, testes:** o teste da tarefa à mão não provava que a sugestão existia e expirou nem o motivo do evento;
    reforçado. Os dois ramos novos (causa segurada por sugestão e expiração ao aceitar com dois negócios) ganharam
    teste, e também o alerta reaberto (3 testes novos na `crm-matriz`).
  - Refutado: a tarefa à mão pedida para o alerta novo da mesma causa cria a segunda tarefa. O botão promete "uma
    tarefa aberta por alerta" e o T05.07 trata da criação automática; fica como está.
  - Rodada direcionada sobre a correção (11:34–11:40): 120 passaram, sem falha (`08-testes-e2e.md` § 3). Em seguida,
    a regressão completa nº 5 começou de novo sobre o código final.
- **Completa nº 5 (11:42–12:57):** 3046 passaram, 12 falharam, 57 pulados, 11 não rodaram (1,2 h). 8 falhas do CRM no
  celular com `cadastro falhou com 429`: a suíte passou dos 20 cadastros por hora do mesmo IP. Correção no teste
  (`signupOrg` com um `x-forwarded-for` de teste por cadastro), sem mudança no produto. As outras 4 são as de espera
  do tick global; os 11 que não rodaram são do `nfse` em modo serial.
  - Direcionada das falhas (12:59–13:11), com os arquivos inteiros: 72 passaram, 2 pulados, sem falha
    (`08-testes-e2e.md` § 3).
- **CI do PR #3:** o primeiro run (cf1aeb4) passou inteiro. Nos dois seguintes, 3 shards falharam antes de qualquer
  teste: o servidor de teste não subiu em 180 s porque o `next/font/google` não conseguiu baixar as fontes do Google
  na máquina do CI (milhares de `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`). A falha da
  `main` em 30/10 tem a mesma causa, então o problema é anterior ao CRM. Correção no `deploy.yml`: os passos de teste
  repetem a suíte uma vez só quando o servidor não subiu e nenhum teste rodou; falha de teste não repete. Trocar para
  fonte local resolveria na raiz, mas mexe em todas as telas e fica para o dono decidir.
- **Log das rotinas do CRM no agendador (T08.04):** o `safely()` de `background.ts` gravava `e.message` quando uma
  rotina do CRM falhava. As cinco rotinas do CRM passaram a usar `safelyCrm`, que grava só `errTag`. A checagem
  estática ganhou essas rotinas e o tick, e `token` entrou na lista de campos proibidos no log.
- **Outros navegadores, todas as telas do CRM (10:10–10:39):** 92 passaram, 2 falharam, 2 pulados (28,6 min). As duas
  falhas eram do teste do quadro (`crm.ui:29`) no Firefox e no Safari, por espera (detalhe em `08-testes-e2e.md` § 3).
  O teste passou a esperar a gravação do arraste e o aviso do quadro antes de cada passo do teclado.
- **Direcionada depois da verificação (10:47–10:55):** 124 passaram, 1 falhou (7,8 min): a checagem nova do teclado no
  Chromium, corrigida no teste.
- **Quadro em quatro navegadores (10:57–11:18):** `crm.ui` em Chromium, Firefox, WebKit e iPhone, duas vezes cada:
  38 passaram, 2 pulados (previstos), sem falha (20,9 min).
