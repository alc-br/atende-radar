# Benchmark do ambiente atual (F0-04)

Retrato medido do servidor de produção, do CI e do projeto antes do CRM. Serve de base para o portão **OPS-01** e para o
risco **R09** (sobrecarga do servidor existente). Também é a régua do **ECO-01**: a POC repete os mesmos comandos e compara.

- **Quando:** 30/10/2026, das 23:18 às 23:32 (horário de Brasília, -03).
- **Código em produção:** `62ea82f` (último deploy verde, 26/10/2026). O app está no ar desde 26/10 11:49, sem reinício.
- **Como:** só leitura. SSH no servidor, `gh` no GitHub e `curl` desta máquina. Nada foi reiniciado, instalado ou editado.
  O `app.env` e o env da Evolution não foram abertos.
- **Regra de leitura:** a seção "Medido" traz números com o comando que os gerou. A seção "Estimado" é conta em cima deles,
  com a premissa escrita ao lado. Estimativa não vale como prova em portão nenhum.

## Medido

### Servidor

VPS KVM com Ubuntu 24.04.4 LTS (kernel 6.8). **O servidor é compartilhado**: além do AtendeRadar rodam o Mautic, a
Evolution API, o Postiz, outros apps internos da ALC, 4 runners do GitHub Actions e o antivírus ClamAV.

| Item | Valor | Comando |
|---|---|---|
| CPU | 6 vCPU AMD EPYC, 1 thread por núcleo | `nproc`, `lscpu` |
| RAM total | 11.960 MiB (11,7 GiB) | `free -m` |
| RAM em uso (`used`) | 6.499 MiB | `free -m` |
| RAM disponível de verdade (`available`) | **5.460 MiB (5,3 GiB)** | `free -m` |
| Cache de arquivo (`buff/cache`) | 3.171 MiB | `free -m` |
| Swap | 8 GiB (2 arquivos de 4 GiB); **2.920 MiB em uso** | `free -m`, `swapon --show` |
| Troca ativa de swap | nenhuma: `si`/`so` = 0 em 5 amostras de 1 s | `vmstat 1 5` |
| Pressão de memória (PSI) | 0,00 (10 s, 60 s e 300 s) | `/proc/pressure/memory` |
| Pressão de CPU (PSI, "some") | 1,8% a 2,2% | `/proc/pressure/cpu` |
| Memória prometida (`Committed_AS`) | 12.809 MiB, mais que a RAM física (`overcommit_memory=0`) | `/proc/meminfo` |
| `swappiness` | 10 | `sysctl vm.swappiness` |
| Load (1, 5, 15 min) | 1,27 · 1,20 · 1,27 | `uptime` |
| CPU ociosa agora | 84% a 93% | `vmstat 1 5` |
| Ligado há | 11 dias e 14 h | `uptime` |
| Disco `/` | 193 GB, 139 GB usados (72%), **54 GB livres** | `df -h` |
| OOM killer nos últimos 11 dias | 0 ocorrências | `journalctl -k` filtrado por `out of memory`, `oom-kill` e `killed process` |

Quem segura o swap: um processo `node` de outro sistema (~966 MiB) e o `mysqld` do Mautic (~240 MiB). O AtendeRadar
tem 0 em swap (o serviço tem `MemorySwapMax=0`). São páginas paradas: não há troca ativa nem pressão de memória.

### Histórico de 7 dias (sysstat)

O `sar` grava uma amostra a cada 10 min. **Picos curtos, como o build de 1 a 2 min do deploy, podem não aparecer.**

| Dia | CPU ocupada, média | CPU, pior amostra | Load 1 min, média / máx. | RAM disponível, média / mín. | Swap usada, máx. |
|---|---|---|---|---|---|
| 24/10 | 12,8% | 20,6% | 1,02 / 2,82 | 5.709 / 5.503 MiB | 2.688 MiB |
| 25/10 | 12,5% | 17,1% | 0,99 / 2,82 | 5.661 / 5.489 MiB | 2.660 MiB |
| 26/10 | 14,2% | 26,2% (11:50, logo após o deploy) | 1,33 / **4,77** (11:50) | 5.569 / 5.309 MiB | 2.649 MiB |
| 27/10 | 14,0% | 25,9% | 1,28 / 3,90 | 5.479 / 5.205 MiB | 2.635 MiB |
| 28/10 | 13,7% | 17,5% | 1,24 / 3,88 | 5.395 / 5.198 MiB | 2.620 MiB |
| 29/10 | 14,5% | **29,7%** (08:40) | 1,30 / 3,12 | 5.462 / **5.034 MiB** (08:40) | 2.935 MiB |
| 30/10 | 13,4% | 16,6% | 1,14 / 2,84 | 5.509 / 5.267 MiB | 2.930 MiB |

Comando: `sar -u`, `sar -q`, `sar -r` e `sar -S` com `-f /var/log/sysstat/saDD`. "CPU ocupada" = 100 − `%idle`.
O pico de 29/10 08:40 não tem relação conhecida com o AtendeRadar (não houve deploy do AtendeRadar nesse dia).

### Serviço `atende-radar`

| Item | Valor | Comando |
|---|---|---|
| Memória agora | 402 a 405 MiB (quase toda anônima: 397 MiB `anon`, 1,3 MiB `file`) | `systemctl show ... -p MemoryCurrent`, `memory.stat` |
| Pico de memória desde 26/10 11:49 | **512 MiB** | `-p MemoryPeak` |
| RSS do processo (`bun`) | 457 MiB agora, pico 567 MiB (`VmHWM`) | `/proc/<pid>/status` |
| `MemoryHigh` (o kernel aperta) | 1.200 MiB | `-p MemoryHigh` |
| `MemoryMax` (teto, mata e sobe de novo) | 1.536 MiB | `-p MemoryMax` |
| `MemorySwapMax` | 0 | `-p MemorySwapMax` |
| Tarefas (threads) | 20 de 512 (`TasksMax`) | `-p TasksCurrent,TasksMax` |
| CPU acumulada | 14.704 s em ~387 mil s no ar = **3,8% de 1 vCPU** (0,6% da máquina) | `-p CPUUsageNSec` |
| Limite de CPU | nenhum (`CPUQuota` infinito, sem `CPUWeight`) | `systemctl show` |
| Reinícios | 0 (`Restart=always`, `RestartSec=5`) | `-p NRestarts,Restart` |
| Drop-ins ativos | `memoria.conf` (15/10/2026) e `limites.conf` (19/10/2026) | `-p DropInPaths` |

O pico de 512 MiB ocupa 43% do `MemoryHigh` e 33% do `MemoryMax`.

> O texto de `docs/operacao/capacidade.md` ("Hoje o serviço não tem limite de memória") está desatualizado: os limites
> já valem em produção desde 15/10 e 19/10/2026. O `Restart` ficou `always`, não `on-failure` como na proposta.

### Os 15 maiores processos por RSS

`ps -eo rss,comm --sort=-rss | head -16`. Só nome e RSS. O dono foi identificado pela unidade do systemd (`ps -o unit`).
RSS conta páginas compartilhadas, então somar a coluna superestima o total.

| # | Processo | RSS | Dono |
|---|---|---|---|
| 1 | `clamd` | 970 MiB | antivírus ClamAV |
| 2 | `node` | 669 MiB | Postiz (contêiner) |
| 3 | `bun` | 461 MiB | **AtendeRadar** |
| 4 | `mysqld` | 415 MiB | banco do Mautic (contêiner) |
| 5 | `node` | 406 MiB | Postiz (contêiner) |
| 6 | `temporal-server` | 266 MiB | Temporal do Postiz (contêiner) |
| 7 | `hermes` | 226 MiB | sessão de usuário no servidor |
| 8 | `bun` | 182 MiB | outro app interno da ALC |
| 9 | `bun` | 166 MiB | outro app interno da ALC |
| 10 | `MainThread` | 152 MiB | contêiner (não identificado) |
| 11 | `Runner.Listener` | 147 MiB | runner do GitHub do AtendeRadar |
| 12 | `bun` | 146 MiB | outro app interno da ALC |
| 13 | `Runner.Listener` | 135 MiB | runner de outro sistema |
| 14 | `Runner.Listener` | 133 MiB | runner de outro sistema |
| 15 | `Runner.Listener` | 133 MiB | runner de outro sistema |

### Memória por sistema

`docker stats --no-stream` para contêineres e `systemctl show -p MemoryCurrent` / `systemd-cgtop -m` para serviços.
Os números do cgroup incluem parte do cache de arquivo.

| Grupo | Memória | Teto configurado |
|---|---|---|
| Postiz (app, Temporal, PostgreSQL 17, Redis 7.2) | ~1.800 MiB | nenhum |
| ClamAV (`clamav-daemon`) | 958 MiB (pico 1.124 MiB) | nenhum |
| Mautic (web, cron, worker, MySQL 8.4) | ~900 MiB | nenhum |
| 4 runners do GitHub Actions, parados | ~806 MiB | nenhum |
| Stack interna em contêiner (app, 2 workers, PostgreSQL 17, Redis, MinIO) | ~526 MiB | nenhum |
| Outros apps internos em systemd (4 serviços `bun`) | ~483 MiB | não verificado |
| **AtendeRadar** | **402 MiB** | 1.200 / 1.536 MiB |
| Evolution API (API, PostgreSQL 16, cache) | ~301 MiB | 1 GiB / 512 MiB / 192 MiB |
| PostgreSQL 16 do host | 26 MiB (pico 31 MiB) | nenhum |
| nginx | 27 MiB | nenhum |

Só o AtendeRadar e a Evolution API têm teto de memória. O resto pode crescer até disputar a RAM com todos.

### Pico de memória dos deploys

O deploy do AtendeRadar roda `bun install` e `bun run build` **no próprio servidor**, pelo runner self-hosted, com
`NODE_OPTIONS=--max-old-space-size=1536` (`.github/workflows/deploy.yml`, linhas 115 a 160). O app continua no ar
durante o build.

| Runner (desde 19/10/2026 08:39) | Pico de memória do cgroup | Teto |
|---|---|---|
| AtendeRadar | **4.126 MiB** | nenhum (`memory.max` = `max`) |
| outros 3 runners | 1.576 a 1.592 MiB cada | não verificado |

Comando: `systemctl show <runner> -p MemoryPeak`. O pico do cgroup soma memória anônima e cache de arquivo (o
`bun install` e o build leem e gravam muito arquivo). **Quanto desse pico é memória anônima não foi medido.**

### Serviços e versões

| Item | Situação | Comando |
|---|---|---|
| Node | v24.16.0 no host | `node --version` |
| Bun | 1.3.14 | `bun --version` |
| Docker | 29.5.3; 17 contêineres no ar (21 no total) | `docker --version`, `docker ps` |
| PostgreSQL no host | **sim**: 16.15 (`postgresql@16-main`), escuta só em `127.0.0.1` e `::1`, `shared_buffers` 128 MB, `max_connections` 100, 6 conexões, 2 bancos (37 MB no total) | `psql -XAt -c ...` como `postgres` |
| PostgreSQL em contêiner | 3 instâncias de outros sistemas (16 e 17) | `docker ps` |
| Redis no host | **não** (`redis-server` ausente) | `command -v redis-server` |
| Redis em contêiner | 3 instâncias de outros sistemas | `docker ps` |
| MySQL/MariaDB no host | **não** | `command -v mysqld mariadbd` |
| MySQL em contêiner | 1, do Mautic (8.4) | `docker ps` |
| SQLite (CLI) | 3.45.1 | `sqlite3 --version` |
| nginx | 1.24.0 | `nginx -v` |
| Serviços systemd no ar | 49 | `systemctl list-units --type=service --state=running` |

Um dos 2 bancos do PostgreSQL do host deve ser o `postgres` padrão. Então há 1 banco de outro sistema ali (inferência:
os nomes não foram listados).

### Disco no servidor

| Item | Tamanho | Comando |
|---|---|---|
| `/opt/atende-radar/current` (código + build) | 1,9 GB | `du -sh` |
| └ `node_modules` | 1,4 GB | `du -sh` |
| └ `.next` | 490 MB | `du -sh` |
| `/opt/atende-radar/backups` | 326 MB | `du -sh` |
| `/opt/atende-radar/wa-sessions` | 9,7 MB | `du -sh` |
| Docker: imagens / volumes / cache de build | 23,8 GB / 17,4 GB / 6,3 GB (5,7 GB recuperáveis) | `docker system df` |

### Banco de produção (`prod.db`)

Aberto com `sqlite3 -readonly`. Só contagens: nenhum conteúdo foi lido.

| Item | Valor |
|---|---|
| `prod.db` | 4,1 MiB (1.046 páginas de 4 KiB, 0 livres) |
| `prod.db-wal` | 4,0 MiB |
| Modo | WAL |
| Tabelas | 53 (52 do Prisma + `_prisma_migrations`) |
| Linhas no total | 8.839 |

| Tabela | Linhas | Tabela | Linhas | Tabela | Linhas |
|---|---|---|---|---|---|
| Agent | 5 | ConversationClassification | 80 | PlatformSetting | 0 |
| AgentIdentity | 13 | ConversationIdentity | 30 | ProductEvent | 470 |
| AgentMetric | 70 | ConversationScore | 29 | ProductMilestone | 11 |
| AiClassification | 11 | ConversionEvent | 4 | Promise | 8 |
| AiUsage | 276 | DailyMetric | 39 | RawChannelEvent | 4.331 |
| Alert | 29 | EmailOutbox | 101 | RecoveryItem | 8 |
| AlertEmailItem | 15 | Message | 450 | ReportDefinition | 56 |
| AlertRule | 57 | NfseDocument | 0 | ReportRun | 127 |
| AuditFinding | 48 | NfseSequence | 0 | RevenueOpportunity | 18 |
| AuditLog | 78 | Notification | 40 | SimulationRun | 113 |
| AuthToken | 10 | NovelCluster | 3 | Subscription | 7 |
| BillingCustomer | 1 | NovelSignal | 4 | SupportTicket | 0 |
| BillingInvoice | 3 | OpenQuestion | 17 | Team | 3 |
| ClassificationFeedback | 4 | Organization | 7 | WebhookDelivery | 0 |
| ConnectionSessionEvent | 144 | OrganizationMember | 16 | WebhookEndpoint | 0 |
| ConsentChoiceDaily | 12 | PageViewDaily | 17 | WhatsAppConnection | 9 |
| Contact | 24 | PaymentEvent | 1.998 | _prisma_migrations | 11 |
| Conversation | 29 | Plan | 3 | | |

O volume real é pequeno: 7 empresas, 29 conversas e 450 mensagens. O teste de carga de `docs/operacao/desempenho.md`
usou 20 mil conversas e ~204 mil mensagens. Produção hoje está muito abaixo do que já foi testado.

### Latência vista desta máquina

5 pedidos `GET` em sequência, sem carga, de uma máquina de desenvolvimento (Windows, rede comum). Comando:
`curl -o /dev/null -s -w "%{time_total}"` (mais `time_connect`, `time_appconnect` e `time_starttransfer`).

| URL | Resposta | `time_total` (5 pedidos) | Mediana | TLS pronto (faixa) |
|---|---|---|---|---|
| `https://app.atenderadar.com.br/login` | 307 (redireciona para `/`), 43 bytes | 0,611 · 0,449 · 0,461 · 0,403 · 0,456 s | **0,456 s** | 0,277 a 0,469 s |
| a mesma, seguindo o redirecionamento (`-L`) | 200, 17,9 KB | 0,709 · 0,688 · 0,675 · 0,686 · 0,734 s | 0,688 s | — |
| `https://atenderadar.com.br/` | 200, ~70 KB | 0,892 · 0,849 · 0,730 · 0,689 · 0,717 s | **0,730 s** | 0,286 a 0,390 s |

Leitura (inferência): conexão e TLS levam 0,28 a 0,47 s, e a conexão TCP sozinha 0,14 a 0,22 s. O tempo entre o TLS
pronto e o primeiro byte é ~0,13 s no `/login` e ~0,25 s no site. Isso é uma ida e volta de rede mais o trabalho do
servidor, então a maior parte do tempo total é rede desta máquina. Para medir o servidor sem a rede, repita com
`curl` dentro do servidor em `http://127.0.0.1:3200`.

### CI: últimos 5 deploys verdes

`gh run list -R alc-br/atende-radar --workflow deploy.yml --status success -L 5` e `gh run view <id> --json jobs`.

| Execução | Commit | Data | Tentativa | Tempo total | `test` mais lento (shard 1: unit, api, ui-tablet) | `browsers` | `deploy` (no servidor) |
|---|---|---|---|---|---|---|---|
| 40339719122 | `62ea82f` | 26/10 | 1 | 22m57s | 20m36s | 9m18s | 2m14s |
| 40224033859 | `b6b4d9a` | 25/10 | 1 | 14m38s | 13m18s | 8m51s | 1m14s |
| 40221246309 | `d05345a` | 25/10 | **2** | 33m58s (18m26s na 2ª) | 14m25s | 16m38s | 1m41s |
| 40125688361 | `3779bef` | 24/10 | 1 | 15m29s | 14m09s | 9m03s | 1m15s |
| 40122913155 | `604f367` | 24/10 | **2** | 22m36s (10m17s na 2ª) | 10m57s | 9m26s | 2m04s |

- O shard 1 foi o job de teste mais lento nas 5 execuções. Os outros 4 shards levam de 4m57s a 12m40s, com uma
  exceção: o shard 2 levou 19m55s em 26/10.
- O job `deploy` (backup, migração, build e restart no servidor) leva **1m14s a 2m14s** (mediana 1m41s).
- 2 dos 5 deploys verdes só passaram na 2ª tentativa. Das 15 últimas execuções, 6 falharam e 1 foi cancelada. A falha
  mais recente (41119332369, `eac8042`) foi de infraestrutura (ver `EXECUCAO-AUTONOMA.md`).
- "Tempo total" vai da criação da execução à última atualização. Nas execuções com 2 tentativas ele inclui a 1ª.

### Projeto local

| Item | Valor | Comando |
|---|---|---|
| Dependências diretas | **88**: 74 `dependencies` + 14 `devDependencies` | leitura do `package.json` |
| Pacotes no topo do `node_modules` | 861 (contagem rasa: não inclui pacotes aninhados) | `ls node_modules` |
| Tamanho do `node_modules` local | **não medido**: `du -sh` passou de 3 min e foi interrompido (`timeout 180`, saída 124) | `du -sh` |
| Referência de tamanho | 1,4 GB no servidor (instalação Linux, com dependências de desenvolvimento) | `du -sh` no servidor |
| Versões principais | Next 16.4.1, React ^19, Prisma ^6.19.3, Playwright ^1.63, TypeScript ^5 | `package.json` |

No worktree do CRM, o `node_modules` é um link para o do checkout principal.

## Capacidade disponível para o CRM

### O que já está medido

- **RAM livre de verdade: 5,3 GiB agora; 4,9 GiB no pior momento dos últimos 7 dias** (29/10 08:40). A média diária
  ficou entre 5,3 e 5,6 GiB. Sete dias não bastam para ver tendência.
- **CPU sobra.** Média de 12,5% a 14,5% das 6 vCPU. A pior amostra de 10 min foi 29,7%. O AtendeRadar usa 3,8% de 1 vCPU.
- **Disco sobra.** 54 GB livres.
- **O app tem ~1 GiB de folga dentro do próprio teto.** Pico de 512 MiB contra `MemoryMax` de 1.536 MiB.
- **O maior pico de memória vem do deploy, não do uso normal.** O runner do AtendeRadar chegou a 4,0 GiB de cgroup
  (anônima + cache). Outros 3 runners chegam a ~1,5 GiB cada. Nenhum runner tem teto.
- **A maioria dos sistemas do servidor não tem teto de memória.** O swap já guarda 2,9 GiB de páginas paradas e a
  memória prometida (12,5 GiB) passa da RAM física. Hoje não há pressão: PSI 0,00, sem troca de swap, 0 OOM em 11 dias.
- **Já existem no host:** Node 24 (o mesmo major que o Open Mercato pede), Docker e um PostgreSQL 16 só em localhost,
  com 26 MiB. **Não existe Redis no host**: os 3 Redis que rodam são de outros sistemas.

### Estimativa para um 2º runtime (Arquitetura A, Open Mercato)

As estimativas usam como referência o que roda **neste mesmo servidor**. Nenhum componente do Open Mercato foi
medido aqui: o consumo real sai da POC (F1).

| Componente | Referência medida aqui | Estimativa em uso normal | Teto sugerido |
|---|---|---|---|
| PostgreSQL do CRM | PostgreSQL em contêiner: 30 a 135 MiB; o do host: 26 MiB | 100 a 250 MiB | 512 MiB |
| Redis do CRM | Redis em contêiner: 5 a 10 MiB | 10 a 64 MiB (`maxmemory` 64 MB) | 192 MiB |
| App Open Mercato (Node 24) | AtendeRadar: 402 a 512 MiB; Postiz (Node): ~1,3 GiB | 400 MiB a 1 GiB | 1,2 GiB |
| Worker ou fila do Open Mercato | workers em contêiner aqui: 40 a 190 MiB | 150 a 400 MiB | 512 MiB |
| **Total** | | **0,7 a 1,7 GiB** | **2,4 GiB** |

Busca (Meilisearch) não entra na conta: a especificação manda validar se dá para operar sem ela.

O que sobraria (estimado), partindo do pior momento medido (4,9 GiB livres):

| Situação | RAM que sobra |
|---|---|
| CRM em uso normal, faixa alta (1,7 GiB) | ~3,2 GiB |
| CRM com todos os serviços no teto (2,4 GiB) | ~2,5 GiB |
| O anterior + build do AtendeRadar no servidor (1,5 a 2,5 GiB de memória anônima, estimada) | **0 a 1,0 GiB** |
| O anterior + build do Open Mercato no servidor ao mesmo tempo | **negativo**: entra em swap ou OOM |

Premissa da linha do build: o heap do build é limitado a 1,5 GiB e o `bun` soma algumas centenas de MiB. O pico de
4,0 GiB do cgroup inclui cache e por isso não entra direto na conta.

Para comparação, a **Arquitetura B** (CRM nativo no mesmo Next.js) não cria processo nem banco novo. Ela usa a folga de
~1 GiB que o app já tem dentro do teto de 1.536 MiB. O custo de memória extra seria bem menor, mas também é estimativa.

### Conclusão

1. **Em uso normal, cabe.** Há ~4,9 a 5,3 GiB livres e o 2º runtime pede 0,7 a 1,7 GiB (estimado). CPU e disco não
   são limite.
2. **O risco R09 está nos picos, não no uso normal.** O build no servidor (até 4,0 GiB de cgroup no runner do
   AtendeRadar) somado a serviços sem teto é o que pode levar a swap ou OOM. Isso já vale hoje, com ou sem CRM.
3. **Condições propostas para o OPS-01** (proposta, não medido):
   - Teto de memória em todo serviço novo do CRM (`MemoryMax` no systemd ou `--memory` no Docker).
   - Build do Open Mercato fora do servidor (no CI, entregando o artefato pronto). Se for no servidor, nunca ao mesmo
     tempo que outro build.
   - PostgreSQL do CRM com banco e usuário próprios. Pode ser no cluster 16 do host, que já roda só em localhost, ou em
     contêiner com teto. Decidir na POC, sem dividir tabela nem usuário com outro sistema.
   - Redis próprio do CRM com `maxmemory`. Não reaproveitar o Redis de outro sistema.
   - Medir de novo com o CRM no ar, com os mesmos comandos, e exigir pelo menos 2 GiB livres no pior momento fora de
     deploy, sem troca ativa de swap (`si`/`so` perto de 0) e sem OOM.
4. **Falta medir** (fica para a POC e para o próximo deploy):
   - Memória anônima do build no servidor. Ler `memory.stat` do runner durante um deploy.
   - Consumo real do Open Mercato (app, worker, PostgreSQL, Redis) com dados de homologação.
   - Latência do app medida dentro do servidor (`curl` em `127.0.0.1:3200`), sem a rede.

## Como repetir

Todos os comandos são só leitura. No servidor (`ssh mautic-alc`):

```bash
nproc; free -m; swapon --show; uptime; df -h -x tmpfs -x devtmpfs -x squashfs -x overlay
vmstat 1 5; cat /proc/pressure/memory /proc/pressure/cpu
systemctl show atende-radar -p MemoryMax,MemoryHigh,MemoryCurrent,MemoryPeak,TasksMax,TasksCurrent,CPUUsageNSec,NRestarts
ps -eo rss,comm --sort=-rss | head -16
docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}"
systemctl show <runner> -p MemoryPeak
LC_ALL=C sar -r -f /var/log/sysstat/saDD     # RAM disponível do dia DD
sqlite3 -readonly /opt/atende-radar/shared/prod.db "select count(*) from \"Message\""
```

Desta máquina:

```bash
for i in 1 2 3 4 5; do curl -o /dev/null -s -w "%{time_total}\n" https://app.atenderadar.com.br/login; done
gh run list -R alc-br/atende-radar --workflow deploy.yml --status success -L 5
```
