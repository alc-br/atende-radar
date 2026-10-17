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
| `regra-pergunta-ignorada` | essencial | Regra própria "Pergunta ignorada": pergunta em aberto, alerta, respondida, fecha |
| `regra-resposta-lenta-agrupa` | essencial | "Resposta lenta" e a regra padrão viram UM alerta, que sobe para a mais grave |
| `regra-lead-abandonado` | essencial | "Lead abandonado" antes do abandono automático; cliente volta e fecha |
| `regra-promessa-tipo-antigo` | essencial | Regra própria do tipo antigo "Promessa vencida" |
| `regra-escopo-numero` | gestao | Regra só de um número (escopo por conexão) |
| `regra-desligada` | essencial | Regra desligada não dispara; religada, dispara |
| `alerta-dispensado-cooldown` | essencial | Dispensado não volta no cooldown; depois volta |
| `alerta-falso-positivo` | essencial | Falso positivo não volta no cooldown |
| `alerta-resolvido-pessoa` | essencial | Resolvido sem responder o cliente: abre um alerta novo |
| `alerta-repetido-mesma-conversa` | essencial | Problema volta: mesmo alerta com 2 ocorrências |
| `limite-regras-plano` | essencial | Cota de regras próprias (402), nome repetido (409), tipo e % inválidos (400), prazo próprio |
| `regra-conexao-por-numero` | gestao | Só um de 3 números cai: um alerta de conexão |
| `cota-conversas-aviso` | essencial | Aviso ao chegar em 80% das 300 conversas do mês |
| `cota-conversas-estourada` | essencial | 300 usadas: cliente novo não é analisado; troca para Growth e volta |
| `cota-growth-no-limite` | gestao | 998 de 1000: 2 entram, 2 ficam sem análise |
| `cota-performance-no-limite` | performance | 4999 de 5000: 1 entra, 1 fica sem análise |
| `assinatura-cancelada` | gestao | Assinatura encerrada pausa a análise |
| `assinatura-reativada` | essencial | Cancelada e contratada de novo: volta a analisar |
| `teste-gratis-contrata` | essencial | Teste vencido e contratação |
| `expediente-domingo-ignora` | essencial | Domingo 20:00 com "ignora": alerta só segunda 08:15 |
| `expediente-domingo-atraso` | essencial | Domingo com "conta como atraso": alerta em 1 h |
| `expediente-domingo-alerta` | essencial | Domingo com "alerta": alerta em 1 h |
| `expediente-sexta-noite` | essencial | Sexta 18:40 até segunda 08:10 (sem encerrar no fim de semana) |
| `expediente-tolerancia-fechamento` | essencial | Tolerância de 30 min depois de fechar |
| `expediente-tolerancia-abertura` | essencial | Tolerância de 10 min antes de abrir |
| `expediente-feriado` | essencial | Feriado cadastrado não conta |
| `expediente-sabado-meio-periodo` | essencial | Sábado 08–12 ligado |
| `jornada-essencial-dia` | essencial | 6 clientes (venda, perda, preço, irritado, bom dia, promessa) e os 8 relatórios |
| `jornada-growth-equipe` | gestao | O mesmo dia com atendente, 2 números, relatórios por atendente e conexões |
| `venda-recuperada` | essencial | Preço sem retorno → fila → "fiz o pix": venda e item recuperado |
| `perda-declarada` | essencial | "Já comprei em outro lugar": perdida na hora |
| `desistiu-e-voltou` | essencial | "Desisti" e "na verdade quero": não decide sozinho |
| `contato-excluido-lgpd` | essencial | Parar de monitorar: alerta dispensado e mensagens seguintes ignoradas |
| `carga-200-conversas` | gestao | 200 clientes em 3 números, 4 desfechos, relatório diário |

**Novo cenário:**

1. Crie um objeto `Scenario` em `src/lib/simulation/scenarios/*.ts`. Os tipos estão em `src/lib/simulation/types.ts`.
   Passos: `message`, `connection`, `tick`, `addConnection`, `addAgent`, `rule` (cria regra pelo mesmo caminho da
   tela), `ruleActive`, `alertAction` (dispensar/falso positivo/resolver), `exclude` (LGPD), `usage` (conversas já
   usadas no mês) e `plan` (troca de plano ou cancelamento). Verificações em cada `tick` e no fim, incluindo
   `report` (relatório gerado como o agendado), `question`, `occurrences`, `lastTick` e `recoveryStatus`.
   Para horário comercial, `startAt` fixa o início num dia da semana e hora de São Paulo e `holidayOnStart` marca o
   dia como feriado.
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
- **Regras por equipe.** O campo existe, mas o motor ainda não filtra por equipe (precisa da identidade do atendente
  confirmada). Os campos "dias e horários", "encerrar sozinho" e "exceções" da regra também são guardados e ainda
  não usados pelo motor.
- **Rodar os cenários no CI.** Hoje rodam no e2e local (`tests/e2e/simulacao.spec.ts`).
