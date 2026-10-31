# ADR-001 — Arquitetura do CRM: Open Mercato privado ou CRM nativo

- Estado: aceita (31/10/2026). Revisão adversarial do agente 10: feita em 31/10/2026; mantém a decisão e corrige três
  vereditos (seção "Revisão do agente 10").
- Decide: agente 03 (arquiteto de integração), tarefa F1-03, pela regra da especificação (3.3, F1 e D5).
- Base: branch `crm/integracao` em `eac8042`. Open Mercato 0.9.0, commit `f451ce4`, POC do agente 02.
- **Decisão: B, CRM nativo no Next.js atual**, atrás do mesmo contrato `/api/crm/*`. O Open Mercato não passou nos
  portões da F1.

Vale o que tem comando e saída ou leitura de código, com a fonte ao lado. O que é conta ou dedução está marcado como
**estimativa** ou **inferência**.

## Contexto

A especificação só aceita o Open Mercato se os oito portões passarem com evidência. Se um falhar, vale o CRM nativo,
com o mesmo contrato `/api/crm/*`, e o motivo fica registrado (3.2, 3.3 e F1). Inconclusivo conta como não aprovado.

| Fato | Fonte |
|---|---|
| O servidor de produção é dividido com Mautic, Postiz, Evolution, ClamAV, apps internos e 4 runners | `01-benchmark-atual.md` › Servidor |
| RAM livre no pior momento de 7 dias: 4,9 GiB. Só o AtendeRadar e a Evolution têm teto de memória | idem › Histórico de 7 dias, Memória por sistema |
| O deploy do AtendeRadar compila no próprio servidor. O runner chegou a 4,0 GiB de cgroup | idem › Pico de memória dos deploys |
| Não há Redis no host. Há um PostgreSQL 16 só em localhost | idem › Serviços e versões |
| Volume real: 7 empresas, 29 conversas, 450 mensagens | idem › Banco de produção |
| Não há autorização para contratar outro servidor | orientação do orquestrador para a F1-03 |
| O contrato `/api/crm/*`, a sincronização e a autorização já valem para A e B | `04-api-crm.md`, ADR-002, ADR-003 |
| Versão testada: 0.9.0, de 09/10/2026. A especificação já viu a 0.10.0 em 30/10/2026 | `02-poc-open-mercato.md` › Ambiente; cabeçalho da especificação |

## Opções

### A — Open Mercato como serviço privado

O navegador fala só com o BFF `/api/crm/*`. O BFF chama a API do Open Mercato com uma chave por tenant. O Open Mercato
guarda pessoas, empresas, funis, negócios e atividades num PostgreSQL próprio.

Para rodar, a POC mostrou que precisa de (`02-poc-open-mercato.md` §1, §6 e §8):

- 3 processos Node (supervisor, `next start` e worker da fila), PostgreSQL e Redis. Sem Redis, a fila `local` entrega
  webhook em dobro.
- Provisionar cada tenant pelo CLI `mercato auth setup`, não pela API. Tenant criado pela API nasce sem cifra.
- Guardar a chave de cifra dos tenants no cofre e no backup.
- Tirar `@open-mercato/enterprise` e `newrelic` do `package.json` e incluir `@open-mercato/web-research`.
- No BFF: conferir funil e etapa do próprio tenant (C15), idempotência própria, inbox de `webhook-id` e cabeçalho de
  trava otimista em todo `PUT`.
- CI e deploy separados (especificação 11.4).

### B — CRM nativo no Next.js atual

O mesmo BFF `/api/crm/*`, com as tabelas `Crm*` no SQLite atual, pelo Prisma (`03-modelo-dados.md`, parte nativa).
Sem processo, banco ou fila novos. Usa o `guard()`, o `audit()`, o backup e o deploy que já existem.

Estado lido no worktree em 31/10/2026 (não testado neste ADR):

- A base nativa já existe: 64 arquivos em `src/lib/crm/`, `src/app/api/crm/`, `src/components/crm/`, na migração
  `20261031120000_crm_base` e em dois testes, com cerca de 6 mil linhas (`wc -l`).
- Nenhum arquivo de `src/lib/crm/` chama serviço externo pelo servidor. O único `fetch` está em `client.ts`, que é o lado
  do navegador e fala com `/api/crm/*`.
- O `package.json` não mudou (`git diff -- package.json` sem linhas).

## Portões

| Portão | Veredito | Motivo |
|---|---|---|
| LIC-01 | aprovado com ressalva | núcleo MIT; o pacote comercial e o agente proprietário saem e o build passa. Inventário só da instalação no Windows |
| TEN-01 | **reprovado** | o negócio do tenant A grava e mostra a etapa do tenant B (C15) |
| AUTH-01 | inconclusivo | o lado do Open Mercato passou; o caminho BFF → Open Mercato não foi construído nem testado |
| CRUD-01 | aprovado | as seis entidades por API pública, sem UI; contrato 0.x com ressalvas |
| SYNC-01 | inconclusivo | o mesmo `POST` com `Idempotency-Key` cria 3 registros, mas o cabeçalho não existe no Open Mercato e o caminho próprio (`data_sync`) não foi testado; fora de ordem, queda e replay sem teste |
| UX-01 | inconclusivo | nenhuma tela comercial rodou com o Open Mercato por trás |
| OPS-01 | **reprovado** | backup, restauração, Linux e servidor real não demonstrados, que é o bloqueio da própria especificação |
| ECO-01 | inconclusivo | um 2º runtime completo, com PostgreSQL e Redis, num servidor dividido. CPU não medida nas duas opções; memória do B não medida |

Resultado, depois da revisão do agente 10: 1 aprovado (CRUD-01), 1 aprovado com ressalva (LIC-01), 2 reprovados (TEN-01 e
OPS-01) e 4 inconclusivos (AUTH-01, SYNC-01, UX-01 e ECO-01). A primeira versão deste ADR dava SYNC-01 e ECO-01 como
reprovados; as seções abaixo guardam o raciocínio original, e a revisão diz por que mudou.

### LIC-01 — licenças

Exigido: relatório de licenças de tudo que vai para produção; núcleo MIT; nada Enterprise obrigatório. Bloqueio:
extensão comercial exigida ou incompatibilidade sem solução.

Provado:

- Raiz MIT, lida no `LICENSE` da 0.9.0. Os 28 pacotes `@open-mercato/*` que ficam são MIT
  (`evidencias/licencas-resumo-sem-enterprise.txt`, 1.814 pacotes).
- O scaffold traz `@open-mercato/enterprise`, que é comercial e proíbe produção, e `newrelic`, que puxa o
  `@newrelic/security-agent`, proprietário (`reports/om-licencas.md`).
- Sem os dois, e com `@open-mercato/web-research@0.9.0`, o build passou: `build exit=0 s=112`
  (`evidencias/build-sem-enterprise.txt`). A rodada 6, sem enterprise, deu o mesmo resultado da rodada 5: 90 de 93.
- Conferido de novo na F1-03, no app da POC: `grep -c "@open-mercato/enterprise@" yarn.lock` deu 0, e a busca por
  `newrelic@` e `@newrelic/` também deu 0. O `package.json` não cita nenhum dos dois.
- Os 11 pacotes fora da lista permissiva têm saída: licença dupla com opção permissiva, ferramenta de build ou LGPL de
  ligação dinâmica (`sharp`). Nenhum obriga a abrir o código do AtendeRadar nem depende de serviço pago.

Ressalva: o relatório é da instalação no Windows. Os binários do Linux não foram inventariados, e nada foi implantado.

### TEN-01 — isolamento entre tenants

Exigido: dois tenants com ids e credenciais diferentes; 100% das tentativas cruzadas negadas. Bloqueio: qualquer
vazamento entre tenants.

Provado (`evidencias/run6-sem-enterprise/resultados.txt`):

- 37 de 40 checagens passaram: leitura, lista, busca, `PUT`, `DELETE` e tenant alheio no corpo, na URL, em cookie e em
  cabeçalho. Cada uma rodou com a chave de API e com o usuário do tenant A.
- **Falharam C15-key, C15-user e C15b.** O `PUT` do negócio de A com `pipelineId` e `pipelineStageId` de B respondeu
  200 `{"ok":true}`. A leitura seguinte trouxe o nome da etapa de B (`rotulo_de_B_na_resposta=true`). A rodada 5, com
  enterprise, deu o mesmo.

Lido no código da 0.9.0 (pasta da POC), na F1-03:

- `packages/core/src/modules/customers/commands/deals.ts:112`: a etapa é buscada com
  `findOneWithDecryption(em, CustomerPipelineStage, { id: pipelineStageId }, {}, { tenantId, organizationId })`.
- `packages/shared/src/lib/encryption/find.ts:48`: o último argumento é `scope?: DecryptionScope`. A função chama
  `em.findOne(entityName, where)` só com o `where`. O tenant e a organização servem para decifrar, não para filtrar.
- A mesma função atende a criação (linha 561), a mudança (linha 819) e o desfazer (linha 1018). Só a mudança foi testada.

Veredito: reprovado. Há leitura de dado de outro tenant (o nome da etapa) e gravação de referência alheia. O BFF pode
contornar, mas o portão mede o motor, e a especificação bloqueia "qualquer vazamento".

### AUTH-01 — só pelo BFF e pelos papéis do AtendeRadar

Exigido: operações de CRM só pelo BFF e pelos papéis do AtendeRadar; usuário bloqueado não entra. Bloqueio: contornar
a trava de assinatura ou o controle de papéis.

Provado no Open Mercato (POC §3d, rodada 6): sem credencial, chave inválida, revogada e vencida dão 401; papel sem
permissão dá 403; a API responde JSON, sem redirecionar (D1 a D9, G2).

Não provado: o adaptador BFF → Open Mercato não existe. Ninguém testou, nesse caminho, o papel do AtendeRadar, a trava
de assinatura (402) ou o usuário bloqueado.

Pontos abertos:

- Os passos 2 e 3 do provisionamento usam o token do superadmin (`open-mercato-contracts.md` §3). Com ele dá para criar
  chave em outro tenant (§2). Essa credencial teria de morar no servidor do AtendeRadar ou num processo à parte.
- A chave fica 30 s em cache em cada processo (`DEFAULT_SUCCESS_TTL_MS = 30_000` em
  `packages/shared/src/lib/auth/apiKeyAuthCache.ts:3`). **Inferência da POC:** com mais de uma instância, uma chave
  revogada pode valer por até 30 s.

Veredito: inconclusivo.

### CRUD-01 — APIs estáveis

Exigido: pessoas, empresas, funis, etapas, negócios e atividades por API estável. Bloqueio: depender da UI padrão ou
de endpoint privado frágil.

Provado (rodada 6): B1 a B16 passaram. Criar as seis entidades nos dois tenants deu 201 em todas. Ler, mudar, mudar
etapa com histórico, buscar, paginar e apagar (exclusão lógica) funcionaram. Tudo pela API do OpenAPI (263 caminhos),
sem UI (G2).

Ressalvas, sem bloqueio:

- Versão 0.x. Da 0.9.0 (09/10) à 0.10.0 (vista em 30/10) foram 3 semanas. O código guarda rastro de troca de contrato:
  os comentários em `deals.ts:127` e `deals.ts:929` citam a grafia `loose`, trocada na 0.7.1. Troca de versão não foi
  testada (POC §7).
- Campo desconhecido some sem erro (`rolesCsv`). A lista vem em snake_case e a leitura em camelCase. `?email=` não acha
  nada em tenant cifrado. O `PUT` do negócio não devolve o `updatedAt` (`open-mercato-contracts.md` §1 e §5).

Veredito: aprovado.

### SYNC-01 — duplicados, fora de ordem, queda e replay

Exigido: provar eventos duplicados, fora de ordem, indisponibilidade e replay. Bloqueio: negócio duplicado, perda de
evento ou gravação por cima indevida.

Provado:

- E1: o mesmo `POST` de pessoa 3 vezes com o mesmo `Idempotency-Key` deu 201, 201, 201 e criou 3 pessoas
  (`ids_distintos=3`).
- E2: atividade com `id` do cliente repetida deu 201, depois 500 `DATABASE_ERROR` duas vezes, não 409.
- F1: sem o cabeçalho de trava otimista, o `PUT` grava por cima (o último vence).
- Webhook na fila `local`: 2 requisições com o mesmo `webhook-id`, a 11 ms uma da outra
  (`evidencias/webhook-duplicado-local.json`). Na fila `async` com Redis: 1 (`evidencias/webhook-duplicado-async.json`).
  Reentrega depois de 503 com o mesmo id (F9).

Lido no código, na F1-03: `dealCreateSchema` (`packages/core/src/modules/customers/data/validators.ts:170`) não tem
`id`. Só o `dealUpdateSchema` tem. **Inferência:** repetir a criação de um negócio depois de um timeout cria outro
negócio. O teste com negócio não foi feito.

Não testado: eventos fora de ordem, Open Mercato fora do ar com o outbox do AtendeRadar acumulando, replay e backfill.
O adaptador que faria a idempotência do lado do BFF não existe.

Veredito: reprovado. O motor duplica registro no reenvio, que é o caminho para o bloqueio "negócio duplicado". As
defesas da POC §8 são proposta, sem teste.

### UX-01 — tudo no shell do AtendeRadar

Exigido: 100% das telas comerciais no shell do AtendeRadar, sem redirecionar ao Open Mercato. Bloqueio: troca de
identidade visual ou sessão extra.

Provado: a API do Open Mercato não redireciona (G2). Só as páginas `/backend` redirecionam (G3), e o BFF não as usa.

Não provado: nenhuma tela comercial rodou com o Open Mercato por trás. Os 9 componentes de `src/components/crm/` têm
12 linhas cada e dizem "a tela é escrita na F4" (`wc -l` e leitura, 31/10/2026).

Veredito: inconclusivo. Este portão quase não depende do provedor, porque o contrato `/api/crm/*` esconde quem está
atrás. A prova vem na F4 e na F6, para a opção escolhida.

### OPS-01 — backup, restauração e operação

Exigido: backup e restauração do CRM, sozinho e junto com o SQLite; saúde e observabilidade. Bloqueio: recuperação
inconsistente ou operação não demonstrada.

Provado: `/api/healthz` responde 200 sem credencial (G1). Boot até o 200 em 20,8 a 29,2 s (`evidencias/boot-*.txt` e
POC §2).

Não provado (POC §7): Linux, systemd, o servidor real, backup, restauração, troca de versão com migração e mais de uma
instância.

Achado que pesa aqui: a cifra por tenant depende de um segredo (`TENANT_DATA_ENCRYPTION_FALLBACK_KEY`, sem Vault). O
próprio CLI avisa que, sem ele, o dado cifrado não volta depois de reiniciar (`evidencias/auth-setup-tenant-c.log`). O
restauro teria de juntar SQLite, PostgreSQL, essa chave e o mapeamento, numa ordem testada (especificação 11.3). Nada
disso rodou.

Veredito: reprovado. A especificação põe "operação não demonstrada" como bloqueio.

### ECO-01 — custo comparado ao nativo

Exigido: CPU, RAM, manutenção e tempo de integração, registrados e comparados ao fallback. Bloqueio: custo total
desproporcional à funcionalidade.

Medido no Open Mercato (Windows, POC §2 e `evidencias/`):

| Item | Valor |
|---|---|
| Processos | 3 Node (supervisor 167 MB, `next` 243 MB, worker 175 MB), PostgreSQL (13 processos, 227 MB) e Redis |
| Memória do app | 585 MB em repouso; 629 MB com Redis; pico de 873 MB com 5 requisições em paralelo; 686 MB logo depois, sem enterprise |
| Tamanho | 1.814 pacotes; `node_modules` com 1,7 GB; banco com 128 tabelas |
| Tempos | `yarn install` 6 min 17 s; build 5 min 40 s (1 min 52 s com cache); boot 22,5 s |
| Carga leve | 200 GETs, 5 em paralelo: p50 461 ms, p95 613 ms, 0 erro |

Medido no servidor (`01-benchmark-atual.md`): 4,9 GiB livres no pior momento; o build do AtendeRadar roda no servidor;
não há Redis no host; os serviços vizinhos não têm teto.

**Estimativa** do benchmark: com o CRM no teto e um build do AtendeRadar ao mesmo tempo, sobram de 0 a 1,0 GiB. Com o
build do Open Mercato junto, a conta fica negativa (swap ou OOM). Sem servidor novo, o build do Open Mercato teria de
sair do servidor, e isso é mais um pipeline para manter.

Opção B: nenhum processo, banco ou fila novos (lido no código: `src/lib/crm/` usa o Prisma e não chama serviço
externo). A memória extra do B **não foi medida**. A estimativa do benchmark é que cabe na folga do app: pico de
512 MiB contra teto de 1.536 MiB.

Manutenção e integração (leitura dos documentos da F1):

- A precisa de tudo que o B já tem no BFF (guard, escopo, flags, outbox, auditoria e `CrmIdentityLink`), mais o
  adaptador, as 9 defesas da POC §8, PostgreSQL, Redis, a guarda da chave de cifra, CI e deploy próprios.
- O que o Open Mercato poupa são as seis entidades e suas regras. A base delas já está escrita no B.
- Versão 0.x: cada troca pede repetir a POC.

Veredito: reprovado. A comparação é medido (A) contra estimado (B). Mesmo assim a diferença é de ordem de grandeza: o
A põe um segundo runtime completo num servidor dividido com o Mautic, sem verba para outro servidor, para 7 empresas.

## Decisão

**Fallback B: CRM nativo no Next.js do AtendeRadar**, com o contrato `/api/crm/*` de `04-api-crm.md`.

Motivo registrado (F1): TEN-01 e OPS-01 reprovados; AUTH-01, SYNC-01, UX-01 e ECO-01 inconclusivos. Um portão sem
aprovação já basta para não adotar (D5). Corrigir só o C15 não muda a decisão: OPS-01 continua reprovado e os
inconclusivos continuam sem prova.

Isso segue a especificação (3.2): o produto, as telas e os testes de aceite são os mesmos nas duas opções. O D8 continua
cumprido, porque o B não adiciona pacote.

## Consequências

Boas:

- Nenhum processo, banco, fila ou pipeline novo. Deploy, backup do SQLite e monitoramento seguem os de hoje.
- O Mautic e os outros sistemas do servidor não dividem a RAM com um segundo runtime (R09).
- Tenant, papel e trava de assinatura passam pelo `guard()` de sempre (ADR-003), sem token de superadmin de outro sistema.
- Idempotência, versão e escopo ficam no nosso código e nos nossos testes (`CrmIdempotencyKey`, `version`, `ownerScope`).
- O R02 deixa de existir: não há integração entre dois runtimes.

Custos aceitos:

- Construir e manter as seis entidades e suas regras: importar, exportar, mesclar, funil e histórico. O que o Open
  Mercato traz a mais (cotação, catálogo, pedido) não vem pronto.
- O CRM grava no mesmo SQLite do motor, que tem um escritor só. Medir a disputa na F7.
- O CRM divide o teto de memória do app (`MemoryHigh` 1.200 MiB, `MemoryMax` 1.536 MiB). Medir na F7 com os comandos do
  benchmark.

O que muda nos outros documentos:

- `03-modelo-dados.md`: a parte nativa entra em vigor. `CrmTenantLink.provider` = `native`.
- ADR-003, seção "Provedor": fica sem efeito enquanto o B valer.
- `02-poc-open-mercato.md` §8 e `open-mercato-contracts.md`: ficam como referência congelada da 0.9.0, para uma
  reavaliação. Não são requisito.
- `05-sincronizacao.md`: a classificação de 401, 403 e 429 de provedor externo não se aplica.

## Riscos e decisões da especificação

| Item | Situação com B |
|---|---|
| R01 — Open Mercato 0.x muda API | não se aplica. Fica como custo de uma reavaliação |
| R02 — dois runtimes mais caros que o nativo | confirmado pelo ECO-01 e evitado |
| R09 — sobrecarga do servidor | menor. O pico do build continua valendo, com ou sem CRM. Medir na F7 |
| D5 — Open Mercato só se passar na F1 | não passou; vale o B |
| D8 — sem Enterprise nem módulo não auditado | cumprido; o B não adiciona pacote |

## Revisão do agente 10 (adversarial, 31/10/2026)

Concorda com a decisão. TEN-01 confirmado por leitura da fonte da 0.9.0 (`deals.ts:112` e o `dist/deals.js:81`
instalado): a busca da etapa usa só `{ id }`, enquanto as funções vizinhas filtram por tenant
(`closureStage.ts:57-66`, `pipeline-stages.ts:108-112`). OPS-01 vale: a especificação põe "operação não demonstrada"
como bloqueio. AUTH-01 e UX-01 inconclusivos, corretos.

Vereditos corrigidos (já refletidos na tabela de portões):

- **SYNC-01 → inconclusivo.** O E1 testou um `Idempotency-Key` que o Open Mercato não oferece. Negócio duplicado não foi
  observado; é inferência do `validators.ts:170`. A fila `async` (a de produção) não duplicou o webhook. O caminho
  oficial de integração, `data_sync` com `SyncExternalIdMapping`, que casa registros no replay, não foi avaliado.
- **ECO-01 → inconclusivo.** CPU não medida em nenhuma das opções; memória do B não medida; tempo de integração sem
  número. O próprio benchmark diz que estimativa não vale como prova de portão e que, em uso normal, cabe.
- **LIC-01 → aprovado com ressalva.** O inventário é da instalação no Windows; os binários do Linux (`sharp-libvips`,
  `swc`, `lightningcss`) não foram vistos.

Afirmações da POC sem prova ou contrariadas (corrigidas em `02-poc-open-mercato.md`):

- "90 de 93": o E1 e o E3 são `check(..., true)` fixo (`tests/poc-http.mjs:373` e `:390`) e passam sempre.
- C15d ("B não passa a ver o negócio de A") roda depois do C15c, que já devolveu o negócio à etapa de A: não consegue
  ver o caso.
- "Exclusão lógica": o `DELETE /people` faz `em.remove` e `nativeDelete` em cascata (`people.ts:1253-1270`), ou seja,
  exclusão física (inferência por leitura).
- "Token de superadmin obrigatório no provisionamento": há caminho só por CLI (`mercato api_keys add --roles`,
  `auth sync-role-acls`).
- O `.yarnrc.yml` da POC tem `npmPreapprovedPackages '@open-mercato/*'`: o prazo de 14 dias não valia para o próprio
  framework.
- Números sem arquivo de evidência: boot de 29,2 s e `node_modules` de 1,7 GB sem enterprise.

Para a reavaliação: o agente 10 leu (sem testar) o `deals.ts` do commit de referência da especificação (`440f7c2`,
0.10.0) e a busca da etapa já filtra por `tenantId` e `organizationId`, ou seja, o C15 parece corrigido lá. O
`dealCreateSchema` continua sem `id`.

## Como reavaliar

Reabrir este ADR só se aparecer um destes gatilhos:

1. Servidor novo ou VM dedicada autorizada para o CRM.
2. Escopo aprovado pelo produto que o B teria de construir e o Open Mercato já tem (cotação, catálogo, pedido de venda).
3. Versão do Open Mercato com pelo menos 14 dias de publicada que corrija o C15 e tenha idempotência.

Para o A passar, cada portão precisa de:

| Portão | O que faria passar |
|---|---|
| LIC-01 | refazer o inventário na instalação Linux e um teste que trave a ausência de `@open-mercato/enterprise`, `newrelic` e `@newrelic/*` no lockfile |
| TEN-01 | o C15 corrigido (etapa e funil filtrados por `tenantId` e `organizationId` na criação, na mudança, na troca em massa e no desfazer) e C1 a C21 com 100%, mais os casos de criar negócio e trocar etapa em massa com etapa alheia |
| AUTH-01 | adaptador BFF → Open Mercato com a matriz T03 a T06 do ADR-003 passando (402, papel, IDOR) e provisionamento sem token de superadmin no runtime do AtendeRadar |
| CRUD-01 | B1 a B16 na versão candidata e numa troca de versão com migração |
| SYNC-01 | idempotência no motor (`Idempotency-Key` respeitado, ou `id` do cliente com 409) ou no adaptador, com teste de duplicado, fora de ordem, Open Mercato parado e replay: zero negócio duplicado e zero evento perdido |
| UX-01 | as telas da F4 e da F6 rodando com o adaptador, com o mesmo teste visual |
| OPS-01 | Linux com systemd e teto de memória; backup e restauração do PostgreSQL, da chave de cifra e do SQLite juntos, num ensaio cronometrado |
| ECO-01 | medir no Linux com dados de homologação e manter pelo menos 2 GiB livres no pior momento fora de deploy, sem troca de swap e sem OOM (critério do benchmark), com o build fora do servidor |

O que facilita trocar depois: o contrato `/api/crm/*` não muda; `CrmTenantLink.provider` já aceita `open_mercato`; o
`CrmIdentityLink` liga o id local ao id externo. A troca seria um adaptador e uma migração de dados, sem mexer em tela.

Para repetir a POC: os scripts (`tests/poc-http.mjs`, `tests/webhook-dup.mjs`, `tests/licencas.mjs`) e as evidências
estão na pasta temporária da sessão (`scratchpad/om`), fora do repositório. Somem quando a pasta for limpa. Se uma
reavaliação for provável, vale versionar os scripts, depois de conferir que não têm segredo.
