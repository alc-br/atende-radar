# CRM — contrato da API `/api/crm/*`

O navegador só fala com o AtendeRadar. Todas as rotas abaixo são do próprio Next.js (BFF), e o provedor por trás delas
(nativo ou Open Mercato, conforme o ADR-001) não aparece no contrato. Nenhuma rota do provedor é exposta ao navegador.

## Regras gerais

- **Autorização no servidor.** Toda rota chama `guard('<permissão>')` (`src/lib/api-auth.ts`), que confere sessão,
  membro ativo, `sessionVersion`, papel lido do banco e bloqueio de assinatura (402 `subscription_locked`). O
  `organizationId` sai do `guard`. Corpo, cabeçalho ou URL nunca escolhem o tenant.
- **Flag.** Com `crm.enabled` desligada para a organização, toda rota `/api/crm/*` responde 404 `crm_disabled`. O
  frontend nem mostra o menu, mas a resposta não depende disso.
- **IDs do caminho dentro do tenant.** A busca já filtra por `organizationId` (`findFirst({ where: { id, organizationId } })`).
  ID de outra empresa recebe 404, igual a um ID que não existe, para não revelar a existência do registro.
- **Escopo por papel.** O supervisor vê a própria equipe (`supervisorTeam`). O atendente vê só o que é dele
  (`ownerMemberId` = ele, `isOwnScopeOnly`). O analista e o visualizador só recebem agregados, sem nome, telefone ou e-mail.
- **Validação.** Corpo lido com `readJson` (`src/lib/json-body.ts`, limite de 5 MB) e validado por zod `strict()`.
  Campo desconhecido gera 400, o que bloqueia mass assignment. `organizationId`, `amountSource = verified_external`,
  `status` e `createdBy` nunca são aceitos no corpo de criação ou edição comum. `version` só entra nas mutações de
  registro existente (edição, transição, arquivamento), onde é obrigatória.
- **CSRF.** Toda mutação exige `Content-Type: application/json` (`parseBody`, 415 sem ele), inclusive as de corpo
  vazio (`{}`) e o DELETE (que leva `{ version }`). Formulário de outro site não consegue mandar esse tipo sem preflight
  de CORS; o cookie de sessão é `SameSite=Lax` (ADR-003).
- **Paginação.** `pageParams` (`src/lib/pagination.ts`): `page`, `limit` (no máximo 100). Ordenação e filtros vêm de
  listas fechadas.
- **Concorrência.** Mutação de entidade versionada exige `version` no corpo. Versão diferente da atual gera 409
  `crm_version_conflict`, com a versão atual no corpo para a tela recarregar.
- **Idempotência.** `POST` que cria algo aceita o cabeçalho `Idempotency-Key` (de 8 a 128 caracteres). A mesma chave
  com o mesmo corpo devolve a resposta guardada. A mesma chave com outro corpo gera 422 `crm_idempotency_mismatch`.
  `deals/from-opportunity` é idempotente mesmo sem a chave: uma oportunidade gera no máximo um negócio.
- **Erros.** Corpo `{ error: 'mensagem em português', code: 'crm_…', requestId }`. A mensagem não traz stack, SQL, ID
  externo nem dado pessoal. O `requestId` também vai no cabeçalho `x-request-id`.
- **Auditoria.** Criar, editar campos sensíveis, mover etapa, fechar, reabrir, mesclar, importar, exportar e mudar
  configuração geram `AuditLog` (`src/lib/audit.ts`). O texto de mensagem e o telefone completo nunca vão para o log.
- **Limite de taxa.** Mutações por membro usam `allow()` (`src/lib/rate-limit.ts`): 120 por minuto, e 10 por minuto em
  importação, exportação e mescla. O excesso responde 429 com `Retry-After`.

## Permissões

Novas chaves em `PERMISSIONS` (`src/lib/permissions.ts`). Os papéis (`ROLES`) não mudam.

| Permissão | Papéis | Escopo |
|---|---|---|
| `crm.analytics.view` | admin, gestor, supervisor, analista, atendente, viewer | supervisor: equipe; atendente: próprios; analista e viewer: só agregado |
| `crm.contacts.view` | admin, gestor, supervisor, atendente | supervisor: equipe; atendente: próprios |
| `crm.contacts.manage` (criar, editar, arquivar pessoa e empresa) | admin, gestor, supervisor, atendente | idem |
| `crm.contacts.merge` | admin, gestor | empresa inteira |
| `crm.deals.view` | admin, gestor, supervisor, atendente | supervisor: equipe; atendente: próprios |
| `crm.deals.manage` (criar, editar, mover, fechar, reabrir, aceitar sugestão) | admin, gestor, supervisor, atendente | idem; o atendente não troca o responsável |
| `crm.activities.view` | admin, gestor, supervisor, atendente | idem |
| `crm.activities.manage` | admin, gestor, supervisor, atendente | idem |
| `crm.pipelines.manage` | admin, gestor | empresa inteira |
| `crm.settings.manage` (sub-flags, integração, DLQ) | admin, gestor | o gestor vê o estado da integração; reprocessar a DLQ é só do admin |
| `crm.import` | admin | — |
| `crm.export` | admin | exportação com dados pessoais |

`member` não recebe nenhuma permissão de CRM. Ligar `crm.enabled` não é permissão da empresa: é ação do operador da
plataforma (`isPlatformOperator`, `PLATFORM_ADMIN_EMAILS`) na tela Admin.

## Rotas

| Método | Rota | Permissão | O que faz |
|---|---|---|---|
| GET | `/api/crm/overview` | `crm.analytics.view` | KPIs: abertos, ganhos e perdidos no período, valor declarado, valor estimado (separados), conversão, tarefas atrasadas, negócios parados. Período `from`/`to` (ISO); sem eles, os últimos 30 dias; `from >= to` ou mais de 366 dias dá 400 |
| GET | `/api/crm/contacts` | `crm.contacts.view` | lista com busca (`q` por nome, e-mail ou últimos 4 dígitos), filtros (`ownerMemberId`, `status`, `companyId`) e paginação |
| POST | `/api/crm/contacts` | `crm.contacts.manage` | cria pessoa; recusa telefone ou e-mail já usados na empresa com 409 `crm_duplicate`; o corpo traz `existingId` só se quem pede enxerga a pessoa existente |
| GET | `/api/crm/contacts/:id` | `crm.contacts.view` | detalhe com negócios, atividades e conversas vinculadas |
| PATCH | `/api/crm/contacts/:id` | `crm.contacts.manage` | edita (com `version`) |
| DELETE | `/api/crm/contacts/:id` | `crm.contacts.manage` | arquiva (soft delete), corpo `{ version }`; libera telefone e e-mail para outra pessoa |
| POST | `/api/crm/contacts/merge` | `crm.contacts.merge` | `{ keepId, mergeId, versions }`: move negócios, atividades e vínculos para `keepId`; `mergeId` fica com `mergedIntoId` |
| GET, POST | `/api/crm/companies` | view / manage | lista e cria empresa. A linha traz `peopleCount` (pessoas ativas) e `dealCount` no escopo de quem pede, os mesmos números do detalhe; a resposta traz `members` (nomes dos responsáveis, sem e-mail) |
| GET, PATCH, DELETE | `/api/crm/companies/:id` | view / manage | detalhe (pessoas ativas e negócios no escopo, até 100 de cada, e `members`), edição, arquivamento (`{ version }`) |
| GET | `/api/crm/pipelines` | `crm.deals.view` | funis ativos com as etapas em ordem |
| POST | `/api/crm/pipelines` | `crm.pipelines.manage` | cria funil (com etapas iniciais) |
| PATCH | `/api/crm/pipelines/:id` | `crm.pipelines.manage` | renomeia, define padrão, desativa |
| PATCH | `/api/crm/pipelines/:id/stages` | `crm.pipelines.manage` | cria, renomeia, reordena e desativa etapas; não apaga etapa com negócio aberto |
| GET | `/api/crm/deals` | `crm.deals.view` | lista ou Kanban (`view=board`, agrupado por etapa, até 50 por coluna; a coluna traz `nextCursor` e a próxima página vem com `stageId` + `cursor`), filtros por funil, etapa, responsável, status, período, origem e `q`. Com `conversationId`, só os negócios ligados à conversa (bloco "Negócios relacionados", CRM-05): a conversa passa pelo escopo da tela de conversas (atendente: só as dele; contato excluído: nunca) e fora dele é 404; os negócios seguem o escopo de sempre. O cartão traz `stage { id, name }` e `nextTask` |
| POST | `/api/crm/deals` | `crm.deals.manage` | cria negócio manual |
| GET | `/api/crm/deals/:id` | `crm.deals.view` | detalhe, histórico (`CrmDealEvent`), vínculos e atividades |
| PATCH | `/api/crm/deals/:id` | `crm.deals.manage` | edita título, valor, responsável, previsão, próxima ação (com `version`) |
| DELETE | `/api/crm/deals/:id` | `crm.deals.manage` | arquiva, corpo `{ version }`; as sugestões pendentes do negócio vencem |
| POST | `/api/crm/deals/:id/stage` | `crm.deals.manage` | `{ stageId, version }`: move, grava evento e marca `stageLockedByHuman` |
| POST | `/api/crm/deals/:id/close` | `crm.deals.manage` | `{ outcome: won|lost, version, amountCents?, lostReasonCode?, note? }`; ganho exige valor declarado ou confirmação explícita de "sem valor"; perda exige motivo |
| POST | `/api/crm/deals/:id/reopen` | `crm.deals.manage` | `{ version, reason }`: volta para `open` na etapa em que estava (ou na primeira ativa do funil, se ela foi desativada), com o evento `reopened` (`data: { from, reason }`). O motivo é obrigatório (CRM-03): de 3 a 500 caracteres, sem contar os invisíveis (espaço de largura zero, preenchimentos) para o mínimo; controle (fora quebra de linha e tabulação), surrogate solto e controles bidi dão 400 `crm_invalid` com a mensagem do campo. Negócio já aberto: 409 `crm_invalid_transition`. A auditoria `crm.deal_reopened` registra quem reabriu, sem o texto do motivo |
| POST | `/api/crm/deals/from-opportunity` | `crm.deals.manage` | `{ opportunityId }`: cria (ou devolve o já criado) negócio a partir de uma `RevenueOpportunity`, com a estimativa em `estimatedAmountCents`. Contato excluído do monitoramento ou conversa de grupo: 409 `crm_invalid_transition` |
| GET | `/api/crm/activities` | `crm.activities.view` | lista com filtros `status` (`open`, `in_progress`, `done`, `cancelled` ou `pending` = aberta + em andamento), `dueAfter` (inclusivo), `dueBefore` (estrito), `due=today|next7` (janela da agenda no fuso da empresa, `Organization.timezone`: hoje = da meia-noite de hoje à de amanhã; next7 = da meia-noite de hoje à do 8º dia), `ownerMemberId`, `dealId`, `personId` e `overdue=1` (aberta ou em andamento com prazo vencido). Data inválida: 400 `Data inválida.`; valor fora da lista: 400 `Campo inválido: <campo>.`. A resposta traz `timezone` (o fuso da empresa já validado; fuso gravado inválido vira `America/Sao_Paulo`) para a tela mostrar prazos no mesmo dia que a equipe vê |
| POST | `/api/crm/activities` | `crm.activities.manage` | cria tarefa (201, `{ activity, created: true }`). Com `alertId` ou `recoveryItemId` (um ou outro; os dois = 400), a tarefa nasce do alerta ou do item de recuperação (`source` `alert`/`recovery`, `sourceId`): a origem passa pelo escopo da tela de alertas ou de recuperação, e contato excluído do monitoramento é 404. Uma tarefa aberta por causa: pedir de novo devolve 200 com a mesma (`created: false`); se ela é de outra pessoa, fora do escopo de quem pede, 409 `crm_duplicate` sem o conteúdo. Com `dealId`, o negócio fica ligado ao alerta ou ao item e à conversa. Criar à mão a tarefa de um alerta vence a sugestão `create_task` pendente dele (vira `expired`) |
| PATCH | `/api/crm/activities/:id` | `crm.activities.manage` | edita título, observação, prioridade e situação; atribui, reagenda, conclui ou cancela (com `version`). `status: 'pending'` é só filtro de leitura (400 aqui). O atendente não troca o responsável (403); o novo responsável precisa ver as tarefas do CRM (senão 400 `crm_invalid`). Campo reenviado com o mesmo valor não conta como mudança. A auditoria `crm.activity_updated` sai só quando algo mudou e guarda `fields` (os nomes dos campos que mudaram), `status`, `statusFrom` (se a situação mudou) e `ownerFrom`/`ownerTo` (IDs de membro, se o responsável mudou), nunca o título nem a observação |
| GET | `/api/crm/suggestions` | `crm.deals.view` | sugestões pendentes no escopo |
| POST | `/api/crm/suggestions/:id/accept` | `crm.deals.manage` | aplica a sugestão (cria negócio, move etapa, cria tarefa ou confirma desfecho) e registra quem aceitou. Corpo `{}`, exceto em `confirm_outcome`: `{ amountCents?, confirmNoAmount?, lostReasonCode?, note? }`, com as mesmas regras do fechamento. Sugestão que perdeu o sentido (vencida, negócio fechado, etapa já mudou) vira `expired` e responde 409 `crm_invalid_transition` com `expired: true` |
| POST | `/api/crm/suggestions/:id/dismiss` | `crm.deals.manage` | descarta, com motivo opcional |
| GET | `/api/crm/settings` | `crm.settings.manage` | sub-flags e estado do vínculo |
| PATCH | `/api/crm/settings` | `crm.settings.manage` | liga ou desliga sub-flags (`crm.autoCreateDeals`, `crm.suggestStage`, `crm.notifications`, `crm.exports`). `crm.notifications` é gravada, mas ainda não tem efeito, e a tela de Ajustes não a mostra |
| GET | `/api/crm/integration/status` | `crm.settings.manage` | saúde, lag, contagem por estado do outbox e última reconciliação, sem segredos |
| POST | `/api/crm/integration/dlq/:id/retry` | `crm.sync.retry` (só admin) | reprocessa um evento `dead`, com auditoria |
| POST | `/api/crm/imports` | `crm.import` | `{ dryRun: true }` devolve a prévia (válidos, duplicados, erros por linha); `dryRun: false` grava |
| POST | `/api/crm/exports` | `crm.export` + sub-flag `crm.exports` | `{ entity: people|deals, includeFullPhone?, confirm? }`: devolve o CSV na própria resposta (até 20.000 linhas; acima disso, cabeçalho `x-crm-truncated`), com auditoria. Telefone completo só com `includeFullPhone` e `confirm`. Nada fica guardado no servidor |
| PATCH | `/api/admin/organizations/:id/crm` | operador da plataforma | liga ou desliga `crm.enabled` para uma empresa |

## Códigos de erro

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `crm_invalid` | corpo ou filtro inválido (a mensagem diz o campo) |
| 401 | — | sem sessão (o `guard` atual) |
| 402 | `subscription_locked` | assinatura bloqueada (o `guard` atual) |
| 403 | — | sem permissão (o `guard` atual) ou fora do escopo para mutação |
| 404 | `crm_disabled` | CRM desligado para a empresa |
| 404 | `crm_not_found` | registro inexistente ou de outra empresa |
| 409 | `crm_version_conflict` | `version` desatualizada |
| 409 | `crm_duplicate` | pessoa duplicada (telefone ou e-mail); tarefa aberta da mesma causa com outra pessoa |
| 409 | `crm_invalid_transition` | movimento ou fechamento inválido (negócio fechado, etapa inativa, etapa de outro funil) |
| 422 | `crm_idempotency_mismatch` | mesma `Idempotency-Key` com outro corpo |
| 429 | `crm_rate_limited` | limite de taxa |
| 500 | `crm_unavailable` | falha inesperada; o log do servidor leva só o tipo do erro e o `requestId` |
| 503 | `crm_unavailable` | provedor indisponível (só na arquitetura A); a auditoria continua funcionando |

## `/api/me`

Ganha o campo `crm`:

```json
{ "crm": { "enabled": false, "flags": { "autoCreateDeals": false, "suggestStage": false, "notifications": false, "exports": false } } }
```

Com `enabled: false`, o menu e as telas são exatamente os de hoje.
