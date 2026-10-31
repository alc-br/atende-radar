# ADR-002 — Fonte de verdade e sincronização

- Estado: aceita (30/10/2026)
- Decide: orquestrador (sessão Claude Code), com revisão do agente 10
- Vale para: alternativa A (Open Mercato) e B (nativo). Ver ADR-001.

## Contexto

A especificação (8.1) pede outbox transacional: gravar a mudança e o evento na mesma transação. O inventário mostrou
que o motor de análise grava passo a passo, sem `$transaction` (`00-inventario.md` 8.2 e R4), em dez pontos diferentes
de `engine.ts`, além de `ingest.ts`, `privacy.ts` e de rotas manuais. O estado da oportunidade não é monótono: ela é
apagada na correção humana, reaberta quando o cliente volta e muda de status sozinha (R5).

Pôr o outbox dentro do motor exigiria transformar esses pontos em transações. Isso muda o comportamento do modo
Auditoria (D1) e a disputa pelo único escritor do SQLite (R17), e qualquer erro ali para a análise de todos os
clientes, não só dos que usam CRM.

## Decisão

1. **O AtendeRadar é a fonte de verdade da observação; o CRM é a fonte de verdade comercial.** O CRM lê conversa,
   oportunidade, alerta e recuperação e nunca as altera pela sincronização. A única escrita de volta é o desfecho
   confirmado por uma pessoa no CRM (CRM-07), pela mesma regra da rota manual.
2. **Captura por leitura com checkpoint, não por gatilho no motor.** Um job (`capture.ts`) lê as tabelas de origem a
   partir de um cursor `(updatedAt, id)` por empresa e recurso e grava eventos no `CrmOutboxEvent`. O motor não muda.
3. **Idempotência pela chave `(empresa, tipo, agregado, versão)`.** Reler um trecho é inofensivo. O mesmo código faz
   captura contínua, backfill (30 dias na primeira rodada) e reconciliação (7 dias a cada 6 h).
4. **Worker at-least-once com consumidor idempotente** (`worker.ts`): reserva condicional, efeito e inbox na mesma
   transação, backoff exponencial com jitter, 8 tentativas, DLQ com reprocessamento auditado.
5. **Sugestão primeiro** (D2, `consumer.ts`). O consumidor nativo só cria sugestões, atualiza estimativa e vínculos e
   escreve histórico. Negócio automático só com `crm.autoCreateDeals`. Nada marca ganho, move etapa ou resolve alerta.
6. **Decisão humana vence.** Etapa escolhida por pessoa fica travada (`stageLockedByHuman`); desfecho diferente do
   detectado vira `divergence` no histórico; evento com versão menor que a aplicada é ignorado.

## Consequências

Boas:

- Zero mudança no motor, na ingestão e nas rotas existentes. O modo Auditoria fica como está.
- Falha do CRM não chega à análise nem ao WhatsApp: a captura roda fora do ciclo do motor e `emitCrmEvent` nunca lança.
- Empresa sem CRM não paga nada: a captura só percorre empresas com `crm.enabled`.
- Desligar é trivial: flag por empresa ou `CRM_DISABLED=1` para todas.

Custos aceitos:

- Atraso de até ~15 s além do ciclo do motor (meta p95 < 60 s, medida na F7).
- A captura vê o estado atual, não cada passo: duas mudanças entre rodadas viram uma.
- Mais leitura no SQLite: consultas por `(organizationId, updatedAt)` em lotes de 200, só nas empresas com CRM. Medido
  no benchmark da F7.
- Oportunidade reaberta não gera nova sugestão (`05-sincronizacao.md` §10).

## Alternativas descartadas

| Alternativa | Por quê |
|---|---|
| Outbox dentro do motor (`$transaction` em cada ponto) | muda o motor do modo Auditoria e a contenção do SQLite; risco alto para todos os clientes |
| Emitir o evento logo depois de cada gravação do motor, sem transação | perde evento numa queda entre as duas gravações (é o defeito do webhook público, R4) e ainda muda o motor |
| Reaproveitar `WebhookDelivery` | proibido pela especificação (8.1): contrato e público diferentes |
| Sincronizar a partir das telas (`useEffect`) | proibido pela especificação (8.1) |
| Gatilhos do SQLite | lógica escondida no banco, fora do Prisma e das migrações aditivas do projeto; difícil de testar e de desligar |

## Revisão

Rever se o motor ganhar transações por outro motivo: aí o evento pode ser gravado na própria transação e a captura vira
só reconciliação.
