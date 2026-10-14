# Plano: ambiente de simulação (backlog, pedido do dono em 14/10/2026)

**Objetivo.** Testar a plataforma "na prática" sem conectar WhatsApp: cliente manda mensagem, atendente responde, atendente
some, atrasos, várias conexões e atendentes conforme cada plano (1 número/3 atendentes, 3/10, 10/50). As mensagens
chegam por outro lugar, mas percorrem o **mesmo caminho** do real (mesma ingestão, banco, motor e telas). Só o operador
da plataforma (super administrador) usa, e o **agente de IA também precisa conseguir rodar todos os cenários sozinho**
e conferir o resultado (CLI/API com cenários declarativos e asserções, não só tela).

## Como o real funciona (o que a simulação reaproveita)

- Entrada: `POST /api/gateway/events` (`gatewayGuard`, Bearer `GATEWAY_SECRET`) → `ingestEvent` (`src/lib/ingest.ts`):
  idempotência em `rawChannelEvent`, `Contact` por `phoneHash`, `Conversation` (janela de reabertura), `Message` mascarada,
  `requestAnalysis(orgId)`.
- Atendente (P5): atribuído pelo motor pela assinatura `*Nome*:` (`src/lib/agent-identities.ts`, `src/lib/analysis/agents.ts`).
- Motor: `analyzeOrganization(orgId, now)` / `analyzeAll(now)` (`src/lib/analysis/engine.ts`) já recebem `now`;
  `analysisGate` (teste vencido, cota mensal). Tick: `/api/gateway/tick`.
- Planos: `Plan.maxConnections` / `maxAgents`, `enforceQuota` (`src/lib/quotas.ts`, 402 `quota_exceeded`).
- Operador: `isPlatformOperator` (`PLATFORM_ADMIN_EMAILS`), tela `src/components/admin/admin-view.tsx`.
- A empresa de demonstração (`DEMO_ORG_ID`) já fica fora de motor, cotas, e-mails, relatórios e analytics: é o modelo.
- Os testes e2e já simulam mensagens (`tests/e2e/gw.ts`, `setupCompany`, `c.send`, `c.tick`), com tempo "no passado".

**Cuidados encontrados:** a ingestão agenda análise com o relógio real (`requestAnalysis`); `analyzeAll` varreria as
empresas simuladas; o login busca o membro só pelo e-mail (`src/lib/auth.ts`), então o operador não entra em várias
empresas simuladas com o próprio e-mail.

## Arquitetura

1. **Isolamento** (`src/lib/sandbox.ts`): `Organization.isSimulation`; `isIsolatedOrg(orgId)` (demo ou simulação) e
   `REAL_ORGS` substituem os testes espalhados de `DEMO_ORG_ID`.
2. **Provider `simulator`** em `WhatsAppConnection.provider`: `ingestEvent(evt, { source })` recusa cruzamentos (gateway real
   não alcança conexão `simulator` e vice-versa); para `simulator` não chama `requestAnalysis`; `manager.reconcile` e
   `/api/gateway/connections` só pegam `baileys`.
3. **Relógio simulado**: o cenário começa no passado (`t0 = agora − duração`, ou âncora tipo "sexta 18:30"); cada passo grava
   `occurredAt = t0 + offset` e cada `tick` chama `analyzeOrganization(orgId, t0 + offset)`.
4. **`src/lib/simulation/`**: `types.ts` (cenário: plano, conexões, atendentes, configurações, passos, expectativas),
   `builder.ts` (cria a empresa com `isSimulation`, plano, membros sintéticos `@sim.invalid`, conexões pelo `enforceQuota`),
   `injector.ts` (mesmo envelope do `EventSchema` → `ingestEvent`), `assert.ts` (alertas, status da conversa, nota,
   recuperação, oportunidade, gate, cota, "nenhum alerta X"), `runner.ts` (resultado por asserção + `SimulationRun`),
   `scenarios/*.ts`.
5. **CLI** `bun scripts/simular.ts listar | rodar <id|todos> [--json] [--manter] | limpar`: sai com código ≠ 0 se alguma
   asserção falhar (é o que o agente usa). Só roda com `SIMULATION_ENABLED=on`.
6. **API de operador** `/api/admin/simulation/*` (rodar, resultado, injetar mensagem avulsa, tick, "entrar como gestor/atendente"
   com sessão curta e faixa SIMULAÇÃO). Acesso: operador da plataforma ou Bearer `SIMULATION_SECRET`.
7. **Tela**: aba "Simulação" no Admin: catálogo, Rodar, resultado verde/vermelho por asserção, abrir como gestor/atendente,
   injetar mensagem, limpar.

## Cenários iniciais

Por plano (básico, excede limite → 402, 3 números, carga 10 números/50 atendentes/~500 conversas); primeira resposta
estourada; resposta resolve o alerta; atendente some; pergunta ignorada; objeção de preço; venda perdida por abandono;
venda recuperada; cliente frustrado; promessa vencida; fora do expediente (ignora/atraso/alerta); teste grátis vencido
(análise pausada); limite de conversas no mês; contato excluído; conexão cai; mensagem duplicada; CPF mascarado.

## Salvaguardas

Ligado só com `SIMULATION_ENABLED=on`; só operador ou `SIMULATION_SECRET`; toda ação na auditoria; empresas simuladas fora
de `analyzeAll`, avisos de teste, cobrança, relatórios agendados, e-mails de alerta, webhooks, analytics e métricas/receita
do Admin; e-mail de simulação nunca é entregue; membros sintéticos não entram pelo login comum; `limpar` só apaga empresas
`isSimulation`; expiração automática (24 h).

## Schema (migração versionada, B10)

`Organization.isSimulation Boolean @default(false)`, `simulationExpiresAt DateTime?`, índice; modelo `SimulationRun`
(`scenarioId`, `status`, `virtualStart`, `startedBy`, `resultJson`, datas). `provider` aceita `'simulator'` sem mudar schema.

## Fases (estimativa 9–13 dias)

1. Schema, `sandbox.ts` e exclusões + teste de isolamento (nada em `emailOutbox`, `webhookDelivery`, `productEvent`) — 2–3 d.
2. Builder, injector, runner, asserções, CLI e 6 cenários — 3–4 d (risco: pontos que usam `new Date()` em vez de `now`).
3. API de operador, "entrar como" e aba no Admin — 2–3 d (revisão de segurança; teste: `enter` em empresa real → 403).
4. Catálogo completo e rodar os cenários no CI — 2–3 d.
