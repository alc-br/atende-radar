# Desempenho e carga (T15)

Complementa `capacidade.md` (medição de 25/09/2026, com poucos dados). Aqui o foco é **uma empresa com muito histórico**.

## Metas (definidas antes de medir)

Cenário: banco SQLite com **1 empresa grande** (20 mil conversas, ~204 mil mensagens, ~8,8 mil alertas, 40 atendentes,
5 equipes, 46 membros) **+ 50 empresas pequenas** (100 conversas cada).

| # | Meta | Como é medida |
|---|---|---|
| M1 | Consultas por trás do **painel**, da **lista de conversas** e dos **alertas**: **< 300 ms** cada (p95), na empresa grande | `scripts/carga/medir.ts`, direto no banco, para dono, supervisor com equipe e atendente |
| M2 | **API p95 < 500 ms** nas rotas das telas principais | `next start` (build própria) na porta 3200 apontando para o banco de carga, 10 pedidos em paralelo |
| M3 | **Ingestão de 100 mensagens/s** sem atraso acumulado > 30 s | `ingestEvent` (o mesmo código do gateway), 10 em paralelo; vazão sustentada ≥ 100 msg/s ⇒ fila não cresce |
| M4 | Relatórios e motor de análise não travam o servidor (referência, sem meta rígida): relatório < 2 s; rodada do motor proporcional ao que mudou | idem M1 |

## Máquina e ressalva

AMD Ryzen 5 4600G (6 núcleos / 12 threads), 31 GB de RAM, Windows 11 Pro, SSD; Bun 1.3.14, Prisma 6.19, SQLite 3.46 (WAL).
**A CPU ficou perto de 100% o tempo todo por outros processos** (antivírus, navegador, outros builds). Os números absolutos
estão inflados e variam bastante; por isso "antes" e "depois" foram medidos **um logo após o outro**, nas mesmas condições.
Uma rodada anterior com a máquina menos carregada deu, no código antigo: painel do dono 260 ms, painel do supervisor 17,4 s,
conversas p1 266 ms, alertas 23–55 ms. Vale a **proporção**, não o valor absoluto.

## Antes × depois (p50 / p95, ms)

Antes = código de `d0da4f2` sem os índices novos. Depois = código desta tarefa, com índices e `optimizeDb`.

| Cenário | Antes | Depois |
|---|---|---|
| Painel 7d · dono | 1118 / 1749 | 543 / 1026 |
| Painel 30d · dono | 996 / 1424 | 455 / 1017 |
| Painel 7d · supervisor com equipe | **56051 / 65651** | 1647 / 1887 |
| Painel 7d · atendente | 757 / 941 | 527 / 1112 |
| Conversas p1 · dono | 538 / 892 | 161 / 490 |
| Conversas p30 · dono | 744 | 304 |
| Conversas, busca "Cliente 1234" | 593 | 534 |
| Conversas, busca "9999" | 552 | 492 |
| Conversas esperando + com alerta | 1796 / 2964 | 89 / 194 |
| Conversas 7d + preço + valor ≥ 500 | 448 | 123 |
| Conversas p1 · supervisor | 508 | 202 |
| Conversas p1 · atendente | 494 | 524 |
| Detalhe da conversa | 206 | 81 |
| Alertas · dono | 45 | 41 |
| Alertas · supervisor | 89 | 259 |
| Alertas · atendente | 62 | 489 |
| Equipe | 150 | 139 |
| Relatório diário | 1059 | 509 |
| Relatório semanal | 2926 | 1733 |
| Relatório por equipe | 6526 | 3498 |
| Relatório de oportunidades perdidas | 4212 | 1614 |
| Relatório de promessas | 5805 | 532 |
| Consultas das telas com varredura de tabela inteira (EXPLAIN) | 73 | 0 |

Motor e ingestão:

| Cenário | Antes | Depois |
|---|---|---|
| Números do painel (`recomputeMetrics`), empresa grande | ~12,5 min | 3,2 s (2,2 s na 2ª vez) |
| Motor, 1ª rodada (2.353 conversas) | — | 296 s (~126 ms/conversa, máquina carregada) |
| Motor, rodadas seguintes (787 conversas pendentes) | — | 13–18 s |
| Motor, empresa pequena | — | 0,7 s |
| Ingestão, 10 em paralelo | 4 msg/s · p95 8,2 s | 18 msg/s · p95 2,8 s · 0 falhas |

Com a máquina livre, a proporção sugere que painel do dono, lista de conversas e alertas ficam abaixo de 300 ms (M1).

## O que mudou

- **Índices** (só acréscimos em `prisma/schema.prisma`, ~30 `@@index`): por empresa+data/estado nas conversas, alertas,
  recuperação, notificações e números diários; por conversa nas mensagens e nas tabelas de análise; contato por telefone.
  Sem eles quase toda tela varria a tabela inteira.
- **Estatísticas do SQLite** (`optimizeDb` em `src/lib/db.ts`): `PRAGMA optimize` 30 s depois de subir e a cada 6 h
  (só com o agendador ligado). Sem estatísticas o SQLite escolhia o índice errado (painel do supervisor: 56 s).
- **Painel** (`api/dashboard`): o funil virou um `groupBy` só (antes, 5 contagens) — `src/lib/analysis/funnel.ts`;
  consultas com `select` em vez de `include`.
- **Lista de conversas**: o total de mensagens sai de um `groupBy` só das conversas da página (antes, o Prisma contava
  as mensagens de todas as conversas da tabela).
- **Paginação** (`src/lib/pagination.ts`): conversas, alertas, recuperação e notificações aceitam no máximo 100 por página
  (as telas pedem 15–30; antes não havia teto).
- **Números do painel** (`recomputeMetrics`): lê só as conversas que podem cair na janela recalculada (abertas na janela,
  ainda abertas, com mensagem ou oportunidade na janela), com `select` só dos campos usados. O cálculo puro foi para
  `src/lib/analysis/day-metrics.ts` (sem mudar a fórmula) e a conversão de data para dia ficou em cache.
- **Relatórios** (`src/lib/reports/build.ts`): só carrega conversas e mensagens nos tipos que usam; mensagens com 3 campos.

### Mesmos números (equivalência)

No banco de carga, um script comparou o código antigo com o novo: os 8 tipos de relatório (empresa grande e uma pequena),
o funil por papel, os números do dia de hoje e de ontem (20.000 → 2.938 conversas lidas, mesmo resultado) e o total de
mensagens da lista (páginas 1 e 30). Tudo igual. Testes que ficam no projeto:

- `tests/unit/metrics-window.unit.spec.ts` — ler só a janela dá os mesmos números do dia (6 fusos × 20 cenários); cache de data.
- `tests/unit/dashboard-funnel.unit.spec.ts` — funil agrupado = contagens separadas.
- `tests/unit/pagination.unit.spec.ts` — padrão por rota, teto de 100, valores inválidos.
- `tests/e2e/reports.spec.ts` — "números de mensagens e conversas batem com os dados (diário e conexões)".

## O que ainda passa da meta

| Item | Situação | Próximo passo |
|---|---|---|
| Painel do supervisor | ~0,6 s com a máquina menos carregada (era 17 s) | Números diários por equipe pré-calculados (`DailyMetric` já tem `teamId`) |
| Busca por nome/telefone | 0,3–0,5 s (`LIKE` no contato) | Índice de texto (FTS5) ou busca em tabela de contatos primeiro |
| Alertas do atendente | ~2× mais lento que antes (ainda < 0,1 s com a máquina livre): o SQLite percorre os alertas da empresa pelo índice novo | `agentId` no próprio alerta |
| Ingestão (M3) | 18 msg/s com a máquina carregada (`capacidade.md`: 49 msg/s com ela livre), longe de 100 msg/s | Ver abaixo |
| API via HTTP (M2) | **não medida** | Ver abaixo |

**Ingestão.** Cada mensagem faz ~10 comandos no banco (conexão, evento bruto, contato, conversa, mensagem, atualizações)
e o SQLite tem **um escritor só**: mais chamadas em paralelo não aumentam a vazão, só a fila. Os índices tiraram as
varreduras (4 → 18 msg/s). Rodadas extras com 1 e 4 em paralelo deram 7 msg/s (p50 54 ms) e 3 msg/s — variação que vem
da máquina carregada, não do código; o tempo por mensagem sozinha (~54 ms) é o número mais estável. Passar de 100 msg/s pede gravar em lote ou Postgres (ver "Quando migrar" em `capacidade.md`).
Não mexi no fluxo de gravação porque mudaria a garantia de idempotência e de reprocessamento.

**M2 (HTTP).** Medir pela API exigiria `next build` numa máquina já saturada e dividindo porta e banco com outra execução;
os números não seriam confiáveis. As consultas das rotas foram medidas direto no banco (M1), que é onde estava o custo.

No motor, o EXPLAIN ainda mostra varredura em `OpenQuestion`, `Promise` e `AlertRule` (≤ 40 ms, tabelas pequenas).

## O que não foi testado

- **50 pessoas usando ao mesmo tempo** com este volume (só consultas uma a uma e a ingestão em paralelo).
- **20 conexões reais de WhatsApp** (a ingestão foi chamada direto, sem o gateway nem a rede).
- O servidor real (outra máquina, outro disco).
- Postgres.

## Como medir em produção (ou numa cópia)

1. **Nunca contra o banco de produção.** Faça uma cópia (ver `backup-e-restauracao.md`) ou gere um banco de carga:
   ```powershell
   $env:DATABASE_URL = "file:$PWD\.tmp\carga.db"; $env:NODE_ENV = "production"
   bunx prisma db push --skip-generate   # só neste arquivo
   bun scripts/carga/semear.ts            # empresa grande + 50 pequenas
   ```
   Os scripts recusam rodar se `DATABASE_URL` não apontar para um arquivo `.db` dentro de `.tmp`.
2. **Telas, relatórios, motor e ingestão:**
   `bun scripts/carga/medir.ts --otimizar [--so='telas,relatorios'] [--saida=nome] [--paralelo=10]`.
   Saída: p50/p95 por cenário, `.tmp/carga-resultado-<nome>.json` e o `EXPLAIN QUERY PLAN` de cada SQL em
   `.tmp/carga-planos-<nome>.txt` (procure `SCAN` sem índice).
3. **HTTP de ponta a ponta:** build de produção numa porta livre apontando para a cópia e
   `node scripts/load-test.mjs http://127.0.0.1:<porta> <GATEWAY_SECRET>`.
4. **No servidor em uso:** com o banco crescido, rodar `PRAGMA optimize` de vez em quando é automático (a cada 6 h). Se uma
   tela ficar lenta de repente, olhar o tempo da rota no log de acesso e repetir o passo 2 numa cópia do banco.
5. Apague os bancos de carga no fim (`.tmp/carga*.db*`, `.tmp/carga-credenciais.json`).

## Riscos da mudança

- O primeiro deploy cria ~30 índices: em banco grande, alguns segundos a mais no `db push` e ~20–30% a mais de disco.
- Cada índice custa um pouco em cada gravação (já incluído na medição de ingestão).
- `PRAGMA optimize` grava estatísticas em `sqlite_stat1` (tabela interna do SQLite; não muda dados).
- Teto de 100 itens por página: quem pedisse mais pela API passa a receber 100 (as telas pedem menos).
