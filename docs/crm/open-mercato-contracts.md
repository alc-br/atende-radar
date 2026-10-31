# Contratos do Open Mercato 0.9.0 para o BFF (F1-01)

O que o BFF do AtendeRadar precisa saber para falar com o Open Mercato (alternativa A do ADR-001). O navegador nunca
chama o Open Mercato; só o servidor do AtendeRadar chama, com uma chave por tenant (ADR-003, seção "Provedor").

Fonte de cada linha:

- **Provado**: chamada real na POC (`02-poc-open-mercato.md`, id da prova entre parênteses).
- **Código**: lido no código da 0.9.0 (commit `f451ce4`), caminho a partir de `packages/`. Não executado.

## 1. Base

| Item | Contrato | Fonte |
|---|---|---|
| Transporte | HTTP interno, JSON (`content-type: application/json`) | provado |
| Saúde | `GET /api/healthz` → 200 `{"status":"ok","ts":"<ISO>"}`, sem credencial | provado (G1) |
| OpenAPI | `GET /api/docs/openapi`, 263 caminhos | provado |
| Sem credencial | 401 `{"error":"Unauthorized"}`, sem redirecionar | provado (G2, D1) |
| Campos desconhecidos | descartados em silêncio (zod). Um nome de campo errado não dá erro | provado (`rolesCsv`, `Idempotency-Key`) |

## 2. Autenticação do BFF

| Item | Contrato | Fonte |
|---|---|---|
| Cabeçalho | `x-api-key: <segredo>` ou `Authorization: ApiKey <segredo>` | provado (D4) |
| Formato | `omk_<8 hex>.<48 hex>`. O `keyPrefix` (`omk_` + 8 hex) é público e serve para achar a chave nos logs | código `core/src/modules/api_keys/services/apiKeyService.ts:117` |
| Escopo | o tenant e a organização da chave. Nenhum parâmetro, cookie ou cabeçalho troca isso | provado (C8, C14, C16, C17) |
| Permissões | as do papel ligado à chave (`roles`). Papel do BFF: `customers.*` e `webhooks.*` | provado (A4, A7) |
| Falta de permissão | 403 `{"error":"Forbidden","requiredFeatures":[...]}` | provado (D7, C20) |
| Revogação | vale na hora no mesmo processo; cache de 30 s (chave válida) e 5 s (não achada) por processo | provado (D5, D8); cache: código |
| Validade | `expiresAt` na criação; depois dela, 401 | provado (D9) |

Criar, listar e revogar chave (precisa de `api_keys.*`):

```http
POST /api/api_keys/keys
{ "name": "bff-<empresa>", "roles": ["crm_bff"], "organizationId": "<org>", "expiresAt": "<ISO, opcional>" }

201 { "id": "<uuid>", "name": "...", "keyPrefix": "omk_…", "secret": "omk_….…",
      "tenantId": "<uuid>", "organizationId": "<uuid>", "roles": [{ "id": "<uuid>", "name": "crm_bff" }] }
```

- O `secret` só vem nessa resposta. O BFF cifra e guarda; não há como ler de novo.
- `GET /api/api_keys/keys` lista só as chaves do tenant de quem chama (A8).
- `DELETE /api/api_keys/keys?id=<id>` → 200 `{"success":true}` (D5).
- Superadmin pode criar chave para outro tenant mandando `tenantId` no corpo. Quem não é superadmin recebe 403 "Not
  authorized to target this tenant."

## 3. Provisionar um tenant (uma empresa do AtendeRadar)

Ordem provada na POC. O passo 1 tem de ser pelo CLI: tenant criado por `POST /api/directory/tenants` nasce **sem
cifra em repouso** (seção 6 da POC).

| Passo | Chamada | Resposta |
|---|---|---|
| 1. Tenant, organização e admin | `yarn mercato auth setup --orgName "<nome>" --orgSlug <slug> --email <admin> --password <gerada> --roles admin --json` | uma linha JSON `{tenantId, organizationId, adminUserId, adminEmail, reusedExistingUser}` |
| 2. Papel do BFF | `POST /api/auth/roles {name, tenantId}` | 201 `{id}` |
| 3. Permissões do papel | `PUT /api/auth/roles/acl {roleId, tenantId, features: ["customers.*","webhooks.*"]}` | 200 `{ok:true, sanitized:false}` |
| 4. Chave do BFF | `POST /api/api_keys/keys` (seção 2) | 201 com `secret` |
| 5. Webhook | `POST /api/webhooks` com a chave do passo 4 (seção 8) | 201 com `secret` `whsec_…` |
| 6. Mapeamento | o BFF grava em `CrmTenantLink`: `tenantId`, `organizationId`, id e prefixo da chave, segredo da chave cifrado, id do webhook e segredo do webhook cifrado | — |

Notas:

- Passos 2 e 3 usam o token do superadmin (`POST /api/auth/login`, formulário `email` e `password`, resposta
  `{ok, token, redirect}`; vai como `Authorization: Bearer`). O token nunca sai do servidor.
- Com `--orgSlug`, o setup falha se o e-mail já existir, em vez de reaproveitar o tenant do usuário existente.
- Usuário pela API: `POST /api/auth/users {email, password, tenantId, organizationId, roles: [nomes]}`. O campo é
  `roles`; `rolesCsv` é ignorado (A5).
- Sem `--include-demo-users`, o setup não cria os usuários de exemplo.

## 4. Erros

| Status | Corpo | Quando | Fonte |
|---|---|---|---|
| 400 | `{"error":"Invalid input","details":[...]}` | corpo fora do schema | código `shared/src/lib/crud/factory.ts:652` |
| 400 | `{"error":"Pipeline stage not found"}` e parecidos | regra de negócio | código `customers/commands/deals.ts` |
| 401 | `{"error":"Unauthorized"}` | sem chave, chave inválida, revogada ou vencida | provado (D1–D9) |
| 403 | `{"error":"Forbidden","requiredFeatures":[...]}` | papel sem permissão | provado (D7) |
| 403 | `{"error":"Forbidden"}` | `PUT`/`DELETE` em registro de outro tenant | provado (C9–C11) |
| 403 | `{"error":"Not authorized to target this tenant."}` | `tenantId` alheio na URL ou no corpo | provado (C8, C14) |
| 404 | `{"error":"Person not found"}`, `"Deal not found"`, `"Company not found"`, `"Customer not found"` | id que não existe no tenant | provado (C1, C5, C6, C12) |
| 409 | `{"error":"record_modified","code":"optimistic_lock_conflict","currentUpdatedAt":"<ISO>","expectedUpdatedAt":"<ISO>"}` | trava otimista | provado (F1) |
| 422 | `{"error":"...","code":"organization_selection_invalid"}` | cookie de organização inválido (só usuário com sessão) | provado (C16) |
| 500 | `{"error":"Internal server error","message":"...","requestId":"<uuid>","code":"DATABASE_ERROR"}` | por exemplo, atividade com `id` repetido | provado (E2) |

Regra do BFF: 401 e 403 viram alerta de credencial, nunca troca de tenant (ADR-003). 500 com `DATABASE_ERROR` em
criação de atividade com `id` do BFF = conferir se já existe (seção 7).

## 5. Recursos de CRM

Base `/api/customers`. Todos com o tenant e a organização da chave. `tenantId` e `organizationId` não vão no corpo.

| Recurso | Caminho | Criar (campos principais) | Resposta da criação |
|---|---|---|---|
| Pessoa | `/people` | `firstName`, `lastName` (obrigatórios); `displayName`, `primaryEmail`, `primaryPhone`, `companyEntityId`, `jobTitle`, `ownerUserId`, `source`, `status`, `lifecycleStage`, `tags` | 201 `{id, personId}` |
| Empresa | `/companies` | `displayName` (obrigatório); `domain`, `legalName`, `websiteUrl`, `industry` | 201 `{id, companyId}` |
| Funil | `/pipelines` | `name` | 201 `{id}` |
| Etapa | `/pipeline-stages` | `pipelineId`, `label`, `order` | 201 `{id}` |
| Negócio | `/deals` | `title` (obrigatório); `pipelineId`, `pipelineStageId`, `valueAmount`, `valueCurrency` (3 letras), `probability` (0–100), `expectedCloseAt`, `ownerUserId`, `source`, `closureOutcome` (`won`/`lost`), `lossReasonId`, `lossNotes`, `personIds`, `companyIds`, `primaryPersonEntityId` | 201 `{id}` |
| Atividade | `/interactions` | `entityId` (pessoa ou empresa), `interactionType` (ex.: `note`); `id` (uuid do cliente, opcional), `dealId`, `title`, `body`, `status` (padrão `planned`), `scheduledAt`, `occurredAt` | 201 `{id}` |

Fonte: provado (B1) e código `customers/data/validators.ts` (`personCreateSchema:137`, `companyCreateSchema:158`,
`dealCreateSchema:170`, `interactionCreateBaseSchema:493`, `pipelineCreateSchema:680`, `pipelineStageCreateSchema:701`).

**Dois ids na pessoa e na empresa.** `id` é o da entidade; `personId`/`companyId` é o do perfil. O BFF usa sempre o
`id`: na leitura (`/people/{id}`), em `interactions.entityId`, em `deals.personIds` e no `data.entityId` do webhook.

Operações:

| Operação | Contrato | Fonte |
|---|---|---|
| Ler um | `GET /people/{id}`, `/companies/{id}`, `/deals/{id}`. Pessoa aceita `include=deals&include=interactions` (também `activities`, `addresses`, `comments`) | provado (B7–B9, E4); código `customers/api/people/[id]/route.ts:442-449` |
| Resposta da leitura | `{interactionMode, person: {...}}`; `{deal: {...}, people, companies, linkedPersonIds, linkedCompanyIds, pipelineName, stageTransitions, customFields}`. Campos em camelCase | provado |
| Listar | `GET /people?page=1&pageSize=50&search=<texto>`; filtros `id`, `ids`, `pipelineStageId` (negócios), `entityId` (atividades) | provado (B14, B15, C2, C3) |
| Resposta da lista | `{items, total, page, pageSize, totalPages, _meta}`. **Itens em snake_case** (`display_name`, `primary_email`, `updated_at`). `pageSize` padrão 50 | provado |
| Atividades | `GET /interactions?entityId=<id>&limit=25&cursor=<cursor>` (`limit` de 1 a 100). Paginação por cursor, não por página | provado (B10); código `customers/api/interactions/route.ts:54-55` |
| Mudar | `PUT /<recurso>` com `id` no corpo e só os campos que mudam. Pessoa responde `{ok:true, updatedAt}`; negócio responde só `{ok:true}` | provado (B11, B12) |
| Apagar | `DELETE /<recurso>?id=<id>` → 200 `{ok:true}`. Exclusão lógica: a leitura seguinte dá 404 | provado (B16) |
| Busca por e-mail | `?email=` **não funciona** em tenant cifrado (compara com o texto cifrado). Usar `?search=` | provado (E3); código `customers/api/people/route.ts:189-197` |

**Defeito conhecido (C15).** `PUT /deals` aceita `pipelineId` e `pipelineStageId` de outro tenant e grava. O BFF só
manda ids de funil e etapa que leu do próprio tenant e confere antes de mandar.

## 6. Trava otimista

| Item | Contrato | Fonte |
|---|---|---|
| Cabeçalho | `x-om-ext-optimistic-lock-expected-updated-at: <updatedAt da última leitura>` | provado (F1); código `shared/src/lib/crud/optimistic-lock-headers.ts` |
| Valor diferente do atual | 409 `optimistic_lock_conflict` com `currentUpdatedAt` | provado (F1) |
| Sem cabeçalho | grava (último vence) | provado (F1) |
| Ligada por padrão | variável `OM_OPTIMISTIC_LOCK` | código `shared/src/lib/crud/optimistic-lock.ts` |

O BFF sempre manda o cabeçalho. No negócio, o `PUT` não devolve o `updatedAt` novo: reler antes da próxima mudança.

## 7. Idempotência

Não existe no Open Mercato 0.9.0.

| Caso | Comportamento | Fonte |
|---|---|---|
| `Idempotency-Key` | ignorado. 3 `POST` iguais = 3 registros | provado (E1) |
| Atividade com o mesmo `id` | 1ª 201; as seguintes **500** `DATABASE_ERROR` (não 409) | provado (E2) |
| Pessoa, empresa, negócio | não aceitam `id` do cliente | código `customers/data/validators.ts` |

O que o BFF faz:

1. Mapeamento próprio `(empresa, tipo, id local) → id no Open Mercato`, gravado na mesma transação que marca o envio
   como feito (outbox do ADR-002).
2. Antes de repetir uma criação depois de timeout, procurar pelo id local. **Inferência:** dá para guardar o id local
   num campo próprio (`source` ou campo personalizado) e procurar com `?search=`; não testei.
3. Atividade: o BFF gera o `id`. Em 500 na criação, lê `GET /interactions?entityId=...` e confere se o `id` já existe
   antes de tentar de novo.

## 8. Webhooks (saída do Open Mercato para o BFF)

Cadastro, com a chave do tenant (precisa de `webhooks.*`):

```http
POST /api/webhooks
{ "name": "bff-<empresa>", "url": "https://<bff>/api/crm/om-webhook",
  "subscribedEvents": ["customers.person.created", "customers.deal.updated"], "maxRetries": 3, "timeoutMs": 5000 }

201 { "id": "<uuid>", "name": "...", "url": "...", "secret": "whsec_…", "subscribedEvents": [...] }
```

| Item | Contrato | Fonte |
|---|---|---|
| Escopo | tenant e organização vêm da credencial; o webhook só recebe eventos do próprio tenant | provado (F8, F11); código `webhooks/.../subscribers/outbound-dispatch.ts` |
| Segredo | `whsec_<base64>`, só na resposta da criação | provado (F6) |
| Outras rotas | `GET /api/webhooks`, `DELETE /api/webhooks/{id}` → `{success:true}` | provado (F11, F12) |
| Entregas | `GET /api/webhooks/deliveries?webhookId=<id>` → `items[]` com `status`, `attemptNumber`, `maxAttempts`, `responseStatus`, `messageId` | provado (F10) |
| Catálogo | `GET /api/webhooks/events` → `{data:[{id, label, entity, category}]}`; 135 eventos | provado (F5) |
| Existem, não testadas | `POST /api/webhooks/{id}/rotate-secret`, `POST /api/webhooks/{id}/test`, `POST /api/webhooks/deliveries/{id}/retry` | código `webhooks/src/modules/webhooks/api/` |
| URL privada | recusada (400) sem `OM_WEBHOOKS_ALLOW_PRIVATE_URLS=true` | provado; código `webhooks/.../lib/url-safety.ts:56` |

Eventos do `customers` (17 de pessoa, empresa, negócio e atividade, código `customers/events.ts`):
`person.created|updated|deleted`, `company.created|updated|deleted`, `deal.created|updated|deleted|won|lost`,
`interaction.created|updated|deleted|completed|canceled|reverted`, todos com o prefixo `customers.`. Provados:
`person.created`, `deal.updated`, `interaction.created`.

Entrega:

```http
POST <url>
content-type: application/json
webhook-id: msg_<32 hex>
webhook-timestamp: <segundos Unix>
webhook-signature: v1,<base64>

{ "type": "customers.person.created", "timestamp": "<ISO>",
  "data": { "id": "<personId>", "entityId": "<id da pessoa>", "tenantId": "<uuid>", "organizationId": "<uuid>" } }
```

- O evento só leva ids. O BFF lê o registro depois (`GET /people/{entityId}`).
- Assinatura (Standard Webhooks): tirar `whsec_` do segredo, decodificar o base64, calcular HMAC-SHA256 de
  `<webhook-id>.<webhook-timestamp>.<corpo cru>`, codificar em base64 e comparar, em tempo constante, com cada valor
  `v1,…` do cabeçalho. Provado: todas as entregas conferiram (F7). Código `shared/src/lib/webhooks/sign.ts`.
- O BFF recusa `webhook-timestamp` com mais de 5 minutos de diferença (regra nossa, contra reenvio).
- Reentrega em 408, 429 e 5xx, com espera de 1 s × 2^(tentativa − 1) mais até 1 s aleatório. Outros 4xx não repetem.
  O `webhook-id` é o mesmo em todas as tentativas (F9). Código `webhooks/.../lib/delivery.ts:414-425`.
- Primeira entrega chegou entre 0,2 e 1,1 s depois da mudança.

Fila: com a fila `local` (padrão do scaffold), um evento chegou **duas vezes** com o mesmo `webhook-id`. Com
`QUEUE_STRATEGY=async` e `REDIS_URL`, uma vez. Em qualquer caso, o BFF guarda os `webhook-id` já processados e ignora
o repetido.

## 9. O que o BFF nunca usa

- `POST /api/directory/tenants` e `/organizations` (tenant sem cifra; e a chave do BFF não tem essa permissão).
- Rotas de página (`/backend`) e o login de usuário, fora do provisionamento.
- `?email=` em pessoa.
- Cookies `om_selected_tenant` e `om_selected_org` (são da UI do Open Mercato).
