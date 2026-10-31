# F0 · Baseline de testes (commit `eac8042`)

Resultado da suíte atual, rodada no worktree do CRM antes de qualquer mudança. Vale o que está aqui com comando,
horário e saída. As saídas brutas (últimas 200 linhas, sanitizadas) estão em `f0-logs/`.

Tarefas F0-02 (Agente 08, QA) e F0-03 (Agente 05, frontend). O baseline visual está em `../01-baseline-visual.md`.

## Ambiente

| Item | Valor |
|---|---|
| Commit | `eac8042` (branch `crm/integracao`). No início, só `docs/crm/` novo. Outros agentes mudaram o worktree durante a rodada: ver "Mudanças no worktree durante a rodada" |
| Pasta | worktree `.claude/worktrees/crm` (`node_modules` é junção para o do checkout principal) |
| Sistema | Windows 11 Pro 10.0.22000, Git Bash |
| Ferramentas | Node 24.13.0, Bun 1.3.14, Next 16.4.1 (`next dev`, Turbopack), Playwright 1.63.0, Chromium 153.0.8010.12 |
| Variáveis | `E2E_PORT=3111`, `TURBOPACK_ROOT=D:\ALC\clientes\alc\sistemas-proprios\atende-radar` |
| Banco | `prisma/test.db` do worktree, recriado pelo `webServer` do Playwright a cada execução |
| `.env` do worktree | só `DATABASE_URL`. Sem chaves do Pagar.me sandbox (`PAGARME_*_TEST`) |
| Execução | uma suíte por vez, `workers: 1`. Outros agentes do CRM rodavam ao mesmo tempo na máquina (CPU dividida) |

## Resumo

| # | Passo | Início | Fim | Duração | Código | Resultado |
|---|---|---|---|---|---|---|
| 1 | `bunx tsc --noEmit` | 30/10 23:20:54 | 23:21:58 | 64 s | 0 | sem erros |
| 2 | `bunx eslint . --ignore-pattern ".tmp/**" --ignore-pattern ".bun-cache/**"` | 30/10 23:22:10 | 23:23:21 | 71 s | 0 | sem avisos nem erros (saída vazia) |
| 3 | `bun run db:check` | 30/10 23:23:34 | 23:23:47 | 13 s | 0 | "as migrações cobrem todo o schema.prisma" |
| 4 | `bunx playwright test --project=unit` | 30/10 23:24:01 | 23:25:49 | 108 s | 0 | **566 passaram** |
| 5 | `bunx playwright test --project=api` | 30/10 23:26:04 | 23:57:34 | 1890 s (31,5 min) | 1 | **1614 passaram, 4 falharam, 14 pulados, 7 não rodaram** |
| 5b | reexecução dos 3 arquivos com falha (ver abaixo) | 30/10 23:58:57 | 31/10 00:01:54 | 177 s | 0 | **22 passaram** (inclui os 4 que falharam e os 7 que não rodaram) |
| 6 | `DESIGN_CAPTURAS=1 bunx playwright test tests/e2e/design.ui.spec.ts --project=ui-desktop --project=ui-mobile --project=ui-tablet` | 31/10 00:02:12 | 00:09:01 | 408 s | 0 | **12 passaram, 9 pulados** (pulos previstos no próprio teste) |
| 7 | `bunx playwright test tests/e2e/a11y.ui.spec.ts --project=ui-desktop` | 31/10 00:09:39 | 00:12:54 | 195 s | 0 | **5 passaram**; 0 violação do axe em 32 auditorias |

Horários em BRT (-03:00). Em nenhum passo o servidor de teste deixou de subir em 180 s: nenhuma ocorrência de
"Timed out waiting ... config.webServer" nas saídas. Não foi preciso repetir passo por causa disso.

Logs: `f0-logs/01-tsc.txt`, `02-eslint.txt`, `03-dbcheck.txt`, `04-unit.txt`, `05-api.txt`,
`05b-api-reexec-falhas.txt`, `06-design-ui.txt`, `07-a11y-ui.txt`. Cada um tem comando, horários, código de saída,
lista de falhas, lista de pulados e as últimas 200 linhas.

## Falhas da suíte `api` (passo 5)

As quatro falharam por tempo esgotado (30 s, o limite padrão do teste). Nenhuma falhou por asserção errada.

| Teste | Mensagem | Na reexecução | Avaliação |
|---|---|---|---|
| `analysis-outcomes.spec.ts:199` · B6 · correção da intenção para "não é venda" sobrevive à reanálise | Test timeout of 30000ms exceeded | passou | ambiente (lentidão) |
| `nfse.spec.ts:47` · fatura paga vira NFS-e emitida, uma só; renovação gera outra; reembolso cancela | Test timeout of 30000ms exceeded, no `expect.poll` do status da nota (linha 41) | passou em 9,7 s | ambiente (lentidão) |
| `settings-effect.spec.ts:56` · P2 · SLA de primeira resposta na nota | Test timeout of 30000ms exceeded | passou em 8,1 s | ambiente (lentidão) |
| `settings-effect.spec.ts:91` · P2 · cliente que some além do "Tempo de abandono" → perdido por abandono | Test timeout of 30000ms exceeded | passou | ambiente (lentidão) |

Por que "ambiente" e não regressão:

- **Provado:** a reexecução dos três arquivos, no mesmo commit, com banco recriado, passou inteira (22 de 22).
  Comando: `bunx playwright test --project=api tests/e2e/analysis-outcomes.spec.ts tests/e2e/nfse.spec.ts tests/e2e/settings-effect.spec.ts`.
- **Provado:** o código do app é o mesmo do último deploy verde (`62ea82f`); `eac8042` só mudou o `handoff.md`.
- **Inferência:** a lentidão veio da máquina dividida com outros agentes e, talvez, da compilação sob demanda do
  `next dev`. As falhas ficaram espalhadas (testes 39, 580, 1607 e 1609 de 1639) e testes vizinhos do mesmo arquivo
  passaram. Não medi CPU durante a execução.
- **Atenção:** são testes que dependem do motor (`/api/gateway/tick`) e ficam perto do limite de 30 s numa máquina
  carregada. Se voltarem a falhar no CI, vale olhar antes de culpar o CRM.

### Os 7 que não rodaram

`nfse.spec.ts` é `serial`: quando o primeiro teste falhou, os outros 7 do arquivo (linhas 86, 95, 116, 128, 139, 181
e 214) não rodaram. Na reexecução (5b) os 8 passaram.

### Os 14 pulados

Todos de `billing-pagarme.spec.ts` (B8 · checkout Pagar.me sandbox, V7 · arrependimento e reativação, avisos por
webhook, inadimplência). Motivo do próprio teste: "sem chaves do Pagar.me neste ambiente". O `.env` do worktree não
tem `PAGARME_*_TEST`. **Não é falha, mas é um buraco no baseline:** a cobrança real em sandbox não foi exercitada
aqui. No CI ela roda com os segredos do repositório.

## Pulados do `design.ui` (passo 6)

Os 9 pulos são do próprio teste, não de ambiente:

- `ui-desktop`: "menu no celular" (só faz sentido no celular).
- `ui-mobile` e `ui-tablet`: "telas largas 1440/1920", "reflow 320 px" e "teclado" (rodam só no desktop, que
  redimensiona a janela). O teste de teclado é pulado onde `isMobile` é verdadeiro, e o iPad Mini conta como móvel.

## O que não foi coberto neste baseline

- Projetos `ui-desktop`, `ui-mobile` e `ui-tablet` completos (só `design.ui` e `a11y.ui` rodaram). As outras 52
  suítes de interface (`*.ui.spec.ts`, 54 no total) ficam sem baseline local.
- `a11y.ui` só no `ui-desktop` (a tarefa pediu assim). Celular e tablet não foram auditados pelo axe.
- Navegadores Firefox e WebKit (`CROSS_BROWSER=1`).
- Pagar.me sandbox (14 testes pulados, ver acima).

## Mudanças no worktree durante a rodada

O worktree é compartilhado com outros agentes do CRM. Enquanto a suíte `api` rodava, eles começaram a escrever nele.
Horários pela data de modificação dos arquivos (`stat`), conferidos às 00:19 de 31/10:

| Hora | Arquivo | Quem |
|---|---|---|
| 30/10 23:24:35 | `AGENTS.md` (não versionado) | o `next dev` do passo 4: o Next 16 cria esse arquivo ao subir (`next/dist/server/lib/generate-agent-files.js`); o horário bate com a subida do servidor |
| 30/10 23:30:17 | `prisma/schema.prisma` (+372 linhas, modelos `Crm*`) | outro agente |
| 30/10 23:30 a 31/10 00:16 | `src/lib/crm/*.ts` (novos) | outro agente |
| 31/10 00:00:41 | `src/lib/conversation-outcome.ts` (novo) | outro agente |

Por que os resultados continuam valendo como baseline de `eac8042`:

- **Provado:** os passos 1 a 3 (tsc, eslint, db:check) e o 4 (unit) terminaram antes da mudança no schema.
- **Provado:** o cliente Prisma compartilhado não foi gerado de novo. `node_modules/.prisma/client` é de 23/10/2026
  e não tem nenhum modelo `Crm*`. Servidor e testes usaram o cliente de `eac8042`.
- **Provado:** não há migração nova em `prisma/migrations` (a última é `20261023174024_marketing`). O banco de teste,
  criado pelas migrações a cada execução, é o mesmo de `eac8042`.
- **Provado:** `git diff` só mostra `prisma/schema.prisma` entre os arquivos versionados. Nenhum arquivo versionado
  importa `src/lib/crm` nem `conversation-outcome` (`git grep` só acha comentários no próprio schema).
- **Inferência:** como nada importa os arquivos novos, o `next dev` não os compilou nas telas testadas.
- **Inferência, não executado:** com o schema atual, `bun run db:check` deve falhar até existir a migração do CRM.

## Espaço em disco

| Momento | D: livre |
|---|---|
| Antes do passo 1 | 4,6 GB |
| Durante a suíte `api` | 3,3 GB (o `.next` do worktree cresceu para 814 MB) |
| No fim | 3,4 GB |

`test-results/` ficou com 7,2 MB no fim (menos de 500 MB): não foi apagada. O cache `.next/` do worktree ocupa 1,2 GB;
é descartável (o `next dev` recria) e pode ser apagado se faltar espaço.

## Como reproduzir

No worktree, um Playwright por vez:

```bash
export E2E_PORT=3111
export TURBOPACK_ROOT='D:\ALC\clientes\alc\sistemas-proprios\atende-radar'
bunx tsc --noEmit
bunx eslint . --ignore-pattern ".tmp/**" --ignore-pattern ".bun-cache/**"
bun run db:check
bunx playwright test --project=unit
bunx playwright test --project=api
DESIGN_CAPTURAS=1 bunx playwright test tests/e2e/design.ui.spec.ts --project=ui-desktop --project=ui-mobile --project=ui-tablet
bunx playwright test tests/e2e/a11y.ui.spec.ts --project=ui-desktop
```

Os logs foram limpos antes de salvar: cores ANSI removidas; e-mails, telefones, tokens e cadeias longas mascarados.
