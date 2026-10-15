# Ambiente de simulação (só o operador da plataforma)

Código: `src/lib/simulation/` (cenários, construtor, injetor, motor com relógio virtual, verificações), `src/lib/sandbox.ts`
(isolamento), `scripts/simular.ts` (CLI), `src/app/api/admin/simulation/*` (API) e a aba **Simulação** do Admin
(`src/components/admin/simulation-panel.tsx`). Plano original: `docs/planos/ambiente-de-simulacao.md`.

## Para que serve

Testar a plataforma "na prática" sem WhatsApp: cada cenário cria uma **empresa simulada** com o plano do cenário,
conexões e atendentes. Depois injeta mensagens de cliente e de atendente num tempo virtual, roda o motor de análise
e confere o resultado: alertas, situação da conversa, intenção, sentimento, recuperação, valor em risco, promessa,
limite do plano e máscara de dados.

As mensagens passam pelo **mesmo caminho** do WhatsApp real: `ingestEvent`, banco, motor e telas. Só a origem muda: o
provider é `simulator`, e não o gateway.

**Relógio virtual.** O cenário começa no passado: `t0 = agora − (último minuto do cenário + 1)`. Cada mensagem é gravada
com `occurredAt = t0 + minuto`, e cada `tick` roda `analyzeOrganization(empresa, t0 + minuto)`. Ninguém espera
30 min de verdade.

## Ligar

| Variável | Padrão | Efeito |
|---|---|---|
| `SIMULATION_ENABLED` | `off` | Só `on` liga. Desligado: a API responde 404 para todos, a aba não aparece e o CLI sai com código 2. |
| `SIMULATION_SECRET` | (vazio) | Opcional. Com 16+ caracteres, libera a API por `Authorization: Bearer <segredo>` (CLI `--api`, agente de IA). Vazio: só o operador logado usa. |

O deploy (`.github/workflows/deploy.yml`, passo "Variáveis do app") cria `SIMULATION_ENABLED=off` no `app.env` do
servidor quando a variável não existe e nunca muda um valor já gravado. `SIMULATION_SECRET` não é criado pelo deploy.

Ligar num servidor é **decisão do dono**:

1. Edite `/opt/atende-radar/shared/app.env`.
2. Reinicie: `sudo systemctl restart atende-radar`.

O recomendado é ligar só em homologação. Em produção, mesmo ligado, as empresas simuladas não alcançam cliente nenhum
(ver salvaguardas), mas ocupam o banco por até 24 h.

## Como usar

### Pela tela (operador)

Admin › aba **Simulação**. Ela só aparece para o operador (`PLATFORM_ADMIN_EMAILS`) e com a simulação ligada.

- **Rodar** um cenário ou **Rodar todos**. Cada verificação aparece com ✓ ou ✗, o minuto virtual e o que foi encontrado.
- **Manter a empresa (24 h).** A empresa simulada não é apagada no fim. Em **Abrir**/**Ver empresa** aparece um retrato
  só leitura (conversas, alertas, recuperação). Ali dá para **injetar** uma mensagem avulsa (conversa, quem fala, texto,
  minutos atrás) e **rodar o motor agora**.
- **Limpar simuladas** apaga todas as empresas simuladas. Empresa real nunca entra.
- **Últimas execuções** mostra quem rodou o quê.

### Pelo CLI (operador ou agente de IA)

```bash
SIMULATION_ENABLED=on bun scripts/simular.ts listar [--json]
SIMULATION_ENABLED=on bun scripts/simular.ts rodar <id|todos> [--json] [--manter]
SIMULATION_ENABLED=on bun scripts/simular.ts limpar [--json]
```

- Usa o banco de `DATABASE_URL`, como o servidor. Para testar localmente sem tocar `dev.db`, aponte para um banco
  descartável: `bun scripts/db-migrate.ts && bun prisma/seed.ts` com `DATABASE_URL=file:/caminho/sim.db`.
- Código de saída:
  - `0`: tudo verde.
  - `1`: alguma verificação falhou, ou um cenário deu erro.
  - `2`: uso errado, desligado ou falha. É o que o agente usa para decidir.
- `--json` devolve `{ ok, total, passed, failed, results[] }`. Cada resultado traz `assertions[]` com `label`, `ok`,
  `detail` e `at`.
- `--api https://servidor` chama a API em vez do banco, com o segredo **na variável de ambiente** `SIMULATION_SECRET`.
  O segredo nunca vai na linha de comando. Nesse modo vale o `SIMULATION_ENABLED` do servidor.

### Pela API

Todas as rotas exigem a simulação ligada e aceitam a sessão do operador ou `Authorization: Bearer <SIMULATION_SECRET>`.
Se o cabeçalho Bearer vier e o segredo estiver errado, a resposta é 401 e a sessão não é usada como alternativa. Para
outro papel, a resposta é 403.

| Método e rota | O quê |
|---|---|
| `GET /api/admin/simulation/scenarios` | Catálogo |
| `POST /api/admin/simulation/run` `{ scenarioId \| "todos", keep? }` | Roda e devolve o resultado por verificação |
| `GET /api/admin/simulation/runs` | Últimas 50 execuções e as empresas simuladas mantidas |
| `GET /api/admin/simulation/runs/{id}` | Uma execução, com o resultado completo |
| `GET /api/admin/simulation/orgs/{id}` | Retrato só leitura de uma empresa simulada (empresa real → 404) |
| `POST /api/admin/simulation/orgs/{id}/inject` `{ chat, from: customer\|company, text, name?, agent?, minutesAgo?, connection? }` | Mensagem avulsa (empresa real → 404) |
| `POST /api/admin/simulation/orgs/{id}/tick` | Roda o motor agora na empresa simulada (empresa real → 404) |
| `POST /api/admin/simulation/clean` | Apaga todas as empresas simuladas |

## Cenários

| id | Plano | O quê |
|---|---|---|
| `primeira-resposta-estourada` | essencial | Primeira resposta estourada |
| `resposta-resolve-alerta` | essencial | Resposta resolve o alerta |
| `atendente-some` | gestao | Atendente some no meio da conversa (atendente sugerido pela assinatura) |
| `objecao-preco` | essencial | Pedido de preço sem retorno: alerta, recuperação e valor estimado |
| `venda-perdida-abandono` | essencial | Venda perdida por abandono |
| `intencao-alta` | essencial | Intenção alta sem resposta |
| `cliente-frustrado` | essencial | Cliente irritado |
| `promessa-vencida` | essencial | Promessa vencida e cumprida |
| `conexao-cai` | essencial | Conexão cai e volta |
| `teste-gratis-vencido` | essencial | Teste grátis vencido pausa a análise |
| `limite-conexoes-plano` | essencial | Limite de conexões do plano (402) |
| `limite-atendentes-plano` | essencial | Limite de atendentes do plano (402) |
| `plano-growth-3-numeros` | gestao | Plano Growth com 3 números |
| `plano-performance-carga` | performance | 10 números, 50 atendentes, 20 conversas |
| `mensagem-duplicada` | essencial | Mesmo evento e mesma mensagem não entram duas vezes |
| `cpf-mascarado` | essencial | CPF mascarado na entrada |

**Novo cenário:**

1. Crie um objeto `Scenario` em `src/lib/simulation/scenarios/*.ts`. Os tipos estão em `src/lib/simulation/types.ts`.
   O cenário tem passos `message`, `connection`, `tick`, `addConnection` e `addAgent`, e verificações em cada `tick`
   e no fim.
2. Registre o cenário em `scenarios/index.ts`.
3. O teste `tests/e2e/simulacao.spec.ts` roda "todos" e exige tudo verde.

## Salvaguardas

- **Desligado por padrão.** Desligado, a API responde 404 e o CLI sai com código 2.
- **Acesso.** Só o operador da plataforma ou o Bearer `SIMULATION_SECRET`. O segredo precisa ter 16+ caracteres e é
  comparado em tempo constante. O segredo do gateway não serve.
- **Isolamento.** A empresa simulada tem `Organization.isSimulation = true`. Ela fica fora de:
  - `analyzeAll` (motor agendado);
  - e-mails de alerta, e-mails em geral (nada no `EmailOutbox` para `@sim.invalid`), webhooks, avisos e expiração de
    teste grátis, relatórios agendados, eventos e marcos de produto (analytics) e uso de IA;
  - números, listas e usuários do Admin;
  - reconexão do gateway WhatsApp e `/api/gateway/connections`.

  O gateway real não injeta em conexão `simulator` (404), e a simulação não injeta em conexão real.
- **Membros sintéticos** (`gestor.*@sim.invalid`, `atendente.*@sim.invalid`): não têm senha e não entram pelo login comum.
  `.invalid` é um domínio reservado e nunca entrega e-mail.
- **Plano de verdade.** Cotas e bloqueio de análise valem para a simulada (só a demonstração é isenta). É assim que os
  cenários de limite (402) e de teste vencido funcionam.
- **Limpeza.** `limpar` e a expiração apagam só empresas `isSimulation`. A empresa mantida expira em 24 h. A limpeza
  das expiradas roda a cada 15 min, junto das exclusões agendadas, e também antes de cada "rodar". A exclusão apaga a empresa inteira: conversas, alertas,
  conexões, membros, webhook e fila de e-mails.
- **Auditoria.**
  - Cada ação (rodar, injetar, tick, limpar, ver retrato) grava uma linha em `SimulationRun` com quem fez (`startedBy`:
    o e-mail do operador ou `token`).
  - Com sessão, a ação também vai para o registro de auditoria da empresa do operador (`simulation.*`).
  - Com o segredo, vai para o log do servidor (`[simulation] ...`).

## O que ainda não existe

- **"Entrar como gestor/atendente" da empresa simulada.** Não foi feito. O login é por e-mail único, e uma sessão
  emprestada exige revisão de segurança própria. No lugar, há o retrato só leitura.
- **Cenários ainda não escritos:**
  - pergunta ignorada;
  - venda recuperada;
  - fora do expediente (ignora, atraso, alerta);
  - limite de conversas no mês;
  - contato excluído;
  - carga de ~500 conversas.
- **Rodar os cenários no CI.** Hoje rodam no e2e local (`tests/e2e/simulacao.spec.ts`).
