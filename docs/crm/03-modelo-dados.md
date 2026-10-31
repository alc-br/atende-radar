# CRM — modelo de dados

Modelo do CRM no AtendeRadar. A parte **comum** vale para as duas arquiteturas (A: Open Mercato privado; B: CRM
nativo). A parte **nativa** só existe se o ADR-001 escolher B. Tudo é aditivo: nenhuma tabela ou coluna existente muda.
Migrações: `prisma/migrations/20261031120000_crm_base` (tabelas e índices) e `20261031140000_crm_indices_empresa` (índices
`organizationId, companyId` em `CrmPerson` e `CrmDeal`, que saíram da medição de carga).

## Princípios

- **Tenant em toda linha.** Toda tabela nova tem `organizationId`, e toda consulta filtra por ele no servidor. O
  `organizationId` vem do `guard()`, nunca do corpo, do cabeçalho ou da URL.
- **Contato observacional ≠ pessoa comercial (D4).** `Contact` (WhatsApp) continua igual. A pessoa comercial é outra
  linha, ligada por `CrmIdentityLink` (`entityType = contact`). Apagar ou arquivar uma não mexe na outra.
- **Dinheiro em centavos inteiros.** `amountCents Int?`. `null` quer dizer "valor não informado" e nunca vira R$ 0.
  A estimativa analítica fica em `estimatedAmountCents`, separada, e nunca entra em receita.
- **Origem do valor.** `amountSource`: `unknown | manual | verified_external | inferred`. Só `manual` e
  `verified_external` contam como valor declarado ou confirmado. Hoje o código grava só `manual` (valor digitado por
  alguém) e `unknown` (sem valor); `verified_external` e `inferred` estão previstos e não são usados: a estimativa
  da inteligência fica em `estimatedAmountCents`, e o negócio que nasce dela tem `amountCents` nulo e `amountSource`
  `unknown` até alguém informar o valor.
- **Concorrência otimista.** Entidades editáveis têm `version Int`. Toda mutação manda a versão lida. Se ela for
  diferente da atual, a resposta é 409, sem gravação silenciosa.
- **Histórico imutável.** Movimentos e fechamentos de negócio geram `CrmDealEvent`. As ações administrativas também vão
  para o `AuditLog`, que já existe (não criamos um `CrmAuditEvent`).
- **PII mínima.** O telefone da pessoa comercial é cifrado com a mesma `PHONE_ENC_KEY` (`src/lib/phone-crypto.ts`) e
  deduplicado por `phoneHash(orgId, dígitos)` (`src/lib/phone-hash.ts`). O texto das mensagens nunca é copiado.

## Parte comum (A e B)

| Tabela | Para que serve | Chaves e índices |
|---|---|---|
| `CrmTenantLink` | um vínculo por organização com o provedor (`native` ou `open_mercato`), estado `pending, active, degraded, disabled, deleting` | `organizationId` único; `(provider, externalTenantId)` único |
| `CrmIdentityLink` | mapeia um ID do AtendeRadar (`contact`, `company`, `member`, `agent`, `deal`) para o ID no CRM, com `lastVersion` e `tombstone` | `(organizationId, entityType, sourceId, provider)` único; `(organizationId, entityType, externalId, provider)` único |
| `CrmBusinessLink` | liga um negócio a uma oportunidade, conversa, alerta ou item de recuperação. Vários por negócio, sem 1:1 | `linkKey` único (organização + tipo + IDs), índice por `(organizationId, dealId)` |
| `CrmOutboxEvent` | eventos de domínio gravados na mesma transação da mudança | `idempotencyKey` único; `(status, nextAttemptAt)`; `(organizationId, aggregateType, aggregateId, aggregateVersion)` |
| `CrmSyncInbox` | idempotência do consumidor: um `eventId` processado uma vez por consumidor | `(consumer, eventId)` único |
| `CrmSyncCheckpoint` | cursor e lag por organização e recurso (backfill, reconciliação) | `(organizationId, resource)` único |
| `CrmFeatureState` | flags por organização (`crm.enabled`, `crm.autoCreateDeals`, `crm.suggestStage`, `crm.notifications`, `crm.exports`) | `(organizationId, flag)` único |
| `CrmIdempotencyKey` | resposta guardada de uma mutação com `Idempotency-Key`, para o reenvio não repetir o efeito | `(organizationId, key)` único |

Estados do outbox: `pending`, `processing` (com `lockedUntil`), `processed`, `failed` (vai tentar de novo em
`nextAttemptAt`) e `dead` (DLQ, só reprocessa por ação auditada).

## Parte nativa (só arquitetura B)

| Tabela | Campos principais |
|---|---|
| `CrmPerson` | nome, e-mail (e `emailNorm`), telefone cifrado + `phoneHash` + `phoneLast4`, empresa, responsável (`ownerMemberId`), origem (`manual, whatsapp, import`), notas, etiquetas (JSON), `status` (`active, archived`), `mergedIntoId`, `lastInteractionAt`, `version` |
| `CrmCompany` | nome (e `nameNorm`), CNPJ (`taxId`, só dígitos, em texto puro: é dado de pessoa jurídica, e a API o devolve inteiro a quem vê a empresa; a versão anterior deste documento dizia "cifrado + `taxIdLast4`", o que o código nunca fez — ver `07-seguranca-e-privacidade.md` § 7), domínio, setor, responsável, notas, `status`, `importBatchId`, `version` |
| `CrmPipeline` | nome, `isDefault`, `status` (`active, inactive`), `position`, `version` |
| `CrmStage` | funil, nome, `position`, probabilidade (0 a 100), SLA em dias, `status`. Ganho e perdido **não** são etapas: são estados do negócio |
| `CrmDeal` | funil, etapa, título, pessoa, empresa, responsável, origem (`manual, opportunity, alert, recovery, import`) + `sourceId` e `originKey`, `status` (`open, won, lost, archived`), `amountCents`, `currency`, `amountSource`, `estimatedAmountCents`, `confidence`, probabilidade (sem campo de origem), prioridade, previsão de fechamento, `closedAt`, motivo de perda, nota e evidência do desfecho, próxima ação e prazo, `stageChangedAt`, `stageLockedByHuman`, `version`. Não há equipe nem `deletedAt`: o negócio sai da lista por `status = archived` (`10-handoff-e-suporte.md` § 9, H27) |
| `CrmDealEvent` | histórico imutável: `created, updated, stage_changed, assigned, won, lost, reopened` (com o motivo em `data.reason`), `archived, suggestion_accepted, suggestion_dismissed, recovery_completed, divergence` (desfecho do sistema diferente do humano, que continua valendo); etapa de/para; origem `manual, system, suggested`; autor; dados pequenos em JSON. O tipo `linked` está previsto no schema, mas nenhum fluxo o grava: o vínculo com conversa, alerta ou recuperação fica em `CrmBusinessLink`, sem linha no histórico. Não há comentário livre no negócio |
| `CrmActivity` | tipo (`call, whatsapp_external, email, meeting, follow_up, internal`), título, negócio, pessoa, responsável, prazo (UTC, mostrado no fuso da empresa), prioridade, `status` (`open, in_progress, done, cancelled`), resultado, notas, origem (`manual, alert, recovery, stage, suggestion`) + `sourceId`, `dedupeKey` único (uma tarefa aberta por causa), `version` |
| `CrmSuggestion` | sugestão da inteligência (`create_deal, move_stage, create_task, confirm_outcome`), `status` (`pending, accepted, dismissed, expired`), alvo (negócio, conversa, oportunidade, alerta), motivo e evidência, versão da regra, `dedupeKey` único |

## Mapeamento com o legado

| AtendeRadar | CRM | Regra |
|---|---|---|
| `Organization.id` | `CrmTenantLink` | criado ao ligar `crm.enabled`, uma vez (retry não duplica) |
| `OrganizationMember.id` | `ownerMemberId` | sem segundo login; o papel continua o do AtendeRadar |
| `Contact.id` | `CrmPerson` via `CrmIdentityLink` | só contato elegível: não excluído, não grupo, fora da simulação |
| `Conversation.id` | `CrmBusinessLink` | só a referência; o texto fica na conversa |
| `RevenueOpportunity.id` | origem do negócio ou da sugestão | estimativa em `estimatedAmountCents`, arredondada para centavos; `amountCents` fica nulo e `amountSource` fica `unknown` |
| `Alert.id` | `CrmActivity.sourceId` ou `CrmBusinessLink` | uma tarefa aberta por alerta (`dedupeKey`) |
| `RecoveryItem.id` | `CrmBusinessLink` | a fila de recuperação continua a fonte da execução; não há fila paralela |

## Exclusão e retenção

- As tabelas CRM não têm chave estrangeira para `Organization` (como várias tabelas do app, R7). Excluir a organização
  (`wipeOrganization` em `src/lib/org-deletion.ts`) apaga cada tabela `Crm*` com `deleteMany` explícito, na mesma
  transação do resto, filhas antes das mães. A exportação da organização (`src/lib/org-export.ts`) inclui as mesmas
  tabelas. Na arquitetura A, a exclusão só termina quando o provedor confirmar a remoção do tenant.
- Contato marcado como excluído do monitoramento (`Contact.excluded`) não gera pessoa, negócio nem sugestão nova. A pessoa
  comercial que já existia fica, porque é dado comercial próprio, mas perde o vínculo de conversa nas telas.
- Outbox `processed` com mais de 30 dias é apagado pelo job de limpeza. `dead` fica até ser reprocessado ou descartado
  por ação auditada.
