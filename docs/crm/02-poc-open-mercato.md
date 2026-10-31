# POC isolada do Open Mercato (F1-02)

- Data: 30 e 31/10/2026
- Agente: 02 (especialista Open Mercato)
- Pergunta: o Open Mercato 0.9.0 serve como backend privado do CRM, chamado só pelo BFF do AtendeRadar, servidor a
  servidor?
- Vale o que tem comando e saída. O que é leitura de código ou dedução está marcado como **inferência**.

## Resultado em uma tabela

| Tema | Resultado | Onde |
|---|---|---|
| Licença | Núcleo MIT. O scaffold traz `@open-mercato/enterprise` (comercial) e `newrelic` (puxa um agente proprietário). Os dois saem: build e as 93 verificações passaram sem eles | `reports/om-licencas.md` |
| Tenant e organização | Superadmin cria tenant, organização, papel, ACL e usuário pela API | A1–A8 |
| CRUD | Pessoa, empresa, negócio, funil, etapa e atividade: criar, ler, mudar, apagar, buscar e paginar | B1–B16 |
| Isolamento | 37 de 40 verificações passaram. **Falha real:** o negócio de A aceita a etapa e o funil de B (C15) | C1–C21 |
| Autenticação | Sem credencial, chave inválida, revogada e expirada dão 401. Falta de permissão dá 403 | D1–D9 |
| Idempotência | **Não existe.** `Idempotency-Key` é ignorado. Repetir uma atividade com o mesmo `id` dá 500 | E1–E2 |
| Concorrência | Trava otimista por `updatedAt` funciona (409), mas só quando o cliente manda o cabeçalho | F1 |
| Webhooks | Assinatura Standard Webhooks válida, isolados por tenant, reentrega com o mesmo id. Na fila `local` saem **duplicados**; com Redis, não | F5–F12 |
| Headless | A API responde JSON 401 sem redirecionar. OpenAPI com 263 caminhos | G1–G3 |
| Cifra em repouso | Tenant criado pela API fica **sem cifra**. Tenant criado pelo CLI `mercato auth setup` fica cifrado | seção 6 |

Última execução completa (run `mvvvjaou`, sem enterprise, fila `async` com Redis): **93 verificações, 90 passaram,
3 falharam**. As 3 são o mesmo defeito (C15). A execução anterior com o enterprise instalado deu o mesmo resultado.

> **Correção da revisão adversarial (agente 10, 31/10/2026; ver ADR-001):** o E1 e o E3 são `check(..., true)` fixo
> (`tests/poc-http.mjs:373` e `:390`) e passam sempre, mesmo mostrando o defeito (sem idempotência; `?email=` sem
> resultado em tenant cifrado). Contando só as verificações que podem falhar, são 91, com 88 passando. O C15d não prova
> o que diz (abaixo), e a exclusão do B16 é física, não lógica.

Leitura do agente 02 para a F1-03 (a decisão é do ADR-001): o Open Mercato **passa com ressalvas** em TEN, AUTH, CRUD e
SYNC. As ressalvas viram requisito do BFF (seção 8). A decisão LIC depende de tirar o enterprise do `package.json`,
o que foi provado possível. O ADR-001 não aceitou essa leitura: ressalva que só o BFF resolve não aprova o portão.

## Decisão (F1-03)

**Fallback B: CRM nativo no Next.js do AtendeRadar**, com o mesmo contrato `/api/crm/*`. O Open Mercato não será
adotado nesta entrega. Detalhe, evidências e como reavaliar: `ADR-001-arquitetura-crm.md`.

| Portão | Veredito | Por quê |
|---|---|---|
| LIC-01 | aprovado | núcleo MIT; sem enterprise e `newrelic` o build e as provas passam |
| TEN-01 | reprovado | C15: o negócio de A grava e mostra a etapa de B |
| AUTH-01 | inconclusivo | só o lado do Open Mercato foi testado; o caminho BFF → Open Mercato não existe |
| CRUD-01 | aprovado | B1–B16 pela API pública, sem UI |
| SYNC-01 | reprovado | sem idempotência (E1, E2); fora de ordem, queda e replay sem teste |
| UX-01 | inconclusivo | nenhuma tela comercial rodou com o Open Mercato por trás |
| OPS-01 | reprovado | backup, restauração, Linux e servidor real não demonstrados (seção 7) |
| ECO-01 | reprovado | 2º runtime com PostgreSQL e Redis num servidor dividido com o Mautic, sem verba para outro |

A regra da especificação é adotar só se todos passarem. Corrigir só o C15 não muda a decisão. A seção 8 e o
`open-mercato-contracts.md` ficam como referência da 0.9.0 para uma reavaliação; não são requisito enquanto o B valer.

## 1. Ambiente

| Item | Valor |
|---|---|
| Open Mercato | 0.9.0, publicado em 09/10/2026, commit `f451ce4c390087f90d5314e002e9d009d5339e08` |
| App | criado do preset `crm` (`.mercato/starter-preset.json`), módulos `api_keys` e `webhooks` ligados à mão |
| Pilha do app | Next.js 16.3.6 (Turbopack), React 19.2.8, MikroORM 7, awilix, zod 4 |
| Máquina | Windows 11, Node 24.13, Yarn 4.17.1 via corepack (pasta global própria da POC) |
| Banco | PostgreSQL 16 do WSL, porta 5433, papel e banco `om_poc`, senha gerada na hora e guardada só no `.env` da POC |
| Redis | 7.0.15 do WSL, porta 6390, só para a fila `async` |
| Porta do app | 5050 (nunca 3000, 3100 ou 3111) |
| Pasta | temporária da sessão no C:, fora do repositório. Ficou guardada, com o app, o Postgres e o Redis parados |
| Idade dos pacotes | `.yarnrc.yml` com `npmMinimalAgeGate: 14d` (nada publicado há menos de 2 semanas) |

Ajustes feitos no app gerado:

1. `src/modules.ts`: entram `{ id: 'api_keys', from: '@open-mercato/core' }` e
   `{ id: 'webhooks', from: '@open-mercato/webhooks' }`. O preset `crm` não traz nenhum dos dois, e o BFF precisa dos dois.
2. `.env`: `CACHE_STRATEGY=memory`, `PORT=5050`, `DATABASE_URL` do banco da POC. Para a fila sem duplicata:
   `QUEUE_STRATEGY=async` e `REDIS_URL`.
3. `.env`, só na POC: `OM_WEBHOOKS_ALLOW_PRIVATE_URLS=true`, porque o receptor de teste roda em `127.0.0.1`. Sem isso o
   cadastro devolve 400 "resolves to a private or reserved IP range". Em produção fica desligado.
4. Teste sem enterprise: sai o bloco do enterprise de `modules.ts`, sai a pasta `src/modules/agent_examples` (importa o
   SDK do enterprise) e roda `yarn remove @open-mercato/enterprise newrelic`. O primeiro build falhou com
   `Cannot find module '@open-mercato/web-research'`: esse pacote (MIT) só vinha pelo enterprise, e o arquivo gerado
   `web-research-adapters.generated.ts` importa os tipos dele. Com `yarn add @open-mercato/web-research@0.9.0` o build
   passou.

## 2. Instalação e medidas

Medido na máquina de desenvolvimento (Windows), não no servidor. Serve para ordem de grandeza.

| Medida | Valor |
|---|---|
| `yarn install` | 6 min 17 s |
| Pacotes únicos instalados (nome@versão) | 1.892; sem enterprise e `newrelic`: 1.814 |
| `node_modules` | 1,8 GB; sem enterprise: 1,7 GB. Cache global do Yarn: mais 1,8 GB |
| `yarn generate` | 1 min 05 s |
| `yarn db:migrate` | 19 s, 128 tabelas |
| `yarn initialize` | 1 min 10 s |
| `yarn build` | 5 min 40 s (primeiro). Sem enterprise, com cache: 1 min 52 s |
| Boot até `/api/healthz` 200 | 29,2 s (primeiro); depois 20,8 s; 21,7 s com Redis; 22,5 s sem enterprise. O Next fica pronto em 1 a 2 s, o resto é o supervisor e o worker |
| Processos | `mercato server start` (supervisor) sobe `next start` e `mercato queue worker --all`. O preset não liga o scheduler |
| Memória em repouso | 585 MB (supervisor 167 + next 243 + worker 175) com fila `local`; 629 MB com Redis. Os invólucros do `yarn` somam mais ~205 MB se o app subir por `yarn start` |
| Memória na carga leve | pico 848 a 930 MB nas 5 execuções com carga; 686 MB logo depois da carga sem enterprise |
| Carga leve | 200 GETs, 5 em paralelo, 0 erro. p50 323 a 461 ms, p95 459 a 613 ms, máximo 1,1 a 1,3 s |
| Postgres | banco com 36 MB depois do `initialize` e 53 MB no fim; 8 conexões em repouso, 25 depois da carga; 227 MB de memória (13 processos) |
| Redis | 2,8 MB, 48 chaves |

**Inferência sobre o servidor.** O benchmark atual (`01-benchmark-atual.md`) mostra 5,3 GiB disponíveis. O Open
Mercato com Postgres e Redis ficaria entre 0,9 e 1,2 GB no pico, uns 20% do que sobra. O working set do Windows não é
igual ao RSS do Linux, então o número no servidor precisa ser medido de novo na F2 se o ADR-001 escolher a alternativa A.

## 3. Provas por HTTP

Script `tests/poc-http.mjs` da POC. Ele cria tudo com um sufixo por execução, guarda os segredos só na memória e mascara
JWT, chaves `omk_`, segredos `whsec_`, assinaturas, e-mails e telefones antes de gravar. No fim, ele procura nos
arquivos gravados os segredos que conhece; as cinco varreduras deram "limpo". Uma varredura final de toda a pasta
`evidencias/` (71 arquivos) achou e-mails de teste no log do `initialize`; foram mascarados.

Credenciais usadas: chave de API do tenant A (`x-api-key`), chave do tenant B, usuário comum do tenant A (Bearer do
`/api/auth/login`) e o superadmin do tenant A (só para criar tenant, papel e usuário).

### a) Tenants, usuários e chaves

| ID | Prova | Resultado |
|---|---|---|
| A1 | login do superadmin | 200 com `{ok, token, redirect}` e cookie |
| A2, A3 | superadmin cria tenant B e organização B | 201 e 201 |
| A4 | papel com ACL por tenant (`customers.*`, `api_keys.*`, `webhooks.*`) | 201 e 200 |
| A5, A6 | usuário comum em cada tenant, com `roles: [nome]`, e login dele | 201 e 200 |
| A7 | usuário A cria chave do tenant A; segredo aparece uma vez | 201, `tenantId` e `organizationId` do usuário |
| A7-exp | chave com `expiresAt` 25 s à frente | 201 |
| A8 | listagem de chaves do usuário A | só chaves do tenant A |

Armadilha encontrada: a API de usuários **ignora em silêncio** o campo `rolesCsv`. Na 1ª execução os usuários nasceram
sem papel e tudo deu 403 `requiredFeatures`. O campo certo é `roles` (lista de nomes).

### b) CRUD, busca e paginação

| ID | Prova | Resultado |
|---|---|---|
| B1 | funil, 2 etapas, empresa, pessoa, negócio e atividade em cada tenant | 201 em todos |
| B7–B9 | ler pessoa, negócio e empresa por id | 200; `include=deals&include=interactions` traz os vínculos (E4) |
| B10 | atividades por pessoa | 200, paginação por cursor |
| B11 | `PUT` da pessoa com `id` no corpo | 200 `{ok, updatedAt}` |
| B12 | mudar etapa do negócio | 200; a transição de etapa fica registrada |
| B14 | `?search=` com `pageSize=2` | página 1 com 2, total 3, `totalPages` 2, página 2 com 1 |
| B16 | `DELETE ?id=` | 200; a leitura seguinte dá 404. O 404 não separa exclusão lógica de física; o código faz `em.remove` e `nativeDelete` em cascata (`people.ts:1253-1270`, inferência por leitura do agente 10) |

### c) IDOR e troca de tenant

Cada tentativa rodou duas vezes: com a chave de A e com o usuário A.

| ID | Tentativa | Resultado |
|---|---|---|
| C1, C5, C6 | ler pessoa, negócio e empresa de B pelo id | 404 |
| C2–C4, C7 | `?id=`, `?ids=`, busca pelo nome de B, atividades da pessoa B | lista vazia |
| C8 | `?tenantId=B&organizationId=orgB` na URL | 403 "Not authorized to target this tenant." |
| C9–C11 | `PUT` e `DELETE` em registros de B | 403 |
| C12, C13 | atividade e negócio apontando para pessoa de B | 404 |
| C14, C19 | criar pessoa com `tenantId` de B no corpo | 403; nada aparece em B |
| **C15** | **`PUT` no negócio de A com `pipelineId` e `pipelineStageId` de B** | **200. O negócio de A guarda os ids de B e a leitura mostra o nome da etapa de B** |
| C16, C17 | cookies `om_selected_tenant`/`om_selected_org` e cabeçalhos `x-tenant-id`/`x-organization-id` de B | ignorados (404 ou lista vazia; com o cookie, o usuário recebe 422 `organization_selection_invalid`) |
| C18 | dados de B depois de tudo | intactos |
| C20, C21 | chave do BFF e usuário A no diretório de tenants | 403 |

Causa do C15 (**inferência** por leitura de código): `loadPipelineStageSnapshot` em
`packages/core/src/modules/customers/commands/deals.ts:112` busca a etapa só por `{ id }`. O tenant e a organização vão
como escopo de decifragem, não como filtro. A criação do negócio usa a mesma função (linha 561), então deve ter o mesmo
defeito; não testei. O C15d ("B não passa a ver o negócio de A") roda depois do C15c, que já devolveu o negócio à
etapa de A (`poc-http.mjs:319-321`): o teste não consegue ver o caso (revisão do agente 10). O vazamento é o nome da etapa de B e a gravação de um id
alheio. Para explorar, é preciso saber o UUID de uma etapa de B.

### d) Autenticação

| ID | Prova | Resultado |
|---|---|---|
| D1 | sem credencial | 401 `{"error":"Unauthorized"}` |
| D2, D3 | `x-api-key` inválida, Bearer inválido | 401 |
| D4 | `Authorization: ApiKey <segredo>` | 200 (forma alternativa ao `x-api-key`) |
| D5 | chave revogada, mesmo processo | 200 antes, 401 logo depois |
| D8 | chave revogada, 31 s depois | 401 |
| D9 | chave com `expiresAt` vencido | 200 antes, 401 depois |
| D7 | usuário sem a permissão | 403 com `requiredFeatures` |

O cache da chave fica na memória de cada processo: 30 s para chave válida, 5 s para chave não achada. Com uma instância
só, a revogação vale na hora (D5). **Inferência:** com mais de uma instância, outra instância pode aceitar a chave
revogada por até 30 s.

### e) Idempotência

| ID | Prova | Resultado |
|---|---|---|
| E1 | mesmo `POST` de pessoa 3 vezes com o mesmo `Idempotency-Key` | 201, 201, 201: **3 pessoas** |
| E2 | atividade com `id` gerado pelo cliente, 3 vezes | 201, depois **500** duas vezes (`DATABASE_ERROR`, chave duplicada em `customer_interactions_pkey`) |
| E3 | achar pessoa por e-mail para fazer upsert | tenant cifrado: `?email=` acha 0, `?search=` acha 3. Tenant sem cifra: `?email=` acha 1 |

Só a atividade aceita `id` do cliente. Pessoa, empresa e negócio não têm campo `id` na criação
(`customers/data/validators.ts`). O BFF tem de cuidar sozinho da idempotência (seção 8).

### f) Eventos, webhooks e concorrência

| ID | Prova | Resultado |
|---|---|---|
| F1 | `PUT` com `x-om-ext-optimistic-lock-expected-updated-at` atual / velho / sem cabeçalho | 200 / **409** `optimistic_lock_conflict` / 200 (último vence) |
| F5 | catálogo de eventos | 135 eventos, 51 do `customers` |
| F6 | chave de A e de B cadastram um webhook cada | 201; segredo `whsec_` aparece uma vez |
| F7 | pessoa, mudança de etapa e atividade em A; pessoa em B | 4 entregas em A, 1 em B; assinatura válida em todas; 1ª entrega em 0,2 a 1,1 s |
| F8 | isolamento | A só recebe eventos de A; B só de B |
| F9 | receptor responde 503 na 1ª atividade | reentrega com o **mesmo** `webhook-id`: 1,3 a 1,9 s depois com Redis; 45 ms depois na fila `local` |
| F10, F11 | listar entregas e webhooks | 200; a chave A só vê webhooks de A |
| F12 | apagar os webhooks | 200 |

Duplicata na fila `local` (`tests/webhook-dup.mjs`, 1 pessoa criada, espera de 20 s):

| Fila | Requisições recebidas | Entregas registradas |
|---|---|---|
| `local` (padrão do scaffold) | 2, com o mesmo `webhook-id`, a 11 ms uma da outra | 1 |
| `async` (BullMQ e Redis) | 1 | 1 |

O worker registra "Job completed" duas vezes para o mesmo job na fila `local`. O próprio código da fila diz que ela não
serve para produção e não aguenta consumidores concorrentes (`packages/queue/src/strategies/local.ts:72-90`).

### g) API headless

| ID | Prova | Resultado |
|---|---|---|
| G1 | `/api/healthz` | 200 `{"status":"ok","ts":...}` |
| G2 | rota da API sem credencial | 401 JSON, sem `Location` |
| G3 | página `/backend` sem sessão | 307 para `/api/auth/session/refresh` (só páginas redirecionam) |
| — | `/api/docs/openapi` | 263 caminhos (3,4 MB) |

## 4. Erros vistos nos logs do servidor

| Erro | Quando | Impacto |
|---|---|---|
| `QueryIndexScopeError` "Query index event for a global entity must explicitly provide tenantId and organizationId as null" | ao criar organização pela API | o índice de busca da organização não é gravado. Não afetou as provas |
| `email delivery failed` | ao criar usuário (não há SMTP na POC) | só aviso |
| `duplicate key value violates unique constraint "customer_interactions_pkey"` | prova E2 | vira 500 em vez de 409 |

## 5. Usuários e senhas de exemplo

O `mercato init` cria superadmin, admin e employee. Os dois derivados usam a senha conhecida `secret` quando não há
variável de ambiente (`packages/cli/src/lib/init-secrets.ts:29`). Em produção não se usa `init`: usa-se
`mercato auth setup` com senha explícita e sem `--include-demo-users`.

## 6. Cifra em repouso por tenant

| Como o tenant nasceu | Mapas de cifra (`encryption_maps`) | E-mail do usuário no banco |
|---|---|---|
| `mercato init` (tenant A) | 21 | cifrado |
| `POST /api/directory/tenants` (tenant B) | 0 | texto puro |
| `mercato auth setup --orgName ... --orgSlug ... --roles admin --json` (tenant C) | 21 | cifrado |

O comando do tenant C levou 13 s e devolveu `{tenantId, organizationId, adminUserId, ...}` em uma linha JSON. Ele avisou
que usou chave derivada de `TENANT_DATA_ENCRYPTION_FALLBACK_KEY` (sem Vault) e que, sem esse segredo, o dado cifrado
não volta depois de reiniciar.

Consequências:

- Provisionar tenant pela API HTTP deixa os dados do cliente sem cifra. O provisionamento tem de ser pelo CLI (ou pela
  mesma função `setupInitialTenant`). **Inferência:** o módulo `onboarding` (cadastro com verificação de e-mail) também
  chama `setupInitialTenant`; não testei.
- No tenant cifrado, o filtro `?email=` não acha nada, porque compara com o texto cifrado
  (`customers/api/people/route.ts:189-197`). A busca `?search=` funciona.
- O segredo de cifra vira dado crítico de backup: sem ele, o banco cifrado não serve.

## 7. O que não foi provado

- Linux, systemd e o servidor real. Tudo rodou no Windows.
- Mais de uma instância do app (efeito do cache de chaves, do cache em memória e da fila).
- Backup, restauração e troca de versão com migração (0.9.0 para a seguinte).
- Volume real de dados e carga acima de 5 requisições em paralelo.
- Limite de taxa, CORS e SSO.
- Criação de negócio já com a etapa de outro tenant (deve ter o mesmo defeito do C15).
- `PUT /api/customers/deals/bulk-update-stage` com etapa de outro tenant.
- Se o 403 do C9 (registro existe em outro tenant) difere da resposta para um id que não existe.

## 8. Requisitos para o BFF, se a alternativa A for a escolhida

Fora de vigor: o ADR-001 escolheu a alternativa B. A lista vale só se o A for reavaliado.

1. **Etapa e funil só do mapeamento do próprio tenant.** O BFF nunca repassa `pipelineId` ou `pipelineStageId` vindos do
   navegador sem conferir que pertencem ao tenant mapeado. Abrir o defeito do C15 no projeto e acompanhar a correção.
2. **Idempotência do lado do BFF.** Tabela de mapeamento `(empresa, tipo, id local) → id no Open Mercato`, gravada
   antes de considerar o envio feito. Antes de recriar depois de timeout, procurar pelo id local. Para atividade, gerar
   o `id` no BFF e, em erro 500 de chave duplicada, ler pelo id em vez de repetir.
3. **Fila `async` com Redis em produção.** A fila `local` duplica entregas.
4. **Consumidor de webhook idempotente pelo `webhook-id`.** Mesmo com Redis, a reentrega repete o id (é o contrato).
5. **Sempre mandar o cabeçalho da trava otimista** nos `PUT`. Sem ele, o último a gravar vence.
6. **Provisionar tenant pelo CLI** (`mercato auth setup`), nunca por `POST /api/directory/tenants`, e guardar o segredo
   de cifra no cofre do servidor.
7. **Uma chave de API por tenant**, com papel mínimo (`customers.*`, `webhooks.*`) e sem permissão de diretório.
8. **Tirar `@open-mercato/enterprise` e `newrelic`** do `package.json` do app e incluir `@open-mercato/web-research`.
9. **Webhook só leva ids.** O BFF lê o registro depois do evento.

## 9. Como repetir

Na pasta da POC (fora do repositório):

```bash
# banco e Redis do WSL
wsl -d Ubuntu -u root -- service postgresql start
wsl -d Ubuntu -u root -- redis-server --port 6390 --daemonize yes

# app (em crm/)
yarn install && yarn generate && yarn db:migrate && yarn initialize && yarn build
QUEUE_STRATEGY=async REDIS_URL=redis://127.0.0.1:6390 PORT=5050 yarn start

# provas (na raiz da POC)
OM_TENANT_A=<tenant do init> OM_ORG_A=<org do init> OM_PIDS=<pids> node tests/poc-http.mjs
OM_TENANT_A=... OM_ORG_A=... OM_ROLE=<papel bff> node tests/webhook-dup.mjs
node tests/licencas.mjs

# parar
taskkill /PID <pid do yarn start> /T /F
wsl -d Ubuntu -u root -- redis-cli -p 6390 shutdown
wsl -d Ubuntu -u root -- service postgresql stop
```

Evidências na pasta `evidencias/` da POC: `resultados.txt` e `http-log.json` de cada execução (`run1-sem-papel` a
`run6-sem-enterprise`), `webhook-duplicado-local.json`, `webhook-duplicado-async.json`, `auth-setup-tenant-c.log`,
`licencas-*.json`, logs do servidor e do build, todos mascarados.
