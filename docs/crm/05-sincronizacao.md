# Sincronização do CRM

Como as mudanças do AtendeRadar (oportunidade, alerta, recuperação, privacidade, etapa analítica) chegam ao CRM.
Decisão em `ADR-002-fonte-de-verdade-e-sync.md`. Código em `src/lib/crm/`: `capture.ts`, `events.ts`, `worker.ts`,
`consumer.ts`. Referência da especificação: seção 8 (8.1 a 8.5) e CRM-06.

## 1. Fonte de verdade

| Dado | Dono | O CRM pode |
|---|---|---|
| Conversa, mensagens, contato observacional, análise, oportunidade, alerta, recuperação | AtendeRadar (motor e ingestão) | ler e gerar sugestão |
| Pessoa, empresa, funil, etapa, negócio, atividade, sugestão | CRM | ler e escrever |
| Ganho, perda, etapa escolhida por uma pessoa | quem decidiu (registrado em `CrmDealEvent`) | nada sem nova ação humana |

O CRM nunca escreve nas tabelas do AtendeRadar pela sincronização. A única escrita na direção contrária é o desfecho
confirmado por uma pessoa (CRM-07), que passa pela mesma regra da rota manual de desfecho (seção 7).

## 2. Fluxo

```text
tabelas de origem ──(captura a cada 15 s, por checkpoint)──▶ CrmOutboxEvent (pending)
                                                                  │
                                         worker (reserva, valida, consumidor)
                                                                  │
                          ┌─────────── mesma transação ───────────┤
                          ▼                                       ▼
              efeitos no CRM (sugestão, valor, vínculo,     CrmSyncInbox (consumer, eventId)
              histórico; negócio só com autoCreateDeals)
```

1. `captureCrmChanges()` percorre as empresas com `crm.enabled` e, para cada recurso, lê as linhas alteradas depois do
   cursor salvo em `CrmSyncCheckpoint` (`capture:<recurso>`), em ordem `(updatedAt, id)`.
2. Cada linha vira zero ou mais eventos (seção 4) gravados por `emitCrmEvent`, que valida o payload com zod e descarta
   o que já existe pela `idempotencyKey`.
3. Se gravou algo, `kickCrmOutbox()` agenda uma rodada do worker em ~1 s. O agendador também roda o worker sozinho.
4. O worker reserva cada evento, valida de novo, chama os consumidores registrados e grava o resultado.

Por que ler as tabelas em vez de gravar o evento dentro do motor: o motor grava passo a passo, sem transação
(`00-inventario.md` R4), e mudar o motor arrisca o modo Auditoria. A captura não toca no motor. Ver ADR-002.

## 3. Captura (`capture.ts`)

| Item | Valor |
|---|---|
| Lote | 200 linhas por leitura, até 10 leituras por recurso e rodada. O resto fica para a rodada seguinte. |
| Primeira rodada | janela de 30 dias (`BACKFILL_DAYS`). É o backfill. |
| Cursor | `{ t: updatedAt ISO, id }` em `CrmSyncCheckpoint.cursor`, por empresa e recurso. |
| Atraso | `lagSeconds` no checkpoint quando a rodada esgota as 10 leituras (há fila acumulada); 0 caso contrário. |
| Falha | grava `lastErrorCode = capture_failed` no checkpoint daquele recurso e segue para os outros e para as outras empresas. |
| Rodada ociosa | sem linha nova, sem erro e com a última gravação também ociosa há menos de 1 min (`IDLE_SAVE_MS`), o checkpoint não é regravado: a linha já diz o mesmo e só "Última leitura" ficaria até 1 min mais velha. Antes, cada rodada gravava 5 linhas por empresa a cada 15 s (medição em `08-testes-e2e.md` § 3). |
| Grupos e excluídos | conversa de grupo ou de contato excluído do monitoramento não gera evento. |
| Empresa de simulação | não alimenta o CRM (`isSimulationOrg`): a rodada volta com `paused: 'simulation'` sem ler nada. |
| Empresa bloqueada pelo plano | pausa como a análise (`orgLock`): `paused: 'locked'`, cursor parado. Quando o plano volta, a captura segue de onde estava. |
| Concorrência | uma captura por processo (`globalThis.__crmCaptureRunning`). |

Ler de novo o mesmo trecho não muda nada: a chave `(empresa, tipo, agregado, versão)` já existe e o evento é ignorado.
Por isso o mesmo código faz captura contínua, backfill e reconciliação.

## 4. Eventos

Payload mínimo: IDs, números e rótulos fechados. Nunca texto de mensagem, nome ou telefone. Schemas em
`EVENT_SCHEMAS` (`events.ts`), todos `.strict()`.

| Evento | Recurso | Agregado | Versão | Quando |
|---|---|---|---|---|
| `opportunity.detected` | oportunidades | `revenue_opportunity` / id | 1 | oportunidade ativa vista pela primeira vez |
| `opportunity.estimate_changed` | oportunidades | `revenue_opportunity` / id | `updatedAt` em segundos | oportunidade ativa alterada depois de criada |
| `outcome.detected` | oportunidades | `opportunity_outcome` / `id:status` | 1 | oportunidade em `won` ou `lost` |
| `alert.created` | alertas | `alert` / id | `occurrences` | alerta aberto (novo ou reaberto) |
| `alert.resolved` | alertas | `alert` / id | `occurrences` | alerta `resolved` ou `dismissed` |
| `recovery.completed` | recuperações | `recovery_item` / id | 1 | recuperação `recovered` ou `lost` |
| `conversation.stage_inferred` | etapas | `conversation_stage` / `conversa:etapa` | 1 | conversa ligada a negócio aberto muda de etapa analítica |
| `contact.privacy_changed` | privacidade | `contact` / id | `updatedAt` em segundos | contato marcado como excluído |

Detalhes:

- `recovery.completed.result`: `not_recovered` (perdida), `sale_confirmed` (recuperada com valor) ou
  `contact_recovered` (recuperada sem valor). Recuperado sem valor não é venda (CRM-07).
- `alert.created.type` é o prefixo do `groupKey` do alerta (o tipo de problema), cortado em 60 caracteres.
- Etapa analítica só é lida para conversas com negócio aberto. Vínculo novo faz a conversa ser lida mesmo sem mudança
  depois do cursor.
- Valores em centavos inteiros (`reaisToCents`), convertidos na borda a partir do `Float` legado (R6).

## 5. Worker (`worker.ts`)

Estados de `CrmOutboxEvent.status`: `pending` → `processing` → `processed`; em erro `failed` (volta a tentar) ou
`dead` (DLQ).

| Regra | Valor |
|---|---|
| Entrega | at-least-once. O consumidor é idempotente. |
| Reserva | `updateMany` condicional para `processing` com `lockedUntil` de 60 s. Dois workers não pegam o mesmo evento. |
| Reserva vencida | volta para `failed` no começo da rodada seguinte (servidor reiniciou no meio). |
| Lote | 50 eventos por rodada. Lote cheio emenda outra rodada na hora. |
| Efeito e inbox | uma transação: efeitos do consumidor + linha em `CrmSyncInbox (consumer, eventId)`. Reprocessar não duplica. |
| Erro permanente | tipo desconhecido, JSON inválido, payload fora do schema: `dead` na primeira vez, sem retry. |
| Erro temporário | `failed` com `nextAttemptAt` = 30 s × 2^(n-1), teto de 1 h, ±20% de jitter. |
| Limite | 8 tentativas (`MAX_ATTEMPTS`). Depois, `dead`. |
| DLQ | `retryDeadEvent(org, id)` devolve para `pending` com 0 tentativas. Só pela rota de admin, com auditoria. |
| CRM desligado | evento da empresa que desligou o CRM é marcado `processed` sem efeito. |
| Limpeza | `purgeCrmOutbox`: processados e inbox com mais de 30 dias; chaves de idempotência de rota com mais de 24 h. |
| Desligar tudo | `CRM_DISABLED=1` no `app.env` para a captura, a reconciliação e as telas, sem mexer no banco. |

Erros 401, 403 e 429 de um provedor externo não existem no caminho nativo. Se o ADR-001 escolher o Open Mercato, o
adaptador classifica: 4xx de contrato = permanente; 401/403 = permanente + alerta de credencial; 5xx, 429 e rede =
temporário.

## 6. Regras do consumidor (inteligência)

D2: tudo vira sugestão para uma pessoa revisar. Com `crm.autoCreateDeals` ligada, a oportunidade ativa vira negócio
sozinha. Nenhuma regra marca ganho ou perda, move etapa, resolve alerta, manda mensagem ou mexe em consentimento.
Versão das regras: `crm-rules-1` (`RULE_VERSION`), gravada em cada sugestão e em cada histórico gerado pelo sistema.

| Evento | Condição | Efeito | Não faz |
|---|---|---|---|
| `opportunity.detected` | oportunidade ativa, sem negócio de origem | sugestão `create_deal` com título pela intenção, valor estimado, confiança e dono (membro com o e-mail do atendente) | não cria negócio se `autoCreateDeals` desligada |
| `opportunity.detected` | `autoCreateDeals` ligada | negócio `source=opportunity`, origem idempotente (`originKey`), vínculos com oportunidade e conversa | não duplica: a mesma oportunidade dá no máximo um negócio |
| `opportunity.estimate_changed` | negócio aberto da oportunidade | atualiza `estimatedAmountCents` e `confidence` sem mudar a versão do negócio | não mexe em `amountCents` (valor declarado por pessoa) |
| `opportunity.estimate_changed` | só há sugestão pendente | atualiza o payload da sugestão | versão menor que a aplicada é ignorada |
| `conversation.stage_inferred` | `crm.suggestStage` ligada, etapa mapeada à frente da atual | sugestão `move_stage` | nunca para trás; etapa escolhida por pessoa só muda se alguém aceitar |
| `outcome.detected` | negócio aberto na conversa | sugestão `confirm_outcome` (ganho com valor ou perda com motivo) | não fecha o negócio |
| `outcome.detected` | negócio já fechado com desfecho diferente | histórico `divergence` (uma vez por fechamento) | a pessoa vence (8.4) |
| `outcome.detected` | desfecho perdido | expira `create_deal` pendente da conversa | — |
| `alert.created` | severidade `high` ou `critical`, negócio aberto na conversa | sugestão `create_task` (retorno em 4 h; prioridade alta se crítico) | não cria tarefa sozinho |
| `alert.resolved` | — | expira sugestões pendentes daquele alerta (resolvido, descartado ou falso positivo) | tarefa já criada fica (decisão de uma pessoa) |
| `recovery.completed` | negócio aberto na conversa | vínculo `recovery` + histórico `recovery_completed` | não fecha o negócio |
| `recovery.completed` | `sale_confirmed` | sugestão `confirm_outcome` ganho | recuperado sem valor não vira ganho |
| `contact.privacy_changed` | contato excluído | expira sugestões das conversas dele, marca o vínculo de identidade como removido (`tombstone`) | não apaga pessoa nem negócio criado por gente |

Antes das regras, o consumidor confere o estado de agora, porque o evento pode ter saído antes (fila antiga,
reprocessamento da DLQ):

- `opportunity.detected` de oportunidade que não existe mais é ignorado (`opportunity_missing`); de contato excluído
  do monitoramento (`contact_excluded`) ou de conversa de grupo (`group`), também. A captura já pula os dois casos.
- `alert.created` de alerta que já não está aberto (resolvido, descartado ou falso positivo) é ignorado (`alert_closed`). "Criado" e "resolvido"
  são eventos diferentes do mesmo alerta, e o "criado" pode chegar depois.

Mapa da etapa analítica para a posição no funil padrão: `discovery` 0, `qualification` 1, `price` 2,
`negotiation` 3, `decision` 3. `evaluation` e `post_sale` não sugerem movimento.

Sugestões vencem em 14 dias. A chave `dedupeKey` (`empresa:tipo:alvo`) impede a mesma sugestão duas vezes, mesmo
depois de recusada ou vencida. A de tarefa de alerta leva também a ocorrência do alerta (abaixo).

Tarefa de alerta, uma por causa (T05.07): a chave da tarefa é `empresa:alert:id` (`alertTaskKey` em `activities.ts`),
a mesma para a tarefa criada à mão e para a sugestão aceita, então uma devolve a outra. Aceitar a sugestão expira as
outras sugestões pendentes de tarefa do mesmo alerta. O alerta que volta pode ser a mesma linha (o motor reabre o
alerta que ele mesmo resolveu, com mais uma ocorrência) ou uma linha nova com o mesmo `groupKey` (tipo do alerta na
mesma conversa), quando quem fechou foi uma pessoa. O consumidor olha todos os alertas desse `groupKey` e não sugere
tarefa quando:

- um deles tem tarefa aberta (`task_open_for_cause`);
- outro alerta da causa, ainda aberto, tem sugestão de tarefa pendente e no prazo (`suggestion_open_for_cause`). A
  sugestão de um alerta já fechado ou vencida não conta: o falso positivo também emite `alert.resolved`, que a expira;
- o próprio alerta, para aquele negócio, tem sugestão pendente no prazo ou uma que uma pessoa recusou
  (`suggestion_exists`).

A chave da sugestão leva a ocorrência (`create_task:alert:id:negócio:ocorrência`). Concluída ou cancelada a tarefa,
a chave dela é liberada, e a próxima ocorrência da causa (o mesmo alerta reaberto ou uma linha nova) pede de novo.

## 7. Conflitos (especificação 8.4)

| Conflito | O que o código faz |
|---|---|
| Análise diz ganho, pessoa marcou perdido | `divergence` no histórico; negócio fica como a pessoa deixou |
| Intenção muda depois de a pessoa mover o negócio | `stageLockedByHuman`; a sugestão avisa que a etapa foi escolhida por uma pessoa |
| Alerta reaberto com negócio encerrado | `openDealsOfConversation` só pega negócios abertos: nada acontece |
| Contato duplicado por número | `personFromContact` casa pelo hash do telefone na empresa; a mescla é manual e auditada |
| Tarefa concluída com alerta ainda aberto | o alerta fica como está (o CRM não resolve alerta); uma nova ocorrência dele pode sugerir outra tarefa |
| Venda confirmada com negócio aberto | sugestão `confirm_outcome` |
| Valor estimado diferente do negociado | `estimatedAmountCents` (sistema) e `amountCents` (pessoa) em campos separados; KPI usa a fonte explícita |
| Edição simultânea | `version` no negócio; versão velha = 409 |
| Membro removido | o escopo vem do login em cada chamada; negócios ficam com o dono antigo até reatribuição auditada |
| Empresa excluída | `wipeOrganization` apaga as tabelas `Crm*` na mesma transação |

Desfecho confirmado no CRM (CRM-07): ganho ou perda decidido por uma pessoa no negócio ligado a uma conversa também
vale para a conversa, a oportunidade e a recuperação, pela mesma regra de `conversations/[id]/outcome`.

## 8. Reconciliação (8.5)

`reconcileCrm(org, { dryRun })`:

1. Relê 7 dias com a mesma idempotência. Evento perdido é reposto; o resto conta como `alreadySynced`.
2. Conta negócios, abertos, vínculos órfãos, oportunidades que sumiram, telefones duplicados entre pessoas ativas,
   eventos presos (`processing` há mais de 10 min), eventos na DLQ e sugestões pendentes.
3. Grava os números no checkpoint `reconcile` (sem dado pessoal).

`dryRun` só conta. Não muda resultado decidido por pessoa. Roda sozinha a cada 6 h por empresa (`reconcileDue`) e sob
demanda pela rota de admin.

## 9. Observabilidade

| Onde | O que mostra |
|---|---|
| `outboxHealth(org)` | contagem por estado, `lagSeconds` do evento pendente mais antigo, `status`: `degraded` (há DLQ), `syncing` (atraso acima de 5 min) ou `operational` |
| `CrmSyncCheckpoint` | última rodada, último sucesso, último erro, linhas lidas, atraso, por recurso |
| `CrmSyncInbox.resultJson` | por que o evento foi ignorado (`suggestion_exists`, `stale_version`, `deal_closed`, `contact_excluded`, `group`, `alert_closed`...) |
| Configurações › CRM e Admin | `GET /api/crm/integration/status` com o acima, sem payload |
| Log do servidor (`[crm] ...`) | tipo e código do erro (`errTag` em `log.ts`, por exemplo `PrismaClientKnownRequestError P2002`), nunca a mensagem: a do Prisma pode citar telefone ou e-mail da consulta. Vale também para as rotinas do CRM no agendador (`safelyCrm` em `background.ts`) e para o tick do gateway |

Meta inicial (8.5): sugestão em p95 abaixo de 60 s depois da análise, com os componentes saudáveis. Pela construção:
captura a cada 15 s + worker em ~1 s. O motor roda a cada 60 s, então a contagem começa quando a análise grava, não
quando a mensagem chega. Medido na F7 (`08-testes-e2e.md` › Carga): 200 estimativas mudadas, p95 de 6,9 s entre o
evento ser gravado e ser processado. Somando os 15 s da captura, o pior caso fica perto de 22 s.

## 10. Limites conhecidos

- Oportunidade reaberta (`lost` → `active`, `ingest.ts:235`) não gera nova sugestão `create_deal`: a chave da sugestão
  já existe. A pessoa cria o negócio pela conversa. Registrado em R5.
- A captura enxerga o estado atual, não cada passo intermediário. Duas mudanças entre rodadas viram um evento com a
  versão mais nova. Para o CRM, que só sugere, isso basta.
- `updatedAt` alterado por coisas que não interessam ao CRM (por exemplo, `lastSeenAt`) gera releitura. A
  idempotência descarta.
- Uma instância só (R11, R17). Mais de um processo funciona (reserva condicional), mas a captura não foi pensada para
  dividir trabalho.
